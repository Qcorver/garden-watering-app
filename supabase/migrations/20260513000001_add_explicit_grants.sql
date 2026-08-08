-- Explicit table-level grants required from Oct 30, 2026 (Supabase Data API change).
-- PostgREST needs these even when RLS policies are in place.

-- app_users: anonymous auth creates an authenticated session immediately, so only
-- authenticated + service_role need access.
GRANT SELECT, INSERT
  ON public.app_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.app_users TO service_role;

-- user_preferences: app reads/writes; push-daily (service_role) reads notify settings.
GRANT SELECT, INSERT, UPDATE
  ON public.user_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.user_preferences TO service_role;

-- push_devices: app registers/updates FCM tokens; push-daily reads them.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.push_devices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.push_devices TO service_role;

-- user_location: app upserts lat/lon; push-daily reads for weather lookup.
GRANT SELECT, INSERT, UPDATE
  ON public.user_location TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.user_location TO service_role;

-- watering_sessions: app toggles calendar days; push-daily reads history.
GRANT SELECT, INSERT, DELETE
  ON public.watering_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.watering_sessions TO service_role;

-- garden_plants: app manages plant list; push-daily reads for pruning notifications.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.garden_plants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.garden_plants TO service_role;

-- plant_species: public catalogue; anon role covers unauthenticated search requests;
-- plant-enrich edge function (service_role) inserts/updates rows.
GRANT SELECT
  ON public.plant_species TO anon;
GRANT SELECT
  ON public.plant_species TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.plant_species TO service_role;
