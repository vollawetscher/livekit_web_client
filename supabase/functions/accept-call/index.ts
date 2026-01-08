import { createClient } from 'npm:@supabase/supabase-js@2';

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { invitation_id, callee_user_id }: AcceptCallRequest = await req.json();

    if (!invitation_id || !callee_user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Accept call - Looking for invitation:', invitation_id, 'for callee:', callee_user_id);

    const { data: anyInvitation, error: anyError } = await supabase
      .from('call_invitations')
      .select('*')
      .eq('id', invitation_id)
      .maybeSingle();

    if (anyError) {
      console.error('Database error:', anyError);
      return new Response(
        JSON.stringify({ error: 'Database error', details: anyError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!anyInvitation) {
      console.error('Invitation not found:', invitation_id);
      return new Response(
        JSON.stringify({ error: 'Invitation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found invitation:', {
      id: anyInvitation.id,
      status: anyInvitation.status,
      caller: anyInvitation.caller_user_id,
      callee: anyInvitation.callee_user_id,
      expires_at: anyInvitation.expires_at,
    });

    if (anyInvitation.callee_user_id !== callee_user_id) {
      console.error('Callee mismatch. Expected:', anyInvitation.callee_user_id, 'Got:', callee_user_id);
      return new Response(
        JSON.stringify({ error: 'Invitation not for this user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (anyInvitation.status !== 'pending') {
      console.error('Invitation already processed. Status:', anyInvitation.status);
      return new Response(
        JSON.stringify({ error: `Invitation already ${anyInvitation.status}` }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (new Date(anyInvitation.expires_at) < new Date()) {
      console.error('Invitation expired at:', anyInvitation.expires_at);
      await supabase
        .from('call_invitations')
        .update({ status: 'missed', ended_at: new Date().toISOString() })
        .eq('id', invitation_id);

      return new Response(
        JSON.stringify({ error: 'Invitation expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: updateError } = await supabase
      .from('call_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invitation_id)
      .eq('status', 'pending');

    if (updateError) {
      console.error('Error updating invitation:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update invitation' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: session, error: sessionError } = await supabase
      .from('call_sessions')
      .insert({
        caller_user_id: anyInvitation.caller_user_id,
        callee_user_id: callee_user_id,
        room_name: anyInvitation.room_name,
        status: 'active',
        invitation_id: invitation_id,
      })
      .select()
      .maybeSingle();

    if (sessionError) {
      console.warn('Failed to create call session:', sessionError);
    }

    console.log('Call accepted successfully. Session ID:', session?.id);

    return new Response(
      JSON.stringify({
        success: true,
        room_name: anyInvitation.room_name,
        caller_token: anyInvitation.caller_token,
        callee_token: anyInvitation.callee_token,
        session_id: session?.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in accept-call:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});