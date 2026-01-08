import { useState, useEffect, useRef } from 'react';
import { Bell, BellOff, LogOut, Phone as PhoneIcon } from 'lucide-react';
import { Room } from 'livekit-client';
import { useAuth } from './contexts/AuthContext';
import AuthScreen from './components/AuthScreen';
import UnifiedContacts from './components/UnifiedContacts';
import PhoneContactModal from './components/PhoneContactModal';
import Dialpad from './components/Dialpad';
import CallHistory from './components/CallHistory';
import IncomingCallDialog from './components/IncomingCallDialog';
import VideoGrid from './components/VideoGrid';
import ParticipantNotification from './components/ParticipantNotification';
import MediaWorkerBadge from './components/MediaWorkerBadge';
import { PresenceManager } from './utils/PresenceManager';
import { NotificationManager } from './utils/NotificationManager';
import { CallInvitationService } from './utils/CallInvitationService';
import { LiveKitClient, CallStatusEvent } from './utils/LiveKitClient';
import { DialService } from './utils/DialService';
import { TokenManager } from './utils/TokenManager';
import { AudioRecorder } from './utils/AudioRecorder';
import { detectMediaWorkers, MediaWorker } from './utils/MediaWorkerDetector';
import { logWebRTCCallStart, logWebRTCCallEnd, logIncomingWebRTCCall } from './utils/WebRTCCallLogger';
import { CallInvitation, getUserProfile, supabase, insertCallHistory, updateCallHistory, PhoneContact, getCallSessionByInvitationId } from './utils/supabase';

function MainApp() {
  const { userId, logout } = useAuth();
  const [incomingInvitation, setIncomingInvitation] = useState<CallInvitation | null>(null);
  const [outgoingInvitation, setOutgoingInvitation] = useState<CallInvitation | null>(null);
  const [outgoingCalleeId, setOutgoingCalleeId] = useState<string | null>(null);
  const [isInCall, setIsInCall] = useState(false);
  const [callType, setCallType] = useState<'webrtc' | 'pstn' | null>(null);
  const [callRoomName, setCallRoomName] = useState<string | null>(null);
  const [callSessionId, setCallSessionId] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [livekitRoom, setLivekitRoom] = useState<Room | null>(null);

  const [isPSTNConnected, setIsPSTNConnected] = useState(false);
  const [isPSTNDialing, setIsPSTNDialing] = useState(false);
  const [pstnCallStatus, setPstnCallStatus] = useState<string | null>(null);
  const [activePSTNCallId, setActivePSTNCallId] = useState<string | null>(null);
  const [isPSTNCallActive, setIsPSTNCallActive] = useState(false);
  const [activeSipParticipantId, setActiveSipParticipantId] = useState<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [jwtToken, setJwtToken] = useState('');
  const [inputLevel, setInputLevel] = useState(0);

  const [showPhoneContactModal, setShowPhoneContactModal] = useState(false);
  const [editingPhoneContact, setEditingPhoneContact] = useState<PhoneContact | undefined>(undefined);

  const [humanParticipantCount, setHumanParticipantCount] = useState(0);
  const [totalParticipantCount, setTotalParticipantCount] = useState(0);
  const [aloneStartTime, setAloneStartTime] = useState<number | null>(null);
  const [participantLeftName, setParticipantLeftName] = useState<string | null>(null);
  const [mediaWorkers, setMediaWorkers] = useState<MediaWorker[]>([]);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [currentCallHistoryId, setCurrentCallHistoryId] = useState<string | null>(null);

  const presenceManagerRef = useRef<PresenceManager | null>(null);
  const notificationManagerRef = useRef<NotificationManager | null>(null);
  const callInvitationServiceRef = useRef<CallInvitationService | null>(null);
  const liveKitClientRef = useRef<LiveKitClient | null>(null);
  const sessionChannelRef = useRef<any>(null);
  const tokenManagerRef = useRef<TokenManager | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const ringtoneIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentCallDataRef = useRef<{ phoneNumber: string; contactName: string } | null>(null);

  useEffect(() => {
    if (userId) {
      initializeServices(userId);
    }

    return () => {
      void cleanup();
    };
  }, [userId]);

  useEffect(() => {
    if (humanParticipantCount === 1 && isInCall && callType === 'webrtc') {
      setAloneStartTime(Date.now());
      const timer = setTimeout(() => {
        alert('No other participants joined. Ending call.');
        handleEndCall();
      }, 30000);
      return () => clearTimeout(timer);
    } else {
      setAloneStartTime(null);
    }
  }, [humanParticipantCount, isInCall, callType]);

  useEffect(() => {
    if (livekitRoom) {
      const updateMediaWorkers = () => {
        const participants = Array.from(livekitRoom.remoteParticipants.values());
        const workers = detectMediaWorkers(participants);
        setMediaWorkers(workers);
      };

      updateMediaWorkers();

      const interval = setInterval(updateMediaWorkers, 2000);
      return () => clearInterval(interval);
    } else {
      setMediaWorkers([]);
    }
  }, [livekitRoom]);

  useEffect(() => {
    if (incomingInvitation) {
      startRingtone();
    } else {
      stopRingtone();
    }
    return () => stopRingtone();
  }, [incomingInvitation]);

  useEffect(() => {
    if (outgoingInvitation) {
      startRingtone();
    } else {
      stopRingtone();
    }
    return () => stopRingtone();
  }, [outgoingInvitation]);

  const initializeServices = async (userId: string) => {
    presenceManagerRef.current = new PresenceManager(userId);
    await presenceManagerRef.current.start();

    notificationManagerRef.current = new NotificationManager(userId);
    await notificationManagerRef.current.initialize();
    setNotificationPermission(notificationManagerRef.current.permission);

    callInvitationServiceRef.current = new CallInvitationService(userId);
    await callInvitationServiceRef.current.start();

    callInvitationServiceRef.current.onInvitation((invitation) => {
      console.log('onInvitation callback received:', invitation);

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
        console.log('Invitation is from current user, status:', invitation.status);
        if (invitation.status === 'accepted') {
          console.log('Calling handleOutgoingCallAccepted');
          handleOutgoingCallAccepted(invitation);
        }

        if (invitation.status === 'rejected' || invitation.status === 'cancelled' || invitation.status === 'missed') {
          setOutgoingInvitation(null);
          setOutgoingCalleeId(null);
          liveKitClientRef.current?.disconnect();
          liveKitClientRef.current = null;
          setLivekitRoom(null);
          setCallSessionId(null);
          presenceManagerRef.current?.setInCall(false);
        }
      }
    });

    const liveKitUrl = import.meta.env.VITE_LIVEKIT_URL;
    if (liveKitUrl) {
      tokenManagerRef.current = new TokenManager(userId);
    }
  };

  const subscribeToCallSession = async (sessionId: string) => {
    try {
      if (sessionChannelRef.current) {
        await sessionChannelRef.current.unsubscribe();
      }

      sessionChannelRef.current = supabase
        .channel(`call_session_${sessionId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_sessions',
          filter: `id=eq.${sessionId}`,
        }, (payload) => {
          if (payload.new && payload.new.status === 'ended') {
            alert('The call has ended.');
            handleEndCall();
          }
        });

      await sessionChannelRef.current.subscribe();
    } catch (error) {
      console.error('Failed to subscribe to call session:', error);
    }
  };

  const cleanup = async () => {
    await presenceManagerRef.current?.stop();
    await callInvitationServiceRef.current?.stop();
    liveKitClientRef.current?.disconnect();
    stopRingtone();

    if (sessionChannelRef.current) {
      await sessionChannelRef.current.unsubscribe();
      sessionChannelRef.current = null;
    }

    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
    }
  };

  const startRingtone = async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      const context = audioContextRef.current;

      if (context.state === 'suspended') {
        await context.resume();
      }

      if (oscillatorRef.current || ringtoneIntervalRef.current) {
        stopRingtone();
      }

      const playTone = () => {
        try {
          const oscillator = context.createOscillator();
          const gainNode = context.createGain();

          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(425, context.currentTime);
          gainNode.gain.setValueAtTime(0.2, context.currentTime);

          oscillator.connect(gainNode);
          gainNode.connect(context.destination);

          oscillator.start();
          oscillator.stop(context.currentTime + 1);

          oscillatorRef.current = oscillator;
          gainNodeRef.current = gainNode;
        } catch (err) {
          console.error('Error playing tone:', err);
        }
      };

      playTone();
      ringtoneIntervalRef.current = setInterval(() => {
        playTone();
      }, 5000);
    } catch (error) {
      console.error('Failed to start ringtone:', error);
    }
  };

  const stopRingtone = () => {
    try {
      if (ringtoneIntervalRef.current) {
        clearInterval(ringtoneIntervalRef.current);
        ringtoneIntervalRef.current = null;
      }
      if (oscillatorRef.current) {
        try {
          oscillatorRef.current.stop();
          oscillatorRef.current.disconnect();
        } catch (e) {
          console.log('Oscillator already stopped');
        }
        oscillatorRef.current = null;
      }
      if (gainNodeRef.current) {
        gainNodeRef.current.disconnect();
        gainNodeRef.current = null;
      }
    } catch (error) {
      console.error('Failed to stop ringtone:', error);
    }
  };

  const handlePSTNCallStatus = async (event: CallStatusEvent) => {
    setPstnCallStatus(event.status);
    setActivePSTNCallId(event.callId);

    if (event.sipParticipantId) {
      setActiveSipParticipantId(event.sipParticipantId);
    }

    if (event.status === 'answered' || event.status === 'in-progress') {
      stopRingtone();
    }

    const isActive = ['initiated', 'ringing', 'in-progress', 'answered'].includes(event.status);
    setIsPSTNCallActive(isActive);

    const isTerminal = ['completed', 'failed', 'busy', 'no-answer'].includes(event.status);
    if (isTerminal) {
      stopRingtone();

      setTimeout(() => {
        setPstnCallStatus(null);
        setActivePSTNCallId(null);
        setIsPSTNCallActive(false);
        setActiveSipParticipantId(null);
        currentCallDataRef.current = null;
      }, 3000);
    }

    try {
      await updateCallHistory(event.callId, event.status);
      setHistoryRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error('Failed to update call history:', error);
    }
  };

  const handleOutgoingCallAccepted = async (invitation: CallInvitation) => {
    console.log('handleOutgoingCallAccepted called', invitation);
    stopRingtone();

    setOutgoingInvitation(null);
    setOutgoingCalleeId(null);
    setIsInCall(true);

    try {
      const callSession = await getCallSessionByInvitationId(invitation.id);
      if (callSession?.id) {
        setCallSessionId(callSession.id);
        await subscribeToCallSession(callSession.id);
        console.log('Initiator subscribed to call session:', callSession.id);
      }
    } catch (error) {
      console.error('Failed to subscribe to call session:', error);
    }
  };

  const handleRemoteParticipantConnected = async (participantIdentity: string, participantName: string) => {
    if (!participantIdentity.startsWith('sip-') && outgoingInvitation) {
      console.log('Remote participant connected during outgoing call, transitioning to in-call state');

      stopRingtone();

      const invitationId = outgoingInvitation.id;

      setOutgoingInvitation(null);
      setOutgoingCalleeId(null);
      setIsInCall(true);

      try {
        const callSession = await getCallSessionByInvitationId(invitationId);
        if (callSession?.id) {
          setCallSessionId(callSession.id);
          await subscribeToCallSession(callSession.id);
          console.log('Initiator subscribed to call session via participant connect:', callSession.id);
        }
      } catch (error) {
        console.error('Failed to subscribe to call session:', error);
      }
    }
  };

  const handleRemoteParticipantDisconnected = async (participantIdentity: string, participantName: string) => {
    console.log('Remote participant disconnected:', participantIdentity, participantName);
    setParticipantLeftName(participantName);
  };

  const handleParticipantCountChanged = (humanCount: number, totalCount: number) => {
    console.log('Participant count changed:', { humanCount, totalCount });
    setHumanParticipantCount(humanCount);
    setTotalParticipantCount(totalCount);
  };

  const handleAcceptCall = async () => {
    if (!incomingInvitation || !callInvitationServiceRef.current) return;

    stopRingtone();

    try {
      const result = await callInvitationServiceRef.current.acceptCall(incomingInvitation.id);

      setCallRoomName(result.room_name);
      if (result.session_id) {
        setCallSessionId(result.session_id);
        subscribeToCallSession(result.session_id);
      }
      setIncomingInvitation(null);
      setIsInCall(true);
      setCallType('webrtc');

      await presenceManagerRef.current?.setInCall(true);

      const livekitUrl = import.meta.env.VITE_LIVEKIT_URL;
      if (!livekitUrl) {
        throw new Error('LiveKit URL not configured');
      }

      setCallStartTime(Date.now());

      if (userId && incomingInvitation.caller_user_id && result.session_id) {
        const historyId = await logIncomingWebRTCCall({
          userId,
          callerUserId: incomingInvitation.caller_user_id,
          sessionId: result.session_id,
          invitationId: incomingInvitation.id,
        });
        if (historyId) {
          setCurrentCallHistoryId(historyId);
        }
      }

      liveKitClientRef.current = new LiveKitClient(
        (msg) => console.log('[LiveKit]', msg),
        () => {},
        () => {},
        () => {},
        handleRemoteParticipantDisconnected,
        handleRemoteParticipantConnected,
        handleParticipantCountChanged
      );

      await liveKitClientRef.current.connect(livekitUrl, result.token);

      const room = liveKitClientRef.current.getRoom();
      setLivekitRoom(room);

      await liveKitClientRef.current.publishAudio({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });

      try {
        await liveKitClientRef.current.publishVideo();
      } catch (videoError) {
        console.warn('Failed to publish video:', videoError);
      }

      setLivekitRoom(liveKitClientRef.current.getRoom());
    } catch (error) {
      console.error('Failed to accept call:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to join call: ${errorMessage}`);

      setIncomingInvitation(null);
      setIsInCall(false);
      setLivekitRoom(null);
      setCallSessionId(null);
      await presenceManagerRef.current?.setInCall(false);

      if (liveKitClientRef.current) {
        liveKitClientRef.current.disconnect();
        liveKitClientRef.current = null;
      }
    }
  };

  const handleRejectCall = async () => {
    if (!incomingInvitation || !callInvitationServiceRef.current) return;

    stopRingtone();

    try {
      await callInvitationServiceRef.current.rejectCall(incomingInvitation.id);
      setIncomingInvitation(null);
    } catch (error) {
      console.error('Failed to reject call:', error);
    }
  };

  const handleCancelOutgoingCall = async () => {
    if (!outgoingInvitation || !callInvitationServiceRef.current) return;

    stopRingtone();

    try {
      await callInvitationServiceRef.current.cancelCall(outgoingInvitation.id);
      setOutgoingInvitation(null);
      setOutgoingCalleeId(null);

      liveKitClientRef.current?.disconnect();
      liveKitClientRef.current = null;
      setLivekitRoom(null);
      setCallSessionId(null);
      await presenceManagerRef.current?.setInCall(false);
    } catch (error) {
      console.error('Failed to cancel call:', error);
    }
  };

  const handleEndCall = async () => {
    if (currentCallHistoryId && callStartTime) {
      const durationSeconds = Math.floor((Date.now() - callStartTime) / 1000);
      await logWebRTCCallEnd({
        historyId: currentCallHistoryId,
        status: 'completed',
        durationSeconds,
      });
      setCurrentCallHistoryId(null);
      setHistoryRefreshKey(prev => prev + 1);
    }

    if (sessionChannelRef.current) {
      await sessionChannelRef.current.unsubscribe();
      sessionChannelRef.current = null;
    }

    liveKitClientRef.current?.disconnect();
    liveKitClientRef.current = null;
    setLivekitRoom(null);

    if (callSessionId) {
      try {
        await supabase
          .from('call_sessions')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', callSessionId);
      } catch (error) {
        console.error('Failed to update call session:', error);
      }
    }

    setIsInCall(false);
    setCallRoomName(null);
    setCallSessionId(null);
    setCallType(null);
    setCallStartTime(null);
    setHumanParticipantCount(0);
    setTotalParticipantCount(0);
    setAloneStartTime(null);

    await presenceManagerRef.current?.setInCall(false);
  };

  const handleRequestNotificationPermission = async () => {
    if (notificationManagerRef.current) {
      const permission = await notificationManagerRef.current.requestPermission();
      setNotificationPermission(permission);
    }
  };

  const handleWebCallInitiated = async (calleeUserId: string) => {
    if (!callInvitationServiceRef.current) return;

    setOutgoingCalleeId(calleeUserId);

    try {
      const { invitation, caller_token, room_name } = await callInvitationServiceRef.current.initiateCall(calleeUserId);
      setOutgoingInvitation(invitation);
      setCallRoomName(room_name);
      setCallType('webrtc');

      await presenceManagerRef.current?.setInCall(true);

      const livekitUrl = import.meta.env.VITE_LIVEKIT_URL;
      if (!livekitUrl) {
        throw new Error('LiveKit URL not configured');
      }

      setCallStartTime(Date.now());

      liveKitClientRef.current = new LiveKitClient(
        (msg) => console.log('[LiveKit]', msg),
        () => {},
        () => {},
        () => {},
        handleRemoteParticipantDisconnected,
        handleRemoteParticipantConnected,
        handleParticipantCountChanged
      );

      await liveKitClientRef.current.connect(livekitUrl, caller_token);

      const room = liveKitClientRef.current.getRoom();
      setLivekitRoom(room);

      await liveKitClientRef.current.publishAudio({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });

      try {
        await liveKitClientRef.current.publishVideo();
      } catch (videoError) {
        console.warn('Failed to publish video:', videoError);
      }

      setLivekitRoom(liveKitClientRef.current.getRoom());
    } catch (error) {
      console.error('Failed to initiate call:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      setOutgoingInvitation(null);
      setOutgoingCalleeId(null);
      setCallRoomName(null);
      setLivekitRoom(null);
      setCallSessionId(null);
      await presenceManagerRef.current?.setInCall(false);

      if (liveKitClientRef.current) {
        liveKitClientRef.current.disconnect();
        liveKitClientRef.current = null;
      }

      alert(`Failed to initiate call: ${errorMessage}`);
    }
  };

  const handleInitializePSTN = async () => {
    if (isPSTNConnected) {
      handleStopPSTN();
      return;
    }

    const liveKitUrl = import.meta.env.VITE_LIVEKIT_URL;
    if (!liveKitUrl) {
      alert('LiveKit URL not configured');
      return;
    }

    if (!tokenManagerRef.current) {
      alert('Token manager not initialized');
      return;
    }

    try {
      const generatedRoomName = `call-${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      const token = await tokenManagerRef.current.getToken(generatedRoomName);
      setJwtToken(token);

      recorderRef.current = new AudioRecorder((level) => {
        setInputLevel(level);
      });

      await recorderRef.current.start();

      liveKitClientRef.current = new LiveKitClient(
        (msg) => console.log('[PSTN LiveKit]', msg),
        () => {},
        handlePSTNCallStatus,
        stopRingtone
      );

      await liveKitClientRef.current.connect(liveKitUrl, token);

      await liveKitClientRef.current.publishAudio({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });

      const room = liveKitClientRef.current.getRoom();
      setLivekitRoom(room);

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      setIsPSTNConnected(true);
      setCallType('pstn');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert('Connection failed: ' + errorMessage);
    }
  };

  const handleStopPSTN = () => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
    }

    if (liveKitClientRef.current) {
      liveKitClientRef.current.disconnect();
      liveKitClientRef.current = null;
    }

    stopRingtone();

    if (tokenManagerRef.current) {
      tokenManagerRef.current.clearToken();
    }

    setIsPSTNConnected(false);
    setInputLevel(0);
    setLivekitRoom(null);
    setCallType(null);
  };

  const handlePSTNDial = async (phoneNumber: string, contactName: string) => {
    if (!liveKitClientRef.current || !jwtToken) {
      alert('Please initialize PSTN first by clicking the phone icon');
      return;
    }

    try {
      setIsPSTNDialing(true);
      setPstnCallStatus('Initiating call...');
      setIsPSTNCallActive(true);

      currentCallDataRef.current = { phoneNumber, contactName };

      const sessionId = liveKitClientRef.current.getSessionId();

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase configuration not found');
      }

      const dialService = new DialService(supabaseUrl, supabaseKey);
      const result = await dialService.dialContact(phoneNumber, contactName, sessionId);

      setPstnCallStatus('ringing');
      setActivePSTNCallId(result.callId);
      setActiveSipParticipantId(result.sipParticipantId);
      setIsInCall(true);
      setCallType('pstn');

      await startRingtone();

      await insertCallHistory({
        phone_number: phoneNumber,
        contact_name: contactName,
        call_id: result.callId,
        status: 'initiated',
        timestamp: new Date().toISOString(),
        call_type: 'pstn',
        callee_identifier: phoneNumber,
        user_id: userId,
      });

      setHistoryRefreshKey(prev => prev + 1);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setPstnCallStatus('failed');
      setIsPSTNCallActive(false);
      stopRingtone();

      if (currentCallDataRef.current) {
        await insertCallHistory({
          phone_number: currentCallDataRef.current.phoneNumber,
          contact_name: currentCallDataRef.current.contactName,
          status: 'failed',
          timestamp: new Date().toISOString(),
          call_type: 'pstn',
          callee_identifier: currentCallDataRef.current.phoneNumber,
          user_id: userId,
        });
        setHistoryRefreshKey(prev => prev + 1);
      }

      setTimeout(() => {
        setPstnCallStatus(null);
        currentCallDataRef.current = null;
      }, 3000);
    } finally {
      setIsPSTNDialing(false);
    }
  };

  const handlePSTNHangup = async () => {
    if (!liveKitClientRef.current || !isPSTNCallActive || !activeSipParticipantId) {
      return;
    }

    try {
      stopRingtone();

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase configuration not found');
      }

      const dialService = new DialService(supabaseUrl, supabaseKey);
      await dialService.hangupCall(activeSipParticipantId);

      setPstnCallStatus('completed');
      setIsPSTNCallActive(false);
      setIsInCall(false);

      setTimeout(() => {
        setPstnCallStatus(null);
        setActivePSTNCallId(null);
        setActiveSipParticipantId(null);
        currentCallDataRef.current = null;
      }, 2000);
    } catch (error) {
      console.error('Hangup failed:', error);
    }
  };

  const handleLogout = async () => {
    await cleanup();
    await logout();
  };

  const handleAddPhoneContact = () => {
    setEditingPhoneContact(undefined);
    setShowPhoneContactModal(true);
  };

  const handleEditPhoneContact = (contact: PhoneContact) => {
    setEditingPhoneContact(contact);
    setShowPhoneContactModal(true);
  };

  const handlePhoneContactSaved = () => {
    setShowPhoneContactModal(false);
    setEditingPhoneContact(undefined);
  };

  if (!userId) {
    return <AuthScreen />;
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
          <div className="relative z-10 flex flex-col items-center space-y-4 sm:space-y-6 md:space-y-8 px-4">
            <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 rounded-full bg-white bg-opacity-20 backdrop-blur-sm border-2 sm:border-3 md:border-4 border-white shadow-2xl flex items-center justify-center">
              <PhoneIcon className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 text-white animate-pulse" />
            </div>

            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-1 sm:mb-2">Calling...</h2>
              <p className="text-sm sm:text-base md:text-lg opacity-90">Waiting for answer</p>
            </div>

            <button
              onClick={handleCancelOutgoingCall}
              className="px-5 sm:px-6 md:px-8 py-2 sm:py-2.5 md:py-3 bg-red-600 hover:bg-red-700 rounded-full font-medium transition-colors text-sm sm:text-base"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showPhoneContactModal && (
        <PhoneContactModal
          currentUserId={userId}
          contact={editingPhoneContact}
          onClose={() => {
            setShowPhoneContactModal(false);
            setEditingPhoneContact(undefined);
          }}
          onSaved={handlePhoneContactSaved}
        />
      )}

      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-7xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-3 sm:gap-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            Unified Calling
          </h1>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {notificationPermission !== 'granted' && (
              <button
                onClick={handleRequestNotificationPermission}
                className="flex items-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg transition-colors text-xs sm:text-sm"
              >
                <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Enable Notifications</span>
                <span className="sm:hidden">Notify</span>
              </button>
            )}

            <button
              onClick={handleInitializePSTN}
              className={`flex items-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-lg transition-colors text-xs sm:text-sm ${
                isPSTNConnected
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <PhoneIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">{isPSTNConnected ? 'PSTN Active' : 'Enable PSTN'}</span>
              <span className="sm:hidden">{isPSTNConnected ? 'Active' : 'PSTN'}</span>
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-xs sm:text-sm"
            >
              <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {isInCall ? (
          <div className="space-y-3 sm:space-y-4">
            {participantLeftName && (
              <ParticipantNotification
                participantName={participantLeftName}
                onClose={() => setParticipantLeftName(null)}
              />
            )}

            {mediaWorkers.length > 0 && callType === 'webrtc' && (
              <div className="fixed top-20 right-4 z-40 flex flex-col gap-2">
                {mediaWorkers.map((worker) => (
                  <MediaWorkerBadge key={worker.identity} worker={worker} />
                ))}
              </div>
            )}

            <div className="bg-slate-800 rounded-lg p-3 sm:p-4 md:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 sm:mb-4 gap-2 sm:gap-0">
                <h2 className="text-lg sm:text-xl font-semibold">
                  In Call {callType === 'pstn' ? '(Phone)' : '(Video)'}
                </h2>
                <div className="flex items-center gap-3">
                  {callType === 'webrtc' && aloneStartTime && (
                    <span className="text-sm text-amber-400">
                      Waiting for others... ({Math.floor((Date.now() - aloneStartTime) / 1000)}s)
                    </span>
                  )}
                  <button
                    onClick={callType === 'pstn' ? handlePSTNHangup : handleEndCall}
                    className="w-full sm:w-auto px-4 sm:px-5 md:px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors text-sm sm:text-base"
                  >
                    End Call
                  </button>
                </div>
              </div>

              <div className="bg-slate-900 rounded-lg p-2 sm:p-3 md:p-4 min-h-[300px] sm:min-h-[400px]">
                <VideoGrid
                  room={livekitRoom}
                  activeSpeakers={new Set()}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-slate-800 rounded-lg p-3 sm:p-4">
                <Dialpad
                  onDial={handlePSTNDial}
                  onHangup={handlePSTNHangup}
                  isDialing={isPSTNDialing}
                  callStatus={pstnCallStatus}
                  isCallActive={isPSTNCallActive}
                  isConnected={isPSTNConnected}
                />
              </div>

              <div className="bg-slate-800 rounded-lg p-3 sm:p-4">
                {userId && (
                  <CallHistory
                    onRedial={handlePSTNDial}
                    isDialing={isPSTNDialing}
                    currentCallId={activePSTNCallId}
                    refreshTrigger={historyRefreshKey}
                  />
                )}
              </div>
            </div>

            <div className="lg:col-span-2 bg-slate-800 rounded-lg p-3 sm:p-4 md:p-6">
              {userId && callInvitationServiceRef.current && (
                <UnifiedContacts
                  currentUserId={userId}
                  callInvitationService={callInvitationServiceRef.current}
                  onWebCallInitiated={handleWebCallInitiated}
                  onPSTNCallInitiated={handlePSTNDial}
                  outgoingCalleeId={outgoingCalleeId}
                  onAddPhoneContact={handleAddPhoneContact}
                  onEditPhoneContact={handleEditPhoneContact}
                />
              )}
            </div>
          </div>
        )}

        <div className="mt-4 sm:mt-6 text-center text-xs sm:text-sm text-gray-500">
          {notificationPermission === 'granted' ? (
            <div className="flex items-center justify-center space-x-1.5 sm:space-x-2">
              <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />
              <span>Notifications enabled</span>
            </div>
          ) : (
            <div className="flex items-center justify-center space-x-1.5 sm:space-x-2">
              <BellOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
              <span className="hidden sm:inline">Enable notifications to receive calls when away</span>
              <span className="sm:hidden">Enable notifications for calls</span>
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
