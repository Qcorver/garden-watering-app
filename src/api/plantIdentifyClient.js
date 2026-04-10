const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BASE_URL = `${SUPABASE_URL}/functions/v1/plant-identify`;

const HEADERS = {
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};

/**
 * Compress an image File to a JPEG data URL, scaled to max 1024px on the
 * longest side. Returns a base64 string (without the data URI prefix).
 */
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const MAX = 1024;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      // toDataURL returns "data:image/jpeg;base64,<data>"
      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
      // Strip the prefix — the edge function handles both forms but strip anyway
      resolve(dataUrl.split(",")[1]);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/**
 * Identify a plant from a compressed base64 JPEG string.
 * Returns an array of up to 3 matches: { score, scientificName, commonName, dbId }
 *
 * @param {string} base64 - JPEG image as base64 (no data URI prefix)
 * @param {AbortSignal} signal
 * @param {'en'|'nl'} lang
 */
export async function identifyPlant(base64, signal, lang = "en") {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: HEADERS,
    signal,
    body: JSON.stringify({ image: base64, mimeType: "image/jpeg", lang }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Plant identification failed: ${res.status}`);
  }

  const data = await res.json();
  return data.matches ?? [];
}
