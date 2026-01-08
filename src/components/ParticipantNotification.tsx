import { useEffect, useState } from 'react';
import { UserMinus } from 'lucide-react';

interface ParticipantNotificationProps {
  participantName: string;
  onClose: () => void;
}

export default function ParticipantNotification({ participantName, onClose }: ParticipantNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 10);

    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
      }`}
    >
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl px-4 py-3 flex items-center gap-3 min-w-[280px]">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
          <UserMinus className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-white">
            {participantName} left the call
          </p>
        </div>
      </div>
    </div>
  );
}
