export class AudioRecorder {
  private onAudioLevel?: (level: number) => void;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunkCount = 0;
  private lastLogTime = 0;

  // Adaptive gain control for level display
  private recentPeaks: number[] = [];
  private maxPeakHistory = 50; // Track last 50 peaks
  private adaptiveGain = 5.0; // Start with moderate gain

  constructor(
    onAudioLevel?: (level: number) => void
  ) {
    this.onAudioLevel = onAudioLevel;
  }

  async start(): Promise<void> {
    console.log('🎤 [AudioRecorder] Requesting microphone access...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      console.error('❌ [AudioRecorder] Failed to get microphone access:', error);
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          throw new Error('Microphone access denied. Please allow microphone permissions in your browser settings.');
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          throw new Error('No microphone found. Please connect a microphone and try again.');
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          throw new Error('Microphone is already in use by another application.');
        }
      }
      throw new Error(`Failed to access microphone: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const audioTrack = this.mediaStream.getAudioTracks()[0];
    const settings = audioTrack.getSettings();
    console.log('🎤 [AudioRecorder] Microphone track settings:', settings);
    console.log('🎤 [AudioRecorder] Track enabled:', audioTrack.enabled, 'readyState:', audioTrack.readyState);

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    console.log('🎤 [AudioRecorder] AudioContext created, state:', this.audioContext.state);

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

      // Track recent peaks for adaptive gain
      this.recentPeaks.push(rms);
      if (this.recentPeaks.length > this.maxPeakHistory) {
        this.recentPeaks.shift();
      }

      // Calculate average peak for adaptive gain
      const avgPeak = this.recentPeaks.reduce((a, b) => a + b, 0) / this.recentPeaks.length;
      if (avgPeak > 0) {
        this.adaptiveGain = Math.min(10, Math.max(3, 0.75 / avgPeak));
      }

      const level = Math.min(1, rms * this.adaptiveGain);

      // Log every 5 seconds
      const now = Date.now();
      if (now - this.lastLogTime > 5000) {
        console.log(`🎤 [AudioRecorder] chunk ${this.chunkCount}, level: ${level.toFixed(3)}, RMS: ${rms.toFixed(4)}, gain: ${this.adaptiveGain.toFixed(1)}x`);
        this.lastLogTime = now;
      }

      if (this.onAudioLevel) {
        this.onAudioLevel(level);
      }
    };

    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    console.log('🎤 Audio recording started - LiveKit handles VAD');
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
