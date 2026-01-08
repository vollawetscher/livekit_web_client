/*
  # Create Transcription Channels Table

  ## Overview
  Tracks active transcription channels for media workers in LiveKit rooms.
  Each channel represents a language-specific transcription service.

  ## Tables Created
  
  1. **transcription_channels**
     - `id` (uuid, primary key): Unique channel identifier
     - `session_id` (uuid, nullable): Reference to call_sessions table
     - `room_name` (text, required): LiveKit room name
     - `language` (text, required): Language code (e.g., 'en', 'es', 'fr')
     - `status` (text): Channel status ('active', 'inactive', 'error')
     - `worker_identity` (text, required): LiveKit participant identity of the worker
     - `created_at` (timestamptz): Channel creation timestamp
     - `updated_at` (timestamptz): Last status update timestamp

  ## Indexes
  - Fast lookups by room name (for displaying active channels)
  - Fast lookups by session ID (for historical queries)
  - Fast lookups by worker identity (for worker management)

  ## Security
  - RLS enabled by default
  - Authenticated users can view transcription channels for their active calls
  - Only system can insert/update/delete (via Edge Functions)
*/

-- Create transcription_channels table
CREATE TABLE IF NOT EXISTS transcription_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES call_sessions(id) ON DELETE CASCADE,
  room_name TEXT NOT NULL,
  language TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  worker_identity TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_transcription_channels_room ON transcription_channels(room_name);
CREATE INDEX IF NOT EXISTS idx_transcription_channels_session ON transcription_channels(session_id);
CREATE INDEX IF NOT EXISTS idx_transcription_channels_worker ON transcription_channels(worker_identity);
CREATE INDEX IF NOT EXISTS idx_transcription_channels_status ON transcription_channels(room_name, status);

-- Enable RLS
ALTER TABLE transcription_channels ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view transcription channels for rooms they're in
CREATE POLICY "Users can view transcription channels in their active calls"
  ON transcription_channels
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM call_sessions
      WHERE call_sessions.room_name = transcription_channels.room_name
      AND (call_sessions.caller_user_id = auth.uid()::text OR call_sessions.callee_user_id = auth.uid()::text)
      AND call_sessions.ended_at IS NULL
    )
  );

-- Policy: System (service role) can insert transcription channels
CREATE POLICY "System can insert transcription channels"
  ON transcription_channels
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: System can update transcription channels
CREATE POLICY "System can update transcription channels"
  ON transcription_channels
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: System can delete transcription channels
CREATE POLICY "System can delete transcription channels"
  ON transcription_channels
  FOR DELETE
  TO service_role
  USING (true);

-- Add comments for documentation
COMMENT ON TABLE transcription_channels IS 'Tracks active transcription channels for media workers';
COMMENT ON COLUMN transcription_channels.session_id IS 'Reference to the call session';
COMMENT ON COLUMN transcription_channels.room_name IS 'LiveKit room name';
COMMENT ON COLUMN transcription_channels.language IS 'Language code (ISO 639-1)';
COMMENT ON COLUMN transcription_channels.status IS 'Channel status: active, inactive, or error';
COMMENT ON COLUMN transcription_channels.worker_identity IS 'LiveKit participant identity of the transcription worker';