import { useState } from 'react';
import { Phone, User, PhoneOff } from 'lucide-react';

interface DialpadProps {
  onDial: (phoneNumber: string, contactName: string) => void;
  onHangup: () => void;
  isDialing: boolean;
  callStatus: string | null;
  isCallActive: boolean;
  isConnected: boolean;
}

export default function Dialpad({ onDial, onHangup, isDialing, isCallActive, isConnected }: DialpadProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [contactName, setContactName] = useState('');

  const isDisabled = !isConnected || isDialing || isCallActive;

  const handleDial = () => {
    if (phoneNumber && !isDisabled) {
      onDial(phoneNumber, contactName || 'Unknown');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && phoneNumber) {
      handleDial();
    }
  };

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-3">
      <h2 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-1.5">
        <Phone className="w-4 h-4" />
        Quick Dial
      </h2>

      <div className="mb-2">
        <label className="block text-xs font-medium text-slate-400 mb-1">
          <User className="w-3 h-3 inline mr-1" />
          Contact Name
        </label>
        <input
          type="text"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Optional"
          disabled={isDisabled}
          className="w-full px-3 py-2 rounded text-sm bg-slate-700 border border-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed text-white placeholder-slate-400"
        />
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium text-slate-400 mb-1">
          Phone Number
        </label>
        <input
          type="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="+1234567890"
          disabled={isDisabled}
          className="w-full px-3 py-2 rounded text-sm bg-slate-700 border border-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed text-white font-mono tracking-wider placeholder-slate-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleDial}
          disabled={!phoneNumber || isDisabled}
          className="py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 hover:bg-green-700 active:scale-95 shadow-lg"
        >
          <Phone className="w-4 h-4" />
          {isDialing ? 'Dialing...' : isCallActive ? 'Active' : 'Call'}
        </button>

        <button
          onClick={onHangup}
          disabled={!isCallActive}
          className="py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-red-600 hover:bg-red-700 active:scale-95 shadow-lg"
        >
          <PhoneOff className="w-4 h-4" />
          End Call
        </button>
      </div>

      <p className="text-[10px] text-slate-400 mt-2 text-center">
        Use E.164 format (e.g., +491234567890)
      </p>
    </div>
  );
}
