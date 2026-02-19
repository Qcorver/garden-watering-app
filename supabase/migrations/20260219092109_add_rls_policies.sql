-- Enable RLS on all tables (idempotent — no-op if already enabled)
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_location ENABLE ROW LEVEL SECURITY;

-- app_users: users can read and insert their own row
CREATE POLICY "Users can read own row"
  ON public.app_users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own row"
  ON public.app_users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- user_preferences: users can read, insert, and update their own preferences
CREATE POLICY "Users can read own preferences"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- push_devices: users can read, insert, and update their own devices
CREATE POLICY "Users can read own devices"
  ON public.push_devices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own devices"
  ON public.push_devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own devices"
  ON public.push_devices FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- user_location: users can read, insert, and update their own location
CREATE POLICY "Users can read own location"
  ON public.user_location FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own location"
  ON public.user_location FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own location"
  ON public.user_location FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
