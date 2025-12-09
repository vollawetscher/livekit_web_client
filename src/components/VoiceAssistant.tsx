import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Wifi, WifiOff, Trash2 } from 'lucide-react';
import { AudioRecorder } from '../utils/AudioRecorder';
import { WebSocketClient } from '../utils/WebSocketClient';

const STORAGE_KEYS = {
  SERVER_URL: 'voice_assistant_server_url',
  JWT_TOKEN: 'voice_assistant_jwt_token',
};

export default function VoiceAssistant() {
  const [isConnected, setIsConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [jwtToken, setJwtToken] = useState('');
  const [useManualJwt, setUseManualJwt] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [inputLevel, setInputLevel] = useState(0);
  const [isReceivingAudio, setIsReceivingAudio] = useState(false);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const wsClientRef = useRef<WebSocketClient | null>(null);
  const audioTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  // Load saved values on mount
  useEffect(() => {
    const envUrl = import.meta.env.VITE_SERVER_URL;
    const envToken = import.meta.env.VITE_JWT_TOKEN;
    const savedUrl = localStorage.getItem(STORAGE_KEYS.SERVER_URL);
    const savedToken = localStorage.getItem(STORAGE_KEYS.JWT_TOKEN);

    if (savedUrl) {
      setServerUrl(savedUrl);
      addLog('Loaded saved server URL');
    } else if (envUrl) {
      setServerUrl(envUrl);
      addLog('Loaded server URL from environment');
    }

    if (savedToken) {
      setJwtToken(savedToken);
      setUseManualJwt(true);
      addLog('Loaded saved JWT token');
    } else if (envToken) {
      setJwtToken(envToken);
      setUseManualJwt(true);
      addLog('Loaded JWT token from environment');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = async () => {
    if (!serverUrl) {
      alert('Please enter server URL');
      return;
    }

    try {
      let token = jwtToken;

      // If no manual JWT provided, fetch one from the server
      if (!useManualJwt || !token) {
        addLog('Requesting authentication token...');

        const tokenResponse = await fetch(
          serverUrl.replace('/mobile-stream', '/api/mobile/auth/token'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: 'test-user', deviceId: 'web-test' }),
          }
        );

        const data = await tokenResponse.json();
        token = data.token;
        addLog('Token received from server');

        // Save the token for future use
        setJwtToken(token);
        localStorage.setItem(STORAGE_KEYS.JWT_TOKEN, token);
      } else {
        addLog('Using saved JWT token');
      }

      // Save server URL
      localStorage.setItem(STORAGE_KEYS.SERVER_URL, serverUrl);

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

      recorderRef.current = new AudioRecorder(
        (audioData) => {
          wsClientRef.current?.sendAudio(audioData);
        },
        (level) => {
          setInputLevel(level);
        }
      );

      await recorderRef.current.start();

      setIsConnected(true);
      addLog('Voice assistant ready!');
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
    addLog('Disconnected');
  };

  const handleClearSaved = () => {
    localStorage.removeItem(STORAGE_KEYS.SERVER_URL);
    localStorage.removeItem(STORAGE_KEYS.JWT_TOKEN);
    setServerUrl('');
    setJwtToken('');
    setUseManualJwt(false);
    addLog('Cleared saved data');
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

        <div className="mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Server URL
            </label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="wss://your-server.com/mobile-stream"
              disabled={isConnected}
              className="w-full px-4 py-3 rounded-lg bg-slate-700 border border-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed text-white placeholder-slate-400"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300">
                JWT Token (Optional)
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useManualJwt}
                  onChange={(e) => setUseManualJwt(e.target.checked)}
                  disabled={isConnected}
                  className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span className="text-xs text-slate-400">Use manual JWT</span>
              </label>
            </div>
            <input
              type="text"
              value={jwtToken}
              onChange={(e) => {
                setJwtToken(e.target.value);
                localStorage.setItem(STORAGE_KEYS.JWT_TOKEN, e.target.value);
              }}
              placeholder="Paste JWT token or leave empty to auto-fetch"
              disabled={isConnected || !useManualJwt}
              className="w-full px-4 py-3 rounded-lg bg-slate-700 border border-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed text-white placeholder-slate-400 font-mono text-xs"
            />
          </div>

          {(serverUrl || jwtToken) && !isConnected && (
            <button
              onClick={handleClearSaved}
              className="w-full py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all bg-slate-700 hover:bg-slate-600 text-slate-300"
            >
              <Trash2 className="w-4 h-4" />
              Clear Saved Data
            </button>
          )}
        </div>

        <div className="flex gap-3 mb-8">
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
