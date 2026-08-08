-- Ensure push_enabled has a safe default so upserts with only { user_id, lang }
-- don't fail with a NOT NULL violation.
ALTER TABLE public.user_preferences
  ALTER COLUMN push_enabled SET DEFAULT false;

-- Backfill any existing rows that have lang = NULL (they got lang from the DB
-- default 'en', but if it was missing, set it explicitly).
UPDATE public.user_preferences
SET lang = 'en'
WHERE lang IS NULL;
