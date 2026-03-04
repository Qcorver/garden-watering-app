# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # Production build (output: dist/)
npm run lint      # ESLint
npm run preview   # Preview production build locally
npm test          # Run Vitest once
npm run test:watch # Vitest watch mode
```

**Capacitor (mobile):**
```bash
npm run build && npx cap sync       # Build web + sync to native projects
npx cap open ios                     # Open Xcode
npx cap open android                 # Open Android Studio
```

**Supabase Edge Functions:**
```bash
supabase functions deploy <name> --project-ref hrnbrljlvmqmbdnagpsp
supabase functions serve             # Local development
supabase secrets set KEY=value --project-ref hrnbrljlvmqmbdnagpsp
```

## Architecture

React 19 + Vite single-page app wrapped with Capacitor for iOS/Android. Backend is Supabase (Postgres + Edge Functions + anonymous auth). No router library — uses simple tab state in App.jsx ("best" / "calendar").

### Data flow

- **Weather forecast**: Frontend → `openWeatherClient.js` → `weather-proxy` Edge Function → OpenWeather API (key stays server-side)
- **Historical rain**: Frontend → `openMeteoClient.js` → Open-Meteo API directly (free, no key)
- **Push notifications**: `push-daily` Edge Function (cron) → fetches rain data → sends FCM to registered devices
- **Watering logic**: Shared algorithm in `supabase/functions/_shared/wateringLogic.ts`, imported by both frontend (via `@shared` alias) and `push-daily` Edge Function

### State management

No state library. React hooks + localStorage persistence:
- `wateringHistory` (localStorage) — object keyed by "yyyy-MM-dd"
- `selectedLocation` (localStorage) — city string like "Amsterdam,NL"
- Three custom hooks in `src/hooks/`: `useAuth`, `useWeatherAdvice`, `usePushNotifications`

### Database (Supabase Postgres, RLS enabled)

Four tables, all gated by `auth.uid()`:
- `app_users` (id = auth.uid)
- `user_preferences` (user_id, push_enabled, notify_hour, notify_minute)
- `push_devices` (user_id, push_token, platform, is_enabled, timezone)
- `user_location` (user_id, lat, lon)

### Key paths

| Path | Purpose |
|------|---------|
| `src/App.jsx` | Root component, tab routing, location sync |
| `src/hooks/` | useAuth, useWeatherAdvice, usePushNotifications |
| `src/api/` | openWeatherClient (proxied), openMeteoClient (direct) |
| `src/components/` | BestDayToWaterScreen, CalendarScreen, LocationPicker |
| `supabase/functions/_shared/wateringLogic.ts` | Canonical watering algorithm |
| `supabase/functions/weather-proxy/` | OpenWeather API proxy Edge Function |
| `supabase/functions/push-daily/` | Scheduled push notification sender |

## Conventions

- Frontend is JSX (not TSX); Edge Functions are TypeScript (Deno runtime)
- Path alias `@shared` → `supabase/functions/_shared/` (configured in vite.config.js)
- Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`
- Edge Function secrets managed via `supabase secrets set` (OPENWEATHER_API_KEY, FCM_*, CRON_SECRET)
- Capacitor app ID: `com.qcorver.whentowater`
- CSS uses `env(safe-area-inset-*)` for iOS notch/home bar support
- Date formatting uses `date-fns`
- The Supabase anon key in `.env.local` must be the JWT format (`eyJ...`), not the `sb_publishable_` format — Edge Functions require JWT for `Authorization: Bearer` headers
- Tests live in `src/__tests__/` (Vitest with globals enabled)
- Edge Function secrets can be listed with `supabase secrets list` (CLI must be authenticated)
