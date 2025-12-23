import { useState, useEffect } from 'react';
import { X, User, Save } from 'lucide-react';
import { getUserProfile, upsertUserProfile, UserProfile } from '../utils/supabase';
import { clearProfileCache } from '../utils/ProfileService';

interface UserSettingsProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdate: (profile: UserProfile) => void;
}

export default function UserSettings({ userId, isOpen, onClose, onProfileUpdate }: UserSettingsProps) {
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadProfile();
    }
  }, [isOpen, userId]);

  const loadProfile = async () => {
    try {
      const profile = await getUserProfile(userId);
      if (profile) {
        setDisplayName(profile.display_name);
        setAvatarUrl(profile.avatar_url || '');
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      setError('Display name is required');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const profile: UserProfile = {
        user_id: userId,
        display_name: displayName.trim(),
        avatar_url: avatarUrl.trim() || undefined,
      };

      const savedProfile = await upsertUserProfile(profile);
      clearProfileCache();
      onProfileUpdate(savedProfile);
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save profile';
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <User className="w-5 h-5" />
            User Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-3 py-2 rounded bg-slate-700 border border-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-white placeholder-slate-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Avatar URL (optional)
            </label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              className="w-full px-3 py-2 rounded bg-slate-700 border border-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-white placeholder-slate-400"
            />
            {avatarUrl && (
              <div className="mt-2 flex items-center gap-2">
                <img
                  src={avatarUrl}
                  alt="Avatar preview"
                  className="w-10 h-10 rounded-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <span className="text-xs text-slate-400">Preview</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              User ID
            </label>
            <input
              type="text"
              value={userId}
              disabled
              className="w-full px-3 py-2 rounded bg-slate-700/50 border border-slate-600 text-slate-400 font-mono text-sm cursor-not-allowed"
            />
          </div>

          {error && (
            <div className="p-3 rounded bg-red-900/30 border border-red-500/50">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
