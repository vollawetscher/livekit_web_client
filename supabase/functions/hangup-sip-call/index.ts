import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { RoomServiceClient } from "npm:livekit-server-sdk@2.6.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface HangupRequest {
  sipParticipantId: string;
}

interface HangupResponse {
  success: boolean;
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

    if (!apiKey || !apiSecret) {
      throw new Error("LiveKit API credentials not configured");
    }

    if (!livekitUrl) {
      throw new Error("LiveKit URL not configured");
    }

    const { sipParticipantId }: HangupRequest = await req.json();

    if (!sipParticipantId) {
      return new Response(
        JSON.stringify({
          error: "Missing required field: sipParticipantId"
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

    console.log(`Removing SIP participant: ${sipParticipantId}`);

    const roomService = new RoomServiceClient(
      livekitUrl.replace('wss://', 'https://').replace('ws://', 'http://'),
      apiKey,
      apiSecret
    );

    const rooms = await roomService.listRooms();
    console.log(`Found ${rooms.length} active rooms`);

    let participantFound = false;
    for (const room of rooms) {
      const participants = await roomService.listParticipants(room.name);

      for (const participant of participants) {
        if (participant.identity === sipParticipantId) {
          console.log(`Found SIP participant in room: ${room.name}`);
          await roomService.removeParticipant(room.name, sipParticipantId);
          console.log(`Successfully removed SIP participant: ${sipParticipantId}`);
          participantFound = true;
          break;
        }
      }

      if (participantFound) break;
    }

    if (!participantFound) {
      console.warn(`SIP participant not found: ${sipParticipantId}`);
    }

    const response: HangupResponse = {
      success: true,
      message: participantFound
        ? `SIP participant removed successfully`
        : `SIP participant not found (may have already disconnected)`,
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
    console.error("Error hanging up call:", error);

    const errorMessage = error instanceof Error ? error.message : "Internal server error";

    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined
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
