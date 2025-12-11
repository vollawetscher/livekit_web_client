export class AudioRecorder {
  private onAudioData: (data: ArrayBuffer) => void;
  private onAudioLevel?: (level: number) => void;
  private onCalibrationComplete?: (threshold: number) => void;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunkCount = 0;
  private lastLogTime = 0;

  // Voice Activity Detection (VAD) properties
  private isCalibrating = true;
  private calibrationSamples: number[] = [];
  private calibrationStartTime = 0;
  private calibrationDuration = 2000; // 2 seconds
  private noiseThreshold = 0;
  private thresholdMultiplier = 1.5; // Threshold is 1.5x the background noise

  constructor(
    onAudioData: (data: ArrayBuffer) => void,
    onAudioLevel?: (level: number) => void,
    onCalibrationComplete?: (threshold: number) => void
  ) {
    this.onAudioData = onAudioData;
    this.onAudioLevel = onAudioLevel;
    this.onCalibrationComplete = onCalibrationComplete;
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

    // Start calibration immediately
    this.isCalibrating = true;
    this.calibrationSamples = [];
    this.calibrationStartTime = Date.now();
    console.log('🎯 [AudioRecorder] Starting noise calibration (please remain quiet for 2 seconds)...');

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

      // Handle calibration phase
      if (this.isCalibrating) {
        const elapsed = Date.now() - this.calibrationStartTime;

        // Collect samples during calibration
        this.calibrationSamples.push(rms);

        // Check if calibration is complete
        if (elapsed >= this.calibrationDuration) {
          // Calculate average noise level
          const avgNoise = this.calibrationSamples.reduce((a, b) => a + b, 0) / this.calibrationSamples.length;

          // Set threshold as multiple of average noise
          this.noiseThreshold = avgNoise * this.thresholdMultiplier;

          console.log(`✅ [AudioRecorder] Calibration complete!`);
          console.log(`   Average noise: ${avgNoise.toFixed(4)}`);
          console.log(`   Threshold set to: ${this.noiseThreshold.toFixed(4)} (${this.thresholdMultiplier}x noise)`);

          this.isCalibrating = false;

          // Notify UI that calibration is complete
          if (this.onCalibrationComplete) {
            this.onCalibrationComplete(this.noiseThreshold);
          }
        }

        // Don't send audio during calibration
        if (this.onAudioLevel) {
          this.onAudioLevel(level);
        }
        return;
      }

      // Voice Activity Detection: Only send audio if level exceeds threshold
      const shouldSendAudio = rms > this.noiseThreshold;

      // Log every 5 seconds
      const now = Date.now();
      if (now - this.lastLogTime > 5000) {
        console.log(`🎤 [AudioRecorder] chunk ${this.chunkCount}, level: ${level.toFixed(3)}, RMS: ${rms.toFixed(4)}, threshold: ${this.noiseThreshold.toFixed(4)}, sending: ${shouldSendAudio}`);
        this.lastLogTime = now;
      }

      if (this.onAudioLevel) {
        this.onAudioLevel(level);
      }

      // Only send audio if it exceeds the threshold (voice detected)
      if (shouldSendAudio) {
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        this.onAudioData(pcm16.buffer);
      }
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
