import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️ Missing Supabase environment variables');
  console.error('Please ensure your .env file contains:');
  console.error('  VITE_SUPABASE_URL=your-supabase-url');
  console.error('  VITE_SUPABASE_ANON_KEY=your-anon-key');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

export interface CallHistoryRecord {
  id?: string;
  phone_number: string;
  contact_name: string;
  call_id?: string;
  status: string;
  timestamp?: string;
  created_at?: string;
  updated_at?: string;
}

export async function insertCallHistory(record: CallHistoryRecord) {
  const { data, error } = await supabase
    .from('call_history')
    .insert(record)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateCallHistory(callId: string, status: string) {
  const { data, error } = await supabase
    .from('call_history')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('call_id', callId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getCallHistory(limit = 50) {
  const { data, error } = await supabase
    .from('call_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export interface UserProfile {
  id?: string;
  user_id: string;
  display_name: string;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertUserProfile(profile: UserProfile): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({
      user_id: profile.user_id,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export interface CallInvitation {
  id: string;
  caller_user_id: string;
  callee_user_id: string;
  room_name: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'missed' | 'ended';
  caller_token?: string;
  callee_token?: string;
  created_at: string;
  accepted_at?: string;
  ended_at?: string;
  expires_at: string;
}

export interface UserPresence {
  id?: string;
  user_id: string;
  status: 'online' | 'offline' | 'away' | 'busy' | 'in_call';
  last_seen_at: string;
  metadata?: Record<string, unknown>;
  updated_at: string;
}

export interface PushSubscription {
  id?: string;
  user_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  user_agent?: string;
  created_at?: string;
  last_used_at?: string;
  is_active?: boolean;
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .order('display_name');

  if (error) throw error;
  return data || [];
}

export async function getUserPresence(userId: string): Promise<UserPresence | null> {
  const { data, error } = await supabase
    .from('user_presence')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertUserPresence(presence: Partial<UserPresence> & { user_id: string }): Promise<UserPresence> {
  const { data, error } = await supabase
    .from('user_presence')
    .upsert({
      user_id: presence.user_id,
      status: presence.status || 'online',
      last_seen_at: new Date().toISOString(),
      metadata: presence.metadata,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function subscribeToPresence(callback: (presence: UserPresence) => void) {
  const channel = supabase
    .channel('user_presence_changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'user_presence',
    }, (payload) => {
      callback(payload.new as UserPresence);
    });

  await channel.subscribe();
  return channel;
}

export async function subscribeToCallInvitations(userId: string, callback: (invitation: CallInvitation) => void) {
  const channel = supabase
    .channel('call_invitations_changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'call_invitations',
      filter: `callee_user_id=eq.${userId}`,
    }, (payload) => {
      callback(payload.new as CallInvitation);
    });

  await channel.subscribe();
  return channel;
}

export async function savePushSubscription(subscription: PushSubscription): Promise<PushSubscription> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: subscription.user_id,
      endpoint: subscription.endpoint,
      p256dh_key: subscription.p256dh_key,
      auth_key: subscription.auth_key,
      user_agent: subscription.user_agent,
      is_active: true,
    }, {
      onConflict: 'endpoint'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);

  if (error) throw error;
}
