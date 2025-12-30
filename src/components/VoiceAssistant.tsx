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
  const ringingAudioRef = useRef<HTMLAudioElement | null>(null);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleCallStatus = async (event: CallStatusEvent) => {
    addLog(`Call status: ${event.status} (${event.phoneNumber})`);
    setCallStatus(event.status);
    setActiveCallId(event.callId);

    if (event.sipParticipantId) {
      setActiveSipParticipantId(event.sipParticipantId);
    }

    if (event.status === 'ringing') {
      if (ringingAudioRef.current) {
        addLog('Playing ringing sound...');
        ringingAudioRef.current.currentTime = 0;
        ringingAudioRef.current.play()
          .then(() => addLog('Ringing sound started'))
          .catch(err => {
            console.error('Failed to play ringing sound:', err);
            addLog(`Ringing sound error: ${err.message}`);
          });
      }
    } else {
      if (ringingAudioRef.current && !ringingAudioRef.current.paused) {
        addLog('Stopping ringing sound');
        ringingAudioRef.current.pause();
        ringingAudioRef.current.currentTime = 0;
      }
    }

    const isActive = ['initiated', 'ringing', 'in-progress', 'answered'].includes(event.status);
    setIsCallActive(isActive);

    const isTerminal = ['completed', 'failed', 'busy', 'no-answer'].includes(event.status);
    if (isTerminal) {
      if (ringingAudioRef.current) {
        ringingAudioRef.current.pause();
        ringingAudioRef.current.currentTime = 0;
      }

      setTimeout(() => {
        setCallStatus(null);
        setActiveCallId(null);
        setIsCallActive(false);
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

    ringingAudioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    ringingAudioRef.current.loop = true;
    ringingAudioRef.current.volume = 0.5;

    return () => {
      if (ringingAudioRef.current) {
        ringingAudioRef.current.pause();
        ringingAudioRef.current = null;
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
        handleCallStatus
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

    if (ringingAudioRef.current) {
      ringingAudioRef.current.pause();
      ringingAudioRef.current.currentTime = 0;
    }

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
      const result = await dialService.dialContact(phoneNumber, contactName, sessionId);

      setCallStatus('initiated');
      setActiveCallId(result.callId);
      setActiveSipParticipantId(result.sipParticipantId);
      addLog(`Call initiated: ${result.callId}`);
      addLog(`SIP Participant: ${result.sipParticipantId}`);

      setTimeout(() => {
        if (liveKitClientRef.current && isCallActive) {
          const participants = Array.from(liveKitClientRef.current.getRoom().remoteParticipants.values());
          const sipParticipant = participants.find(p => p.identity === result.sipParticipantId);

          const hasAudioTrack = sipParticipant?.audioTrackPublications.size ?? 0 > 0;

          if (!hasAudioTrack) {
            setCallStatus('ringing');
            addLog('Call is ringing...');

            if (ringingAudioRef.current) {
              addLog('Starting ringing sound...');
              ringingAudioRef.current.currentTime = 0;
              ringingAudioRef.current.play()
                .then(() => addLog('Ringing sound playing'))
                .catch(err => addLog(`Ringing sound error: ${err.message}`));
            }
          }
        }
      }, 1500);

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

      if (ringingAudioRef.current) {
        ringingAudioRef.current.pause();
        ringingAudioRef.current.currentTime = 0;
      }

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
