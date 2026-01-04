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
    await this.updateStatus('online');
    this.startHeartbeat();
    await this.subscribeToPresenceUpdates();
    this.setupVisibilityHandlers();
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
      await upsertUserPresence({
        user_id: this.userId,
        status,
        metadata: {
          browser: navigator.userAgent,
        },
      });
    } catch (error) {
      console.error('Failed to update presence:', error);
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
