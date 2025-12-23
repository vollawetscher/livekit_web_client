import { supabase } from './supabase';

export interface UserProfile {
  user_id: string;
  display_name: string;
  avatar_url?: string;
}

const profileCache = new Map<string, UserProfile>();

export async function fetchUserProfiles(userIds: string[]): Promise<Map<string, UserProfile>> {
  const uncachedIds = userIds.filter(id => !profileCache.has(id));

  if (uncachedIds.length === 0) {
    return new Map(userIds.map(id => [id, profileCache.get(id)!]).filter(([_, profile]) => profile));
  }

  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', uncachedIds);

    if (error) {
      console.error('Error fetching user profiles:', error);
      return new Map();
    }

    if (data) {
      data.forEach(profile => {
        profileCache.set(profile.user_id, profile);
      });
    }

    return new Map(userIds.map(id => [id, profileCache.get(id)!]).filter(([_, profile]) => profile));
  } catch (error) {
    console.error('Error fetching user profiles:', error);
    return new Map();
  }
}

export function getDisplayName(identity: string, profiles: Map<string, UserProfile>): string {
  const profile = profiles.get(identity);
  if (profile && profile.display_name && profile.display_name.trim() !== '') {
    return profile.display_name;
  }
  return identity;
}

export function clearProfileCache() {
  profileCache.clear();
}
