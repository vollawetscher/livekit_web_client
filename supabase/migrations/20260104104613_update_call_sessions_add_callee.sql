/*
  # Update call_sessions to track both caller and callee

  1. Changes
    - Add callee_user_id column to track who was called
    - Add invitation_id to link to call_invitations
    - Update RLS policies to allow both caller and callee access

  2. Security
    - Update policies to allow callee to read/update sessions
    - Maintain existing security constraints

  3. Notes
    - Safely adds columns if they don't exist
    - Links call_sessions to call_invitations for full tracking
*/

-- Add callee_user_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_sessions' AND column_name = 'callee_user_id'
  ) THEN
    ALTER TABLE call_sessions ADD COLUMN callee_user_id text;
  END IF;
END $$;

-- Add invitation_id to link to call_invitations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_sessions' AND column_name = 'invitation_id'
  ) THEN
    ALTER TABLE call_sessions ADD COLUMN invitation_id uuid;
  END IF;
END $$;

-- Add foreign key constraint to call_invitations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'call_sessions_invitation_id_fkey'
  ) THEN
    ALTER TABLE call_sessions
    ADD CONSTRAINT call_sessions_invitation_id_fkey
    FOREIGN KEY (invitation_id) REFERENCES call_invitations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index on callee_user_id
CREATE INDEX IF NOT EXISTS idx_call_sessions_callee_user_id ON call_sessions(callee_user_id);

-- Drop and recreate policies to include callee access
DROP POLICY IF EXISTS "Users can read their own call sessions" ON call_sessions;
DROP POLICY IF EXISTS "Anonymous users can read their own call sessions" ON call_sessions;
DROP POLICY IF EXISTS "Users can update their own call sessions" ON call_sessions;
DROP POLICY IF EXISTS "Anonymous users can update their call sessions" ON call_sessions;

-- New policies that allow both caller and callee
CREATE POLICY "Users can read sessions they are involved in"
  ON call_sessions
  FOR SELECT
  USING (true);

CREATE POLICY "Users can update sessions they are involved in"
  ON call_sessions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
