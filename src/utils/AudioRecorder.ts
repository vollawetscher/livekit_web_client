export class AudioRecorder {
  private onAudioData: (data: ArrayBuffer) => void;
  private onAudioLevel?: (level: number) => void;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunkCount = 0;
  private lastLogTime = 0;

  constructor(onAudioData: (data: ArrayBuffer) => void, onAudioLevel?: (level: number) => void) {
    this.onAudioData = onAudioData;
    this.onAudioLevel = onAudioLevel;
  }

  async start(): Promise<void> {
    console.log('🎤 [AudioRecorder] Requesting microphone access...');

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        latency: 0,
      },
    });

    const audioTrack = this.mediaStream.getAudioTracks()[0];
    const settings = audioTrack.getSettings();
    console.log('🎤 [AudioRecorder] Microphone track settings:', settings);
    console.log('🎤 [AudioRecorder] Track enabled:', audioTrack.enabled, 'readyState:', audioTrack.readyState);

    // Monitor track state changes
    audioTrack.addEventListener('mute', () => {
      console.warn('⚠️ [AudioRecorder] Audio track MUTED!');
    });
    audioTrack.addEventListener('unmute', () => {
      console.log('✅ [AudioRecorder] Audio track UNMUTED');
    });
    audioTrack.addEventListener('ended', () => {
      console.error('❌ [AudioRecorder] Audio track ENDED!');
    });

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    console.log('🎤 [AudioRecorder] AudioContext created, state:', this.audioContext.state);

    // Monitor AudioContext state changes
    this.audioContext.addEventListener('statechange', () => {
      console.log(`🎤 [AudioRecorder] AudioContext state changed to: ${this.audioContext?.state}`);
    });

    const source = this.audioContext.createMediaStreamSource(this.mediaStream);

    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      this.chunkCount++;
      const inputData = e.inputBuffer.getChannelData(0);

      // Calculate audio level (RMS)
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      const level = Math.min(1, rms * 10); // Amplify for visibility

      // Log every 50 chunks (~5 seconds at 4096 buffer size @ 16kHz)
      const now = Date.now();
      if (now - this.lastLogTime > 5000) {
        console.log(`🎤 [AudioRecorder] Still capturing audio - chunk ${this.chunkCount}, level: ${level.toFixed(3)}, context state: ${this.audioContext?.state}`);
        this.lastLogTime = now;
      }

      if (this.onAudioLevel) {
        this.onAudioLevel(level);
      }

      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      this.onAudioData(pcm16.buffer);
    };

    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    console.log('🎤 Audio recording started with processor connected to destination');
  }

  stop(): void {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    console.log('🛑 Audio recording stopped');
  }
}
