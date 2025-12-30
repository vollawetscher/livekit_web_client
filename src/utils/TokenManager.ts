export class TokenManager {
  private userId: string;
  private deviceId: string;
  private currentToken: string | null = null;
  private tokenExpiry: number | null = null;

  constructor(userId: string = 'web-user', deviceId?: string) {
    this.userId = userId;
    this.deviceId = deviceId || this.generateDeviceId();
  }

  private generateDeviceId(): string {
    const stored = localStorage.getItem('voice_assistant_device_id');
    if (stored) return stored;

    const newId = `web-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    localStorage.setItem('voice_assistant_device_id', newId);
    return newId;
  }

  private parseJwtExpiry(token: string): number | null {
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      return decoded.exp ? decoded.exp * 1000 : null;
    } catch (error) {
      console.error('Failed to parse JWT expiry:', error);
      return null;
    }
  }

  private isTokenValid(): boolean {
    if (!this.currentToken || !this.tokenExpiry) return false;
    const bufferTime = 5 * 60 * 1000;
    return this.tokenExpiry - Date.now() > bufferTime;
  }

  async getToken(): Promise<string> {
    if (this.currentToken && this.isTokenValid()) {
      console.log('Using valid cached token');
      return this.currentToken;
    }

    console.log('Requesting new token from server');
    return await this.requestNewToken();
  }

  private async requestNewToken(): Promise<string> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }

    const tokenUrl = `${supabaseUrl}/functions/v1/generate-livekit-token`;
    const roomName = import.meta.env.VITE_LIVEKIT_ROOM_NAME || `room-${this.userId}`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        roomName: roomName,
        participantIdentity: this.deviceId,
        participantName: this.userId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    if (!data.token) {
      throw new Error('No token in response');
    }

    this.currentToken = data.token;
    this.tokenExpiry = this.parseJwtExpiry(data.token);

    const expiryDate = this.tokenExpiry ? new Date(this.tokenExpiry).toLocaleString() : 'unknown';
    console.log(`LiveKit token received (expires: ${expiryDate})`);

    return data.token;
  }

  clearToken(): void {
    this.currentToken = null;
    this.tokenExpiry = null;
  }

  getTokenExpiry(): Date | null {
    return this.tokenExpiry ? new Date(this.tokenExpiry) : null;
  }
}
