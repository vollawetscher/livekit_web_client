import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Wifi, WifiOff, Bug } from 'lucide-react';
import { AudioRecorder } from '../utils/AudioRecorder';
import { WebSocketClient } from '../utils/WebSocketClient';
import { DialService } from '../utils/DialService';
import Dialpad from './Dialpad';

export default function VoiceAssistant() {
  const [isConnected, setIsConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [jwtToken, setJwtToken] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [inputLevel, setInputLevel] = useState(0);
  const [isReceivingAudio, setIsReceivingAudio] = useState(false);
  const [isDialing, setIsDialing] = useState(false);
  const [callStatus, setCallStatus] = useState<string | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [noiseThreshold, setNoiseThreshold] = useState<number | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const wsClientRef = useRef<WebSocketClient | null>(null);
  const audioTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  // Load values from environment on mount
  useEffect(() => {
    const envUrl = import.meta.env.VITE_SERVER_URL;
    const envToken = import.meta.env.VITE_JWT_TOKEN;

    if (envUrl) {
      setServerUrl(envUrl);
      addLog('Loaded server URL from environment');
    }

    if (envToken) {
      setJwtToken(envToken);
      addLog('Loaded JWT token from environment');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = async () => {
    if (!serverUrl) {
      alert('Server URL not configured. Please set VITE_SERVER_URL in your .env file.');
      return;
    }

    try {
      let token = jwtToken;

      // If no JWT provided in environment, fetch one from the server
      if (!token) {
        addLog('Requesting authentication token...');

        try {
          // Extract base URL and construct token endpoint
          const url = new URL(serverUrl);
          const baseUrl = `${url.protocol}//${url.host}`;
          const tokenUrl = `${baseUrl.replace('wss:', 'https:').replace('ws:', 'http:')}/api/mobile/auth/token`;

          addLog(`Token URL: ${tokenUrl}`);
          console.log('🔑 Fetching token from:', tokenUrl);

          const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: 'test-user', deviceId: 'web-test' }),
          });

          if (!tokenResponse.ok) {
            throw new Error(`Token fetch failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
          }

          const data = await tokenResponse.json();
          token = data.token;
          addLog('Token received from server');
          console.log('🔑 Token received, length:', token?.length);

          setJwtToken(token);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          addLog(`Token fetch failed: ${errorMsg}`);
          throw new Error(`Failed to get authentication token: ${errorMsg}`);
        }
      } else {
        addLog('Using JWT token from environment');
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
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center justify-center gap-2">
            <Mic className="w-8 h-8" />
            Voice Assistant
          </h1>
          <p className="text-slate-400 text-sm">Mobile Test Client</p>
        </div>

        <div
          className={`mb-6 p-4 rounded-lg flex items-center gap-3 transition-colors ${
            isConnected
              ? 'bg-green-900/30 border border-green-500/50'
              : 'bg-red-900/30 border border-red-500/50'
          }`}
        >
          {isConnected ? (
            <>
              <Wifi className="w-5 h-5 text-green-400" />
              <span className="text-green-300 font-medium">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-5 h-5 text-red-400" />
              <span className="text-red-300 font-medium">Disconnected</span>
            </>
          )}
        </div>

        {isConnected && (
          <div className="mb-6 space-y-3">
            {isCalibrating && (
              <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-yellow-400 animate-ping" />
                  <div>
                    <p className="text-yellow-300 font-medium text-sm">Calibrating Microphone...</p>
                    <p className="text-yellow-200/70 text-xs mt-1">Please remain quiet for 2 seconds</p>
                  </div>
                </div>
              </div>
            )}

            {!isCalibrating && noiseThreshold !== null && (
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
                <p className="text-blue-300 text-xs">
                  Voice detection active - Only audio above noise threshold is transmitted
                </p>
              </div>
            )}

            <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
              <div className="flex items-center gap-3 mb-2">
                <Mic className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-slate-300">Microphone Input</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-75"
                  style={{ width: `${inputLevel * 100}%` }}
                />
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-4 h-4 rounded-full transition-colors ${isReceivingAudio ? 'bg-green-400' : 'bg-slate-600'}`} />
                <span className="text-sm font-medium text-slate-300">Assistant Speaking</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
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
        )}

        <div className="space-y-3 mb-8">
          <div className="flex gap-3">
            <button
              onClick={handleStart}
              disabled={isConnected}
              className="flex-1 py-4 rounded-lg font-semibold text-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 hover:bg-green-700 active:scale-95 shadow-lg"
            >
              <Mic className="w-6 h-6" />
              Start Call
            </button>

            <button
              onClick={handleStop}
              disabled={!isConnected}
              className="flex-1 py-4 rounded-lg font-semibold text-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-red-600 hover:bg-red-700 active:scale-95 shadow-lg"
            >
              <MicOff className="w-6 h-6" />
              Stop Call
            </button>
          </div>

          {isConnected && (
            <button
              onClick={handleDebugStatus}
              className="w-full py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all bg-slate-700 hover:bg-slate-600"
            >
              <Bug className="w-4 h-4" />
              Log Debug Status
            </button>
          )}
        </div>

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
          <div className="px-4 py-3 border-b border-slate-700">
            <h2 className="font-semibold text-sm text-slate-300">Activity Log</h2>
          </div>
          <div className="p-4 max-h-64 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-slate-500 text-sm italic">
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
        </div>
      </div>
    </div>
  );
}
