import { PushNotifications } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import type { PluginListenerHandle } from "@capacitor/core";

type RegisterPushOptions = {
  /**
   * Supabase anon REST details (optional). If provided together with userId,
   * this module can upsert the device token into the `push_devices` table directly.
   */
  supabaseUrl?: string;
  supabaseAnonKey?: string;

  /**
   * App-level user id (UUID). Typically your `app_users.id` / Supabase auth user id.
   */
  userId?: string | null;

  /**
   * Defaults to true when upserting to Supabase.
   */
  isEnabled?: boolean;
};


async function upsertDeviceToSupabaseRest(args: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  userId: string;
  platform: NativePlatform;
  token: string;
  isEnabled: boolean;
}): Promise<void> {
  const { supabaseUrl, supabaseAnonKey, userId, platform, token, isEnabled } = args;

  // NOTE: This function now always stores an FCM registration token (iOS & Android).
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/push_devices?on_conflict=push_token`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      user_id: userId,
      platform,
      push_token: token,
      is_enabled: isEnabled,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase upsert push_devices failed: ${res.status} ${res.statusText} ${text}`);
  }
}

type NativePlatform = "ios" | "android";

function getNativePlatform(): NativePlatform | null {
  const p = Capacitor.getPlatform();
  if (p === "ios" || p === "android") return p;
  return null;
}

let listenersAttached = false;
let registrationInFlight = false;
let tokenReceived = false;
let lastToken: string | null = null;
let lastPlatform: NativePlatform | null = null;
let tokenTimeoutId: number | null = null;
let listenerHandles: PluginListenerHandle[] = [];

export async function registerForPushNotifications(
  onToken: (token: string, platform: NativePlatform) => Promise<void> | void,
  options: RegisterPushOptions = {}
): Promise<boolean> {
  // Native push only; ignore browser
  if (!Capacitor.isNativePlatform()) return false;

  const platform = getNativePlatform();
  if (!platform) return false;

  // If we already have a token in-memory for this session, don’t re-register.
  if (tokenReceived && lastToken && lastPlatform === platform) {
    console.log("[push] token already available (cached); skipping register()");
    try {
      await onToken(lastToken, platform);
    } catch (e) {
      console.error("[push] onToken handler failed (cached token):", e);
    }
    return true;
  }

  try {
    console.log("[push] platform:", platform);

    const existingPerm = await PushNotifications.checkPermissions();
    console.log("[push] existing permissions:", existingPerm);

    let permStatus = existingPerm;
    if (existingPerm.receive !== "granted") {
      permStatus = await PushNotifications.requestPermissions();
      console.log("[push] requestPermissions result:", permStatus);
    } else {
      console.log("[push] permission already granted");
    }

    if (permStatus.receive !== "granted") {
      registrationInFlight = false;
      console.warn("[push] permission not granted:", permStatus.receive);
      return false;
    }

    // Attach listeners once (don’t wipe them during an in-flight registration)
    if (!listenersAttached) {
      listenersAttached = true;

      listenerHandles.push(
        await PushNotifications.addListener("registration", async (token) => {
          registrationInFlight = false;

          console.log("[push] APNs token received:", token.value);

          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

          // APNs token received (iOS) – now fetch an FCM registration token
          let fcmToken: string | null = null;

          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              console.log(`[push] fetching FCM token (attempt ${attempt}/3)...`);
              const result = await FirebaseMessaging.getToken();
              if (result?.token) {
                fcmToken = result.token;
                console.log("[push] FCM token received:", fcmToken);
                break;
              }
              console.warn("[push] FirebaseMessaging.getToken() returned no token:", result);
            } catch (e) {
              console.error("[push] failed to get FCM token:", e);
            }
            await sleep(1000);
          }

          if (!fcmToken) {
            console.error("[push] giving up: no FCM token available; will not upsert/callback");
            tokenReceived = false;
            lastToken = null;
            lastPlatform = null;
            return;
          }

          tokenReceived = true;

          lastToken = fcmToken;
          lastPlatform = platform;

          if (tokenTimeoutId != null) {
            window.clearTimeout(tokenTimeoutId);
            tokenTimeoutId = null;
          }

          console.log("[push] using push token (FCM):", fcmToken);

          // Optional: persist device token to Supabase (REST) if configured
          const supabaseUrl = options.supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
          const supabaseAnonKey = options.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY;
          const userId = options.userId;

          if (supabaseUrl && supabaseAnonKey && userId) {
            const isEnabled = options.isEnabled ?? true;

            try {
              await upsertDeviceToSupabaseRest({
                supabaseUrl,
                supabaseAnonKey,
                userId,
                platform,
                token: fcmToken,
                isEnabled,
              });
              console.log("[push] device upserted to Supabase");
            } catch (e) {
              console.error("[push] failed to upsert device to Supabase:", e);
            }
          }

          try {
            await onToken(fcmToken, platform);
          } catch (e) {
            console.error("[push] onToken handler failed:", e);
          }
        })
      );

      listenerHandles.push(
        await PushNotifications.addListener("registrationError", (err) => {
          registrationInFlight = false;
          tokenReceived = false;
          lastToken = null;

          if (tokenTimeoutId != null) {
            window.clearTimeout(tokenTimeoutId);
            tokenTimeoutId = null;
          }

          console.error("[push] registrationError:", err);
        })
      );

      listenerHandles.push(
        await PushNotifications.addListener("pushNotificationReceived", (notification) => {
          console.log("[push] pushNotificationReceived:", notification);
        })
      );

      listenerHandles.push(
        await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          console.log("[push] pushNotificationActionPerformed:", action);
        })
      );
    }

    if (registrationInFlight) {
      console.log("[push] register() skipped: registration already in flight");
      return true;
    }

    registrationInFlight = true;
    tokenReceived = false;

    // Register with APNs/FCM
    await PushNotifications.register();
    console.log("[push] register() called");

    if (tokenTimeoutId != null) {
      window.clearTimeout(tokenTimeoutId);
      tokenTimeoutId = null;
    }

    tokenTimeoutId = window.setTimeout(() => {
      tokenTimeoutId = null;
      if (!tokenReceived) {
        console.warn(
          "[push] No registration token received after 10s. If you are on the iOS simulator, APNs tokens won’t be delivered. On a real device, check Signing/Capabilities (Push Notifications) and that you are running a device build."
        );
      }
    }, 10_000);

    return true;
  } catch (err) {
    console.error("[push] Failed to register for push notifications:", err);
    return false;
  }
}

export async function removePushListeners(): Promise<void> {
  try {
    for (const h of listenerHandles) {
      await h.remove();
    }
  } finally {
    listenerHandles = [];
    listenersAttached = false;
    registrationInFlight = false;
    tokenReceived = false;
    lastToken = null;
    lastPlatform = null;
    if (tokenTimeoutId != null) {
      window.clearTimeout(tokenTimeoutId);
      tokenTimeoutId = null;
    }
  }
}