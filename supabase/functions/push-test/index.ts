import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * push-test (production-ready sender)
 *
 * What it does
 * - Queries enabled devices from `public.devices` (push_token = FCM token)
 * - Sends a notification via FCM HTTP v1
 *
 * Security (recommended)
 * - If CRON_SECRET is set, requests MUST include header: x-cron-secret: <CRON_SECRET>
 *   This prevents anyone with an anon key from spamming your users.
 *
 * Required Edge Function secrets:
 * - PROJECT_SUPABASE_URL
 * - PROJECT_SERVICE_ROLE_KEY
 * - FCM_PROJECT_ID
 * - FCM_SERVICE_ACCOUNT_JSON (raw service account JSON string)
 *
 * Optional secrets:
 * - CRON_SECRET
 */

const SUPABASE_URL = Deno.env.get("PROJECT_SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("PROJECT_SERVICE_ROLE_KEY") ?? "";
const FCM_PROJECT_ID = Deno.env.get("FCM_PROJECT_ID") ?? "";
const FCM_SERVICE_ACCOUNT_JSON = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

// ---------- helpers: CORS ----------
function corsHeaders(origin: string | null) {
  // In production, you can pin Access-Control-Allow-Origin to your domain.
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
  // 64 hex chars = typical APNs token (uppercase/lowercase)
  return /^[A-Fa-f0-9]{64}$/.test(t);
}

function looksLikeFcmToken(t: string): boolean {
  // heuristic: avoid APNs-hex and very short tokens
  if (t.length < 80) return false;
  if (isLegacyApnsHexToken(t)) return false;
  return true;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function sendFcm(
  accessToken: string,
  deviceToken: string,
  title: string,
  body: string,
) {
  const url = `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`;

  const payload = {
    message: {
      token: deviceToken,
      notification: { title, body },
      data: {
        kind: "test",
        sent_at: new Date().toISOString(),
      },
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

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }

    // If CRON_SECRET is set, require it (accept either header name).
    if (CRON_SECRET) {
      const provided =
        (req.headers.get("x-cron-secret") ?? req.headers.get("cron-secret") ?? "").trim();
      if (!provided || provided !== CRON_SECRET) {
        return Response.json(
          { ok: false, error: "Unauthorized" },
          { status: 401, headers: cors },
        );
      }
    }

    if (!SUPABASE_URL) throw new Error("Missing PROJECT_SUPABASE_URL secret");
    if (!SERVICE_ROLE_KEY) throw new Error("Missing PROJECT_SERVICE_ROLE_KEY secret");

    // Body is optional.
    const body = await req.json().catch(() => ({} as any));
    const platform: string | undefined =
      typeof body?.platform === "string" ? body.platform : undefined;
    const limit: number = typeof body?.limit === "number" ? body.limit : 50;
    const dryRun: boolean = body?.dry_run === true;

    const title = typeof body?.title === "string" ? body.title : "Garden Watering";
    const messageBody =
      typeof body?.body === "string"
        ? body.body
        : "Test notification (Supabase Edge Function → FCM).";

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Query enabled devices
    let q = supabase
      .from("push_devices")
      .select("id,user_id,platform,push_token,is_enabled")
      .eq("is_enabled", true)
      .not("push_token", "is", null)
      .limit(Math.min(Math.max(limit, 1), 200));

    if (platform) q = q.eq("platform", platform);

    const { data: devices, error } = await q;
    if (error) throw error;

    const rawTokens = (devices ?? [])
      .map((d: any) => String(d.push_token ?? "").trim())
      .filter((t) => t.length > 0);

    const skippedLegacy = rawTokens.filter(isLegacyApnsHexToken).length;

    // Dedupe + filter
    const tokens = Array.from(new Set(rawTokens)).filter(looksLikeFcmToken);

    if (tokens.length === 0) {
      return Response.json(
        {
          ok: true,
          attempted: 0,
          sent: 0,
          skipped_legacy_apns: skippedLegacy,
          note: "No enabled devices with valid-looking FCM push_token found.",
        },
        { headers: cors },
      );
    }

    if (dryRun) {
      return Response.json(
        {
          ok: true,
          attempted: tokens.length,
          sent: 0,
          dry_run: true,
          skipped_legacy_apns: skippedLegacy,
          sample_tokens: tokens.slice(0, 3).map((t) => t.slice(0, 16) + "…"),
        },
        { headers: cors },
      );
    }

    const accessToken = await getGoogleAccessToken();

    let sent = 0;
    const errors: Array<{ token: string; status: number; json: any }> = [];

    // Concurrency (batched sends)
    for (const batch of chunk(tokens, 20)) {
      const results = await Promise.all(
        batch.map(async (t) => ({ token: t, r: await sendFcm(accessToken, t, title, messageBody) })),
      );

      for (const { token, r } of results) {
        if (r.ok) {
          sent++;
        } else {
          errors.push({ token: token.slice(0, 24) + "…", status: r.status, json: r.json });
        }
      }
    }

    return Response.json(
      {
        ok: true,
        attempted: tokens.length,
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