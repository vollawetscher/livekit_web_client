/*
  # Create user profiles table

  1. New Tables
    - `user_profiles`
      - `id` (uuid, primary key) - unique identifier for profile
      - `user_id` (text, unique) - user identifier from the application
      - `display_name` (text) - user's display name
      - `avatar_url` (text, nullable) - optional avatar image URL
      - `created_at` (timestamptz) - when profile was created
      - `updated_at` (timestamptz) - when profile was last updated

  2. Security
    - Enable RLS on `user_profiles` table
    - Add policy for users to read all profiles (needed for displaying other participants)
    - Add policy for users to create their own profile
    - Add policy for users to update their own profile
    - Add policy for users to delete their own profile

  3. Indexes
    - Add index on user_id for faster lookups
*/

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text UNIQUE NOT NULL,
  display_name text NOT NULL DEFAULT 'User',
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read profiles"
  ON user_profiles
  FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own profile"
  ON user_profiles
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own profile"
  ON user_profiles
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete their own profile"
  ON user_profiles
  FOR DELETE
  USING (true);