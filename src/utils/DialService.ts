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
    const response = await fetch(`${this.baseUrl}/functions/v1/dial-twilio-call`, {
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

  async hangupCall(callId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/api/mobile/call/hangup`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ callId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hangup failed: ${response.status} ${errorText}`);
    }

    return await response.json();
  }
}
