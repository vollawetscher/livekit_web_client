import { supabase } from './supabase';

export interface WebRTCCallStartParams {
  userId: string;
  calleeUserId: string;
  sessionId: string;
  invitationId: string;
}

export interface WebRTCCallEndParams {
  historyId: string;
  status: 'completed' | 'cancelled' | 'failed';
  durationSeconds: number;
}

export async function logWebRTCCallStart(params: WebRTCCallStartParams): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('call_history')
      .insert({
        phone_number: params.calleeUserId,
        call_type: 'webrtc',
        direction: 'outgoing',
        status: 'ringing',
        user_id: params.userId,
        callee_user_id: params.calleeUserId,
        session_id: params.sessionId,
        timestamp: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error logging WebRTC call start:', error);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error('Exception logging WebRTC call start:', err);
    return null;
  }
}

export async function logWebRTCCallEnd(params: WebRTCCallEndParams): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('call_history')
      .update({
        status: params.status,
        duration_seconds: params.durationSeconds,
      })
      .eq('id', params.historyId);

    if (error) {
      console.error('Error logging WebRTC call end:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Exception logging WebRTC call end:', err);
    return false;
  }
}

export async function logIncomingWebRTCCall(params: {
  userId: string;
  callerUserId: string;
  sessionId: string;
  invitationId: string;
}): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('call_history')
      .insert({
        phone_number: params.callerUserId,
        call_type: 'webrtc',
        direction: 'incoming',
        status: 'ringing',
        user_id: params.userId,
        callee_user_id: params.userId,
        session_id: params.sessionId,
        timestamp: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error logging incoming WebRTC call:', error);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error('Exception logging incoming WebRTC call:', err);
    return null;
  }
}
