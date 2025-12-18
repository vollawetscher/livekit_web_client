import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Wifi, WifiOff, Bug } from 'lucide-react';
import { AudioRecorder } from '../utils/AudioRecorder';
import { LiveKitClient, CallStatusEvent } from '../utils/LiveKitClient';
import { DialService } from '../utils/DialService';
import { TokenManager } from '../utils/TokenManager';
import { insertCallHistory, updateCallHistory } from '../utils/supabase';
import Dialpad from './Dialpad';
import CallHistory from './CallHistory';

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
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [enableVAD, setEnableVAD] = useState(import.meta.env.VITE_ENABLE_VAD !== 'false');
  const recorderRef = useRef<AudioRecorder | null>(null);
  const liveKitClientRef = useRef<LiveKitClient | null>(null);
  const audioTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tokenManagerRef = useRef<TokenManager | null>(null);
  const currentCallDataRef = useRef<{ phoneNumber: string; contactName: string } | null>(null);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleCallStatus = async (event: CallStatusEvent) => {
    addLog(`Call status: ${event.status} (${event.phoneNumber})`);
    setCallStatus(event.status);
    setActiveCallId(event.callId);

    const isActive = ['initiated', 'ringing', 'in-progress', 'answered'].includes(event.status);
    setIsCallActive(isActive);

    const isTerminal = ['completed', 'failed', 'busy', 'no-answer'].includes(event.status);
    if (isTerminal) {
      setTimeout(() => {
        setCallStatus(null);
        setActiveCallId(null);
        setIsCallActive(false);
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

    if (envUrl) {
      setLiveKitUrl(envUrl);
      addLog('Loaded LiveKit URL from environment');

      tokenManagerRef.current = new TokenManager('web-user');
      addLog('Token manager initialized');
    }
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
      addLog('Requesting LiveKit token...');
      const token = await tokenManagerRef.current.getToken();
      setJwtToken(token);
      addLog('LiveKit token acquired successfully');

      if (enableVAD) {
        setIsCalibrating(true);
        addLog('Calibrating microphone - please remain quiet for 2 seconds...');
      } else {
        addLog('VAD disabled - monitoring audio levels only');
      }

      let calibrationResolve: () => void;
      const calibrationPromise = new Promise<void>((resolve) => {
        calibrationResolve = resolve;
      });

      recorderRef.current = new AudioRecorder(
        () => {},
        (level) => {
          setInputLevel(level);
        },
        (threshold) => {
          setIsCalibrating(false);
          if (threshold > 0) {
            addLog(`Calibration complete! Noise threshold: ${threshold.toFixed(4)}`);
          }
          calibrationResolve();
        },
        enableVAD
      );

      await recorderRef.current.start();
      await calibrationPromise;

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
      addLog('Publishing microphone to room...');
      await liveKitClientRef.current.publishAudio({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });

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

    setIsConnected(false);
    setInputLevel(0);
    setIsReceivingAudio(false);
    setIsCalibrating(false);
    addLog('Disconnected');
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
      addLog(`Call initiated: ${result.callId}`);
      addLog(`Twilio SID: ${result.twilioCallSid}`);

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

  const handleHangup = () => {
    if (!liveKitClientRef.current || !isCallActive) {
      return;
    }

    try {
      addLog('Sending stop event to end call...');
      liveKitClientRef.current.sendStop();
      addLog('Stop event sent');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Hangup error: ${errorMessage}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      <div className="container mx-auto px-4 py-4 max-w-2xl">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
            <Mic className="w-6 h-6" />
            Voice Assistant
          </h1>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2">
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
            onClick={() => setEnableVAD(!enableVAD)}
            disabled={isConnected}
            className={`py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-1 transition-all ${
              enableVAD
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-slate-600 hover:bg-slate-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {enableVAD ? (
              <>
                <MicOff className="w-3 h-3" />
                Filter Silence
              </>
            ) : (
              <>
                <Mic className="w-3 h-3" />
                All Audio
              </>
            )}
          </button>

          <button
            onClick={() => setIsLogsExpanded(!isLogsExpanded)}
            className="py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-1 transition-all bg-slate-700 hover:bg-slate-600"
          >
            <Bug className="w-3 h-3" />
            Logs {isLogsExpanded ? '▼' : '▶'}
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
          <div className="mb-3 space-y-2">
            {isCalibrating && (
              <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-2 animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-400 animate-ping" />
                  <p className="text-yellow-300 text-xs">Calibrating... remain quiet</p>
                </div>
              </div>
            )}

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
      </div>
    </div>
  );
}
