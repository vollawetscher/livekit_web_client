import { Mic, MicOff, Video as VideoIcon, VideoOff, User } from 'lucide-react';
import { RemoteParticipant, LocalParticipant, Participant } from 'livekit-client';

interface ParticipantTileProps {
  participant: RemoteParticipant | LocalParticipant;
  isLocal?: boolean;
  isSpeaking?: boolean;
  audioLevel?: number;
}

export default function ParticipantTile({
  participant,
  isLocal = false,
  isSpeaking = false,
  audioLevel = 0
}: ParticipantTileProps) {
  const hasAudio = participant.isMicrophoneEnabled;
  const hasVideo = participant.isCameraEnabled;
  const identity = participant.identity;
  const isSip = identity.startsWith('sip-');

  const displayName = isLocal ? 'You' : isSip ? 'Phone Call' : identity;

  const getAudioBars = () => {
    const barCount = 5;
    const activeBars = Math.ceil(audioLevel * barCount);

    return Array.from({ length: barCount }, (_, i) => (
      <div
        key={i}
        className={`w-1 rounded-full transition-all duration-75 ${
          i < activeBars && hasAudio
            ? 'bg-green-400 h-full'
            : 'bg-slate-600 h-1'
        }`}
      />
    ));
  };

  return (
    <div
      className={`p-3 rounded-lg border transition-all ${
        isSpeaking
          ? 'bg-slate-700/70 border-green-500 shadow-lg shadow-green-500/20'
          : 'bg-slate-800/50 border-slate-700'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
          isSpeaking ? 'bg-green-600' : 'bg-slate-600'
        }`}>
          <User className="w-5 h-5 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm text-white truncate">
              {displayName}
            </p>
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

          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1">
              {hasAudio ? (
                <Mic className="w-3 h-3 text-green-400" />
              ) : (
                <MicOff className="w-3 h-3 text-slate-500" />
              )}
            </div>

            <div className="flex items-center gap-1">
              {hasVideo ? (
                <VideoIcon className="w-3 h-3 text-blue-400" />
              ) : (
                <VideoOff className="w-3 h-3 text-slate-500" />
              )}
            </div>

            {hasAudio && (
              <div className="flex items-center gap-0.5 h-3">
                {getAudioBars()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
