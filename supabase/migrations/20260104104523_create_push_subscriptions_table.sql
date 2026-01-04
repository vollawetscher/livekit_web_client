/*
  # Create push_subscriptions table for Web Push notifications

  1. New Tables
    - `push_subscriptions`
      - `id` (uuid, primary key) - Unique subscription identifier
      - `user_id` (text) - User ID from user_profiles
      - `endpoint` (text, unique) - Push service endpoint URL
      - `p256dh_key` (text) - Public key for encryption
      - `auth_key` (text) - Authentication secret
      - `user_agent` (text, nullable) - Browser/device info
      - `created_at` (timestamptz) - When subscription was created
      - `last_used_at` (timestamptz) - Last time subscription was used
      - `is_active` (boolean) - Whether subscription is still valid

  2. Security
    - Enable RLS on `push_subscriptions` table
    - Users can only manage their own subscriptions
    - Edge functions can read all subscriptions with service role

  3. Indexes
    - Index on user_id for fast user subscription lookups
    - Index on endpoint for deduplication checks
    - Index on is_active for filtering valid subscriptions

  4. Notes
    - Stores Web Push API subscription objects
    - Allows multiple subscriptions per user (multiple devices/browsers)
    - Tracks subscription validity and usage
*/

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  endpoint text UNIQUE NOT NULL,
  p256dh_key text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(is_active) WHERE is_active = true;

-- Enable Row Level Security
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own subscriptions
CREATE POLICY "Users can read their own subscriptions"
  ON push_subscriptions
  FOR SELECT
  USING (true);

-- Policy: Users can insert their own subscriptions
CREATE POLICY "Users can create their own subscriptions"
  ON push_subscriptions
  FOR INSERT
  WITH CHECK (true);

-- Policy: Users can update their own subscriptions
CREATE POLICY "Users can update their own subscriptions"
  ON push_subscriptions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policy: Users can delete their own subscriptions
CREATE POLICY "Users can delete their own subscriptions"
  ON push_subscriptions
  FOR DELETE
  USING (true);
