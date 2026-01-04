import { useState, useEffect, useRef } from 'react';
import { Users, Phone, Bell, BellOff, LogOut } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import AuthScreen from './components/AuthScreen';
import VoiceAssistant from './components/VoiceAssistant';
import ContactsList from './components/ContactsList';
import IncomingCallDialog from './components/IncomingCallDialog';
import VideoGrid from './components/VideoGrid';
import { PresenceManager } from './utils/PresenceManager';
import { NotificationManager } from './utils/NotificationManager';
import { CallInvitationService } from './utils/CallInvitationService';
import { LiveKitClient } from './utils/LiveKitClient';
import { CallInvitation, getUserProfile } from './utils/supabase';

function MainApp() {
  const { userId, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'pstn' | 'webrtc'>('webrtc');
  const [incomingInvitation, setIncomingInvitation] = useState<CallInvitation | null>(null);
  const [outgoingInvitation, setOutgoingInvitation] = useState<CallInvitation | null>(null);
  const [isInCall, setIsInCall] = useState(false);
  const [callRoomName, setCallRoomName] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  const presenceManagerRef = useRef<PresenceManager | null>(null);
  const notificationManagerRef = useRef<NotificationManager | null>(null);
  const callInvitationServiceRef = useRef<CallInvitationService | null>(null);
  const liveKitClientRef = useRef<LiveKitClient | null>(null);

  useEffect(() => {
    if (userId) {
      initializeServices(userId);
    }

    return () => {
      cleanup();
    };
  }, [userId]);

  const initializeServices = async (userId: string) => {
    presenceManagerRef.current = new PresenceManager(userId);
    await presenceManagerRef.current.start();

    notificationManagerRef.current = new NotificationManager(userId);
    await notificationManagerRef.current.initialize();
    setNotificationPermission(notificationManagerRef.current.permission);

    callInvitationServiceRef.current = new CallInvitationService(userId);
    await callInvitationServiceRef.current.start();

    callInvitationServiceRef.current.onInvitation((invitation) => {
      if (invitation.callee_user_id === userId) {
        if (invitation.status === 'pending') {
          setIncomingInvitation(invitation);

          if (notificationManagerRef.current?.permission === 'granted') {
            getUserProfile(invitation.caller_user_id).then(profile => {
              notificationManagerRef.current?.showNotification('Incoming Call', {
                body: `${profile?.display_name || invitation.caller_user_id} is calling you`,
                tag: invitation.id,
              });
            });
          }
        }

        if (invitation.status === 'cancelled' || invitation.status === 'rejected' || invitation.status === 'missed') {
          setIncomingInvitation(null);
        }
      }

      if (invitation.caller_user_id === userId) {
        if (invitation.status === 'accepted') {
          handleOutgoingCallAccepted(invitation);
        }

        if (invitation.status === 'rejected' || invitation.status === 'cancelled' || invitation.status === 'missed') {
          setOutgoingInvitation(null);
        }
      }
    });
  };

  const cleanup = () => {
    presenceManagerRef.current?.stop();
    callInvitationServiceRef.current?.stop();
    liveKitClientRef.current?.disconnect();
  };

  const handleOutgoingCallAccepted = async (invitation: CallInvitation) => {
    if (!invitation.caller_token || !invitation.room_name) {
      console.error('Missing token or room name in accepted invitation');
      return;
    }

    try {
      setOutgoingInvitation(null);
      setIsInCall(true);
      setCallRoomName(invitation.room_name);

      await presenceManagerRef.current?.setInCall(true);

      const livekitUrl = import.meta.env.VITE_LIVEKIT_URL;
      if (!livekitUrl) {
        throw new Error('LiveKit URL not configured');
      }

      liveKitClientRef.current = new LiveKitClient(
        (msg) => console.log(msg),
        () => {},
        () => {},
        () => {}
      );

      await liveKitClientRef.current.connect(livekitUrl, invitation.caller_token);
      await liveKitClientRef.current.publishAudio({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      await liveKitClientRef.current.publishVideo();
    } catch (error) {
      console.error('Failed to join call as caller:', error);
      alert('Failed to join call. Please try again.');
      setIsInCall(false);
      setOutgoingInvitation(null);
    }
  };

  const handleAcceptCall = async () => {
    if (!incomingInvitation || !callInvitationServiceRef.current) return;

    try {
      const result = await callInvitationServiceRef.current.acceptCall(incomingInvitation.id);

      setCallRoomName(result.room_name);
      setIncomingInvitation(null);
      setIsInCall(true);

      await presenceManagerRef.current?.setInCall(true);

      const livekitUrl = import.meta.env.VITE_LIVEKIT_URL;
      if (!livekitUrl) {
        throw new Error('LiveKit URL not configured');
      }

      liveKitClientRef.current = new LiveKitClient(
        (msg) => console.log(msg),
        () => {},
        () => {},
        () => {}
      );

      await liveKitClientRef.current.connect(livekitUrl, result.token);
      await liveKitClientRef.current.publishAudio({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      await liveKitClientRef.current.publishVideo();
    } catch (error) {
      console.error('Failed to accept call:', error);
      alert('Failed to join call. Please try again.');
      setIncomingInvitation(null);
    }
  };

  const handleRejectCall = async () => {
    if (!incomingInvitation || !callInvitationServiceRef.current) return;

    try {
      await callInvitationServiceRef.current.rejectCall(incomingInvitation.id);
      setIncomingInvitation(null);
    } catch (error) {
      console.error('Failed to reject call:', error);
    }
  };

  const handleCancelOutgoingCall = async () => {
    if (!outgoingInvitation || !callInvitationServiceRef.current) return;

    try {
      await callInvitationServiceRef.current.cancelCall(outgoingInvitation.id);
      setOutgoingInvitation(null);
    } catch (error) {
      console.error('Failed to cancel call:', error);
    }
  };

  const handleEndCall = async () => {
    liveKitClientRef.current?.disconnect();
    liveKitClientRef.current = null;

    setIsInCall(false);
    setCallRoomName(null);

    await presenceManagerRef.current?.setInCall(false);
  };

  const handleRequestNotificationPermission = async () => {
    if (notificationManagerRef.current) {
      const permission = await notificationManagerRef.current.requestPermission();
      setNotificationPermission(permission);
    }
  };

  const handleCallInitiated = async (calleeUserId: string) => {
    if (!callInvitationServiceRef.current) return;

    try {
      const invitation = await callInvitationServiceRef.current.initiateCall(calleeUserId);
      setOutgoingInvitation(invitation);
    } catch (error) {
      console.error('Failed to initiate call:', error);
    }
  };

  const handleLogout = async () => {
    await cleanup();
    await logout();
  };

  if (!userId) {
    return <AuthScreen />;
  }

  if (activeTab === 'pstn') {
    return <VoiceAssistant />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {incomingInvitation && (
        <IncomingCallDialog
          invitation={incomingInvitation}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      )}

      {outgoingInvitation && (
        <div className="fixed inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 z-50 flex flex-col items-center justify-center text-white">
          <div className="absolute inset-0 bg-black opacity-20" />
          <div className="relative z-10 flex flex-col items-center space-y-8">
            <div className="w-32 h-32 rounded-full bg-white bg-opacity-20 backdrop-blur-sm border-4 border-white shadow-2xl flex items-center justify-center">
              <Phone className="w-16 h-16 text-white animate-pulse" />
            </div>

            <div className="text-center">
              <h2 className="text-4xl font-bold mb-2">Calling...</h2>
              <p className="text-lg opacity-90">Waiting for answer</p>
            </div>

            <button
              onClick={handleCancelOutgoingCall}
              className="px-8 py-3 bg-red-600 hover:bg-red-700 rounded-full font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            WebRTC Calling
          </h1>

          <div className="flex items-center space-x-4">
            {notificationPermission !== 'granted' && (
              <button
                onClick={handleRequestNotificationPermission}
                className="flex items-center space-x-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg transition-colors"
              >
                <Bell className="w-4 h-4" />
                <span className="text-sm">Enable Notifications</span>
              </button>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm">Logout</span>
            </button>

            <div className="flex bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('webrtc')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-2 ${
                  activeTab === 'webrtc'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Web Calling</span>
              </button>
              <button
                onClick={() => setActiveTab('pstn')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-2 ${
                  activeTab === 'pstn'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Phone className="w-4 h-4" />
                <span>Phone Calling</span>
              </button>
            </div>
          </div>
        </div>

        {isInCall ? (
          <div className="space-y-4">
            <div className="bg-slate-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">In Call</h2>
                <button
                  onClick={handleEndCall}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
                >
                  End Call
                </button>
              </div>

              <div className="bg-slate-900 rounded-lg p-4 min-h-[400px]">
                <VideoGrid
                  room={liveKitClientRef.current?.getRoom() || null}
                  activeSpeakers={new Set()}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-800 rounded-lg p-6">
            {userId && callInvitationServiceRef.current && (
              <ContactsList
                currentUserId={userId}
                callInvitationService={callInvitationServiceRef.current}
                onCallInitiated={handleCallInitiated}
              />
            )}
          </div>
        )}

        <div className="mt-6 text-center text-sm text-gray-500">
          {notificationPermission === 'granted' ? (
            <div className="flex items-center justify-center space-x-2">
              <Bell className="w-4 h-4 text-green-500" />
              <span>Notifications enabled</span>
            </div>
          ) : (
            <div className="flex items-center justify-center space-x-2">
              <BellOff className="w-4 h-4 text-gray-500" />
              <span>Enable notifications to receive calls when away</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  return <MainApp />;
}

export default App;
