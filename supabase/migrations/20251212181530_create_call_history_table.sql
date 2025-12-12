/*
  # Create call history table

  1. New Tables
    - `call_history`
      - `id` (uuid, primary key) - Unique identifier for each call record
      - `phone_number` (text, not null) - The dialed phone number in E.164 format
      - `contact_name` (text) - Optional contact name
      - `call_id` (text) - Server-generated call identifier
      - `status` (text, not null) - Current call status (initiated, ringing, answered, completed, failed, busy, no-answer)
      - `timestamp` (timestamptz) - When the status event occurred
      - `created_at` (timestamptz, default now()) - When the record was created
      - `updated_at` (timestamptz, default now()) - Last update timestamp

  2. Security
    - Enable RLS on `call_history` table
    - Add policy for public read access (demo app - adjust for production)
    - Add policy for public write access (demo app - adjust for production)

  3. Indexes
    - Index on phone_number for faster lookups
    - Index on created_at for chronological sorting
*/

CREATE TABLE IF NOT EXISTS call_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  contact_name text DEFAULT 'Unknown',
  call_id text,
  status text NOT NULL DEFAULT 'initiated',
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_call_history_phone_number ON call_history(phone_number);
CREATE INDEX IF NOT EXISTS idx_call_history_created_at ON call_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_history_call_id ON call_history(call_id);

-- Enable Row Level Security
ALTER TABLE call_history ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read call history (demo app - adjust for production with user authentication)
CREATE POLICY "Anyone can view call history"
  ON call_history
  FOR SELECT
  USING (true);

-- Allow anyone to insert call history (demo app - adjust for production)
CREATE POLICY "Anyone can insert call history"
  ON call_history
  FOR INSERT
  WITH CHECK (true);

-- Allow anyone to update call history (for status updates)
CREATE POLICY "Anyone can update call history"
  ON call_history
  FOR UPDATE
  USING (true)
  WITH CHECK (true);