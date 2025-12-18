import {
  Room,
  RoomEvent,
  RemoteTrackPublication,
  RemoteAudioTrack,
  RemoteTrack,
  Track,
  LocalAudioTrack,
  createLocalAudioTrack,
  AudioCaptureOptions,
  DisconnectReason,
  RemoteParticipant,
} from 'livekit-client';

export interface CallStatusEvent {
  event: 'call-status';
  status: string;
  callId: string;
  phoneNumber: string;
  timestamp: number;
  sipParticipantId?: string;
}

export class LiveKitClient {
  private room: Room;
  private onLogMessage: (msg: string) => void;
  private onAudioReceived?: () => void;
  private onCallStatus?: (event: CallStatusEvent) => void;
  private isConnected = false;
  private sessionId: string = '';
  private localAudioTrack: LocalAudioTrack | null = null;

  constructor(
    onLogMessage: (msg: string) => void,
    onAudioReceived?: () => void,
    onCallStatus?: (event: CallStatusEvent) => void
  ) {
    this.room = new Room();
    this.onLogMessage = onLogMessage;
    this.onAudioReceived = onAudioReceived;
    this.onCallStatus = onCallStatus;

    this.setupRoomListeners();
  }

  private setupRoomListeners(): void {
    this.room.on(RoomEvent.Connected, () => {
      console.log('✅ Connected to LiveKit room');
      this.onLogMessage('Connected to LiveKit room');
      this.isConnected = true;
    });

    this.room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      console.log('🔌 Disconnected from LiveKit room:', reason);
      this.onLogMessage(`Disconnected: ${reason || 'Unknown reason'}`);
      this.isConnected = false;
    });

    this.room.on(RoomEvent.Reconnecting, () => {
      console.log('🔄 Reconnecting to LiveKit room...');
      this.onLogMessage('Reconnecting...');
    });

    this.room.on(RoomEvent.Reconnected, () => {
      console.log('✅ Reconnected to LiveKit room');
      this.onLogMessage('Reconnected');
    });

    this.room.on(RoomEvent.TrackSubscribed, (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      _participant: RemoteParticipant
    ) => {
      if (track.kind === Track.Kind.Audio) {
        console.log('🎵 Audio track subscribed:', publication.trackSid);
        this.onLogMessage('Assistant audio connected');

        const audioElement = (track as RemoteAudioTrack).attach();
        document.body.appendChild(audioElement);
        audioElement.play();

        if (this.onAudioReceived) {
          this.onAudioReceived();
        }
      }
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      _participant: RemoteParticipant
    ) => {
      if (track.kind === Track.Kind.Audio) {
        console.log('🔇 Audio track unsubscribed:', publication.trackSid);
        (track as RemoteAudioTrack).detach().forEach((element) => element.remove());
      }
    });

    this.room.on(RoomEvent.DataReceived, (
      payload: Uint8Array,
      _participant?: any
    ) => {
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);

        console.log('📨 Data received:', data);

        if (data.event === 'call-status') {
          this.onLogMessage(`Call status: ${data.status}`);
          if (this.onCallStatus) {
            this.onCallStatus(data as CallStatusEvent);
          }
        } else if (data.event === 'transcript') {
          console.log('📝 Transcript:', data.text);
          this.onLogMessage('Transcript: ' + data.text);
        } else if (data.event === 'ready') {
          if (data.sessionId) {
            this.sessionId = data.sessionId;
            console.log('✅ Session ID received:', this.sessionId);
            this.onLogMessage(`Session ready: ${this.sessionId}`);
          }
        }
      } catch (error) {
        console.error('❌ Error parsing data message:', error);
      }
    });

    this.room.on(RoomEvent.ConnectionQualityChanged, (quality: any, participant: any) => {
      console.log('📶 Connection quality:', quality, participant?.identity);
    });

    this.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log('👤 Participant connected:', participant.identity);
      if (participant.identity.startsWith('sip-')) {
        this.onLogMessage(`SIP participant joined room: ${participant.identity}`);
      }
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      console.log('👤 Participant disconnected:', participant.identity);

      if (participant.identity.startsWith('sip-')) {
        this.onLogMessage(`SIP participant left room: ${participant.identity}`);

        const metadata = participant.metadata ? JSON.parse(participant.metadata) : {};
        if (metadata.callId && metadata.phoneNumber) {
          if (this.onCallStatus) {
            this.onCallStatus({
              event: 'call-status',
              status: 'completed',
              callId: metadata.callId,
              phoneNumber: metadata.phoneNumber,
              timestamp: Date.now(),
              sipParticipantId: participant.identity,
            });
          }
        }
      }
    });

    this.room.on(RoomEvent.TrackPublished, (publication, participant: RemoteParticipant) => {
      console.log('📢 Track published:', publication.kind, 'by', participant.identity);

      if (participant.identity.startsWith('sip-') && publication.kind === Track.Kind.Audio) {
        this.onLogMessage(`Call answered - audio track detected`);

        const metadata = participant.metadata ? JSON.parse(participant.metadata) : {};
        if (metadata.callId && metadata.phoneNumber) {
          if (this.onCallStatus) {
            this.onCallStatus({
              event: 'call-status',
              status: 'answered',
              callId: metadata.callId,
              phoneNumber: metadata.phoneNumber,
              timestamp: Date.now(),
              sipParticipantId: participant.identity,
            });
          }
        }
      }
    });
  }

  async connect(url: string, token: string): Promise<void> {
    try {
      console.log('🔌 Connecting to LiveKit:', url);
      this.onLogMessage(`Connecting to ${url}...`);

      await this.room.connect(url, token);

      console.log('✅ Room connected');
      this.sessionId = this.room.name || 'default-session';
      this.onLogMessage('Room connected');

      const startMessage = {
        event: 'start',
        callId: 'web-client-' + Date.now(),
        metadata: {},
      };
      await this.sendData(startMessage);
      this.onLogMessage('Sent start event');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Connection failed';
      console.error('❌ Failed to connect to LiveKit:', error);
      this.onLogMessage(`Connection failed: ${errorMsg}`);
      throw new Error(`Failed to connect: ${errorMsg}`);
    }
  }

  async publishAudio(audioOptions?: AudioCaptureOptions): Promise<void> {
    try {
      console.log('🎤 Creating local audio track...');

      const options: AudioCaptureOptions = audioOptions || {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };

      this.localAudioTrack = await createLocalAudioTrack(options);

      console.log('🎤 Publishing audio track to room...');
      await this.room.localParticipant.publishTrack(this.localAudioTrack);

      this.onLogMessage('Microphone connected');
      console.log('✅ Audio track published');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to publish audio';
      console.error('❌ Failed to publish audio:', error);
      this.onLogMessage(`Audio error: ${errorMsg}`);
      throw error;
    }
  }

  async unpublishAudio(): Promise<void> {
    if (this.localAudioTrack) {
      console.log('🔇 Unpublishing audio track...');
      await this.room.localParticipant.unpublishTrack(this.localAudioTrack);
      this.localAudioTrack.stop();
      this.localAudioTrack = null;
      this.onLogMessage('Microphone disconnected');
    }
  }

  async sendData(data: unknown): Promise<void> {
    try {
      const message = JSON.stringify(data);
      const encoder = new TextEncoder();
      const dataArray = encoder.encode(message);

      await this.room.localParticipant.publishData(dataArray, {
        reliable: true,
      });

      console.log('📤 Data sent:', data);
    } catch (error) {
      console.error('❌ Failed to send data:', error);
      throw error;
    }
  }

  sendStop(): void {
    console.log('📤 Sending stop event');
    this.sendData({
      event: 'stop',
    });
  }

  disconnect(): void {
    console.log('🔌 Disconnecting from LiveKit...');

    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack = null;
    }

    this.room.disconnect();
    this.isConnected = false;
    this.sessionId = '';

    this.onLogMessage('Disconnected');
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getConnectionState(): string {
    return this.room.state;
  }

  getRoom(): Room {
    return this.room;
  }

  logStatus(): void {
    console.log('📊 LiveKit Status:', {
      state: this.room.state,
      connected: this.isConnected,
      sessionId: this.sessionId,
      participants: this.room.numParticipants,
      localTracks: this.room.localParticipant.trackPublications.size,
    });
  }
}
