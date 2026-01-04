import { createClient } from 'npm:@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2.6.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface AcceptCallRequest {
  invitation_id: string;
  callee_user_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY')!;
    const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET')!;

    if (!livekitApiKey || !livekitApiSecret) {
      throw new Error('LiveKit credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { invitation_id, callee_user_id }: AcceptCallRequest = await req.json();

    if (!invitation_id || !callee_user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('call_invitations')
      .select('*')
      .eq('id', invitation_id)
      .eq('callee_user_id', callee_user_id)
      .eq('status', 'pending')
      .maybeSingle();

    if (inviteError || !invitation) {
      return new Response(
        JSON.stringify({ error: 'Invitation not found or already processed' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if invitation expired
    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('call_invitations')
        .update({ status: 'missed', ended_at: new Date().toISOString() })
        .eq('id', invitation_id);

      return new Response(
        JSON.stringify({ error: 'Invitation expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get caller and callee profiles for display names
    const { data: callerProfile } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('user_id', invitation.caller_user_id)
      .maybeSingle();

    const { data: calleeProfile } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('user_id', callee_user_id)
      .maybeSingle();

    // Generate LiveKit tokens for both participants
    const callerToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: invitation.caller_user_id,
      name: callerProfile?.display_name || invitation.caller_user_id,
    });
    callerToken.addGrant({
      roomJoin: true,
      room: invitation.room_name,
      canPublish: true,
      canSubscribe: true,
    });

    const calleeToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: callee_user_id,
      name: calleeProfile?.display_name || callee_user_id,
    });
    calleeToken.addGrant({
      roomJoin: true,
      room: invitation.room_name,
      canPublish: true,
      canSubscribe: true,
    });

    const callerJwt = await callerToken.toJwt();
    const calleeJwt = await calleeToken.toJwt();

    // Update invitation with tokens and status
    const { error: updateError } = await supabase
      .from('call_invitations')
      .update({
        status: 'accepted',
        caller_token: callerJwt,
        callee_token: calleeJwt,
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invitation_id);

    if (updateError) {
      console.error('Error updating invitation:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update invitation' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create call session
    const { data: session, error: sessionError } = await supabase
      .from('call_sessions')
      .insert({
        caller_user_id: invitation.caller_user_id,
        callee_user_id: callee_user_id,
        room_name: invitation.room_name,
        status: 'active',
        invitation_id: invitation_id,
      })
      .select()
      .maybeSingle();

    if (sessionError) {
      console.warn('Failed to create call session:', sessionError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        room_name: invitation.room_name,
        caller_token: callerJwt,
        callee_token: calleeJwt,
        session_id: session?.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in accept-call:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
