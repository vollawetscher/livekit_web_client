import { Mic, MicOff, Video as VideoIcon, VideoOff, User, UserX, Crown } from 'lucide-react';
import { RemoteParticipant, LocalParticipant } from 'livekit-client';
import { UserProfile, getDisplayName } from '../utils/ProfileService';

interface ParticipantTileProps {
  participant: RemoteParticipant | LocalParticipant;
  isLocal?: boolean;
  isSpeaking?: boolean;
  audioLevel?: number;
  isAdmin?: boolean;
  isCurrentUserAdmin?: boolean;
  onKickParticipant?: (participantId: string) => void;
  onMuteParticipant?: (participantId: string, muted: boolean) => void;
  onToggleParticipantVideo?: (participantId: string, enabled: boolean) => void;
  userProfiles?: Map<string, UserProfile>;
}

export default function ParticipantTile({
  participant,
  isLocal = false,
  isSpeaking = false,
  audioLevel = 0,
  isAdmin = false,
  isCurrentUserAdmin = false,
  onKickParticipant,
  onMuteParticipant,
  onToggleParticipantVideo,
  userProfiles = new Map()
}: ParticipantTileProps) {
  const hasAudio = participant.isMicrophoneEnabled;
  const hasVideo = participant.isCameraEnabled;
  const identity = participant.identity;
  const isSip = identity.startsWith('sip-');

  const displayName = isLocal
    ? 'You'
    : isSip
    ? 'Phone Call'
    : getDisplayName(identity, userProfiles);

  const handleKick = () => {
    if (onKickParticipant && !isLocal) {
      onKickParticipant(identity);
    }
  };

  const handleMuteToggle = () => {
    if (onMuteParticipant && !isLocal) {
      onMuteParticipant(identity, hasAudio);
    }
  };

  const handleVideoToggle = () => {
    if (onToggleParticipantVideo && !isLocal) {
      onToggleParticipantVideo(identity, hasVideo);
    }
  };

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
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <p className="font-medium text-sm text-white truncate">
              {displayName}
            </p>
            {isAdmin && (
              <Crown className="w-3 h-3 text-amber-400 flex-shrink-0" title="Room Admin" />
            )}
            {isLocal && (
              <span className="px-1.5 py-0.5 text-[10px] bg-blue-600 text-white rounded flex-shrink-0">
                YOU
              </span>
            )}
            {isSip && (
              <span className="px-1.5 py-0.5 text-[10px] bg-amber-600 text-white rounded flex-shrink-0">
                PSTN
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1">
            {isCurrentUserAdmin && !isLocal && !isSip ? (
              <button
                onClick={handleMuteToggle}
                className="p-1 rounded hover:bg-slate-600 transition-colors"
                title={hasAudio ? 'Click to mute' : 'Click to unmute'}
              >
                {hasAudio ? (
                  <Mic className="w-3 h-3 text-green-400" />
                ) : (
                  <MicOff className="w-3 h-3 text-slate-500" />
                )}
              </button>
            ) : (
              <div className="flex items-center gap-1">
                {hasAudio ? (
                  <Mic className="w-3 h-3 text-green-400" />
                ) : (
                  <MicOff className="w-3 h-3 text-slate-500" />
                )}
              </div>
            )}

            {isCurrentUserAdmin && !isLocal && !isSip ? (
              <button
                onClick={handleVideoToggle}
                className="p-1 rounded hover:bg-slate-600 transition-colors"
                title={hasVideo ? 'Click to disable video' : 'Click to enable video'}
              >
                {hasVideo ? (
                  <VideoIcon className="w-3 h-3 text-blue-400" />
                ) : (
                  <VideoOff className="w-3 h-3 text-slate-500" />
                )}
              </button>
            ) : (
              <div className="flex items-center gap-1">
                {hasVideo ? (
                  <VideoIcon className="w-3 h-3 text-blue-400" />
                ) : (
                  <VideoOff className="w-3 h-3 text-slate-500" />
                )}
              </div>
            )}

            {isCurrentUserAdmin && !isLocal && !isSip && (
              <button
                onClick={handleKick}
                className="p-1 rounded hover:bg-red-600 transition-colors"
                title="Remove participant"
              >
                <UserX className="w-3 h-3 text-red-400" />
              </button>
            )}

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
