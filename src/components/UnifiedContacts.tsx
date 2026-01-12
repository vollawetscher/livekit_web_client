import { useEffect, useState } from 'react';
import { Phone, User, Video, Users, Star, Search, Plus, Edit2, Trash2 } from 'lucide-react';
import {
  getAllUsers,
  getUserPresence,
  subscribeToPresence,
  UserProfile,
  UserPresence,
  getPhoneContacts,
  PhoneContact,
  deletePhoneContact,
  updatePhoneContact
} from '../utils/supabase';
import { CallInvitationService } from '../utils/CallInvitationService';

interface UnifiedContactsProps {
  currentUserId: string;
  callInvitationService: CallInvitationService;
  onWebCallInitiated?: (calleeUserId: string) => void;
  onPSTNCallInitiated?: (phoneNumber: string, contactName: string) => void;
  outgoingCalleeId?: string | null;
  onAddPhoneContact?: () => void;
  onEditPhoneContact?: (contact: PhoneContact) => void;
}

export default function UnifiedContacts({
  currentUserId,
  callInvitationService,
  onWebCallInitiated,
  onPSTNCallInitiated,
  outgoingCalleeId,
  onAddPhoneContact,
  onEditPhoneContact
}: UnifiedContactsProps) {
  const [webContacts, setWebContacts] = useState<UserProfile[]>([]);
  const [phoneContacts, setPhoneContacts] = useState<PhoneContact[]>([]);
  const [presenceMap, setPresenceMap] = useState<Map<string, UserPresence>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'web' | 'phone'>('web');

  useEffect(() => {
    loadContacts();
  }, [currentUserId]);

  useEffect(() => {
    let channelSubscription: any = null;
    let pollingInterval: number | null = null;

    const setupSubscription = async () => {
      try {
        channelSubscription = await subscribeToPresence((presence) => {
          console.log('[UnifiedContacts] Received presence update:', presence);
          setPresenceMap(prev => {
            const updated = new Map(prev);
            updated.set(presence.user_id, presence);
            return updated;
          });
        });
        console.log('[UnifiedContacts] Presence subscription established, channel state:', channelSubscription?.state);
      } catch (error) {
        console.error('[UnifiedContacts] Failed to subscribe to presence:', error);
      }
    };

    const refreshPresence = async () => {
      try {
        const allUsers = await getAllUsers();
        const users = allUsers.filter(u => u.user_id !== currentUserId);
        if (users.length === 0) return;

        const presences = await Promise.all(
          users.map(c => getUserPresence(c.user_id))
        );

        setPresenceMap(prev => {
          const updated = new Map(prev);
          presences.forEach((presence, idx) => {
            if (presence) {
              const existing = prev.get(users[idx].user_id);
              if (!existing || new Date(presence.updated_at) > new Date(existing.updated_at)) {
                console.log('[UnifiedContacts] Presence refreshed for:', users[idx].user_id, presence.status);
                updated.set(users[idx].user_id, presence);
              }
            }
          });
          return updated;
        });
      } catch (error) {
        console.error('[UnifiedContacts] Failed to refresh presence:', error);
      }
    };

    setupSubscription();

    pollingInterval = window.setInterval(() => {
      refreshPresence();
    }, 10000);

    return () => {
      if (channelSubscription && typeof channelSubscription.unsubscribe === 'function') {
        channelSubscription.unsubscribe();
      }
      if (pollingInterval !== null) {
        clearInterval(pollingInterval);
      }
    };
  }, [currentUserId]);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const [users, phoneContactsList] = await Promise.all([
        getAllUsers(),
        getPhoneContacts(currentUserId)
      ]);

      const filteredWebContacts = users.filter(u => u.user_id !== currentUserId);
      setWebContacts(filteredWebContacts);
      setPhoneContacts(phoneContactsList);

      const presences = await Promise.all(
        filteredWebContacts.map(c => getUserPresence(c.user_id))
      );

      const newPresenceMap = new Map<string, UserPresence>();
      presences.forEach((presence, idx) => {
        if (presence) {
          newPresenceMap.set(filteredWebContacts[idx].user_id, presence);
        }
      });
      setPresenceMap(newPresenceMap);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFavorite = async (contact: PhoneContact) => {
    try {
      await updatePhoneContact(contact.id!, { is_favorite: !contact.is_favorite });
      await loadContacts();
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const handleDeletePhoneContact = async (contactId: string) => {
    if (confirm('Are you sure you want to delete this contact?')) {
      try {
        await deletePhoneContact(contactId);
        await loadContacts();
      } catch (error) {
        console.error('Failed to delete contact:', error);
      }
    }
  };

  const getEffectiveStatus = (presence?: UserPresence): string => {
    if (!presence) return 'offline';

    const lastSeenTime = new Date(presence.last_seen_at).getTime();
    const now = Date.now();
    const secondsSinceLastSeen = (now - lastSeenTime) / 1000;

    if (secondsSinceLastSeen > 90) {
      return 'offline';
    }

    if (presence.status === 'online' && secondsSinceLastSeen > 60) {
      return 'away';
    }

    return presence.status;
  };

  const getStatusColor = (effectiveStatus: string) => {
    switch (effectiveStatus) {
      case 'online': return 'bg-green-500';
      case 'in_call': return 'bg-red-500';
      case 'away': return 'bg-yellow-500';
      case 'busy': return 'bg-red-500';
      default: return 'bg-slate-500';
    }
  };

  const getStatusText = (effectiveStatus: string) => {
    switch (effectiveStatus) {
      case 'online': return 'Online';
      case 'in_call': return 'In Call';
      case 'away': return 'Away';
      case 'busy': return 'Busy';
      default: return 'Offline';
    }
  };

  const filteredWebContacts = webContacts.filter(contact =>
    contact.display_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPhoneContacts = phoneContacts.filter(contact =>
    contact.contact_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.phone_number.includes(searchQuery)
  );

  if (loading) {
    return (
      <div className="text-center py-8 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-2 text-sm">Loading contacts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      <div className="flex bg-slate-700 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('web')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center space-x-2 ${
            activeTab === 'web'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Web Contacts ({filteredWebContacts.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('phone')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center space-x-2 ${
            activeTab === 'phone'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Phone className="w-4 h-4" />
          <span>Phone Contacts ({filteredPhoneContacts.length})</span>
        </button>
      </div>

      {activeTab === 'web' && (
        <div className="space-y-2">
          {filteredWebContacts.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              No web contacts found
            </div>
          ) : (
            filteredWebContacts.map((contact) => {
              const presence = presenceMap.get(contact.user_id);
              const effectiveStatus = getEffectiveStatus(presence);
              const isInCall = effectiveStatus === 'in_call';
              const isCalling = outgoingCalleeId === contact.user_id;

              return (
                <div
                  key={contact.user_id}
                  className="bg-slate-700 rounded-lg p-3 flex items-center justify-between hover:bg-slate-600 transition-colors"
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                      </div>
                      <div className={`absolute bottom-0 right-0 w-3 h-3 ${getStatusColor(effectiveStatus)} border-2 border-slate-700 rounded-full`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate">{contact.display_name}</p>
                      <p className="text-xs text-slate-400">{getStatusText(effectiveStatus)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onWebCallInitiated?.(contact.user_id)}
                    disabled={isInCall || isCalling}
                    className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                      isCalling
                        ? 'bg-blue-600 text-white'
                        : isInCall
                        ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                    title={isInCall ? 'User is in another call' : 'Start video call'}
                  >
                    <Video className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'phone' && (
        <div className="space-y-2">
          <button
            onClick={onAddPhoneContact}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-3 flex items-center justify-center space-x-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Phone Contact</span>
          </button>

          {filteredPhoneContacts.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              No phone contacts yet. Add one to get started!
            </div>
          ) : (
            filteredPhoneContacts.map((contact) => (
              <div
                key={contact.id}
                className="bg-slate-700 rounded-lg p-3 flex items-center justify-between hover:bg-slate-600 transition-colors"
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <Phone className="w-5 h-5 text-white" />
                    </div>
                    {contact.is_favorite && (
                      <div className="absolute -top-1 -right-1">
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{contact.contact_name}</p>
                    <p className="text-xs text-slate-400 font-mono">{contact.phone_number}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-1 flex-shrink-0">
                  <button
                    onClick={() => handleToggleFavorite(contact)}
                    className="p-2 rounded-lg hover:bg-slate-500 transition-colors"
                    title={contact.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star className={`w-4 h-4 ${contact.is_favorite ? 'text-yellow-400 fill-yellow-400' : 'text-slate-400'}`} />
                  </button>
                  <button
                    onClick={() => onEditPhoneContact?.(contact)}
                    className="p-2 rounded-lg hover:bg-slate-500 transition-colors"
                    title="Edit contact"
                  >
                    <Edit2 className="w-4 h-4 text-slate-400" />
                  </button>
                  <button
                    onClick={() => handleDeletePhoneContact(contact.id!)}
                    className="p-2 rounded-lg hover:bg-slate-500 transition-colors"
                    title="Delete contact"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                  <button
                    onClick={() => onPSTNCallInitiated?.(contact.phone_number, contact.contact_name)}
                    className="ml-2 p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    title="Call this number"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
