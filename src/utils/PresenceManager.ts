import { upsertUserPresence, subscribeToPresence, UserPresence } from './supabase';

export class PresenceManager {
  private userId: string;
  private heartbeatInterval: number | null = null;
  private channel: any = null;
  private onPresenceUpdateCallbacks: ((presence: UserPresence) => void)[] = [];

  constructor(userId: string) {
    this.userId = userId;
  }

  async start() {
    console.log('PresenceManager: Starting for user:', this.userId);
    await this.updateStatus('online');
    console.log('PresenceManager: Initial status set to online');
    this.startHeartbeat();
    console.log('PresenceManager: Heartbeat started');
    await this.subscribeToPresenceUpdates();
    console.log('PresenceManager: Subscribed to presence updates');
    this.setupVisibilityHandlers();
    console.log('PresenceManager: Visibility handlers setup complete');
  }

  async stop() {
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
    this.channel = await subscribeToPresence((presence) => {
      this.onPresenceUpdateCallbacks.forEach(callback => callback(presence));
    });
  }

  private setupVisibilityHandlers() {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        this.updateStatus('away');
      } else {
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
