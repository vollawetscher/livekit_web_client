import {
  Room,
  RoomEvent,
  RemoteTrackPublication,
  RemoteAudioTrack,
  RemoteTrack,
  Track,
  LocalAudioTrack,
  LocalVideoTrack,
  createLocalAudioTrack,
  createLocalVideoTrack,
  AudioCaptureOptions,
  VideoCaptureOptions,
  VideoPresets,
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
  private onStopRingtone?: () => void;
  private onParticipantDisconnected?: (participantIdentity: string, participantName: string) => void;
  private onParticipantConnected?: (participantIdentity: string, participantName: string) => void;
  private onParticipantCountChanged?: (humanCount: number, totalCount: number) => void;
  private isConnected = false;
  private sessionId: string = '';
  private localAudioTrack: LocalAudioTrack | null = null;
  private localVideoTrack: LocalVideoTrack | null = null;

  constructor(
    onLogMessage: (msg: string) => void,
    onAudioReceived?: () => void,
    onCallStatus?: (event: CallStatusEvent) => void,
    onStopRingtone?: () => void,
    onParticipantDisconnected?: (participantIdentity: string, participantName: string) => void,
    onParticipantConnected?: (participantIdentity: string, participantName: string) => void,
    onParticipantCountChanged?: (humanCount: number, totalCount: number) => void
  ) {
    this.room = new Room();
    this.onLogMessage = onLogMessage;
    this.onAudioReceived = onAudioReceived;
    this.onCallStatus = onCallStatus;
    this.onStopRingtone = onStopRingtone;
    this.onParticipantDisconnected = onParticipantDisconnected;
    this.onParticipantConnected = onParticipantConnected;
    this.onParticipantCountChanged = onParticipantCountChanged;

    this.setupRoomListeners();
  }

  private isMediaWorker(participant: RemoteParticipant): boolean {
    const identity = participant.identity?.toLowerCase() || '';
    const name = participant.name?.toLowerCase() || '';

    return (
      identity.includes('agent') ||
      identity.includes('transcription') ||
      identity.includes('recorder') ||
      identity.includes('media-worker') ||
      identity.startsWith('sip-') ||
      name.includes('agent') ||
      name.includes('transcription') ||
      name.includes('recorder') ||
      name.includes('sip')
    );
  }

  private updateParticipantCount(): void {
    if (!this.onParticipantCountChanged) return;

    const participants = this.getParticipants();
    const humanParticipants = participants.filter(p => !this.isMediaWorker(p));

    const humanCount = humanParticipants.length + 1;
    const totalCount = participants.length + 1;

    this.onParticipantCountChanged(humanCount, totalCount);
  }

  private setupRoomListeners(): void {
    this.room.on(RoomEvent.Connected, () => {
      console.log('✅ Connected to LiveKit room');
      this.onLogMessage('Connected to LiveKit room');
      this.isConnected = true;
      this.updateParticipantCount();
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
      participant: RemoteParticipant
    ) => {
      if (track.kind === Track.Kind.Audio) {
        console.log('🎵 Audio track subscribed:', publication.trackSid, 'from', participant.identity);
        this.onLogMessage('Audio track connected from ' + participant.identity);

        const audioElement = (track as RemoteAudioTrack).attach();
        document.body.appendChild(audioElement);
        audioElement.play();

        if (participant.identity.startsWith('sip-')) {
          console.log('📞 SIP participant audio connected - stopping ringtone');
          if (this.onStopRingtone) {
            this.onStopRingtone();
          }
        }

        if (this.onAudioReceived) {
          this.onAudioReceived();
        }
      } else if (track.kind === Track.Kind.Video) {
        console.log('📹 Video track subscribed:', publication.trackSid, 'from', participant.identity);
        this.onLogMessage('Video track connected from ' + participant.identity);
      }
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      console.log('Track unsubscribed:', track.kind, publication.trackSid, 'from', participant.identity);
      if (track.kind === Track.Kind.Audio) {
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
        } else if (data.event === 'admin-control') {
          this.handleAdminControl(data);
        }
      } catch (error) {
        console.error('❌ Error parsing data message:', error);
      }
    });

    this.room.on(RoomEvent.ConnectionQualityChanged, (quality: any, participant: any) => {
      console.log('📶 Connection quality:', quality, participant?.identity);
    });

    this.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log('👤 Participant connected:', participant.identity, 'metadata:', participant.metadata);
      this.onLogMessage(`Participant joined: ${participant.identity}`);

      this.updateParticipantCount();

      if (this.isMediaWorker(participant)) {
        if (participant.identity.startsWith('sip-')) {
          this.onLogMessage(`🔔 SIP participant connected (call may be ringing)`);
          console.log('SIP participant metadata:', participant.metadata);
        } else {
          console.log('Media worker connected:', participant.identity);
        }
      } else {
        if (this.onParticipantConnected) {
          this.onParticipantConnected(participant.identity, participant.name || participant.identity);
        }
      }
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      console.log('👤 Participant disconnected:', participant.identity);

      this.updateParticipantCount();

      if (this.isMediaWorker(participant)) {
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
        } else {
          console.log('Media worker disconnected:', participant.identity);
        }
      } else {
        this.onLogMessage(`Participant left: ${participant.identity}`);
        if (this.onParticipantDisconnected) {
          this.onParticipantDisconnected(participant.identity, participant.name || participant.identity);
        }
      }
    });

    this.room.on(RoomEvent.TrackPublished, (publication, participant: RemoteParticipant) => {
      console.log('📢 Track published:', publication.kind, 'by', participant.identity, 'at', new Date().toISOString());

      if (participant.identity.startsWith('sip-') && publication.kind === Track.Kind.Audio) {
        this.onLogMessage(`✅ Call answered - SIP audio track published`);
        console.log('🎵 SIP audio track published, triggering answered status');

        const metadata = participant.metadata ? JSON.parse(participant.metadata) : {};
        console.log('SIP participant metadata:', metadata);

        if (metadata.callId && metadata.phoneNumber) {
          console.log('Calling onCallStatus with answered status');
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
        } else {
          console.warn('Missing callId or phoneNumber in SIP participant metadata');
        }
      }
    });
  }

  async connect(url: string, token: string): Promise<void> {
    try {
      console.log('🔌 Connecting to LiveKit:', url);
      this.onLogMessage(`Connecting to ${url}...`);

      await this.room.connect(url, token, {
        autoSubscribe: true,
      });

      console.log('✅ Room connected with auto-subscribe enabled');
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

    if (this.localVideoTrack) {
      this.localVideoTrack.stop();
      this.localVideoTrack = null;
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

  async publishVideo(videoOptions?: VideoCaptureOptions): Promise<void> {
    try {
      console.log('📹 Creating local video track...');

      const options: VideoCaptureOptions = videoOptions || {
        resolution: VideoPresets.h720.resolution,
        facingMode: 'user',
      };

      this.localVideoTrack = await createLocalVideoTrack(options);

      console.log('📹 Publishing video track to room...');
      await this.room.localParticipant.publishTrack(this.localVideoTrack);

      this.onLogMessage('Camera connected');
      console.log('✅ Video track published');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to publish video';
      console.error('❌ Failed to publish video:', error);
      this.onLogMessage(`Video error: ${errorMsg}`);
      throw error;
    }
  }

  async unpublishVideo(): Promise<void> {
    if (this.localVideoTrack) {
      console.log('📹 Unpublishing video track...');
      await this.room.localParticipant.unpublishTrack(this.localVideoTrack);
      this.localVideoTrack.stop();
      this.localVideoTrack = null;
      this.onLogMessage('Camera disconnected');
    }
  }

  async toggleVideo(): Promise<boolean> {
    if (this.localVideoTrack) {
      await this.unpublishVideo();
      return false;
    } else {
      await this.publishVideo();
      return true;
    }
  }

  getParticipants(): RemoteParticipant[] {
    return Array.from(this.room.remoteParticipants.values());
  }

  getLocalParticipant() {
    return this.room.localParticipant;
  }

  getAllParticipants(): (RemoteParticipant | typeof this.room.localParticipant)[] {
    return [this.room.localParticipant, ...this.getParticipants()];
  }

  isVideoEnabled(): boolean {
    return this.localVideoTrack !== null;
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

  async toggleRemoteParticipantAudio(participantIdentity: string, muted: boolean): Promise<void> {
    try {
      console.log(`Sending mute command to ${participantIdentity}: ${muted}`);
      await this.sendData({
        event: 'admin-control',
        action: 'mute-audio',
        targetParticipant: participantIdentity,
        muted: muted,
      });
      this.onLogMessage(`Sent audio ${muted ? 'mute' : 'unmute'} to ${participantIdentity}`);
    } catch (error) {
      console.error('Failed to toggle remote participant audio:', error);
      throw error;
    }
  }

  async toggleRemoteParticipantVideo(participantIdentity: string, enabled: boolean): Promise<void> {
    try {
      console.log(`Sending video command to ${participantIdentity}: ${enabled ? 'enable' : 'disable'}`);
      await this.sendData({
        event: 'admin-control',
        action: 'toggle-video',
        targetParticipant: participantIdentity,
        enabled: enabled,
      });
      this.onLogMessage(`Sent video ${enabled ? 'enable' : 'disable'} to ${participantIdentity}`);
    } catch (error) {
      console.error('Failed to toggle remote participant video:', error);
      throw error;
    }
  }

  private async handleAdminControl(data: any): Promise<void> {
    if (data.targetParticipant !== this.room.localParticipant.identity) {
      return;
    }

    console.log('📨 Received admin control:', data);

    if (data.action === 'mute-audio') {
      if (data.muted && this.localAudioTrack) {
        await this.localAudioTrack.mute();
        this.onLogMessage('Admin muted your audio');
      } else if (!data.muted && this.localAudioTrack) {
        await this.localAudioTrack.unmute();
        this.onLogMessage('Admin unmuted your audio');
      }
    } else if (data.action === 'toggle-video') {
      if (!data.enabled && this.localVideoTrack) {
        await this.unpublishVideo();
        this.onLogMessage('Admin disabled your video');
      } else if (data.enabled && !this.localVideoTrack) {
        await this.publishVideo();
        this.onLogMessage('Admin enabled your video');
      }
    }
  }
}
