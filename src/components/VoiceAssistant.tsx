import { useState, useRef, useEffect } from 'react';
import { Mic, Wifi, WifiOff, Bug, Video, Settings } from 'lucide-react';
import { AudioRecorder } from '../utils/AudioRecorder';
import { LiveKitClient, CallStatusEvent } from '../utils/LiveKitClient';
import { DialService } from '../utils/DialService';
import { TokenManager } from '../utils/TokenManager';
import { insertCallHistory, updateCallHistory, getUserProfile, upsertUserProfile, UserProfile } from '../utils/supabase';
import Dialpad from './Dialpad';
import CallHistory from './CallHistory';
import ParticipantsPanel from './ParticipantsPanel';
import VideoGrid from './VideoGrid';
import RoomInfo from './RoomInfo';
import UserSettings from './UserSettings';

export default function VoiceAssistant() {
  const [isConnected, setIsConnected] = useState(false);
  const [liveKitUrl, setLiveKitUrl] = useState('');
  const [jwtToken, setJwtToken] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [isReceivingAudio, setIsReceivingAudio] = useState(false);
  const [isDialing, setIsDialing] = useState(false);
  const [callStatus, setCallStatus] = useState<string | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [activeSipParticipantId, setActiveSipParticipantId] = useState<string | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [audioLevels, setAudioLevels] = useState<Map<string, number>>(new Map());
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [adminUserId, setAdminUserId] = useState<string>('');
  const [roomName, setRoomName] = useState<string>('');
  const recorderRef = useRef<AudioRecorder | null>(null);
  const liveKitClientRef = useRef<LiveKitClient | null>(null);
  const audioTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tokenManagerRef = useRef<TokenManager | null>(null);
  const currentCallDataRef = useRef<{ phoneNumber: string; contactName: string } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const ringtoneIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  const startRingtone = async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
        addLog('AudioContext created');
      }

      const context = audioContextRef.current;

      if (context.state === 'suspended') {
        await context.resume();
        addLog('AudioContext resumed from suspended state');
      }

      if (oscillatorRef.current || ringtoneIntervalRef.current) {
        addLog('Stopping existing ringtone before starting new one');
        stopRingtone();
      }

      addLog(`AudioContext state: ${context.state}, sample rate: ${context.sampleRate}`);

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

          console.log('Tone played at', new Date().toISOString());
        } catch (err) {
          console.error('Error playing tone:', err);
          addLog(`Tone play error: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
      };

      playTone();
      addLog('Initial ringtone tone played');

      ringtoneIntervalRef.current = setInterval(() => {
        playTone();
      }, 5000);

      addLog('Ringtone started (ETSI: 425Hz, 1s on / 4s off)');
    } catch (error) {
      console.error('Failed to start ringtone:', error);
      addLog(`Ringtone error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  };

  const stopRingtone = () => {
    try {
      const hadRingtone = ringtoneIntervalRef.current !== null || oscillatorRef.current !== null;

      if (ringtoneIntervalRef.current) {
        clearInterval(ringtoneIntervalRef.current);
        ringtoneIntervalRef.current = null;
        console.log('Ringtone interval cleared');
      }
      if (oscillatorRef.current) {
        try {
          oscillatorRef.current.stop();
          oscillatorRef.current.disconnect();
        } catch (e) {
          console.log('Oscillator already stopped or disconnected');
        }
        oscillatorRef.current = null;
      }
      if (gainNodeRef.current) {
        gainNodeRef.current.disconnect();
        gainNodeRef.current = null;
      }

      if (hadRingtone) {
        addLog('🔇 Ringtone stopped');
        console.log('Ringtone stopped at', new Date().toISOString());
      }
    } catch (error) {
      console.error('Failed to stop ringtone:', error);
      addLog(`Ringtone stop error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  };

  const handleCallStatus = async (event: CallStatusEvent) => {
    console.log('📞 handleCallStatus called:', event);
    addLog(`📞 Status event: ${event.status} (${event.phoneNumber}, SIP: ${event.sipParticipantId || 'none'})`);

    const previousStatus = callStatus;
    setCallStatus(event.status);
    setActiveCallId(event.callId);

    if (previousStatus !== event.status) {
      addLog(`Status changed: ${previousStatus || 'none'} → ${event.status}`);
    }

    if (event.sipParticipantId) {
      setActiveSipParticipantId(event.sipParticipantId);
    }

    if (event.status === 'answered' || event.status === 'in-progress') {
      addLog(`Call ${event.status} - stopping ringtone`);
      stopRingtone();
    }

    const isActive = ['initiated', 'ringing', 'in-progress', 'answered'].includes(event.status);
    setIsCallActive(isActive);

    const isTerminal = ['completed', 'failed', 'busy', 'no-answer'].includes(event.status);
    if (isTerminal) {
      addLog(`Call ended with status: ${event.status}`);
      stopRingtone();

      setTimeout(() => {
        setCallStatus(null);
        setActiveCallId(null);
        setIsCallActive(false);
        setActiveSipParticipantId(null);
        currentCallDataRef.current = null;
        addLog('Call state cleared');
      }, 3000);
    }

    try {
      await updateCallHistory(event.callId, event.status);
      setHistoryRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error('Failed to update call history:', error);
      addLog(`History update failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  };

  useEffect(() => {
    const envUrl = import.meta.env.VITE_LIVEKIT_URL;

    let storedUserId = localStorage.getItem('userId');
    if (!storedUserId) {
      storedUserId = 'user-' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('userId', storedUserId);
    }
    setUserId(storedUserId);

    getUserProfile(storedUserId).then(async profile => {
      if (profile) {
        setUserProfile(profile);
      } else {
        try {
          const newProfile = await upsertUserProfile({
            user_id: storedUserId,
            display_name: storedUserId,
          });
          setUserProfile(newProfile);
          addLog('Profile created. Set your display name in Settings.');
        } catch (err) {
          console.error('Failed to create user profile:', err);
          addLog('Warning: Could not create user profile');
        }
      }
    }).catch(err => {
      console.error('Failed to load user profile:', err);
    });

    if (envUrl) {
      setLiveKitUrl(envUrl);
      addLog('Loaded LiveKit URL from environment');

      tokenManagerRef.current = new TokenManager(storedUserId);
      addLog('Token manager initialized');
    }

    return () => {
      stopRingtone();
      if (audioContextRef.current) {
        audioContextRef.current.close().then(() => {
          console.log('AudioContext closed');
        }).catch(err => {
          console.error('Error closing AudioContext:', err);
        });
        audioContextRef.current = null;
      }
    };
  }, []);

  const handleStart = async () => {
    if (!liveKitUrl) {
      alert('LiveKit URL not configured. Please set VITE_LIVEKIT_URL in your .env file.');
      return;
    }

    if (!tokenManagerRef.current) {
      alert('Token manager not initialized. Please refresh the page.');
      return;
    }

    try {
      const generatedRoomName = `call-${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      setRoomName(generatedRoomName);
      addLog(`Creating new room: ${generatedRoomName}`);

      addLog('Requesting LiveKit token...');
      const token = await tokenManagerRef.current.getToken(generatedRoomName);
      setJwtToken(token);
      addLog('LiveKit token acquired successfully');

      recorderRef.current = new AudioRecorder(
        (level) => {
          setInputLevel(level);
        }
      );

      await recorderRef.current.start();

      addLog('Connecting to LiveKit room...');

      liveKitClientRef.current = new LiveKitClient(
        addLog,
        () => {
          setIsReceivingAudio(true);
          if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current);
          audioTimeoutRef.current = setTimeout(() => setIsReceivingAudio(false), 200);
        },
        handleCallStatus,
        stopRingtone
      );

      await liveKitClientRef.current.connect(liveKitUrl, token);

      const room = liveKitClientRef.current.getRoom();
      if (room.numParticipants === 1) {
        setAdminUserId(userId);
        addLog('You are the room admin');
      }

      addLog('Publishing microphone to room...');
      await liveKitClientRef.current.publishAudio({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });

      addLog('Enabling camera...');
      try {
        await liveKitClientRef.current.publishVideo();
        setIsVideoEnabled(true);
        addLog('Camera enabled automatically');
      } catch (error) {
        addLog('Camera could not be enabled automatically');
        console.warn('Failed to auto-enable video:', error);
      }

      if (!audioContextRef.current) {
        try {
          audioContextRef.current = new AudioContext();
          addLog('AudioContext initialized (ready for ringtone)');
        } catch (err) {
          console.error('Failed to create AudioContext:', err);
          addLog('Warning: AudioContext creation failed');
        }
      }

      addLog('Voice assistant ready - speak normally now');
      setIsConnected(true);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      addLog(`Error: ${errorMessage}`);
      alert('Connection failed: ' + errorMessage);
    }
  };

  const handleStop = () => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
    }

    if (liveKitClientRef.current) {
      liveKitClientRef.current.disconnect();
      liveKitClientRef.current = null;
    }

    if (audioTimeoutRef.current) {
      clearTimeout(audioTimeoutRef.current);
      audioTimeoutRef.current = null;
    }

    stopRingtone();

    if (tokenManagerRef.current) {
      tokenManagerRef.current.clearToken();
      addLog('Token cleared for new connection');
    }

    setIsConnected(false);
    setInputLevel(0);
    setIsReceivingAudio(false);
    setIsVideoEnabled(false);
    setAudioLevels(new Map());
    setActiveSpeakers(new Set());
    setAdminUserId('');
    setRoomName('');
    addLog('Disconnected');
  };

  const handleKickParticipant = async (participantId: string) => {
    if (!liveKitClientRef.current || userId !== adminUserId) {
      addLog('Only admin can kick participants');
      return;
    }

    try {
      addLog(`Kicking participant: ${participantId}`);
      const room = liveKitClientRef.current.getRoom();
      const participant = room.getParticipantByIdentity(participantId);

      if (participant) {
        addLog(`Participant ${participantId} will be removed`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Kick error: ${errorMessage}`);
    }
  };

  const handleMuteParticipant = async (participantId: string, muted: boolean) => {
    if (!liveKitClientRef.current || userId !== adminUserId) {
      addLog('Only admin can control participants');
      return;
    }

    try {
      await liveKitClientRef.current.toggleRemoteParticipantAudio(participantId, muted);
      addLog(`${muted ? 'Muted' : 'Unmuted'} ${participantId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Mute error: ${errorMessage}`);
    }
  };

  const handleToggleParticipantVideo = async (participantId: string, enabled: boolean) => {
    if (!liveKitClientRef.current || userId !== adminUserId) {
      addLog('Only admin can control participants');
      return;
    }

    try {
      await liveKitClientRef.current.toggleRemoteParticipantVideo(participantId, enabled);
      addLog(`${enabled ? 'Enabled' : 'Disabled'} video for ${participantId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Video toggle error: ${errorMessage}`);
    }
  };

  const handleProfileUpdate = (profile: UserProfile) => {
    setUserProfile(profile);
    addLog('Profile updated successfully');
  };

  const handleToggleVideo = async () => {
    if (!liveKitClientRef.current || !isConnected) {
      return;
    }

    try {
      const newVideoState = await liveKitClientRef.current.toggleVideo();
      setIsVideoEnabled(newVideoState);
      addLog(newVideoState ? 'Camera enabled' : 'Camera disabled');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Video toggle error: ${errorMessage}`);
    }
  };

  const handleToggleConnection = () => {
    if (isConnected) {
      handleStop();
    } else {
      handleStart();
    }
  };

  const handleDial = async (phoneNumber: string, contactName: string) => {
    if (!liveKitClientRef.current || !jwtToken) {
      alert('Connection not ready. Please start the call first.');
      return;
    }

    try {
      setIsDialing(true);
      setCallStatus('Initiating call...');
      setIsCallActive(true);
      addLog(`Dialing ${contactName} at ${phoneNumber}...`);

      currentCallDataRef.current = { phoneNumber, contactName };

      const sessionId = liveKitClientRef.current.getSessionId();

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase configuration not found');
      }

      const dialService = new DialService(supabaseUrl, supabaseKey);
      addLog('Calling dial service...');
      const result = await dialService.dialContact(phoneNumber, contactName, sessionId);

      addLog(`Dial service returned: ${result.status}, callId: ${result.callId}`);
      setCallStatus('ringing');
      setActiveCallId(result.callId);
      setActiveSipParticipantId(result.sipParticipantId);
      addLog(`Local status set to 'ringing'`);
      addLog(`SIP Participant ID: ${result.sipParticipantId}`);

      addLog('Starting ringtone...');
      await startRingtone();
      addLog('Ringtone start sequence completed');

      await insertCallHistory({
        phone_number: phoneNumber,
        contact_name: contactName,
        call_id: result.callId,
        status: 'initiated',
        timestamp: new Date().toISOString(),
      });

      setHistoryRefreshKey(prev => prev + 1);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setCallStatus(`failed`);
      addLog(`Dial error: ${errorMessage}`);
      setIsCallActive(false);
      stopRingtone();

      if (currentCallDataRef.current) {
        await insertCallHistory({
          phone_number: currentCallDataRef.current.phoneNumber,
          contact_name: currentCallDataRef.current.contactName,
          status: 'failed',
          timestamp: new Date().toISOString(),
        });
        setHistoryRefreshKey(prev => prev + 1);
      }

      setTimeout(() => {
        setCallStatus(null);
        currentCallDataRef.current = null;
      }, 3000);
    } finally {
      setIsDialing(false);
    }
  };

  const handleHangup = async () => {
    if (!liveKitClientRef.current || !isCallActive || !activeSipParticipantId) {
      return;
    }

    try {
      addLog('Ending call...');
      stopRingtone();

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase configuration not found');
      }

      const dialService = new DialService(supabaseUrl, supabaseKey);
      await dialService.hangupCall(activeSipParticipantId);

      addLog('Call ended successfully');
      setCallStatus('completed');
      setIsCallActive(false);

      setTimeout(() => {
        setCallStatus(null);
        setActiveCallId(null);
        setActiveSipParticipantId(null);
        currentCallDataRef.current = null;
      }, 2000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Hangup error: ${errorMessage}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      <div className="container mx-auto px-4 py-4 max-w-7xl">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
            <Mic className="w-6 h-6" />
            Voice Assistant
          </h1>
        </div>

        <div className="mb-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          <button
            onClick={handleToggleConnection}
            className={`py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-1 transition-all shadow-lg ${
              isConnected
                ? 'bg-red-600 hover:bg-red-700 active:scale-95'
                : 'bg-green-600 hover:bg-green-700 active:scale-95'
            }`}
          >
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4" />
                Disconnect
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4" />
                Connect
              </>
            )}
          </button>

          <button
            onClick={handleToggleVideo}
            disabled={!isConnected}
            className={`py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-1 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
              isVideoEnabled
                ? 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                : 'bg-slate-700 hover:bg-slate-600 active:scale-95'
            }`}
          >
            <Video className="w-4 h-4" />
            {isVideoEnabled ? 'Stop Video' : 'Start Video'}
          </button>

          <button
            onClick={() => setIsLogsExpanded(!isLogsExpanded)}
            className="py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-1 transition-all bg-slate-700 hover:bg-slate-600"
          >
            <Bug className="w-3 h-3" />
            Logs {isLogsExpanded ? '▼' : '▶'}
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-1 transition-all bg-slate-700 hover:bg-slate-600"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>

        {isLogsExpanded && (
          <div className="mb-3 bg-slate-800/50 rounded-lg border border-slate-700 p-3 max-h-40 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-slate-500 text-xs italic">No activity yet...</p>
            ) : (
              <div className="space-y-1">
                {logs.map((log, index) => (
                  <div key={index} className="text-xs font-mono text-slate-300 break-words">
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isConnected && (
          <div className="mb-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-2">
                <div className="flex items-center gap-1 mb-1">
                  <Mic className="w-3 h-3 text-blue-400" />
                  <span className="text-xs font-medium text-slate-300">Mic</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-75"
                    style={{ width: `${inputLevel * 100}%` }}
                  />
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-2">
                <div className="flex items-center gap-1 mb-1">
                  <div className={`w-2 h-2 rounded-full transition-colors ${isReceivingAudio ? 'bg-green-400' : 'bg-slate-600'}`} />
                  <span className="text-xs font-medium text-slate-300">Assistant</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-200 ${
                      isReceivingAudio
                        ? 'bg-gradient-to-r from-green-500 to-green-400 w-full'
                        : 'bg-slate-600 w-0'
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {isConnected && (
          <div className="mb-3">
            <RoomInfo
              room={liveKitClientRef.current?.getRoom() || null}
              participantCount={liveKitClientRef.current?.getRoom().numParticipants || 0}
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
          {isConnected && (
            <div className="lg:col-span-1 space-y-3">
              <ParticipantsPanel
                room={liveKitClientRef.current?.getRoom() || null}
                audioLevels={audioLevels}
                activeSpeakers={activeSpeakers}
                adminUserId={adminUserId}
                currentUserId={userId}
                onKickParticipant={handleKickParticipant}
                onMuteParticipant={handleMuteParticipant}
                onToggleParticipantVideo={handleToggleParticipantVideo}
              />
            </div>
          )}

          <div className={`${isConnected ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
            <div className="bg-slate-800/30 rounded-lg border border-slate-700 p-4 mb-4">
              <VideoGrid
                room={liveKitClientRef.current?.getRoom() || null}
                activeSpeakers={activeSpeakers}
              />
            </div>
          </div>
        </div>

        {callStatus && (
          <div className={`mb-3 p-2 rounded-lg border ${
            callStatus === 'ringing' || callStatus === 'initiated'
              ? 'bg-blue-900/30 border-blue-500/50'
              : callStatus === 'answered' || callStatus === 'in-progress'
              ? 'bg-green-900/30 border-green-500/50'
              : callStatus === 'completed'
              ? 'bg-slate-800/50 border-slate-500/50'
              : 'bg-red-900/30 border-red-500/50'
          }`}>
            <p className={`text-xs font-medium capitalize text-center ${
              callStatus === 'ringing' || callStatus === 'initiated'
                ? 'text-blue-300'
                : callStatus === 'answered' || callStatus === 'in-progress'
                ? 'text-green-300'
                : callStatus === 'completed'
                ? 'text-slate-300'
                : 'text-red-300'
            }`}>
              {callStatus === 'in-progress' ? 'Call Connected' : callStatus.replace('-', ' ')}
            </p>
          </div>
        )}

        <div className="mb-3">
          <Dialpad
            onDial={handleDial}
            onHangup={handleHangup}
            isDialing={isDialing}
            callStatus={callStatus}
            isCallActive={isCallActive}
            isConnected={isConnected}
          />
        </div>

        <CallHistory
          onRedial={handleDial}
          isDialing={isDialing || isCallActive}
          currentCallId={activeCallId || undefined}
          refreshTrigger={historyRefreshKey}
        />

        <UserSettings
          userId={userId}
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onProfileUpdate={handleProfileUpdate}
        />
      </div>
    </div>
  );
}
