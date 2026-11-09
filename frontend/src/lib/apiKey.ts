import { firebaseToken } from "./firebase";
import { getOwnGeminiKey } from "./geminiKey";

/** The API key this browser uses when the server has SWARMGUARD_API_KEYS set (see backend/app/auth.py). */
const STORE = "swarmguard.apiKey";
export const AUTH_REQUIRED = "swarmguard-auth-required";

export function getApiKey(): string {
  try {
    return localStorage.getItem(STORE) ?? "";
  } catch {
    return ""; // private mode / blocked storage: no key
  }
}

export function setApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(STORE, key);
    else localStorage.removeItem(STORE);
  } catch {
    /* storage unavailable: the key lasts until reload */
  }
}

/** What this browser authenticates with: the Google sign-in token when signed in, else a saved API key. */
export function currentCredential(): string {
  return firebaseToken() || getApiKey();
}

export function authHeaders(): Record<string, string> {
  const key = currentCredential();
  const own = getOwnGeminiKey();
  return { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(own ? { "X-Gemini-Key": own } : {}) };
}
