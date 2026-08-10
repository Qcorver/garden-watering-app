-- Rate limiting for the garden-assistant edge function.
-- One row per user per day; the edge function (service role) increments
-- message_count and rejects requests over the daily cap.
--
-- References auth.users (not app_users): the assistant can be used before the
-- app_users row exists, but every caller always has an auth identity.
CREATE TABLE IF NOT EXISTS assistant_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- No policies on purpose: only the service role (edge function) reads/writes.
ALTER TABLE assistant_usage ENABLE ROW LEVEL SECURITY;
