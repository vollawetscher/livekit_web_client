import { useEffect, useRef } from 'react';
import { Mic, MicOff, Video as VideoIcon, VideoOff, User } from 'lucide-react';
import { RemoteParticipant, LocalParticipant, RemoteVideoTrack, LocalVideoTrack, Track } from 'livekit-client';

interface VideoTileProps {
  participant: RemoteParticipant | LocalParticipant;
  isLocal?: boolean;
  isSpeaking?: boolean;
}

export default function VideoTile({
  participant,
  isLocal = false,
  isSpeaking = false
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasAudio = participant.isMicrophoneEnabled;
  const identity = participant.identity;
  const isSip = identity.startsWith('sip-');

  const displayName = isLocal ? 'You' : isSip ? 'Phone Call' : identity;

  let hasVideo = false;
  let videoTrack: RemoteVideoTrack | LocalVideoTrack | undefined;

  if (isLocal) {
    const localParticipant = participant as LocalParticipant;
    const publication = localParticipant.getTrackPublication(Track.Source.Camera);
    videoTrack = publication?.track as LocalVideoTrack;
    hasVideo = !!videoTrack;
  } else {
    const remoteParticipant = participant as RemoteParticipant;
    const cameraPublication = Array.from(remoteParticipant.videoTrackPublications.values())
      .find(pub => pub.source === Track.Source.Camera);

    if (cameraPublication?.isSubscribed && cameraPublication?.track) {
      videoTrack = cameraPublication.track as RemoteVideoTrack;
      hasVideo = true;
    }
  }

  useEffect(() => {
    if (!videoRef.current || !videoTrack) return;

    console.log('Attaching video track for', participant.identity, videoTrack);
    videoTrack.attach(videoRef.current);

    return () => {
      if (videoTrack && videoRef.current) {
        videoTrack.detach(videoRef.current);
      }
    };
  }, [participant, videoTrack]);

  return (
    <div
      className={`relative aspect-video bg-slate-900 rounded-lg overflow-hidden border-2 transition-all ${
        isSpeaking
          ? 'border-green-500 shadow-lg shadow-green-500/30'
          : 'border-slate-700'
      }`}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-800">
          <div className="text-center">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-3 ${
              isSpeaking ? 'bg-green-600' : 'bg-slate-700'
            }`}>
              <User className="w-10 h-10 text-white" />
            </div>
            <p className="text-sm font-medium text-white">{displayName}</p>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate max-w-[150px]">
              {displayName}
            </span>
            {isLocal && (
              <span className="px-1.5 py-0.5 text-[10px] bg-blue-600 text-white rounded">
                YOU
              </span>
            )}
            {isSip && (
              <span className="px-1.5 py-0.5 text-[10px] bg-amber-600 text-white rounded">
                PSTN
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasAudio ? (
              <div className={`p-1 rounded ${isSpeaking ? 'bg-green-600' : 'bg-slate-700/70'}`}>
                <Mic className="w-3 h-3 text-white" />
              </div>
            ) : (
              <div className="p-1 rounded bg-red-600/70">
                <MicOff className="w-3 h-3 text-white" />
              </div>
            )}

            {hasVideo ? (
              <div className="p-1 rounded bg-slate-700/70">
                <VideoIcon className="w-3 h-3 text-white" />
              </div>
            ) : (
              <div className="p-1 rounded bg-slate-700/70">
                <VideoOff className="w-3 h-3 text-slate-400" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
