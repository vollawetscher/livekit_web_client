interface TokenData {
  token: string;
  expiresAt: number;
}

export class TokenManager {
  private static readonly STORAGE_KEY = 'voice_assistant_token';
  private static readonly TOKEN_VALIDITY_DAYS = 30;
  private static readonly REFRESH_BUFFER_DAYS = 2; // Refresh 2 days before expiry
  private baseUrl: string;
  private userId: string;
  private deviceId: string;

  constructor(baseUrl: string, userId: string = 'web-user', deviceId?: string) {
    this.baseUrl = baseUrl;
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

  private getStoredToken(): TokenData | null {
    try {
      const stored = localStorage.getItem(TokenManager.STORAGE_KEY);
      if (!stored) return null;

      const data: TokenData = JSON.parse(stored);
      return data;
    } catch (error) {
      console.error('Failed to parse stored token:', error);
      return null;
    }
  }

  private storeToken(token: string): void {
    const expiresAt = Date.now() + (TokenManager.TOKEN_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
    const data: TokenData = { token, expiresAt };
    localStorage.setItem(TokenManager.STORAGE_KEY, JSON.stringify(data));
  }

  private isTokenValid(tokenData: TokenData): boolean {
    const now = Date.now();
    const bufferTime = TokenManager.REFRESH_BUFFER_DAYS * 24 * 60 * 60 * 1000;
    return tokenData.expiresAt - now > bufferTime;
  }

  async getToken(): Promise<string> {
    const stored = this.getStoredToken();

    if (stored && this.isTokenValid(stored)) {
      console.log('Using valid stored token');
      return stored.token;
    }

    console.log('Requesting new token from server');
    return await this.requestNewToken();
  }

  private async requestNewToken(): Promise<string> {
    const tokenUrl = `${this.baseUrl}/api/mobile/auth/token`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: this.userId,
        deviceId: this.deviceId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.token) {
      throw new Error('No token in response');
    }

    this.storeToken(data.token);
    console.log('Token stored successfully');

    return data.token;
  }

  clearToken(): void {
    localStorage.removeItem(TokenManager.STORAGE_KEY);
  }

  getTokenExpiry(): Date | null {
    const stored = this.getStoredToken();
    return stored ? new Date(stored.expiresAt) : null;
  }
}
