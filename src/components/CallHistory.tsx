import { useEffect, useState } from 'react';
import { Phone, Clock, PhoneCall, PhoneMissed, PhoneOff } from 'lucide-react';
import { getCallHistory, CallHistoryRecord } from '../utils/supabase';

interface CallHistoryProps {
  onRedial: (phoneNumber: string, contactName: string) => void;
  isDialing: boolean;
  currentCallId?: string;
  refreshTrigger?: number;
}

export default function CallHistory({ onRedial, isDialing, currentCallId, refreshTrigger }: CallHistoryProps) {
  const [history, setHistory] = useState<CallHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [refreshTrigger]);

  const loadHistory = async () => {
    try {
      setIsLoading(true);
      const data = await getCallHistory(20);
      setHistory(data);
    } catch (error) {
      console.error('Failed to load call history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'answered':
      case 'in-progress':
      case 'completed':
        return <PhoneCall className="w-4 h-4 text-green-400" />;
      case 'ringing':
        return <Phone className="w-4 h-4 text-blue-400 animate-pulse" />;
      case 'failed':
      case 'busy':
      case 'no-answer':
        return <PhoneMissed className="w-4 h-4 text-red-400" />;
      case 'initiated':
        return <Phone className="w-4 h-4 text-yellow-400" />;
      default:
        return <PhoneOff className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'answered':
      case 'in-progress':
      case 'completed':
        return 'text-green-400';
      case 'ringing':
        return 'text-blue-400';
      case 'failed':
      case 'busy':
      case 'no-answer':
        return 'text-red-400';
      case 'initiated':
        return 'text-yellow-400';
      default:
        return 'text-slate-400';
    }
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleRedial = (record: CallHistoryRecord) => {
    if (!isDialing) {
      onRedial(record.phone_number, record.contact_name);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
        <h2 className="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Call History
        </h2>
        <div className="text-center py-8 text-slate-400 text-sm">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
      <h2 className="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2">
        <Clock className="w-5 h-5" />
        Call History
      </h2>

      {history.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">
          No calls yet
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {history.map((record) => (
            <button
              key={record.id}
              onClick={() => handleRedial(record)}
              disabled={isDialing}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                record.call_id === currentCallId
                  ? 'bg-blue-900/30 border-blue-500/50'
                  : 'bg-slate-700/50 border-slate-600 hover:bg-slate-700 hover:border-slate-500'
              } ${isDialing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-98'}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  {getStatusIcon(record.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-white truncate">
                      {record.contact_name}
                    </p>
                    <p className="text-xs text-slate-400 flex-shrink-0">
                      {formatTimestamp(record.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-sm text-slate-300 font-mono truncate">
                      {record.phone_number}
                    </p>
                    <p className={`text-xs font-medium flex-shrink-0 capitalize ${getStatusColor(record.status)}`}>
                      {record.status}
                    </p>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
