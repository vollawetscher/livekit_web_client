export class WebSocketClient {
  private url: string;
  private token: string;
  private ws: WebSocket | null = null;
  private onLogMessage: (msg: string) => void;
  private onAudioReceived?: () => void;
  private isReady = false;

  // Audio playback queue system with precise timing
  private audioContext: AudioContext | null = null;
  private audioQueue: AudioBuffer[] = [];
  private nextPlayTime = 0;
  private scheduledSources: AudioBufferSourceNode[] = [];

  // Debugging
  private audioSentCount = 0;
  private lastSendLogTime = 0;

  constructor(url: string, token: string, onLogMessage: (msg: string) => void, onAudioReceived?: () => void) {
    this.url = url;
    this.token = token;
    this.onLogMessage = onLogMessage;
    this.onAudioReceived = onAudioReceived;

    // Don't create AudioContext in constructor - will create it lazily on connect
    // This avoids mobile browser restrictions on AudioContext creation
  }

  async connect(): Promise<void> {
    // Ensure AudioContext is initialized
    if (!this.audioContext || this.audioContext.state === 'closed') {
      try {
        this.audioContext = new AudioContext({ sampleRate: 8000 });
        console.log('🔊 AudioContext initialized, state:', this.audioContext.state);
        this.onLogMessage(`AudioContext: ${this.audioContext.state}`);

        // Try to resume if suspended (common on mobile)
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
          console.log('🔊 AudioContext resumed, state:', this.audioContext.state);
        }
      } catch (error) {
        console.error('❌ Failed to create AudioContext:', error);
        this.onLogMessage(`AudioContext error: ${error instanceof Error ? error.message : 'Unknown'}`);
        throw new Error(`Failed to initialize audio: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }

    return new Promise((resolve, reject) => {
      const connectionTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          this.ws.close();
          reject(new Error('Connection timeout - server did not respond'));
        }
      }, 10000); // 10 second timeout

      try {
        const wsUrl = `${this.url}?token=${encodeURIComponent(this.token)}`;
        console.log('🔌 [WebSocketClient] Attempting to connect to:', wsUrl);
        this.onLogMessage(`Connecting to ${this.url}...`);
        this.ws = new WebSocket(wsUrl);
      } catch (error) {
        clearTimeout(connectionTimeout);
        const errorMsg = error instanceof Error ? error.message : 'Invalid WebSocket URL';
        console.error('❌ [WebSocketClient] Failed to create WebSocket:', error);
        this.onLogMessage(`Failed to create WebSocket: ${errorMsg}`);
        reject(new Error(`Failed to create WebSocket: ${errorMsg}`));
        return;
      }

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
        try {
          const data = JSON.parse(event.data);

          console.log(`📨 [WebSocketClient] Received event: ${data.event}`);

          if (data.event === 'ready') {
            console.log('🟢 Server ready');
            this.onLogMessage('Server ready - can send audio now');
            this.isReady = true;
            clearTimeout(connectionTimeout);
            resolve();
          } else if (data.event === 'error') {
            console.error('❌ Server error:', data.message);
            this.onLogMessage(`Server error: ${data.message}`);
            clearTimeout(connectionTimeout);
            reject(new Error(data.message || 'Server reported an error'));
          } else if (data.event === 'audio') {
            console.log(`🔊 [WebSocketClient] Received audio chunk (${data.audio?.length} bytes)`);
            this.playAudio(data.audio);
          } else if (data.event === 'transcript') {
            console.log('📝 Transcript:', data.text);
            this.onLogMessage('Transcript: ' + data.text);
          } else {
            console.log(`⚠️ [WebSocketClient] Unknown event: ${data.event}`, data);
          }
        } catch (error) {
          console.error('❌ Error parsing message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        console.error('❌ WebSocket readyState:', this.ws?.readyState);
        console.error('❌ Navigator online:', navigator.onLine);
        console.error('❌ URL:', this.url);

        const detailedError = `WebSocket error - ReadyState: ${this.ws?.readyState}, Online: ${navigator.onLine}`;
        this.onLogMessage(detailedError);
        clearTimeout(connectionTimeout);

        // Provide more specific error message
        reject(new Error(`Connection failed - ${detailedError}`));
      };

      this.ws.onclose = (event) => {
        console.log(`🔌 WebSocket disconnected (code: ${event.code}, reason: ${event.reason})`);
        clearTimeout(connectionTimeout);

        if (!this.isReady) {
          // Connection closed before ready - this is an error
          let errorMsg = 'Connection closed by server';

          if (event.code === 1000) {
            errorMsg = 'Connection closed normally';
          } else if (event.code === 1006) {
            errorMsg = 'Connection failed - server unreachable or rejected connection';
          } else if (event.code === 1008) {
            errorMsg = 'Connection rejected - invalid authentication token';
          } else if (event.reason) {
            errorMsg = `Connection closed: ${event.reason}`;
          }

          this.onLogMessage(errorMsg);
          reject(new Error(errorMsg));
        } else {
          this.onLogMessage('WebSocket disconnected');
        }
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

    // Resume audio context if suspended
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
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

    // Schedule audio chunk for seamless playback
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    // Calculate when to start this chunk
    const currentTime = this.audioContext.currentTime;
    const startTime = Math.max(currentTime, this.nextPlayTime);

    // Schedule playback
    source.start(startTime);

    // Update next play time for seamless chaining
    this.nextPlayTime = startTime + audioBuffer.duration;

    // Clean up after playback
    source.onended = () => {
      const index = this.scheduledSources.indexOf(source);
      if (index > -1) {
        this.scheduledSources.splice(index, 1);
      }
    };

    this.scheduledSources.push(source);

    console.log(`🎵 Audio scheduled at ${startTime.toFixed(3)}s, duration: ${audioBuffer.duration.toFixed(3)}s, next: ${this.nextPlayTime.toFixed(3)}s`);
  }

  clearAudioQueue(): void {
    // Stop all scheduled sources
    for (const source of this.scheduledSources) {
      try {
        source.stop();
      } catch (e) {
        // Ignore if already stopped
      }
    }

    // Clear state
    this.scheduledSources = [];
    this.audioQueue = [];
    this.nextPlayTime = 0;
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
    const currentTime = this.audioContext?.currentTime.toFixed(2) || '0';
    const nextPlay = this.nextPlayTime.toFixed(2);
    return `WebSocket: ${wsState}, Server Ready: ${this.isReady}, AudioContext: ${contextState}, Scheduled: ${this.scheduledSources.length}, CurrentTime: ${currentTime}s, NextPlay: ${nextPlay}s, Sent: ${this.audioSentCount}`;
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
