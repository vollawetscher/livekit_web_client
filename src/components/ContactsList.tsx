import { useEffect, useState } from 'react';
import { Phone, User, Video } from 'lucide-react';
import { getAllUsers, getUserPresence, subscribeToPresence, UserProfile, UserPresence } from '../utils/supabase';
import { CallInvitationService } from '../utils/CallInvitationService';

interface ContactsListProps {
  currentUserId: string;
  callInvitationService: CallInvitationService;
  onCallInitiated?: (calleeUserId: string) => void;
  outgoingCalleeId?: string | null;
}

export default function ContactsList({ currentUserId, callInvitationService, onCallInitiated, outgoingCalleeId }: ContactsListProps) {
  const [contacts, setContacts] = useState<UserProfile[]>([]);
  const [presenceMap, setPresenceMap] = useState<Map<string, UserPresence>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContacts();

    let channelSubscription: any = null;

    const setupSubscription = async () => {
      channelSubscription = await subscribeToPresence((presence) => {
        console.log('Presence update received:', presence);
        setPresenceMap(prev => {
          const updated = new Map(prev);
          updated.set(presence.user_id, presence);
          return updated;
        });
      });
    };

    setupSubscription();

    return () => {
      if (channelSubscription && typeof channelSubscription.unsubscribe === 'function') {
        channelSubscription.unsubscribe();
      }
    };
  }, []);

  const loadContacts = async () => {
    try {
      const users = await getAllUsers();
      const filteredContacts = users.filter(u => u.user_id !== currentUserId);
      setContacts(filteredContacts);

      const presences = await Promise.all(
        filteredContacts.map(c => getUserPresence(c.user_id))
      );

      const newPresenceMap = new Map();
      presences.forEach((presence, idx) => {
        if (presence) {
          newPresenceMap.set(filteredContacts[idx].user_id, presence);
        }
      });

      setPresenceMap(newPresenceMap);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCall = (contact: UserProfile) => {
    console.log('handleCall started for contact:', contact.user_id);
    if (outgoingCalleeId) {
      console.log('Already calling someone:', outgoingCalleeId);
      return;
    }

    console.log('Calling onCallInitiated callback...');
    onCallInitiated?.(contact.user_id);
  };

  const getPresenceStatus = (userId: string) => {
    const presence = presenceMap.get(userId);
    if (!presence) return 'offline';

    const lastSeen = new Date(presence.last_seen_at).getTime();
    const isRecent = Date.now() - lastSeen < 60000;

    if (presence.status === 'online' && isRecent) return 'online';
    if (presence.status === 'in_call') return 'in_call';
    return 'offline';
  };

  const getPresenceColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'in_call': return 'bg-yellow-500';
      default: return 'bg-gray-400';
    }
  };

  const getPresenceLabel = (status: string) => {
    switch (status) {
      case 'online': return 'Online';
      case 'in_call': return 'In a call';
      default: return 'Offline';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading contacts...</div>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <User className="w-16 h-16 mb-4 opacity-50" />
        <p>No contacts available</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 text-white">Contacts</h2>
      <div className="space-y-2">
        {contacts.map((contact) => {
          const status = getPresenceStatus(contact.user_id);
          const isInCall = status === 'in_call';
          const isCalling = outgoingCalleeId === contact.user_id;

          return (
            <div
              key={contact.user_id}
              className="flex items-center justify-between p-3 sm:p-4 bg-slate-700/50 rounded-lg border border-slate-600 hover:border-slate-500 transition-all"
            >
              <div className="flex items-center space-x-2 sm:space-x-3 flex-1 min-w-0">
                <div className="relative flex-shrink-0">
                  {contact.avatar_url ? (
                    <img
                      src={contact.avatar_url}
                      alt={contact.display_name}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm sm:text-base">
                      {contact.display_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div
                    className={`absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border-2 border-slate-700 ${getPresenceColor(status)}`}
                    title={getPresenceLabel(status)}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-white text-sm sm:text-base truncate">{contact.display_name}</div>
                  <div className="text-xs sm:text-sm text-slate-400 truncate">{getPresenceLabel(status)}</div>
                </div>
              </div>

              <button
                onClick={() => handleCall(contact)}
                disabled={isCalling || isInCall}
                className={`flex items-center space-x-1 sm:space-x-2 px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-lg font-medium transition-colors text-xs sm:text-sm flex-shrink-0 ml-2 ${
                  isCalling || isInCall
                    ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isCalling ? (
                  <>
                    <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="hidden sm:inline">Calling...</span>
                  </>
                ) : (
                  <>
                    <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Call</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
