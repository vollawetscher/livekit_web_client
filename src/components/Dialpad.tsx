import { useState } from 'react';
import { Phone, Delete, User, PhoneOff } from 'lucide-react';

interface DialpadProps {
  onDial: (phoneNumber: string, contactName: string) => void;
  onHangup: () => void;
  isDialing: boolean;
  callStatus: string | null;
  isCallActive: boolean;
}

export default function Dialpad({ onDial, onHangup, isDialing, callStatus, isCallActive }: DialpadProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [contactName, setContactName] = useState('');

  const isDisabled = isDialing || isCallActive;

  const handleNumberClick = (digit: string) => {
    if (!isDisabled) {
      setPhoneNumber((prev) => prev + digit);
    }
  };

  const handleDelete = () => {
    if (!isDisabled) {
      setPhoneNumber((prev) => prev.slice(0, -1));
    }
  };

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

  const dialpadButtons = [
    { display: '1', value: '1', sub: '' },
    { display: '2', value: '2', sub: 'ABC' },
    { display: '3', value: '3', sub: 'DEF' },
    { display: '4', value: '4', sub: 'GHI' },
    { display: '5', value: '5', sub: 'JKL' },
    { display: '6', value: '6', sub: 'MNO' },
    { display: '7', value: '7', sub: 'PQRS' },
    { display: '8', value: '8', sub: 'TUV' },
    { display: '9', value: '9', sub: 'WXYZ' },
    { display: '*', value: '*', sub: '' },
    { display: '0', value: '0', sub: '+' },
    { display: '#', value: '#', sub: '' },
  ];

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <Phone className="w-5 h-5" />
          Dialpad
        </h2>

        {callStatus && (
          <div className="mb-4 p-3 bg-blue-900/30 border border-blue-500/50 rounded-lg">
            <p className="text-sm text-blue-300 font-medium">{callStatus}</p>
          </div>
        )}

        <div className="mb-3">
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            <User className="w-3 h-3 inline mr-1" />
            Contact Name (Optional)
          </label>
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter name"
            disabled={isDisabled}
            className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm placeholder-slate-400"
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Phone Number
          </label>
          <div className="relative">
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="+1234567890"
              disabled={isDisabled}
              className="w-full px-3 py-3 pr-12 rounded-lg bg-slate-700 border border-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed text-white text-lg font-mono tracking-wider text-center placeholder-slate-400"
            />
            {phoneNumber && (
              <button
                onClick={handleDelete}
                disabled={isDisabled}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Delete className="w-4 h-4 text-slate-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {dialpadButtons.map((button) => (
          <button
            key={button.value}
            onClick={() => handleNumberClick(button.value)}
            disabled={isDisabled}
            className="aspect-square rounded-lg bg-slate-700 hover:bg-slate-600 active:bg-slate-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-slate-600 hover:border-slate-500"
          >
            <div className="flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold text-white">{button.display}</span>
              {button.sub && (
                <span className="text-xs text-slate-400 mt-0.5">{button.sub}</span>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleDial}
          disabled={!phoneNumber || isDisabled}
          className="py-4 rounded-lg font-semibold text-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 hover:bg-green-700 active:scale-95 shadow-lg"
        >
          <Phone className="w-5 h-5" />
          {isDialing ? 'Dialing...' : isCallActive ? 'In Progress' : 'Call'}
        </button>

        <button
          onClick={onHangup}
          disabled={!isCallActive}
          className="py-4 rounded-lg font-semibold text-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-red-600 hover:bg-red-700 active:scale-95 shadow-lg"
        >
          <PhoneOff className="w-5 h-5" />
          End Call
        </button>
      </div>

      <p className="text-xs text-slate-400 mt-3 text-center">
        Use E.164 format (e.g., +491234567890)
      </p>
    </div>
  );
}
