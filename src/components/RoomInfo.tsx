import { Room } from 'livekit-client';
import { Circle } from 'lucide-react';

interface RoomInfoProps {
  room: Room | null;
  participantCount: number;
}

export default function RoomInfo({ room, participantCount }: RoomInfoProps) {
  if (!room) {
    return null;
  }

  const roomName = room.name || 'Unknown Room';
  const connectionState = room.state;

  const isConnected = connectionState === 'connected';

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Circle
            className={`w-2 h-2 ${isConnected ? 'fill-green-400 text-green-400' : 'fill-slate-500 text-slate-500'}`}
          />
          <span className="text-sm font-medium text-slate-300">
            Room: <span className="text-white font-mono">{roomName}</span>
          </span>
        </div>

        <div className="text-sm text-slate-400">
          {participantCount} participant{participantCount !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}
