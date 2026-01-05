import { useEffect, useState } from 'react';
import { Phone, PhoneOff, User } from 'lucide-react';
import { CallInvitation, getUserProfile, UserProfile } from '../utils/supabase';

interface IncomingCallDialogProps {
  invitation: CallInvitation;
  onAccept: () => void;
  onReject: () => void;
}

export default function IncomingCallDialog({ invitation, onAccept, onReject }: IncomingCallDialogProps) {
  const [callerProfile, setCallerProfile] = useState<UserProfile | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    loadCallerProfile();
    calculateTimeLeft();

    const timer = setInterval(() => {
      calculateTimeLeft();
    }, 1000);

    return () => clearInterval(timer);
  }, [invitation]);

  const loadCallerProfile = async () => {
    try {
      const profile = await getUserProfile(invitation.caller_user_id);
      setCallerProfile(profile);
    } catch (error) {
      console.error('Failed to load caller profile:', error);
    }
  };

  const calculateTimeLeft = () => {
    const expiresAt = new Date(invitation.expires_at).getTime();
    const now = Date.now();
    const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
    setTimeLeft(remaining);

    if (remaining === 0) {
      onReject();
    }
  };

  const callerName = callerProfile?.display_name || invitation.caller_user_id;
  const callerAvatar = callerProfile?.avatar_url;

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 z-50 flex flex-col items-center justify-center text-white">
      <div className="absolute inset-0 bg-black opacity-20" />

      <div className="relative z-10 flex flex-col items-center space-y-4 sm:space-y-6 md:space-y-8 animate-fade-in px-4">
        <div className="text-sm sm:text-base md:text-lg font-medium opacity-90">Incoming Call</div>

        <div className="relative">
          {callerAvatar ? (
            <img
              src={callerAvatar}
              alt={callerName}
              className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 rounded-full object-cover border-2 sm:border-3 md:border-4 border-white shadow-2xl animate-pulse-slow"
            />
          ) : (
            <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 rounded-full bg-white bg-opacity-20 backdrop-blur-sm border-2 sm:border-3 md:border-4 border-white shadow-2xl flex items-center justify-center animate-pulse-slow">
              <User className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 text-white" />
            </div>
          )}

          <div className="absolute inset-0 rounded-full border-2 sm:border-3 md:border-4 border-white opacity-30 animate-ping" style={{ animationDuration: '2s' }} />
        </div>

        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-1 sm:mb-2">{callerName}</h2>
          <p className="text-sm sm:text-base md:text-lg opacity-90">wants to video call you</p>
        </div>

        <div className="text-xs sm:text-sm opacity-75">
          {timeLeft > 0 ? `Ringing... (${timeLeft}s)` : 'Call expired'}
        </div>

        <div className="flex items-center space-x-4 sm:space-x-6 md:space-x-8 mt-4 sm:mt-6 md:mt-8">
          <button
            onClick={onReject}
            className="group flex flex-col items-center space-y-2 sm:space-y-3 transition-transform hover:scale-110"
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-[4.5rem] md:h-[4.5rem] rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-xl transition-colors">
              <PhoneOff className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-white" />
            </div>
            <span className="text-xs sm:text-sm font-medium">Decline</span>
          </button>

          <button
            onClick={onAccept}
            className="group flex flex-col items-center space-y-2 sm:space-y-3 transition-transform hover:scale-110"
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-[4.5rem] md:h-[4.5rem] rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-xl transition-colors animate-bounce-slow">
              <Phone className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-white" />
            </div>
            <span className="text-xs sm:text-sm font-medium">Accept</span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes pulse-slow {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }

        @keyframes bounce-slow {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }

        .animate-pulse-slow {
          animation: pulse-slow 2s ease-in-out infinite;
        }

        .animate-bounce-slow {
          animation: bounce-slow 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
