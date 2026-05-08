import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "../supabaseClient";
import { registerForPushNotifications, silentRefreshToken } from "../push/registerPush";

export function usePushNotifications(userId, ensureAuthUserId) {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [deviceToken, setDeviceToken] = useState(null);

  const toggleInFlightRef = useRef(false);
  const lastToggleRequestedRef = useRef(null);

  // Load push preferences + existing device token once userId is available
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function loadPushPrefs() {
      try {
        const { data: prefs, error } = await supabase
          .from("user_preferences")
          .select("push_enabled")
          .eq("user_id", userId)
          .maybeSingle();

        const prefEnabled = Boolean(prefs?.push_enabled);
        if (!cancelled) setPushEnabled(prefEnabled);

        if (error) {
          console.warn("Could not load user_preferences.push_enabled", error);
        }

        if (prefEnabled && Capacitor.isNativePlatform()) {
          const platform = Capacitor.getPlatform();

          const { data: dev, error: devErr } = await supabase
            .from("push_devices")
            .select("push_token,is_enabled,updated_at")
            .eq("user_id", userId)
            .eq("platform", platform)
            .eq("is_enabled", true)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (devErr) {
            console.warn("Could not load existing device token", devErr);
          } else if (dev?.push_token && !cancelled) {
            setDeviceToken(dev.push_token);
          }

          // Silently refresh the FCM token in the background so stale tokens
          // get updated without showing a loading state.
          const timezone =
            Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || "Europe/Amsterdam";
          silentRefreshToken(async (token, plt) => {
            if (cancelled) return;
            setDeviceToken(token);
            await supabase.from("push_devices").upsert(
              {
                user_id: userId,
                platform: plt,
                push_token: token,
                timezone,
                is_enabled: true,
                last_seen_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "push_token" }
            );
          });
        }
      } catch (err) {
        console.error("Failed to load push preferences", err);
      }
    }

    loadPushPrefs();
    return () => { cancelled = true; };
  }, [userId]);


  async function handleTogglePush(nextEnabled) {
    if (toggleInFlightRef.current) return;

    if (!pushLoading && nextEnabled === pushEnabled) {
      if (!nextEnabled || deviceToken) return;
    }

    toggleInFlightRef.current = true;
    lastToggleRequestedRef.current = nextEnabled;

    const uid = await ensureAuthUserId();
    if (!uid) {
      toggleInFlightRef.current = false;
      return;
    }

    let keepInFlightUntilToken = false;

    setPushLoading(true);
    try {
      const timezone =
        Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || "Europe/Amsterdam";

      if (nextEnabled) {
        setPushEnabled(true);

        if (deviceToken) {
          const nowIso = new Date().toISOString();

          const { error: devUpdErr } = await supabase
            .from("push_devices")
            .update({
              is_enabled: true,
              last_seen_at: nowIso,
              updated_at: nowIso,
            })
            .eq("push_token", deviceToken)
            .eq("user_id", uid);

          if (devUpdErr) console.error("[push] devices update FAILED", devUpdErr);

          const { error: prefErr } = await supabase
            .from("user_preferences")
            .upsert({ user_id: uid, push_enabled: true }, { onConflict: "user_id" });

          if (prefErr) console.error("[push] user_preferences upsert (ON) FAILED", prefErr);

          setPushLoading(false);
          toggleInFlightRef.current = false;
          return;
        }

        keepInFlightUntilToken = true;
        const started = await registerForPushNotifications(async (token, platform) => {
          setDeviceToken(token);

          const { error: devErr } = await supabase
            .from("push_devices")
            .upsert(
              {
                user_id: uid,
                platform,
                push_token: token,
                timezone,
                is_enabled: true,
                last_seen_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "push_token" }
            );

          if (devErr) console.error("[push] devices upsert FAILED", devErr);

          const { error: prefErr } = await supabase
            .from("user_preferences")
            .upsert({ user_id: uid, push_enabled: true }, { onConflict: "user_id" });

          if (prefErr) console.error("[push] user_preferences upsert FAILED", prefErr);

          setPushLoading(false);
          toggleInFlightRef.current = false;
        });

        if (!started) {
          setPushEnabled(false);
          keepInFlightUntilToken = false;
          setPushLoading(false);
          toggleInFlightRef.current = false;
          return;
        }

        // Safety net: if APNs token never arrives (simulator, network issue),
        // clear the loading state after 12s so the UI doesn't stay stuck.
        setTimeout(() => {
          if (toggleInFlightRef.current) {
            console.warn("[push] token timeout — clearing loading state");
            setPushEnabled(false);
            setPushLoading(false);
            toggleInFlightRef.current = false;
          }
        }, 12_000);
      } else {
        if (deviceToken) {
          const { error: devOffErr } = await supabase
            .from("push_devices")
            .update({ is_enabled: false })
            .eq("push_token", deviceToken)
            .eq("user_id", uid);

          if (devOffErr) console.error("[push] devices disable FAILED", devOffErr);
        } else {
          const { error: devOffAllErr } = await supabase
            .from("push_devices")
            .update({ is_enabled: false })
            .eq("user_id", uid);

          if (devOffAllErr) console.error("[push] devices disable-all FAILED", devOffAllErr);
        }

        const { error: prefOffErr } = await supabase
          .from("user_preferences")
          .upsert({ user_id: uid, push_enabled: false }, { onConflict: "user_id" });

        if (prefOffErr) console.error("[push] user_preferences upsert (OFF) FAILED", prefOffErr);

        setPushEnabled(false);
        setPushLoading(false);
        toggleInFlightRef.current = false;
      }
    } catch (e) {
      console.error("Failed to toggle push notifications", e);

      if (lastToggleRequestedRef.current === true) {
        setPushEnabled(false);
      }

      keepInFlightUntilToken = false;
      setPushLoading(false);
      toggleInFlightRef.current = false;
    } finally {
      if (!keepInFlightUntilToken) {
        setPushLoading(false);
        toggleInFlightRef.current = false;
      }
    }
  }

  return { pushEnabled, pushLoading, handleTogglePush };
}
