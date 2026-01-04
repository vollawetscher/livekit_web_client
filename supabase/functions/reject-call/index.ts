import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RejectCallRequest {
  invitation_id: string;
  user_id: string;
  reason?: 'rejected' | 'cancelled' | 'missed';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { invitation_id, user_id, reason = 'rejected' }: RejectCallRequest = await req.json();

    if (!invitation_id || !user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: invitation, error: inviteError } = await supabase
      .from('call_invitations')
      .select('*')
      .eq('id', invitation_id)
      .maybeSingle();

    if (inviteError || !invitation) {
      return new Response(
        JSON.stringify({ error: 'Invitation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (invitation.caller_user_id !== user_id && invitation.callee_user_id !== user_id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['pending', 'accepted'].includes(invitation.status)) {
      return new Response(
        JSON.stringify({ success: true, message: 'Invitation already ended' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let finalStatus = reason;
    if (user_id === invitation.caller_user_id && reason === 'rejected') {
      finalStatus = 'cancelled';
    }

    const { error: updateError } = await supabase
      .from('call_invitations')
      .update({
        status: finalStatus,
        ended_at: new Date().toISOString(),
      })
      .eq('id', invitation_id);

    if (updateError) {
      console.error('Error updating invitation:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update invitation' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await supabase
      .from('call_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('invitation_id', invitation_id)
      .eq('status', 'active');

    return new Response(
      JSON.stringify({ success: true, status: finalStatus }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in reject-call:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});