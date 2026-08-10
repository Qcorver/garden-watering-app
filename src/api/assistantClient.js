import { supabase } from "../supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BASE_URL = `${SUPABASE_URL}/functions/v1/garden-assistant`;

/**
 * Stream a chat completion from the garden-assistant edge function.
 *
 * The edge function requires a *user* JWT (anonymous auth session), not the
 * bare anon key — it rate-limits per auth user.
 *
 * @param {Object} opts
 * @param {'doctor'|'garden'|'general'} opts.category
 * @param {Array<{role: 'user'|'assistant', text: string, image?: string, imageMimeType?: string}>} opts.messages
 * @param {Object} opts.context - garden context (plants, soil, advice, location)
 * @param {'en'|'nl'} opts.lang
 * @param {AbortSignal} [opts.signal]
 * @param {(fullText: string) => void} [opts.onDelta] - called with the full text so far on every chunk
 * @returns {Promise<string>} the complete assistant reply
 * @throws {Error} with .code = 'rate_limit' when the daily cap is reached
 */
export async function streamAssistant({ category, messages, context, lang, signal, onDelta }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    const err = new Error("Not authenticated");
    err.code = "auth";
    throw err;
  }

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({ category, messages, context, lang }),
  });

  if (!res.ok) {
    const err = new Error(`Assistant request failed: ${res.status}`);
    const data = await res.json().catch(() => ({}));
    err.code = res.status === 429 || data.error === "rate_limit" ? "rate_limit" : "generic";
    throw err;
  }

  // Parse the piped Anthropic SSE stream: every "data: {json}" line may hold
  // a content_block_delta with a text_delta.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  const processLine = (line) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      return; // partial/keep-alive line
    }
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      fullText += event.delta.text;
      onDelta?.(fullText);
    } else if (event.type === "error") {
      const err = new Error(event.error?.message ?? "Stream error");
      err.code = "generic";
      throw err;
    }
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      processLine(line);
    }
  }
  processLine(buffer.trim());

  return fullText;
}
