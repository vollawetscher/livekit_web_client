import { createClient } from 'npm:@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2.6.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface InitiateCallRequest {
  caller_user_id: string;
  callee_user_id: string;
  caller_display_name: string;
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

    const { caller_user_id, callee_user_id, caller_display_name }: InitiateCallRequest = await req.json();

    if (!caller_user_id || !callee_user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (caller_user_id === callee_user_id) {
      return new Response(
        JSON.stringify({ error: 'Cannot call yourself' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const room_name = `call-${crypto.randomUUID()}`;

    const { data: calleeProfile } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('user_id', callee_user_id)
      .maybeSingle();

    const callerToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: caller_user_id,
      name: caller_display_name || caller_user_id,
    });
    callerToken.addGrant({
      roomJoin: true,
      room: room_name,
      canPublish: true,
      canSubscribe: true,
    });

    const calleeToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: callee_user_id,
      name: calleeProfile?.display_name || callee_user_id,
    });
    calleeToken.addGrant({
      roomJoin: true,
      room: room_name,
      canPublish: true,
      canSubscribe: true,
    });

    const callerJwt = await callerToken.toJwt();
    const calleeJwt = await calleeToken.toJwt();

    const { data: invitation, error: inviteError } = await supabase
      .from('call_invitations')
      .insert({
        caller_user_id,
        callee_user_id,
        room_name,
        caller_token: callerJwt,
        callee_token: calleeJwt,
        status: 'pending',
      })
      .select()
      .single();

    if (inviteError) {
      console.error('Error creating invitation:', inviteError);
      return new Response(
        JSON.stringify({ error: 'Failed to create invitation' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: presence } = await supabase
      .from('user_presence')
      .select('status, last_seen_at')
      .eq('user_id', callee_user_id)
      .maybeSingle();

    const isOnline = presence && 
      presence.status === 'online' && 
      new Date(presence.last_seen_at).getTime() > Date.now() - 60000;

    if (!isOnline) {
      try {
        const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            user_id: callee_user_id,
            title: 'Incoming Call',
            body: `${caller_display_name} is calling you`,
            data: {
              type: 'call_invitation',
              invitation_id: invitation.id,
              caller_user_id,
              caller_display_name,
            },
          }),
        });

        if (!pushResponse.ok) {
          console.warn('Failed to send push notification:', await pushResponse.text());
        }
      } catch (pushError) {
        console.warn('Error sending push notification:', pushError);
      }
    }

    return new Response(
      JSON.stringify({ invitation, callee_online: isOnline }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in initiate-call:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});