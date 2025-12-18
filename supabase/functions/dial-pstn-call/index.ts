import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { SipClient } from "npm:livekit-server-sdk@2.6.1";

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
    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL") || Deno.env.get("VITE_LIVEKIT_URL");
    const sipTrunkId = "ST_3VEUPJ6GsDWP";

    if (!apiKey || !apiSecret) {
      throw new Error("LiveKit API credentials not configured");
    }

    if (!livekitUrl) {
      throw new Error("LiveKit URL not configured");
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

    console.log(`Initiating call to ${phoneNumber} (${contactName}) in room: ${sessionId}`);

    // Initialize LiveKit SIP Client
    const sipClient = new SipClient(
      livekitUrl.replace('wss://', 'https://').replace('ws://', 'http://'),
      apiKey,
      apiSecret
    );

    // Generate unique call ID
    const callId = `call-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create SIP participant to dial out
    console.log(`Attempting to create SIP participant with trunk: ${sipTrunkId}, phone: ${phoneNumber}, room: ${sessionId}`);

    let sipParticipant;
    try {
      sipParticipant = await sipClient.createSipParticipant(
        sipTrunkId,
        phoneNumber,
        sessionId,
        {
          participantIdentity: `sip-${callId}`,
          participantName: contactName,
          participantMetadata: JSON.stringify({
            callId,
            phoneNumber,
            contactName,
            direction: 'outbound',
            initiatedAt: new Date().toISOString(),
          }),
          playDialtone: true,
        }
      );
    } catch (error) {
      console.error(`LiveKit SIP participant creation failed:`, error);
      throw new Error(`Failed to create SIP participant: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    console.log(`SIP participant created successfully:`, JSON.stringify(sipParticipant, null, 2));

    const response: DialResponse = {
      callId,
      status: "initiated",
      twilioCallSid: sipParticipant.sipCallId || "pending",
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