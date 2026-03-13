import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { calculateWateringAdvice } from "../_shared/wateringLogic.ts";

/**
 * push-daily (scheduled sender)
 *
 * Uses the same watering algorithm as the frontend (wateringLogic.js):
 * wet-soil gates, seasonal adjustment, and weekly rain targets.
 *
 * Schema:
 * - push_devices: user_id, push_token, is_enabled, platform
 * - user_preferences: user_id, push_enabled
 * - user_location: user_id, lat, lon
 *
 * Secrets: PROJECT_SUPABASE_URL, PROJECT_SERVICE_ROLE_KEY,
 *          FCM_PROJECT_ID, FCM_SERVICE_ACCOUNT_JSON
 * Optional: CRON_SECRET (header x-cron-secret or cron-secret)
 */

const SUPABASE_URL = Deno.env.get("PROJECT_SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("PROJECT_SERVICE_ROLE_KEY") ?? "";
const FCM_PROJECT_ID = Deno.env.get("FCM_PROJECT_ID") ?? "";
const FCM_SERVICE_ACCOUNT_JSON = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

// ---------- helpers: CORS ----------
function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-secret, cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  } as Record<string, string>;
}

// ---------- helpers: base64url + JWT (RS256) ----------
function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  const b64 = btoa(str);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function utf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function pemToDer(pem: string): Uint8Array {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importPkcs8PrivateKey(pem: string): Promise<CryptoKey> {
  const der = pemToDer(pem);
  return await crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function signJwtRs256(
  payload: Record<string, unknown>,
  privateKeyPem: string,
): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const headerPart = base64UrlEncode(utf8Bytes(JSON.stringify(header)));
  const payloadPart = base64UrlEncode(utf8Bytes(JSON.stringify(payload)));
  const data = utf8Bytes(`${headerPart}.${payloadPart}`);

  const key = await importPkcs8PrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data);
  const sigPart = base64UrlEncode(new Uint8Array(sig));

  return `${headerPart}.${payloadPart}.${sigPart}`;
}

async function getGoogleAccessToken(): Promise<string> {
  if (!FCM_PROJECT_ID) throw new Error("Missing FCM_PROJECT_ID secret");
  if (!FCM_SERVICE_ACCOUNT_JSON) throw new Error("Missing FCM_SERVICE_ACCOUNT_JSON secret");

  const sa = JSON.parse(FCM_SERVICE_ACCOUNT_JSON);
  const clientEmail: string = sa.client_email;
  const privateKey: string = sa.private_key;

  if (!clientEmail || !privateKey) {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON missing client_email/private_key");
  }

  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwtRs256(
    {
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 60 * 60,
    },
    privateKey,
  );

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Failed to get Google access token: ${res.status} ${JSON.stringify(json)}`);
  }

  const token = (json as any).access_token as string | undefined;
  if (!token) throw new Error("Google token response missing access_token");
  return token;
}

// ---------- token hygiene ----------
function isLegacyApnsHexToken(t: string): boolean {
  return /^[A-Fa-f0-9]{64}$/.test(t);
}

function looksLikeFcmToken(t: string): boolean {
  if (t.length < 80) return false;
  if (isLegacyApnsHexToken(t)) return false;
  return true;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function minutesSinceMidnightInTimeZone(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);

    const h = Number(parts.find((p) => p.type === "hour")?.value);
    const m = Number(parts.find((p) => p.type === "minute")?.value);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return minutesSinceMidnight(date);
    return h * 60 + m;
  } catch {
    console.warn(`[push-daily] Invalid timezone "${timeZone}", falling back to server time`);
    return minutesSinceMidnight(date);
  }
}

function withinWindow(nowMin: number, targetMin: number, windowMin: number): boolean {
  const diff = Math.min(Math.abs(nowMin - targetMin), 1440 - Math.abs(nowMin - targetMin));
  return diff <= windowMin;
}

// ---------- weather data ----------
async function fetchRainData(lat: number, lon: number) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=auto&past_days=7&forecast_days=5`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo error: ${r.status} ${await r.text()}`);
  const j = await r.json();

  const timezone: string = j?.timezone ?? "UTC";
  const times: string[] = j?.daily?.time ?? [];
  const sums: number[] = (j?.daily?.precipitation_sum ?? []).map((v: any) => Number(v) || 0);
  const tmaxArr: (number | null)[] = j?.daily?.temperature_2m_max ?? [];
  const tminArr: (number | null)[] = j?.daily?.temperature_2m_min ?? [];

  const todayIso = new Date().toISOString().slice(0, 10);
  let todayIdx = times.findIndex((t) => t === todayIso);
  if (todayIdx === -1) todayIdx = 7;

  const histStart = Math.max(0, todayIdx - 7);
  const past7 = sums.slice(histStart, todayIdx);
  const past5 = past7.slice(-5);
  const past3 = past7.slice(-3);
  const past2 = past7.slice(-2);
  const next5 = sums.slice(todayIdx, todayIdx + 5);
  const next3 = next5.slice(0, 3);

  const tempLast7 = times.slice(histStart, todayIdx).map((d, i) => {
    const absIdx = histStart + i;
    return { date: new Date(`${d}T00:00:00`), tmax: tmaxArr[absIdx], tmin: tminArr[absIdx] };
  }).filter((d): d is { date: Date; tmax: number; tmin: number } =>
    typeof d.tmax === "number" && typeof d.tmin === "number"
  );

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  return {
    timezone,
    rainLast7: sum(past7),
    rainLast5Days: sum(past5),
    rainLast3Days: sum(past3),
    rainLast2Days: sum(past2),
    maxDailyRainLast7: past7.length > 0 ? Math.max(...past7) : 0,
    rainNext3: sum(next3),
    forecastDays: next5.map((mm, i) => ({
      date: times[todayIdx + i] ?? null,
      mm,
    })),
    tempLast7,
  };
}

async function sendFcm(
  accessToken: string,
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
) {
  const url = `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`;

  const payload = {
    message: {
      token: deviceToken,
      notification: { title, body },
      data,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

// ---------- handler ----------
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }

    if (CRON_SECRET !== "") {
      const provided =
        (req.headers.get("x-cron-secret") ?? req.headers.get("cron-secret") ?? "").trim();
      if (!provided || provided !== CRON_SECRET) {
        return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: cors });
      }
    }

    if (!SUPABASE_URL) throw new Error("Missing PROJECT_SUPABASE_URL secret");
    if (!SERVICE_ROLE_KEY) throw new Error("Missing PROJECT_SERVICE_ROLE_KEY secret");

    const body = await req.json().catch(() => ({} as any));
    const platform: string | undefined = typeof body?.platform === "string" ? body.platform : undefined;
    const limit: number = typeof body?.limit === "number" ? body.limit : 500;
    const dryRun: boolean = body?.dry_run === true;
    const windowMinutes: number = typeof body?.window_minutes === "number" ? body.window_minutes : 15;

    const title = typeof body?.title === "string" ? body.title : "Garden Watering";

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // NOTE: PostgREST cannot do multi-hop joins (devices → app_users → user_preferences).
    // Fetch each table separately and join in-memory by user_id.

    // 1) devices
    let dq = supabase
      .from("push_devices")
      .select("id,user_id,platform,push_token,is_enabled")
      .eq("is_enabled", true)
      .not("push_token", "is", null)
      .limit(Math.min(Math.max(limit, 1), 2000));

    if (platform) dq = dq.eq("platform", platform);

    const { data: devices, error: devicesError } = await dq;
    if (devicesError) throw devicesError;

    const userIds = Array.from(
      new Set((devices ?? []).map((d: any) => d.user_id).filter(Boolean)),
    );

    if (userIds.length === 0) {
      return Response.json(
        {
          ok: true,
          dry_run: dryRun,
          window_minutes: windowMinutes,
          scanned: 0,
          in_window: 0,
          attempted: 0,
          sent: 0,
          skipped_legacy_apns: 0,
          errors: [],
        },
        { headers: cors },
      );
    }

    // 2) preferences (only push_enabled)
    const { data: prefsRows, error: prefsError } = await supabase
      .from("user_preferences")
      .select("user_id,push_enabled")
      .in("user_id", userIds)
      .eq("push_enabled", true);

    if (prefsError) throw prefsError;

    // 3) location
    const { data: locRows, error: locError } = await supabase
      .from("user_location")
      .select("user_id,lat,lon")
      .in("user_id", userIds);

    if (locError) throw locError;

    const prefsByUser = new Map((prefsRows ?? []).map((p: any) => [p.user_id, p]));
    const locByUser = new Map((locRows ?? []).map((l: any) => [l.user_id, l]));

    const rows = (devices ?? []).filter((d: any) =>
      prefsByUser.has(d.user_id) && locByUser.has(d.user_id)
    );

    const now = new Date();
    const accessToken = dryRun ? "" : await getGoogleAccessToken();

    let scanned = 0;
    let inWindow = 0;
    let attempted = 0;
    let sent = 0;
    let skippedLegacy = 0;

    const errors: Array<{ token: string; status: number; json: any }> = [];

    const batches = chunk(rows ?? [], 10);

    for (const batch of batches) {
      const results = await Promise.all(
        batch.map(async (row: any) => {
          scanned++;

          const tokenRaw = String(row?.push_token ?? "").trim();
          if (!tokenRaw) return { kind: "skip", reason: "no_token" };

          if (isLegacyApnsHexToken(tokenRaw)) {
            skippedLegacy++;
            return { kind: "skip", reason: "legacy_apns" };
          }
          if (!looksLikeFcmToken(tokenRaw)) return { kind: "skip", reason: "not_fcm" };

          const prefs = prefsByUser.get(row.user_id);
          const loc = locByUser.get(row.user_id);
          if (!prefs) return { kind: "skip", reason: "no_prefs" };
          if (!loc) return { kind: "skip", reason: "no_location" };

          const targetMin = 10 * 60; // 10:00 local time

          const lat = Number(loc?.lat);
          const lon = Number(loc?.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return { kind: "skip", reason: "bad_location" };
          }

          const rain = await fetchRainData(lat, lon);
          const nowLocalMin = minutesSinceMidnightInTimeZone(now, rain.timezone);

          if (!withinWindow(nowLocalMin, targetMin, windowMinutes)) {
            return { kind: "skip", reason: "outside_window" };
          }
          inWindow++;

          const advice = calculateWateringAdvice({
            rainLast7: rain.rainLast7,
            rainLast2Days: rain.rainLast2Days,
            rainLast3Days: rain.rainLast3Days,
            rainLast5Days: rain.rainLast5Days,
            maxDailyRainLast7: rain.maxDailyRainLast7,
            rainNext3: rain.rainNext3,
            dailyForecastNext5: rain.forecastDays.map((d) => ({
              date: d.date ? new Date(d.date + "T00:00:00") : null,
              rainMm: d.mm,
            })),
            tempLast7: rain.tempLast7,
            latitude: lat,
          });

          if (!advice.shouldWater) {
            return {
              kind: "no_send",
              reason: "not_triggered",
              message: advice.message,
              rainLast7: rain.rainLast7,
              rainNext3: rain.rainNext3,
            };
          }

          attempted++;

          const messageBody = advice.message;
          const bestDate = advice.bestWateringDate instanceof Date
            ? advice.bestWateringDate.toISOString().slice(0, 10)
            : (advice.bestWateringDate ?? "");

          if (dryRun) {
            return {
              kind: "dry_run",
              token_preview: tokenRaw.slice(0, 16) + "…",
              bestWateringDate: bestDate,
              message: messageBody,
            };
          }

          const r = await sendFcm(accessToken, tokenRaw, title, messageBody, {
            kind: "daily",
            sent_at: new Date().toISOString(),
            timezone: rain.timezone,
            best_watering_date: bestDate,
            rain_last7_mm: rain.rainLast7.toFixed(1),
            rain_next3_mm: rain.rainNext3.toFixed(1),
          });

          if (r.ok) {
            sent++;
            return { kind: "sent" };
          }

          return {
            kind: "error",
            status: r.status,
            json: r.json,
            token_preview: tokenRaw.slice(0, 24) + "…",
          };
        }),
      );

      for (const r of results) {
        if (r?.kind === "error") {
          errors.push({ token: r.token_preview, status: r.status, json: r.json });
        }
      }
    }

    return Response.json(
      {
        ok: true,
        dry_run: dryRun,
        window_minutes: windowMinutes,
        scanned,
        in_window: inWindow,
        attempted,
        sent,
        skipped_legacy_apns: skippedLegacy,
        errors: errors.slice(0, 10),
      },
      { headers: cors },
    );
  } catch (e) {
    return Response.json(
      { ok: false, error: String((e as any)?.message ?? e) },
      { status: 500, headers: cors },
    );
  }
});