-- Add is_premium flag to user_preferences.
-- Defaults to false for all existing and new users.
-- Set to true manually (or via future payment flow) to unlock premium features.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false;
