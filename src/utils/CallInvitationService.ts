import { supabase, CallInvitation, subscribeToCallInvitations, getUserProfile } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export class CallInvitationService {
  private userId: string;
  private channel: any = null;
  private onInvitationCallbacks: ((invitation: CallInvitation) => void)[] = [];

  constructor(userId: string) {
    this.userId = userId;
  }

  async start() {
    this.channel = await subscribeToCallInvitations(this.userId, (invitation) => {
      this.onInvitationCallbacks.forEach(callback => callback(invitation));
    });
  }

  async stop() {
    if (this.channel) {
      await this.channel.unsubscribe();
      this.channel = null;
    }
  }

  async initiateCall(calleeUserId: string): Promise<CallInvitation> {
    const callerProfile = await getUserProfile(this.userId);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/initiate-call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        caller_user_id: this.userId,
        callee_user_id: calleeUserId,
        caller_display_name: callerProfile?.display_name || this.userId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to initiate call');
    }

    const data = await response.json();
    return data.invitation;
  }

  async acceptCall(invitationId: string): Promise<{
    room_name: string;
    token: string;
    caller_token: string;
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
