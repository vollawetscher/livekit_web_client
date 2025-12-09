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

        if (data.event === 'ready') {
          console.log('🟢 Server ready');
          this.onLogMessage('Server ready - can send audio now');
          this.isReady = true;
          resolve();
        } else if (data.event === 'audio') {
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
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isReady) {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(audioData)));
      this.send({
        event: 'media',
        audio: base64,
      });
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
    const audioBuffer = this.audioContext.createBuffer(1, bytes.length / 2, 8000);
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
