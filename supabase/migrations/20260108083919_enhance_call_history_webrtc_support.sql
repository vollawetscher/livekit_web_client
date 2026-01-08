/*
  # Enhance Call History for WebRTC Support

  ## Changes Made
  
  1. **New Columns Added to call_history Table**
     - `user_id` (text): Authenticated user ID for WebRTC calls
     - `callee_user_id` (text): Recipient user ID for WebRTC calls
     - `session_id` (uuid): Reference to call_sessions table
     - `duration_seconds` (integer): Call duration in seconds
  
  2. **Data Migration**
     - Sets default call_type to 'pstn' for existing records
  
  3. **Performance Indexes**
     - Index on user_id for fast user history queries
     - Index on session_id for session lookups
  
  ## Security
  - RLS policies remain unchanged - existing policies cover new columns
  - Foreign key constraint ensures data integrity with call_sessions
*/

-- Add new columns to support WebRTC call history
ALTER TABLE call_history 
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS callee_user_id TEXT,
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES call_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- Update existing records to have 'pstn' as default call type
UPDATE call_history 
SET call_type = 'pstn' 
WHERE call_type IS NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_call_history_user_id ON call_history(user_id);
CREATE INDEX IF NOT EXISTS idx_call_history_session_id ON call_history(session_id);
CREATE INDEX IF NOT EXISTS idx_call_history_callee_user_id ON call_history(callee_user_id);

-- Add comment for documentation
COMMENT ON COLUMN call_history.user_id IS 'Authenticated user ID for WebRTC calls';
COMMENT ON COLUMN call_history.callee_user_id IS 'Recipient user ID for WebRTC calls';
COMMENT ON COLUMN call_history.session_id IS 'Reference to call_sessions table';
COMMENT ON COLUMN call_history.duration_seconds IS 'Call duration in seconds';