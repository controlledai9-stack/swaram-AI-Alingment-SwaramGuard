/**
 * A person's own Gemini API key. Kept only in this browser and sent as X-Gemini-Key with their own requests, so
 * AI runs they start use their quota instead of the shared one. The server never stores or logs it.
 */
const STORE = "swarmguard.ownGeminiKey";
export const GEMINI_KEY_CHANGED = "swarmguard-gemini-key-changed";

export function getOwnGeminiKey(): string {
  try {
    return localStorage.getItem(STORE) ?? "";
  } catch {
    return "";
  }
}

export function setOwnGeminiKey(key: string): void {
  try {
    if (key) localStorage.setItem(STORE, key);
    else localStorage.removeItem(STORE);
  } catch {
    /* storage blocked: the key can't be remembered in this browser */
  }
  window.dispatchEvent(new Event(GEMINI_KEY_CHANGED));
}

export function maskKey(key: string): string {
  return key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : "••••";
}
