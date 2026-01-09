export class TokenManager {
  private userId: string;
  private organizationId: string | null;
  private deviceId: string;
  private currentToken: string | null = null;
  private tokenExpiry: number | null = null;
  private currentRoomName: string | null = null;

  constructor(userId: string = 'web-user', organizationId: string | null = null, deviceId?: string) {
    this.userId = userId;
    this.organizationId = organizationId;
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

  async getToken(roomName: string): Promise<string> {
    if (!roomName) {
      throw new Error('Room name is required');
    }

    if (this.currentToken && this.isTokenValid() && this.currentRoomName === roomName) {
      console.log('Using valid cached token for same room');
      return this.currentToken;
    }

    if (this.currentRoomName && this.currentRoomName !== roomName) {
      console.log('Room name changed, requesting new token');
    } else {
      console.log('Requesting new token from server');
    }

    return await this.requestNewToken(roomName);
  }

  private async requestNewToken(roomName: string): Promise<string> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }

    const tokenUrl = `${supabaseUrl}/functions/v1/generate-livekit-token`;

    const requestBody: Record<string, string> = {
      roomName: roomName,
      participantIdentity: this.deviceId,
      participantName: this.userId,
    };

    if (this.organizationId) {
      requestBody.organizationId = this.organizationId;
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify(requestBody),
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
    this.currentRoomName = roomName;

    const expiryDate = this.tokenExpiry ? new Date(this.tokenExpiry).toLocaleString() : 'unknown';
    console.log(`LiveKit token received for room ${roomName} (expires: ${expiryDate})`);

    return data.token;
  }

  clearToken(): void {
    this.currentToken = null;
    this.tokenExpiry = null;
    this.currentRoomName = null;
  }

  getTokenExpiry(): Date | null {
    return this.tokenExpiry ? new Date(this.tokenExpiry) : null;
  }
}
