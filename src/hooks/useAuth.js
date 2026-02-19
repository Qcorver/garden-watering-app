import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

async function ensureAppUserRow(uid) {
  const { error } = await supabase
    .from("app_users")
    .upsert({ id: uid }, { onConflict: "id", ignoreDuplicates: true });

  if (error) {
    console.error("[auth] app_users upsert FAILED", error);
  }
}

export function useAuth() {
  const [userId, setUserId] = useState(null);
  const ensureRef = useRef(null);

  async function ensureAuthUserId() {
    if (ensureRef.current) return ensureRef.current;

    ensureRef.current = (async () => {
      try {
        const res1 = await supabase.auth.getUser();

        if (!res1?.data?.user) {
          const resSign = await supabase.auth.signInAnonymously();
          if (resSign?.error) {
            console.error("[auth] signInAnonymously error", resSign.error);
          }

          const res2 = await supabase.auth.getUser();
          const uid = res2?.data?.user?.id || null;
          if (uid) {
            setUserId(uid);
            await ensureAppUserRow(uid);
          }
          return uid;
        }

        const uid = res1.data.user.id;
        setUserId(uid);
        await ensureAppUserRow(uid);
        return uid;
      } catch (e) {
        console.error("[auth] ensureAuthUserId failed:", String(e));
        return null;
      }
    })();

    return ensureRef.current;
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const uid = await ensureAuthUserId();
      if (cancelled || !uid) return;
    }

    init();
    return () => { cancelled = true; };
  }, []);

  return { userId, ensureAuthUserId };
}
