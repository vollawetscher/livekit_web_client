import { upsertUserPresence, subscribeToPresence, UserPresence } from './supabase';

export class PresenceManager {
  private userId: string;
  private heartbeatInterval: number | null = null;
  private channel: any = null;
  private onPresenceUpdateCallbacks: ((presence: UserPresence) => void)[] = [];
  private visibilityTimeout: number | null = null;
  private reconnectTimer: number | null = null;
  private isRunning: boolean = false;

  constructor(userId: string) {
    this.userId = userId;
  }

  async start() {
    console.log('[PresenceManager] Starting for user:', this.userId);
    this.isRunning = true;
    await this.updateStatus('online');
    console.log('[PresenceManager] Initial status set to online');
    this.startHeartbeat();
    console.log('[PresenceManager] Heartbeat started');
    await this.subscribeToPresenceUpdates();
    console.log('[PresenceManager] Subscribed to presence updates');
    this.setupVisibilityHandlers();
    this.startConnectionMonitoring();
    console.log('[PresenceManager] Setup complete');
  }

  async stop() {
    console.log('[PresenceManager] Stopping');
    this.isRunning = false;

    if (this.visibilityTimeout !== null) {
      clearTimeout(this.visibilityTimeout);
      this.visibilityTimeout = null;
    }

    if (this.reconnectTimer !== null) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    await this.updateStatus('offline');
    this.stopHeartbeat();
    if (this.channel) {
      await this.channel.unsubscribe();
      this.channel = null;
    }
  }

  private async updateStatus(status: UserPresence['status']) {
    try {
      console.log('PresenceManager: Updating status to:', status);
      const result = await upsertUserPresence({
        user_id: this.userId,
        status,
        metadata: {
          browser: navigator.userAgent,
        },
      });
      console.log('PresenceManager: Status updated successfully:', result);
    } catch (error) {
      console.error('PresenceManager: Failed to update presence:', error);
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = window.setInterval(() => {
      this.updateStatus('online');
    }, 30000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async subscribeToPresenceUpdates() {
    try {
      this.channel = await subscribeToPresence((presence) => {
        console.log('[PresenceManager] Received presence update:', presence);
        this.onPresenceUpdateCallbacks.forEach(callback => callback(presence));
      });
      console.log('[PresenceManager] Channel subscribed, state:', this.channel?.state);
    } catch (error) {
      console.error('[PresenceManager] Failed to subscribe to presence:', error);
      throw error;
    }
  }

  private startConnectionMonitoring() {
    if (this.reconnectTimer !== null) {
      clearInterval(this.reconnectTimer);
    }

    this.reconnectTimer = window.setInterval(() => {
      if (!this.isRunning) return;

      const state = this.channel?.state;
      console.log('[PresenceManager] Channel state:', state);

      if (state === 'closed' || !this.channel) {
        console.warn('[PresenceManager] Channel closed, reconnecting...');
        this.subscribeToPresenceUpdates().catch(err =>
          console.error('[PresenceManager] Reconnection failed:', err)
        );
      }
    }, 15000);
  }

  private setupVisibilityHandlers() {
    const handleVisibilityChange = () => {
      if (this.visibilityTimeout !== null) {
        clearTimeout(this.visibilityTimeout);
        this.visibilityTimeout = null;
      }

      if (document.hidden) {
        console.log('[PresenceManager] Tab hidden, scheduling away status in 60s');
        this.visibilityTimeout = window.setTimeout(() => {
          console.log('[PresenceManager] Setting status to away after 60s hidden');
          this.updateStatus('away');
          this.visibilityTimeout = null;
        }, 60000);
      } else {
        console.log('[PresenceManager] Tab visible, setting status to online');
        this.updateStatus('online');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    window.addEventListener('beforeunload', () => {
      this.updateStatus('offline');
    });
  }

  onPresenceUpdate(callback: (presence: UserPresence) => void) {
    this.onPresenceUpdateCallbacks.push(callback);
    return () => {
      this.onPresenceUpdateCallbacks = this.onPresenceUpdateCallbacks.filter(cb => cb !== callback);
    };
  }

  async setInCall(inCall: boolean) {
    await this.updateStatus(inCall ? 'in_call' : 'online');
  }
}
