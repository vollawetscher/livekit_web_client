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
