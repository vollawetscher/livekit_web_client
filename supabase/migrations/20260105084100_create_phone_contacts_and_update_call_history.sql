/*
  # Phone Contacts and Enhanced Call History

  1. New Tables
    - `phone_contacts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `contact_name` (text, required)
      - `phone_number` (text, required)
      - `avatar_url` (text, optional)
      - `notes` (text, optional)
      - `is_favorite` (boolean, default false)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Changes to Existing Tables
    - `call_history`
      - Add `call_type` column (text: 'webrtc' or 'pstn')
      - Add `callee_identifier` column (text: user_id or phone_number)
      - Add `user_id` column to track call owner
  
  3. Security
    - Enable RLS on `phone_contacts` table
    - Add policies for users to manage their own phone contacts
    - Update call_history policies for user ownership
*/

-- Create phone_contacts table
CREATE TABLE IF NOT EXISTS phone_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  phone_number text NOT NULL,
  avatar_url text,
  notes text,
  is_favorite boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_phone_contacts_user_id ON phone_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_phone_contacts_phone_number ON phone_contacts(user_id, phone_number);

-- Enable RLS on phone_contacts
ALTER TABLE phone_contacts ENABLE ROW LEVEL SECURITY;

-- Policies for phone_contacts
CREATE POLICY "Users can view own phone contacts"
  ON phone_contacts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own phone contacts"
  ON phone_contacts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own phone contacts"
  ON phone_contacts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own phone contacts"
  ON phone_contacts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add new columns to call_history
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_history' AND column_name = 'call_type'
  ) THEN
    ALTER TABLE call_history ADD COLUMN call_type text DEFAULT 'pstn';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_history' AND column_name = 'callee_identifier'
  ) THEN
    ALTER TABLE call_history ADD COLUMN callee_identifier text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_history' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE call_history ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update existing call_history records to set callee_identifier from phone_number
UPDATE call_history SET callee_identifier = phone_number WHERE callee_identifier IS NULL;

-- Add index for call_history user queries
CREATE INDEX IF NOT EXISTS idx_call_history_user_id ON call_history(user_id);
CREATE INDEX IF NOT EXISTS idx_call_history_call_type ON call_history(call_type);

-- Update call_history RLS policies
DROP POLICY IF EXISTS "Users can view own call history" ON call_history;
DROP POLICY IF EXISTS "Users can insert own call history" ON call_history;
DROP POLICY IF EXISTS "Users can update own call history" ON call_history;

CREATE POLICY "Users can view own call history"
  ON call_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own call history"
  ON call_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own call history"
  ON call_history FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);