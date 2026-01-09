import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AccessToken } from "npm:livekit-server-sdk@2.6.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TokenRequest {
  roomName: string;
  participantIdentity: string;
  participantName?: string;
  organizationId?: string;
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

    if (!apiKey || !apiSecret) {
      throw new Error("LiveKit credentials not configured");
    }

    const { roomName, participantIdentity, participantName, organizationId }: TokenRequest = await req.json();

    if (!roomName || !participantIdentity) {
      return new Response(
        JSON.stringify({ error: "roomName and participantIdentity are required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const metadata: Record<string, string> = {
      created_by: participantIdentity,
    };

    if (organizationId) {
      metadata.organization_id = organizationId;
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      name: participantName || participantIdentity,
      metadata: JSON.stringify(metadata),
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    return new Response(
      JSON.stringify({ token }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error generating LiveKit token:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
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