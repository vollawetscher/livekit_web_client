import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Wifi, WifiOff, Bug } from 'lucide-react';
import { AudioRecorder } from '../utils/AudioRecorder';
import { WebSocketClient } from '../utils/WebSocketClient';
import { DialService } from '../utils/DialService';
import { TokenManager } from '../utils/TokenManager';
import Dialpad from './Dialpad';

export default function VoiceAssistant() {
  const [isConnected, setIsConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [jwtToken, setJwtToken] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [isReceivingAudio, setIsReceivingAudio] = useState(false);
  const [isDialing, setIsDialing] = useState(false);
  const [callStatus, setCallStatus] = useState<string | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [noiseThreshold, setNoiseThreshold] = useState<number | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const wsClientRef = useRef<WebSocketClient | null>(null);
  const audioTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tokenManagerRef = useRef<TokenManager | null>(null);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  // Load values from environment on mount
  useEffect(() => {
    const envUrl = import.meta.env.VITE_SERVER_URL;

    if (envUrl) {
      setServerUrl(envUrl);
      addLog('Loaded server URL from environment');

      // Initialize TokenManager
      const url = new URL(envUrl);
      const baseUrl = `${url.protocol}//${url.host}`.replace('wss:', 'https:').replace('ws:', 'http:');
      tokenManagerRef.current = new TokenManager(baseUrl);
      addLog('Token manager initialized');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = async () => {
    if (!serverUrl) {
      alert('Server URL not configured. Please set VITE_SERVER_URL in your .env file.');
      return;
    }

    if (!tokenManagerRef.current) {
      alert('Token manager not initialized. Please refresh the page.');
      return;
    }

    try {
      addLog('Requesting authentication token...');
      const token = await tokenManagerRef.current.getToken();
      setJwtToken(token);
      addLog('Token acquired successfully');

      const expiry = tokenManagerRef.current.getTokenExpiry();
      if (expiry) {
        addLog(`Token valid until: ${expiry.toLocaleDateString()}`);
      }

      addLog('Connecting to WebSocket...');
      wsClientRef.current = new WebSocketClient(
        serverUrl,
        token,
        addLog,
        () => {
          setIsReceivingAudio(true);
          if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current);
          audioTimeoutRef.current = setTimeout(() => setIsReceivingAudio(false), 200);
        }
      );
      await wsClientRef.current.connect();

      addLog('Starting audio recording...');
      setIsCalibrating(true);
      addLog('Calibrating microphone - please remain quiet for 2 seconds...');

      recorderRef.current = new AudioRecorder(
        (audioData) => {
          wsClientRef.current?.sendAudio(audioData);
        },
        (level) => {
          setInputLevel(level);
        },
        (threshold) => {
          // Calibration complete callback
          setIsCalibrating(false);
          setNoiseThreshold(threshold);
          addLog(`Calibration complete! Noise threshold: ${threshold.toFixed(4)}`);
          addLog('Voice assistant ready - speak normally now');
        }
      );

      await recorderRef.current.start();

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

    if (wsClientRef.current) {
      wsClientRef.current.disconnect();
      wsClientRef.current = null;
    }

    if (audioTimeoutRef.current) {
      clearTimeout(audioTimeoutRef.current);
      audioTimeoutRef.current = null;
    }

    setIsConnected(false);
    setInputLevel(0);
    setIsReceivingAudio(false);
    setIsCalibrating(false);
    setNoiseThreshold(null);
    addLog('Disconnected');
  };

  const handleToggleConnection = () => {
    if (isConnected) {
      handleStop();
    } else {
      handleStart();
    }
  };

  const handleDebugStatus = () => {
    console.log('🔍 ===== DEBUG STATUS DUMP =====');
    if (wsClientRef.current) {
      wsClientRef.current.logStatus();
    } else {
      console.log('❌ WebSocketClient: Not initialized');
    }
    if (recorderRef.current) {
      console.log('✅ AudioRecorder: Initialized');
    } else {
      console.log('❌ AudioRecorder: Not initialized');
    }
    console.log('🔍 ===========================');
    addLog('Debug status logged to console');
  };

  const handleDial = async (phoneNumber: string, contactName: string) => {
    if (!wsClientRef.current || !jwtToken || !serverUrl) {
      alert('Connection not ready. Please start the call first.');
      return;
    }

    try {
      setIsDialing(true);
      setCallStatus('Initiating call...');
      addLog(`Dialing ${contactName} at ${phoneNumber}...`);

      const sessionId = wsClientRef.current.getSessionId();

      // Extract base URL from WebSocket URL
      const url = new URL(serverUrl);
      const baseUrl = `${url.protocol}//${url.host}`.replace('wss:', 'https:').replace('ws:', 'http:');

      const dialService = new DialService(baseUrl, jwtToken);
      const result = await dialService.dialContact(phoneNumber, contactName, sessionId);

      setCallStatus(`Call ${result.status} - ${result.message}`);
      addLog(`Call initiated: ${result.callId}`);
      addLog(`Twilio SID: ${result.twilioCallSid}`);

      // Clear status after 5 seconds
      setTimeout(() => {
        setCallStatus(null);
      }, 5000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setCallStatus(`Call failed: ${errorMessage}`);
      addLog(`Dial error: ${errorMessage}`);

      // Clear error status after 5 seconds
      setTimeout(() => {
        setCallStatus(null);
      }, 5000);
    } finally {
      setIsDialing(false);
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

        <div className="mb-4">
          <button
            onClick={handleToggleConnection}
            className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all shadow-lg ${
              isConnected
                ? 'bg-red-600 hover:bg-red-700 active:scale-95'
                : 'bg-green-600 hover:bg-green-700 active:scale-95'
            }`}
          >
            {isConnected ? (
              <>
                <Wifi className="w-5 h-5" />
                Disconnect
              </>
            ) : (
              <>
                <WifiOff className="w-5 h-5" />
                Connect
              </>
            )}
          </button>
        </div>

        {isConnected && (
          <div className="mb-4 space-y-2">
            {isCalibrating && (
              <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-2 animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-400 animate-ping" />
                  <p className="text-yellow-300 text-xs">Calibrating... remain quiet</p>
                </div>
              </div>
            )}

            <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-2">
              <div className="flex items-center gap-2 mb-1">
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
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-3 h-3 rounded-full transition-colors ${isReceivingAudio ? 'bg-green-400' : 'bg-slate-600'}`} />
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

            <button
              onClick={handleDebugStatus}
              className="w-full py-1.5 rounded-lg font-medium text-xs flex items-center justify-center gap-1 transition-all bg-slate-700 hover:bg-slate-600"
            >
              <Bug className="w-3 h-3" />
              Debug
            </button>
          </div>
        )}

        {isConnected && (
          <div className="mb-8">
            <Dialpad
              onDial={handleDial}
              isDialing={isDialing}
              callStatus={callStatus}
            />
          </div>
        )}

        <div className="bg-slate-800/50 rounded-lg border border-slate-700">
          <button
            onClick={() => setIsLogsExpanded(!isLogsExpanded)}
            className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-700/50 transition-colors rounded-lg"
          >
            <span className="font-semibold text-xs text-slate-300">Activity Log</span>
            <span className="text-slate-400 text-xs">
              {isLogsExpanded ? '▼' : '▶'}
            </span>
          </button>

          {!isLogsExpanded && logs.length > 0 && (
            <div className="px-3 pb-2">
              <div className="text-xs font-mono text-slate-300 truncate">
                {logs[logs.length - 1]}
              </div>
            </div>
          )}

          {isLogsExpanded && (
            <div className="px-3 pb-2 max-h-48 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-slate-500 text-xs italic">
                  No activity yet...
                </p>
              ) : (
                <div className="space-y-1">
                  {logs.map((log, index) => (
                    <div
                      key={index}
                      className="text-xs font-mono text-slate-300 break-words"
                    >
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
