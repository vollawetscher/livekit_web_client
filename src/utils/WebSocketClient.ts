export class WebSocketClient {
  private url: string;
  private token: string;
  private ws: WebSocket | null = null;
  private onLogMessage: (msg: string) => void;

  constructor(url: string, token: string, onLogMessage: (msg: string) => void) {
    this.url = url;
    this.token = token;
    this.onLogMessage = onLogMessage;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${this.url}?token=${this.token}`);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.onLogMessage('WebSocket connected');

        this.send({
          event: 'start',
          userId: 'test-user',
          deviceId: 'web-test',
          callId: 'test-' + Date.now(),
        });

        resolve();
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.event === 'audio') {
          this.playAudio(data.audio);
        } else if (data.event === 'transcript') {
          console.log('📝 Transcript:', data.text);
          this.onLogMessage('Transcript: ' + data.text);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.onLogMessage('WebSocket error');
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        this.onLogMessage('WebSocket disconnected');
      };
    });
  }

  send(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendAudio(audioData: ArrayBuffer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(audioData)));
      this.send({
        event: 'media',
        audio: base64,
      });
    }
  }

  playAudio(base64Audio: string): void {
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const audioContext = new AudioContext({ sampleRate: 8000 });
    const audioBuffer = audioContext.createBuffer(1, bytes.length / 2, 8000);
    const channelData = audioBuffer.getChannelData(0);

    for (let i = 0; i < bytes.length; i++) {
      channelData[i] = this.mulawToLinear(bytes[i]) / 32768.0;
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
  }

  private mulawToLinear(mulaw: number): number {
    mulaw = ~mulaw;
    const sign = mulaw & 0x80;
    const exponent = (mulaw >> 4) & 0x07;
    const mantissa = mulaw & 0x0f;
    let sample = (mantissa << 3) + 0x84;
    sample <<= exponent;
    return sign ? -sample : sample;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
