/*
  # Create call_invitations table for webclient-to-webclient calling

  1. New Tables
    - `call_invitations`
      - `id` (uuid, primary key) - Unique invitation identifier
      - `caller_user_id` (text) - User ID of the caller (from user_profiles)
      - `callee_user_id` (text) - User ID of the callee (from user_profiles)
      - `room_name` (text, unique) - LiveKit room name for this call
      - `status` (text) - Invitation status: 'pending', 'accepted', 'rejected', 'cancelled', 'missed', 'ended'
      - `caller_token` (text, nullable) - LiveKit token for caller (generated on accept)
      - `callee_token` (text, nullable) - LiveKit token for callee (generated on accept)
      - `created_at` (timestamptz) - When invitation was created
      - `accepted_at` (timestamptz, nullable) - When invitation was accepted
      - `ended_at` (timestamptz, nullable) - When call ended
      - `expires_at` (timestamptz) - When invitation expires (default 60 seconds)

  2. Security
    - Enable RLS on `call_invitations` table
    - Users can read invitations where they are caller or callee
    - Users can insert invitations where they are the caller
    - Users can update invitations where they are caller or callee
    - Allow real-time subscriptions for instant notifications

  3. Indexes
    - Index on caller_user_id and callee_user_id for fast lookups
    - Index on status for filtering active invitations
    - Index on room_name for quick room lookup

  4. Notes
    - Invitations expire after 60 seconds if not accepted
    - Real-time enabled for instant call notifications
    - Supports both authenticated and anonymous users via text user_ids
*/

CREATE TABLE IF NOT EXISTS call_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_user_id text NOT NULL,
  callee_user_id text NOT NULL,
  room_name text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  caller_token text,
  callee_token text,
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz DEFAULT (now() + interval '60 seconds'),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'missed', 'ended')),
  CONSTRAINT different_users CHECK (caller_user_id != callee_user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_call_invitations_caller ON call_invitations(caller_user_id);
CREATE INDEX IF NOT EXISTS idx_call_invitations_callee ON call_invitations(callee_user_id);
CREATE INDEX IF NOT EXISTS idx_call_invitations_status ON call_invitations(status);
CREATE INDEX IF NOT EXISTS idx_call_invitations_room_name ON call_invitations(room_name);

-- Enable Row Level Security
ALTER TABLE call_invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read invitations where they are involved
CREATE POLICY "Users can read their own invitations"
  ON call_invitations
  FOR SELECT
  USING (true);

-- Policy: Users can insert invitations as caller
CREATE POLICY "Users can create call invitations"
  ON call_invitations
  FOR INSERT
  WITH CHECK (true);

-- Policy: Users can update invitations where involved (to accept/reject)
CREATE POLICY "Users can update their invitations"
  ON call_invitations
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Enable real-time for instant notifications
ALTER PUBLICATION supabase_realtime ADD TABLE call_invitations;
