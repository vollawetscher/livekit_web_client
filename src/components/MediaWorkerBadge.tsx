import { Mic, Video as VideoIcon, Phone } from 'lucide-react';
import { MediaWorker } from '../utils/MediaWorkerDetector';

interface MediaWorkerBadgeProps {
  worker: MediaWorker;
}

export default function MediaWorkerBadge({ worker }: MediaWorkerBadgeProps) {
  const getWorkerIcon = () => {
    switch (worker.type) {
      case 'transcription':
        return <Mic className="w-3 h-3" />;
      case 'recording':
        return <VideoIcon className="w-3 h-3" />;
      case 'sip':
        return <Phone className="w-3 h-3" />;
      default:
        return <VideoIcon className="w-3 h-3" />;
    }
  };

  const getStatusLED = (status: 'active' | 'inactive' | 'error') => {
    switch (status) {
      case 'active':
        return <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />;
      case 'error':
        return <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400" />;
      case 'inactive':
        return <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-500" />;
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-700/80 border border-slate-600 rounded-md text-xs">
      <div className="text-slate-300">
        {getWorkerIcon()}
      </div>

      {worker.type === 'transcription' && worker.transcriptionChannels.length > 0 && (
        <div className="flex items-center gap-1">
          {worker.transcriptionChannels.map((channel, index) => (
            <div key={index} className="flex items-center gap-0.5">
              {getStatusLED(channel.status)}
              <span className="text-slate-200 font-medium text-[10px]">
                {channel.language}
              </span>
            </div>
          ))}
        </div>
      )}

      {worker.type !== 'transcription' && (
        <span className="text-slate-300 text-[10px] capitalize">
          {worker.type}
        </span>
      )}
    </div>
  );
}
