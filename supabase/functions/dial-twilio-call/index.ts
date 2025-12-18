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

interface HealthCheckResponse {
  status: string;
  timestamp: string;
  secrets: {
    TWILIO_ACCOUNT_SID: boolean;
    TWILIO_AUTH_TOKEN: boolean;
    TWILIO_FROM_NUMBER: boolean;
    LIVEKIT_SIP_URI: boolean;
    SUPABASE_ANON_KEY: boolean;
  };
  validation: {
    twilioFromNumberFormat?: string;
  };
}

interface ExecutionLog {
  timestamp: string;
  step: string;
  details?: string;
  success: boolean;
}

// Helper function to log with timestamp
function logStep(logs: ExecutionLog[], step: string, details?: string, success: boolean = true) {
  const log = {
    timestamp: new Date().toISOString(),
    step,
    details,
    success
  };
  logs.push(log);
  console.log(`[${log.timestamp}] ${success ? '✓' : '✗'} ${step}${details ? ': ' + details : ''}`);
}

Deno.serve(async (req: Request) => {
  const executionLogs: ExecutionLog[] = [];
  const startTime = Date.now();

  logStep(executionLogs, 'Request received', `Method: ${req.method}`);

  if (req.method === "OPTIONS") {
    logStep(executionLogs, 'CORS preflight handled');
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    logStep(executionLogs, 'URL parsed', url.pathname);

    // HEALTH CHECK ENDPOINT - Public, no auth required
    if (url.pathname.includes('/health')) {
      logStep(executionLogs, 'Health check endpoint called');

      const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
      const twilioFromNumber = Deno.env.get("TWILIO_FROM_NUMBER");
      const livekitSipUri = Deno.env.get("LIVEKIT_SIP_URI");
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

      const e164Regex = /^\+[1-9]\d{1,14}$/;
      let fromNumberValidation = "Not configured";
      if (twilioFromNumber) {
        fromNumberValidation = e164Regex.test(twilioFromNumber)
          ? `Valid (${twilioFromNumber.substring(0, 5)}...)`
          : `Invalid format - must be E.164 (e.g., +15551234567)`;
      }

      const healthResponse: HealthCheckResponse = {
        status: "ok",
        timestamp: new Date().toISOString(),
        secrets: {
          TWILIO_ACCOUNT_SID: !!twilioAccountSid,
          TWILIO_AUTH_TOKEN: !!twilioAuthToken,
          TWILIO_FROM_NUMBER: !!twilioFromNumber,
          LIVEKIT_SIP_URI: !!livekitSipUri,
          SUPABASE_ANON_KEY: !!supabaseAnonKey,
        },
        validation: {
          twilioFromNumberFormat: fromNumberValidation,
        },
      };

      logStep(executionLogs, 'Health check completed',
        `Secrets configured: ${Object.values(healthResponse.secrets).filter(v => v).length}/5`);

      return new Response(
        JSON.stringify(healthResponse, null, 2),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Handle TwiML request from Twilio (public endpoint)
    if (url.pathname.includes('/twiml')) {
      logStep(executionLogs, 'TwiML endpoint called');

      const roomName = url.searchParams.get('room');
      const participantName = url.searchParams.get('name');
      const livekitSipUri = Deno.env.get("LIVEKIT_SIP_URI");

      logStep(executionLogs, 'TwiML parameters retrieved',
        `Room: ${roomName}, Participant: ${participantName}`);

      if (!livekitSipUri || !roomName) {
        logStep(executionLogs, 'TwiML configuration error',
          `LiveKit SIP URI: ${!!livekitSipUri}, Room: ${!!roomName}`, false);
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

      logStep(executionLogs, 'TwiML generated successfully');
      return new Response(twiml, {
        status: 200,
        headers: {
          "Content-Type": "text/xml",
        },
      });
    }

    // Handle call initiation request (requires authentication)
    logStep(executionLogs, 'Processing call initiation request');

    const authHeader = req.headers.get('Authorization');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    logStep(executionLogs, 'Checking authorization',
      `Auth header present: ${!!authHeader}, Anon key present: ${!!anonKey}`);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logStep(executionLogs, 'Authorization check failed', 'Missing or invalid header', false);
      return new Response(
        JSON.stringify({
          error: "Missing or invalid authorization header",
          executionLogs: url.searchParams.has('debug') ? executionLogs : undefined
        }),
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
      logStep(executionLogs, 'Token validation failed', 'Anon key provided instead of JWT', false);
      return new Response(
        JSON.stringify({
          error: "Please provide a user JWT token, not the anon key",
          executionLogs: url.searchParams.has('debug') ? executionLogs : undefined
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    logStep(executionLogs, 'Authorization validated');

    // Load and validate Twilio credentials
    logStep(executionLogs, 'Loading Twilio credentials');
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioFromNumber = Deno.env.get("TWILIO_FROM_NUMBER");

    const missingSecrets = [];
    if (!twilioAccountSid) missingSecrets.push('TWILIO_ACCOUNT_SID');
    if (!twilioAuthToken) missingSecrets.push('TWILIO_AUTH_TOKEN');
    if (!twilioFromNumber) missingSecrets.push('TWILIO_FROM_NUMBER');

    if (missingSecrets.length > 0) {
      const errorMsg = `Missing Twilio credentials: ${missingSecrets.join(', ')}`;
      logStep(executionLogs, 'Credential check failed', errorMsg, false);
      return new Response(
        JSON.stringify({
          error: errorMsg,
          hint: "Please verify these secrets are set in Supabase Edge Functions settings",
          missingSecrets,
          executionLogs: url.searchParams.has('debug') ? executionLogs : undefined
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    logStep(executionLogs, 'Twilio credentials loaded', 'All 3 secrets present');

    // Validate FROM number format
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (!e164Regex.test(twilioFromNumber)) {
      const errorMsg = `TWILIO_FROM_NUMBER has invalid format: ${twilioFromNumber}`;
      logStep(executionLogs, 'FROM number validation failed', errorMsg, false);
      return new Response(
        JSON.stringify({
          error: errorMsg,
          hint: "Format must be E.164 (e.g., +15551234567)",
          executionLogs: url.searchParams.has('debug') ? executionLogs : undefined
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    logStep(executionLogs, 'FROM number validated', twilioFromNumber.substring(0, 5) + '...');

    // Parse request body
    logStep(executionLogs, 'Parsing request body');
    let dialRequest: DialRequest;
    try {
      dialRequest = await req.json();
      logStep(executionLogs, 'Request body parsed',
        `Phone: ${dialRequest.phoneNumber}, Contact: ${dialRequest.contactName}`);
    } catch (error) {
      const errorMsg = 'Failed to parse request body as JSON';
      logStep(executionLogs, 'JSON parse failed', error instanceof Error ? error.message : '', false);
      return new Response(
        JSON.stringify({
          error: errorMsg,
          details: error instanceof Error ? error.message : 'Invalid JSON',
          executionLogs: url.searchParams.has('debug') ? executionLogs : undefined
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

    const { phoneNumber, contactName, sessionId } = dialRequest;

    // Validate required fields
    const missingFields = [];
    if (!phoneNumber) missingFields.push('phoneNumber');
    if (!contactName) missingFields.push('contactName');
    if (!sessionId) missingFields.push('sessionId');

    if (missingFields.length > 0) {
      logStep(executionLogs, 'Field validation failed',
        `Missing: ${missingFields.join(', ')}`, false);
      return new Response(
        JSON.stringify({
          error: `Missing required fields: ${missingFields.join(', ')}`,
          executionLogs: url.searchParams.has('debug') ? executionLogs : undefined
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

    logStep(executionLogs, 'Required fields validated');

    // Validate TO phone number format
    if (!e164Regex.test(phoneNumber)) {
      logStep(executionLogs, 'TO number validation failed',
        `Invalid format: ${phoneNumber}`, false);
      return new Response(
        JSON.stringify({
          error: `Invalid phone number format: ${phoneNumber}`,
          hint: "Please use E.164 format (e.g., +1234567890)",
          executionLogs: url.searchParams.has('debug') ? executionLogs : undefined
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

    logStep(executionLogs, 'TO number validated', phoneNumber.substring(0, 5) + '...');

    // Generate unique call ID
    const callId = `call-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    logStep(executionLogs, 'Call ID generated', callId);

    // Build TwiML URL with room and participant info
    const baseUrl = url.origin + url.pathname;
    const twimlUrl = `${baseUrl}/twiml?room=${encodeURIComponent(sessionId)}&name=${encodeURIComponent(contactName)}&callId=${encodeURIComponent(callId)}`;
    logStep(executionLogs, 'TwiML URL built', twimlUrl.substring(0, 80) + '...');

    // Create call via Twilio REST API
    logStep(executionLogs, 'Preparing Twilio API request');
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

    logStep(executionLogs, 'Making Twilio API call',
      `To: ${phoneNumber}, From: ${twilioFromNumber}`);

    let twilioResponse: Response;
    try {
      twilioResponse = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      logStep(executionLogs, 'Twilio API responded',
        `Status: ${twilioResponse.status} ${twilioResponse.statusText}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown fetch error';
      logStep(executionLogs, 'Twilio API request failed', errorMsg, false);
      return new Response(
        JSON.stringify({
          error: 'Failed to connect to Twilio API',
          details: errorMsg,
          executionLogs: url.searchParams.has('debug') ? executionLogs : undefined
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      logStep(executionLogs, 'Twilio API error',
        `${twilioResponse.status}: ${errorText.substring(0, 200)}`, false);

      let parsedError;
      try {
        parsedError = JSON.parse(errorText);
      } catch {
        parsedError = { message: errorText };
      }

      return new Response(
        JSON.stringify({
          error: 'Twilio API rejected the request',
          twilioError: parsedError,
          statusCode: twilioResponse.status,
          hint: twilioResponse.status === 401
            ? "Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are correct"
            : twilioResponse.status === 400
            ? "Check phone number format and Twilio account status"
            : "See Twilio error details above",
          executionLogs: url.searchParams.has('debug') ? executionLogs : undefined
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const twilioData = await twilioResponse.json();
    logStep(executionLogs, 'Twilio call created successfully',
      `SID: ${twilioData.sid}`);

    const executionTime = Date.now() - startTime;
    logStep(executionLogs, 'Request completed', `Total time: ${executionTime}ms`);

    const response: DialResponse = {
      callId,
      status: "initiated",
      twilioCallSid: twilioData.sid,
      message: `Call initiated to ${phoneNumber}`,
    };

    // Include execution logs if debug mode is enabled
    const responseBody = url.searchParams.has('debug')
      ? { ...response, executionLogs, executionTimeMs: executionTime }
      : response;

    return new Response(
      JSON.stringify(responseBody),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Internal server error";

    logStep(executionLogs, 'Uncaught error', errorMessage, false);
    console.error("Error initiating call:", error);

    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined,
        executionLogs,
        executionTimeMs: executionTime
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
