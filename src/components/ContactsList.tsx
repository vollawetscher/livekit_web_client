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

    const channel = subscribeToPresence((presence) => {
      console.log('Presence update received:', presence);
      setPresenceMap(prev => {
        const updated = new Map(prev);
        updated.set(presence.user_id, presence);
        return updated;
      });
    });

    return () => {
      if (channel) {
        channel.unsubscribe();
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
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Contacts</h2>
      <div className="space-y-2">
        {contacts.map((contact) => {
          const status = getPresenceStatus(contact.user_id);
          const isInCall = status === 'in_call';
          const isCalling = outgoingCalleeId === contact.user_id;

          return (
            <div
              key={contact.user_id}
              className="flex items-center justify-between p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
            >
              <div className="flex items-center space-x-3">
                <div className="relative">
                  {contact.avatar_url ? (
                    <img
                      src={contact.avatar_url}
                      alt={contact.display_name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold">
                      {contact.display_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${getPresenceColor(status)}`}
                    title={getPresenceLabel(status)}
                  />
                </div>
                <div>
                  <div className="font-medium text-gray-900">{contact.display_name}</div>
                  <div className="text-sm text-gray-500">{getPresenceLabel(status)}</div>
                </div>
              </div>

              <button
                onClick={() => handleCall(contact)}
                disabled={isCalling || isInCall}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  isCalling || isInCall
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isCalling ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Calling...</span>
                  </>
                ) : (
                  <>
                    <Video className="w-4 h-4" />
                    <span>Call</span>
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
