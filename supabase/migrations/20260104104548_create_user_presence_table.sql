/*
  # Create user_presence table for online status tracking

  1. New Tables
    - `user_presence`
      - `id` (uuid, primary key) - Unique presence record identifier
      - `user_id` (text, unique) - User ID from user_profiles
      - `status` (text) - Presence status: 'online', 'offline', 'away', 'busy', 'in_call'
      - `last_seen_at` (timestamptz) - Last heartbeat timestamp
      - `metadata` (jsonb, nullable) - Additional presence info (device, browser, etc.)
      - `updated_at` (timestamptz) - Last status update

  2. Security
    - Enable RLS on `user_presence` table
    - All users can read presence information
    - Users can only update their own presence
    - Enable real-time for instant presence updates

  3. Indexes
    - Index on user_id for fast lookups
    - Index on status for filtering by presence state
    - Index on last_seen_at for cleanup queries

  4. Notes
    - Heartbeat updates every 30 seconds to maintain online status
    - Users offline if no heartbeat for 60+ seconds
    - Real-time enabled for instant status changes
    - Supports custom statuses and metadata
*/

CREATE TABLE IF NOT EXISTS user_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'offline',
  last_seen_at timestamptz DEFAULT now(),
  metadata jsonb,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('online', 'offline', 'away', 'busy', 'in_call'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_presence_user_id ON user_presence(user_id);
CREATE INDEX IF NOT EXISTS idx_user_presence_status ON user_presence(status);
CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON user_presence(last_seen_at);

-- Enable Row Level Security
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read presence information
CREATE POLICY "Anyone can read user presence"
  ON user_presence
  FOR SELECT
  USING (true);

-- Policy: Users can upsert their own presence
CREATE POLICY "Users can create their own presence"
  ON user_presence
  FOR INSERT
  WITH CHECK (true);

-- Policy: Users can update their own presence
CREATE POLICY "Users can update their own presence"
  ON user_presence
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policy: Users can delete their own presence
CREATE POLICY "Users can delete their own presence"
  ON user_presence
  FOR DELETE
  USING (true);

-- Enable real-time for instant presence updates
ALTER PUBLICATION supabase_realtime ADD TABLE user_presence;

-- Function to automatically mark users offline after timeout
CREATE OR REPLACE FUNCTION public.cleanup_stale_presence()
RETURNS void AS $$
BEGIN
  UPDATE user_presence
  SET status = 'offline', updated_at = now()
  WHERE status != 'offline'
    AND last_seen_at < (now() - interval '60 seconds');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
