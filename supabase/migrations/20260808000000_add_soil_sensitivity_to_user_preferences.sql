-- Sync soil type and sensitivity slider to the backend so push-daily can use
-- the same watering parameters as the app (they only lived in localStorage).
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS soil_type TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS sensitivity SMALLINT NOT NULL DEFAULT 0;
