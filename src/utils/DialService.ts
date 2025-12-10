interface DialResponse {
  callId: string;
  status: string;
  twilioCallSid: string;
  message: string;
}

export class DialService {
  private baseUrl: string;
  private jwtToken: string;

  constructor(baseUrl: string, jwtToken: string) {
    this.baseUrl = baseUrl;
    this.jwtToken = jwtToken;
  }

  async dialContact(
    phoneNumber: string,
    contactName: string,
    sessionId: string
  ): Promise<DialResponse> {
    const response = await fetch(`${this.baseUrl}/api/mobile/call/dial`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phoneNumber, contactName, sessionId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Dial failed: ${response.status} ${errorText}`);
    }

    return await response.json();
  }
}
