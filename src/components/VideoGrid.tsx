import { useEffect, useState } from 'react';
import { RemoteParticipant, LocalParticipant, Room, RoomEvent } from 'livekit-client';
import VideoTile from './VideoTile';
import { fetchUserProfiles, UserProfile } from '../utils/ProfileService';
import { filterHumanParticipants } from '../utils/MediaWorkerDetector';

interface VideoGridProps {
  room: Room | null;
  activeSpeakers: Set<string>;
}

export default function VideoGrid({ room, activeSpeakers }: VideoGridProps) {
  const [participants, setParticipants] = useState<(RemoteParticipant | LocalParticipant)[]>([]);
  const [userProfiles, setUserProfiles] = useState<Map<string, UserProfile>>(new Map());

  useEffect(() => {
    if (!room) {
      setParticipants([]);
      return;
    }

    const updateParticipants = () => {
      const remoteParticipants = Array.from(room.remoteParticipants.values());
      const humanRemoteParticipants = filterHumanParticipants(remoteParticipants);
      const localParticipant = room.localParticipant;
      setParticipants([localParticipant, ...humanRemoteParticipants]);
    };

    updateParticipants();

    room.on(RoomEvent.ParticipantConnected, updateParticipants);
    room.on(RoomEvent.ParticipantDisconnected, updateParticipants);
    room.on(RoomEvent.TrackPublished, updateParticipants);
    room.on(RoomEvent.TrackUnpublished, updateParticipants);
    room.on(RoomEvent.TrackSubscribed, updateParticipants);
    room.on(RoomEvent.TrackUnsubscribed, updateParticipants);
    room.on(RoomEvent.LocalTrackPublished, updateParticipants);
    room.on(RoomEvent.LocalTrackUnpublished, updateParticipants);

    return () => {
      room.off(RoomEvent.ParticipantConnected, updateParticipants);
      room.off(RoomEvent.ParticipantDisconnected, updateParticipants);
      room.off(RoomEvent.TrackPublished, updateParticipants);
      room.off(RoomEvent.TrackUnpublished, updateParticipants);
      room.off(RoomEvent.TrackSubscribed, updateParticipants);
      room.off(RoomEvent.TrackUnsubscribed, updateParticipants);
      room.off(RoomEvent.LocalTrackPublished, updateParticipants);
      room.off(RoomEvent.LocalTrackUnpublished, updateParticipants);
    };
  }, [room]);

  useEffect(() => {
    if (participants.length === 0) {
      return;
    }

    const userIds = participants
      .map(p => p.identity)
      .filter(id => !id.startsWith('sip-'));

    if (userIds.length === 0) {
      return;
    }

    fetchUserProfiles(userIds).then(profiles => {
      setUserProfiles(profiles);
    });
  }, [participants]);

  if (!room || participants.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4 sm:p-6 md:p-8">
        <div className="text-center text-slate-400">
          <p className="text-xs sm:text-sm">No active participants</p>
          <p className="text-[10px] sm:text-xs mt-1">Connect to start a session</p>
        </div>
      </div>
    );
  }

  const getGridClass = () => {
    const count = participants.length;
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 sm:grid-cols-2';
    if (count <= 4) return 'grid-cols-1 sm:grid-cols-2';
    if (count <= 6) return 'grid-cols-2 md:grid-cols-3';
    return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
  };

  return (
    <div className={`grid ${getGridClass()} gap-2 sm:gap-3 md:gap-4 auto-rows-fr`}>
      {participants.map((participant) => {
        const isLocal = participant === room.localParticipant;
        const isSpeaking = activeSpeakers.has(participant.identity);

        return (
          <VideoTile
            key={participant.identity}
            participant={participant}
            isLocal={isLocal}
            isSpeaking={isSpeaking}
            userProfiles={userProfiles}
          />
        );
      })}
    </div>
  );
}
