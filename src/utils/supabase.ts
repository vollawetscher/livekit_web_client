import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
