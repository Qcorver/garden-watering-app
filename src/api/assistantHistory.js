// Persistence for AI-assistant chat history (localStorage, per device).
//
// Anonymous auth is device-bound anyway, so history lives client-side like
// wateringHistory / selectedLocation. Base64 image data is NOT stored (it would
// blow the ~5MB localStorage quota); instead each message keeps a `hadImage`
// flag so resumed conversations render a small "📷 Photo" marker.

const STORAGE_KEY = "assistantConversations";
const MAX_CONVERSATIONS = 50; // oldest are pruned beyond this

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota or private-mode failure — history is best-effort, so swallow.
  }
}

/** All conversations, newest first. */
export function loadConversations() {
  return readAll().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

/** Conversations for one category (doctor/garden/general), newest first. */
export function conversationsForCategory(category) {
  return loadConversations().filter((c) => c.category === category);
}

/** Derive a short title from the first user message (or empty for a photo). */
export function deriveTitle(messages) {
  const firstUser = messages.find((m) => m.role === "user");
  const text = (firstUser?.text ?? "").trim();
  if (text) return text.length > 60 ? `${text.slice(0, 57)}…` : text;
  return "";
}

/** Strip heavy fields (base64 images) before persisting. */
function slimMessages(messages) {
  return messages.map((m) => ({
    role: m.role,
    text: m.text ?? "",
    hadImage: !!(m.image || m.imagePreview || m.hadImage),
  }));
}

/**
 * Insert or update a conversation and return the saved record.
 * Pass { id, category, messages, createdAt? }; updatedAt/title are managed here.
 */
export function upsertConversation({ id, category, messages, createdAt }) {
  const now = Date.now();
  const record = {
    id,
    category,
    title: deriveTitle(messages),
    createdAt: createdAt ?? now,
    updatedAt: now,
    messages: slimMessages(messages),
  };

  const list = readAll().filter((c) => c.id !== id);
  list.unshift(record);
  list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  writeAll(list.slice(0, MAX_CONVERSATIONS));
  return record;
}

/** Remove a conversation by id. */
export function deleteConversation(id) {
  writeAll(readAll().filter((c) => c.id !== id));
}
