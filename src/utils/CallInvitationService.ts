import { supabase, CallInvitation, subscribeToCallInvitations, getUserProfile } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export class CallInvitationService {
  private userId: string;
  private incomingChannel: any = null;
  private outgoingChannel: any = null;
  private onInvitationCallbacks: ((invitation: CallInvitation) => void)[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pollingTimer: NodeJS.Timeout | null = null;
  private lastSeenInvitationIds: Set<string> = new Set();
  private isRunning: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;

  constructor(userId: string) {
    this.userId = userId;
  }

  async start() {
    console.log('[CallInvitationService] Starting service for user:', this.userId);
    this.isRunning = true;
    await this.connect();
    this.startPolling();
    this.startConnectionMonitoring();
  }

  private async connect() {
    console.log('[CallInvitationService] Connecting channels...');

    await this.disconnect();

    try {
      this.incomingChannel = supabase
        .channel(`incoming_invitations_${this.userId}_${Date.now()}`, {
          config: {
            broadcast: { self: true }
          }
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'call_invitations',
          filter: `callee_user_id=eq.${this.userId}`,
        }, (payload) => {
          console.log('[CallInvitationService] Incoming channel event:', payload);
          this.reconnectAttempts = 0;
          this.onInvitationCallbacks.forEach(callback => callback(payload.new as CallInvitation));
        })
        .on('system', {}, (payload) => {
          console.log('[CallInvitationService] Incoming channel system event:', payload);
        });

      const incomingStatus = await this.incomingChannel.subscribe();
      console.log('[CallInvitationService] Incoming channel subscribe status:', incomingStatus);

      this.outgoingChannel = supabase
        .channel(`outgoing_invitations_${this.userId}_${Date.now()}`, {
          config: {
            broadcast: { self: true }
          }
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'call_invitations',
          filter: `caller_user_id=eq.${this.userId}`,
        }, (payload) => {
          console.log('[CallInvitationService] Outgoing channel event:', payload);
          this.reconnectAttempts = 0;
          this.onInvitationCallbacks.forEach(callback => callback(payload.new as CallInvitation));
        })
        .on('system', {}, (payload) => {
          console.log('[CallInvitationService] Outgoing channel system event:', payload);
        });

      const outgoingStatus = await this.outgoingChannel.subscribe();
      console.log('[CallInvitationService] Outgoing channel subscribe status:', outgoingStatus);

      this.reconnectAttempts = 0;
      console.log('[CallInvitationService] Channels connected successfully');
    } catch (error) {
      console.error('[CallInvitationService] Connection error:', error);
      this.scheduleReconnect();
    }
  }

  private async disconnect() {
    if (this.incomingChannel) {
      await this.incomingChannel.unsubscribe();
      this.incomingChannel = null;
    }
    if (this.outgoingChannel) {
      await this.outgoingChannel.unsubscribe();
      this.outgoingChannel = null;
    }
  }

  private startConnectionMonitoring() {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
    }

    this.reconnectTimer = setInterval(() => {
      if (!this.isRunning) return;

      const incomingState = this.incomingChannel?.state;
      const outgoingState = this.outgoingChannel?.state;

      console.log('[CallInvitationService] Channel states:', {
        incoming: incomingState,
        outgoing: outgoingState,
        reconnectAttempts: this.reconnectAttempts
      });

      if (incomingState === 'closed' || outgoingState === 'closed') {
        console.log('[CallInvitationService] Detected closed channel, reconnecting...');
        this.scheduleReconnect();
      }
    }, 10000);
  }

  private scheduleReconnect() {
    if (!this.isRunning) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[CallInvitationService] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);

    console.log(`[CallInvitationService] Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

    setTimeout(() => {
      if (this.isRunning) {
        console.log('[CallInvitationService] Attempting reconnect...');
        this.connect();
      }
    }, delay);
  }

  private startPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }

    console.log('[CallInvitationService] Starting fallback polling (every 3 seconds)');

    this.pollingTimer = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        const invitations = await this.getPendingInvitations();

        for (const invitation of invitations) {
          if (!this.lastSeenInvitationIds.has(invitation.id)) {
            console.log('[CallInvitationService] Polling found new invitation:', invitation.id);
            this.lastSeenInvitationIds.add(invitation.id);
            this.onInvitationCallbacks.forEach(callback => callback(invitation));
          }
        }

        const activeIds = new Set(invitations.map(inv => inv.id));
        for (const seenId of this.lastSeenInvitationIds) {
          if (!activeIds.has(seenId)) {
            this.lastSeenInvitationIds.delete(seenId);
          }
        }
      } catch (error) {
        console.error('[CallInvitationService] Polling error:', error);
      }
    }, 3000);
  }

  async stop() {
    console.log('[CallInvitationService] Stopping service');
    this.isRunning = false;

    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    await this.disconnect();
    this.lastSeenInvitationIds.clear();
  }

  async initiateCall(calleeUserId: string): Promise<{
    invitation: CallInvitation;
    caller_token: string;
    room_name: string;
  }> {
    console.log('initiateCall: Starting for callee:', calleeUserId);
    console.log('initiateCall: Getting caller profile for:', this.userId);
    const callerProfile = await getUserProfile(this.userId);
    console.log('initiateCall: Caller profile:', callerProfile);

    const url = `${SUPABASE_URL}/functions/v1/initiate-call`;
    console.log('initiateCall: Fetching URL:', url);

    const payload = {
      caller_user_id: this.userId,
      callee_user_id: calleeUserId,
      caller_display_name: callerProfile?.display_name || this.userId,
    };
    console.log('initiateCall: Request payload:', payload);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    console.log('initiateCall: Response status:', response.status);
    console.log('initiateCall: Response ok:', response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('initiateCall: Error response:', errorText);
      let error;
      try {
        error = JSON.parse(errorText);
      } catch (e) {
        error = { error: errorText };
      }
      throw new Error(error.error || 'Failed to initiate call');
    }

    const data = await response.json();
    console.log('initiateCall: Success, invitation:', data.invitation);
    return {
      invitation: data.invitation,
      caller_token: data.caller_token,
      room_name: data.room_name,
    };
  }

  async acceptCall(invitationId: string): Promise<{
    room_name: string;
    token: string;
    caller_token: string;
    session_id?: string;
  }> {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/accept-call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        invitation_id: invitationId,
        callee_user_id: this.userId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to accept call');
    }

    const data = await response.json();
    return {
      room_name: data.room_name,
      token: data.callee_token,
      caller_token: data.caller_token,
      session_id: data.session_id,
    };
  }

  async rejectCall(invitationId: string, reason: 'rejected' | 'cancelled' | 'missed' = 'rejected'): Promise<void> {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/reject-call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        invitation_id: invitationId,
        user_id: this.userId,
        reason,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reject call');
    }
  }

  async cancelCall(invitationId: string): Promise<void> {
    await this.rejectCall(invitationId, 'cancelled');
  }

  onInvitation(callback: (invitation: CallInvitation) => void) {
    this.onInvitationCallbacks.push(callback);
    return () => {
      this.onInvitationCallbacks = this.onInvitationCallbacks.filter(cb => cb !== callback);
    };
  }

  async getPendingInvitations(): Promise<CallInvitation[]> {
    const { data, error } = await supabase
      .from('call_invitations')
      .select('*')
      .eq('callee_user_id', this.userId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString());

    if (error) throw error;
    return data || [];
  }
}
