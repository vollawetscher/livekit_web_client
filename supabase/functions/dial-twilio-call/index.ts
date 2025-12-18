import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DialRequest {
  phoneNumber: string;
  contactName: string;
  sessionId: string;
}

interface DialResponse {
  callId: string;
  status: string;
  twilioCallSid: string;
  message: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);

    // Handle TwiML request from Twilio (public endpoint)
    if (url.pathname.includes('/twiml')) {
      const roomName = url.searchParams.get('room');
      const participantName = url.searchParams.get('name');
      const livekitSipUri = Deno.env.get("LIVEKIT_SIP_URI");

      if (!livekitSipUri || !roomName) {
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Configuration error</Say><Hangup/></Response>',
          {
            status: 200,
            headers: {
              "Content-Type": "text/xml",
            },
          }
        );
      }

      // Generate TwiML to connect to LiveKit via SIP
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Sip>${livekitSipUri}?room=${encodeURIComponent(roomName)}&name=${encodeURIComponent(participantName || 'Guest')}</Sip>
  </Dial>
</Response>`;

      return new Response(twiml, {
        status: 200,
        headers: {
          "Content-Type": "text/xml",
        },
      });
    }

    // Handle call initiation request (requires authentication)
    const authHeader = req.headers.get('Authorization');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization header" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify the token is valid (not just the anon key)
    if (token === anonKey) {
      return new Response(
        JSON.stringify({ error: "Please provide a user JWT token, not the anon key" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioFromNumber = Deno.env.get("TWILIO_FROM_NUMBER");

    if (!twilioAccountSid || !twilioAuthToken || !twilioFromNumber) {
      throw new Error("Twilio credentials not configured");
    }

    const { phoneNumber, contactName, sessionId }: DialRequest = await req.json();

    if (!phoneNumber || !contactName || !sessionId) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: phoneNumber, contactName, and sessionId are required"
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Validate E.164 phone number format
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (!e164Regex.test(phoneNumber)) {
      return new Response(
        JSON.stringify({
          error: "Invalid phone number format. Please use E.164 format (e.g., +1234567890)"
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log(`Initiating Twilio call to ${phoneNumber} (${contactName}) in room: ${sessionId}`);

    // Generate unique call ID
    const callId = `call-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Build TwiML URL with room and participant info
    const baseUrl = url.origin + url.pathname;
    const twimlUrl = `${baseUrl}/twiml?room=${encodeURIComponent(sessionId)}&name=${encodeURIComponent(contactName)}&callId=${encodeURIComponent(callId)}`;

    // Create call via Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`;
    const credentials = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

    const formData = new URLSearchParams({
      To: phoneNumber,
      From: twilioFromNumber,
      Url: twimlUrl,
      Method: 'GET',
      StatusCallback: `${baseUrl}/status?callId=${callId}`,
      StatusCallbackMethod: 'POST',
      StatusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'].join(' '),
    });

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      console.error('Twilio API error:', errorText);
      throw new Error(`Twilio API error: ${twilioResponse.statusText}`);
    }

    const twilioData = await twilioResponse.json();

    console.log(`Twilio call created:`, twilioData);

    const response: DialResponse = {
      callId,
      status: "initiated",
      twilioCallSid: twilioData.sid,
      message: `Call initiated to ${phoneNumber}`,
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error initiating call:", error);

    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    const statusCode = errorMessage.includes("not configured") ? 500 : 400;

    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined
      }),
      {
        status: statusCode,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});