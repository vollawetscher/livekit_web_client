/*
  # Add Direction Column to Call History

  ## Changes Made
  
  1. **New Column Added to call_history Table**
     - `direction` (text): Indicates if the call was 'incoming' or 'outgoing'
  
  2. **Data Migration**
     - Sets default direction to 'outgoing' for existing records
  
  3. **Performance Index**
     - Index on direction for filtering queries

  ## Security
  - RLS policies remain unchanged - existing policies cover new column
*/

-- Add direction column to call_history
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_history' AND column_name = 'direction'
  ) THEN
    ALTER TABLE call_history ADD COLUMN direction text DEFAULT 'outgoing';
  END IF;
END $$;

-- Update existing records to have 'outgoing' as default direction
UPDATE call_history 
SET direction = 'outgoing' 
WHERE direction IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_call_history_direction ON call_history(direction);

-- Add comment for documentation
COMMENT ON COLUMN call_history.direction IS 'Call direction: incoming or outgoing';