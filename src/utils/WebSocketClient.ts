export class WebSocketClient {
  private url: string;
  private token: string;
  private ws: WebSocket | null = null;
  private onLogMessage: (msg: string) => void;
  private onAudioReceived?: () => void;
  private isReady = false;

  // Audio playback queue system
  private audioContext: AudioContext | null = null;
  private audioQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;

  // Debugging
  private audioSentCount = 0;
  private lastSendLogTime = 0;

  constructor(url: string, token: string, onLogMessage: (msg: string) => void, onAudioReceived?: () => void) {
    this.url = url;
    this.token = token;
    this.onLogMessage = onLogMessage;
    this.onAudioReceived = onAudioReceived;

    // Initialize single reusable AudioContext
    this.audioContext = new AudioContext({ sampleRate: 8000 });
  }

  async connect(): Promise<void> {
    // Ensure AudioContext is initialized
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext({ sampleRate: 8000 });
      console.log('🔊 AudioContext initialized');
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${this.url}?token=${this.token}`);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.onLogMessage('WebSocket connected');

        this.send({
          event: 'start',
          callId: 'test-' + Date.now(),
          metadata: {},
        });

        this.onLogMessage('Waiting for server ready...');
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        console.log(`📨 [WebSocketClient] Received event: ${data.event}`);

        if (data.event === 'ready') {
          console.log('🟢 Server ready');
          this.onLogMessage('Server ready - can send audio now');
          this.isReady = true;
          resolve();
        } else if (data.event === 'audio') {
          console.log(`🔊 [WebSocketClient] Received audio chunk (${data.audio?.length} bytes)`);
          this.playAudio(data.audio);
        } else if (data.event === 'transcript') {
          console.log('📝 Transcript:', data.text);
          this.onLogMessage('Transcript: ' + data.text);
        } else {
          console.log(`⚠️ [WebSocketClient] Unknown event: ${data.event}`, data);
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
    this.audioSentCount++;

    // Log every 5 seconds
    const now = Date.now();
    if (now - this.lastSendLogTime > 5000) {
      console.log(`📤 [WebSocketClient] Sending audio - count: ${this.audioSentCount}, ws ready: ${this.ws?.readyState === WebSocket.OPEN}, server ready: ${this.isReady}`);
      this.lastSendLogTime = now;
    }

    if (!this.ws) {
      console.error('❌ [WebSocketClient] Cannot send audio - WebSocket is null');
      return;
    }

    if (this.ws.readyState !== WebSocket.OPEN) {
      console.error(`❌ [WebSocketClient] Cannot send audio - WebSocket state: ${this.ws.readyState} (expected ${WebSocket.OPEN})`);
      return;
    }

    if (!this.isReady) {
      console.warn('⚠️ [WebSocketClient] Cannot send audio - server not ready yet');
      return;
    }

    try {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(audioData)));
      this.send({
        event: 'media',
        audio: base64,
      });
    } catch (error) {
      console.error('❌ [WebSocketClient] Error encoding/sending audio:', error);
    }
  }

  playAudio(base64Audio: string): void {
    if (this.onAudioReceived) {
      this.onAudioReceived();
    }

    if (!this.audioContext) {
      console.error('AudioContext not initialized');
      return;
    }

    // Decode base64 to bytes
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create audio buffer from mulaw-encoded bytes
    const audioBuffer = this.audioContext.createBuffer(1, bytes.length, 8000);
    const channelData = audioBuffer.getChannelData(0);

    for (let i = 0; i < bytes.length; i++) {
      channelData[i] = this.mulawToLinear(bytes[i]) / 32768.0;
    }

    // Add to queue and start playback if not already playing
    this.audioQueue.push(audioBuffer);
    console.log(`🎵 Audio chunk queued (queue size: ${this.audioQueue.length})`);

    if (!this.isPlaying) {
      this.playNextInQueue();
    }
  }

  private playNextInQueue(): void {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      console.log('✅ Audio queue empty - playback complete');
      return;
    }

    if (!this.audioContext) {
      console.error('AudioContext not initialized');
      return;
    }

    this.isPlaying = true;
    const audioBuffer = this.audioQueue.shift()!;

    console.log(`▶️ Playing audio chunk (${this.audioQueue.length} remaining in queue)`);

    // Create and configure audio source
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    // Play next chunk when this one finishes
    source.onended = () => {
      this.currentSource = null;
      this.playNextInQueue();
    };

    this.currentSource = source;
    source.start();
  }

  clearAudioQueue(): void {
    // Stop current playback
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      this.currentSource = null;
    }

    // Clear queue
    this.audioQueue = [];
    this.isPlaying = false;
    console.log('🧹 Audio queue cleared');
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

  getStatus(): string {
    const wsState = this.ws ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][this.ws.readyState] : 'NULL';
    const contextState = this.audioContext?.state || 'NULL';
    return `WebSocket: ${wsState}, Server Ready: ${this.isReady}, AudioContext: ${contextState}, Queue: ${this.audioQueue.length}, Playing: ${this.isPlaying}, Sent: ${this.audioSentCount}`;
  }

  logStatus(): void {
    console.log(`📊 [WebSocketClient] Status: ${this.getStatus()}`);
  }

  disconnect(): void {
    // Clear audio queue and stop playback
    this.clearAudioQueue();

    // Close AudioContext
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isReady = false;
  }
}
