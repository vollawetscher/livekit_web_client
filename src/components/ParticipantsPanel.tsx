import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { RemoteParticipant, LocalParticipant, Room, RoomEvent } from 'livekit-client';
import ParticipantTile from './ParticipantTile';

interface ParticipantsPanelProps {
  room: Room | null;
  audioLevels: Map<string, number>;
  activeSpeakers: Set<string>;
  adminUserId?: string;
  currentUserId?: string;
  onKickParticipant?: (participantId: string) => void;
  onMuteParticipant?: (participantId: string, muted: boolean) => void;
  onToggleParticipantVideo?: (participantId: string, enabled: boolean) => void;
}

export default function ParticipantsPanel({
  room,
  audioLevels,
  activeSpeakers,
  adminUserId,
  currentUserId,
  onKickParticipant,
  onMuteParticipant,
  onToggleParticipantVideo
}: ParticipantsPanelProps) {
  const [participants, setParticipants] = useState<(RemoteParticipant | LocalParticipant)[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (!room) {
      setParticipants([]);
      return;
    }

    const updateParticipants = () => {
      const remoteParticipants = Array.from(room.remoteParticipants.values());
      const localParticipant = room.localParticipant;
      setParticipants([localParticipant, ...remoteParticipants]);
    };

    updateParticipants();

    room.on(RoomEvent.ParticipantConnected, updateParticipants);
    room.on(RoomEvent.ParticipantDisconnected, updateParticipants);
    room.on(RoomEvent.TrackPublished, updateParticipants);
    room.on(RoomEvent.TrackUnpublished, updateParticipants);
    room.on(RoomEvent.TrackMuted, updateParticipants);
    room.on(RoomEvent.TrackUnmuted, updateParticipants);

    return () => {
      room.off(RoomEvent.ParticipantConnected, updateParticipants);
      room.off(RoomEvent.ParticipantDisconnected, updateParticipants);
      room.off(RoomEvent.TrackPublished, updateParticipants);
      room.off(RoomEvent.TrackUnpublished, updateParticipants);
      room.off(RoomEvent.TrackMuted, updateParticipants);
      room.off(RoomEvent.TrackUnmuted, updateParticipants);
    };
  }, [room]);

  if (!room) {
    return null;
  }

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-slate-700/50 transition-colors"
      >
        <span className="font-semibold text-sm text-slate-200 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Participants ({participants.length})
        </span>
        <span className="text-slate-400 text-xs">
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 max-h-96 overflow-y-auto">
          {participants.length === 0 ? (
            <div className="text-center py-4 text-slate-400 text-xs">
              No participants yet
            </div>
          ) : (
            participants.map((participant) => {
              const isLocal = participant === room.localParticipant;
              const isSpeaking = activeSpeakers.has(participant.identity);
              const audioLevel = audioLevels.get(participant.identity) || 0;
              const isAdmin = participant.identity === adminUserId;
              const isCurrentUserAdmin = currentUserId === adminUserId;

              return (
                <ParticipantTile
                  key={participant.identity}
                  participant={participant}
                  isLocal={isLocal}
                  isSpeaking={isSpeaking}
                  audioLevel={audioLevel}
                  isAdmin={isAdmin}
                  isCurrentUserAdmin={isCurrentUserAdmin}
                  onKickParticipant={onKickParticipant}
                  onMuteParticipant={onMuteParticipant}
                  onToggleParticipantVideo={onToggleParticipantVideo}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
