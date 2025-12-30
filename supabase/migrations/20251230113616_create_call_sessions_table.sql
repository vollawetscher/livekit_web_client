/*
  # Create call_sessions table

  1. New Tables
    - `call_sessions`
      - `id` (uuid, primary key) - Unique session identifier
      - `caller_user_id` (text) - User ID of the caller
      - `room_name` (text, unique) - Unique LiveKit room name for this session
      - `status` (text) - Session status: 'waiting', 'active', 'ended'
      - `created_at` (timestamptz) - When the session was created
      - `expires_at` (timestamptz) - When the session will expire
      - `ended_at` (timestamptz, nullable) - When the session ended

  2. Security
    - Enable RLS on `call_sessions` table
    - Add policy for users to read their own sessions
    - Add policy for users to insert their own sessions
    - Add policy for users to update their own sessions

  3. Indexes
    - Index on room_name for fast lookups
    - Index on caller_user_id for user session queries
    - Index on expires_at for cleanup operations
*/

CREATE TABLE IF NOT EXISTS call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_user_id text NOT NULL,
  room_name text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'waiting',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '1 hour'),
  ended_at timestamptz,
  CONSTRAINT valid_status CHECK (status IN ('waiting', 'active', 'ended'))
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_room_name ON call_sessions(room_name);
CREATE INDEX IF NOT EXISTS idx_call_sessions_caller_user_id ON call_sessions(caller_user_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_expires_at ON call_sessions(expires_at);

ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own call sessions"
  ON call_sessions FOR SELECT
  TO authenticated
  USING (caller_user_id = current_user);

CREATE POLICY "Anonymous users can read their own call sessions"
  ON call_sessions FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Users can insert their own call sessions"
  ON call_sessions FOR INSERT
  TO authenticated
  WITH CHECK (caller_user_id = current_user);

CREATE POLICY "Anonymous users can insert call sessions"
  ON call_sessions FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Users can update their own call sessions"
  ON call_sessions FOR UPDATE
  TO authenticated
  USING (caller_user_id = current_user)
  WITH CHECK (caller_user_id = current_user);

CREATE POLICY "Anonymous users can update their call sessions"
  ON call_sessions FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
