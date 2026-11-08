/**
 * Google sign-in through Firebase Authentication.
 *
 * On when frontend/.env.local has the web app's config (Firebase console -> Project settings -> Your apps -> Web):
 *   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID
 * The backend checks the ID token (SWARMGUARD_FIREBASE_AUTH_PROJECT must be the same project id).
 * Without the config the app runs in local mode (no sign-in), as before.
 */
import { useEffect, useState } from "react";
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider, getAuth, onIdTokenChanged, signInWithPopup, signOut as fbSignOut, type Auth, type User,
} from "firebase/auth";

const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const firebaseEnabled = Boolean(config.apiKey && config.authDomain && config.projectId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let token = "";
let current: User | null | undefined = firebaseEnabled ? undefined : null; // undefined = still checking
const listeners = new Set<(u: User | null | undefined) => void>();

function init(): Auth | null {
  if (!firebaseEnabled) return null;
  if (!auth) {
    app = initializeApp(config, "swarmguard"); // a named app: never clashes with another Firebase app on the page
    auth = getAuth(app);
    // Fires on sign-in, sign-out and every hourly token refresh, so the cached token is always current.
    onIdTokenChanged(auth, async (u) => {
      token = u ? await u.getIdToken() : "";
      current = u;
      listeners.forEach((l) => l(u));
    });
  }
  return auth;
}

/** The signed-in user's Firebase ID token, or "" (sent to the API as a bearer token). */
export function firebaseToken(): string {
  return token;
}

export function useFirebaseUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(current);
  useEffect(() => {
    init();
    listeners.add(setUser);
    setUser(current);
    return () => {
      listeners.delete(setUser);
    };
  }, []);
  return user;
}

export async function signInWithGoogle(): Promise<void> {
  const a = init();
  if (!a) return;
  await signInWithPopup(a, new GoogleAuthProvider());
}

export async function signOut(): Promise<void> {
  const a = init();
  if (a) await fbSignOut(a);
}
