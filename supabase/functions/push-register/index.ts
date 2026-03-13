import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("PROJECT_SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("PROJECT_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const { user_id, push_token, platform, is_enabled } = await req.json();

    if (!push_token || typeof push_token !== "string" || push_token.length < 80) {
      return Response.json({ ok: false, error: "push_token invalid" }, { status: 400 });
    }

    if (!user_id || typeof user_id !== "string") {
      return Response.json({ ok: false, error: "user_id required" }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { error } = await supabase
      .from("push_devices")
      .upsert(
        {
          user_id,
          push_token,
          platform: platform ?? null,
          is_enabled: typeof is_enabled === "boolean" ? is_enabled : true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "push_token" },
      );

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
});