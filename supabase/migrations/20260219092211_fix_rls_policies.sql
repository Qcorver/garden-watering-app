-- Drop any partially-created policies and recreate them all cleanly

-- app_users
DROP POLICY IF EXISTS "Users can read own row" ON public.app_users;
DROP POLICY IF EXISTS "Users can insert own row" ON public.app_users;

CREATE POLICY "Users can read own row"
  ON public.app_users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own row"
  ON public.app_users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- user_preferences
DROP POLICY IF EXISTS "Users can read own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_preferences;

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

-- push_devices
DROP POLICY IF EXISTS "Users can read own devices" ON public.push_devices;
DROP POLICY IF EXISTS "Users can insert own devices" ON public.push_devices;
DROP POLICY IF EXISTS "Users can update own devices" ON public.push_devices;

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

-- user_location
DROP POLICY IF EXISTS "Users can read own location" ON public.user_location;
DROP POLICY IF EXISTS "Users can insert own location" ON public.user_location;
DROP POLICY IF EXISTS "Users can update own location" ON public.user_location;

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
