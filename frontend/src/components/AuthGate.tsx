import type { ReactNode } from "react";
import { useState } from "react";
import { firebaseEnabled, signInWithGoogle, useFirebaseUser } from "../lib/firebase";

/** With Firebase configured, nothing renders until the person signs in with Google; each account gets its own state. */
export function AuthGate({ children }: { children: (account: string) => ReactNode }) {
  const user = useFirebaseUser();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!firebaseEnabled) return <>{children("local")}</>;
  if (user === undefined) {
    return <div className="flex min-h-screen items-center justify-center text-[14px] text-[var(--text-3)]">Checking sign-in…</div>;
  }
  if (user) return <>{children(user.email ?? user.uid)}</>;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError((e as Error).message.replace(/^Firebase: /, ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-alt)] px-4">
      <div className="w-full max-w-[380px] rounded-[var(--r-card)] border border-[var(--hairline)] bg-[var(--card)] p-8 text-center shadow-[var(--shadow-1)]">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--text)] text-[var(--bg)]">
          <svg width="18" height="20" viewBox="0 0 16 18" fill="none" aria-hidden>
            <path d="M8 1.2l6 2.3v4.8c0 4-2.6 7.2-6 8.5-3.4-1.3-6-4.5-6-8.5V3.5l6-2.3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M5.3 9l1.9 1.9 3.6-3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-[var(--text)]">Sign in to SwaramGuard</h1>
        <p className="mt-2 text-[14px] text-[var(--text-2)]">Your runs, incidents and history are saved to your account.</p>
        <button
          type="button"
          onClick={go}
          disabled={busy}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--hairline)] bg-[var(--card)] px-4 py-2.5 text-[14px] font-medium text-[var(--text)] hover:bg-[var(--hairline-subtle)] disabled:opacity-60"
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          {busy ? "Opening Google…" : "Continue with Google"}
        </button>
        {error && <p className="mt-4 text-[13px] text-[var(--crit)]">{error}</p>}
      </div>
    </div>
  );
}
