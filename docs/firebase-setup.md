# Firebase: Google sign-in and saved history

SwarmGuard can use the Firebase project you already have. One Firebase project can hold several apps: SwarmGuard
adds its own **Web app** for sign-in, and keeps its data under its own `workspaces/<name>/…` path in Firestore, so it
never touches your other app's collections.

## 1. Google sign-in (about 5 minutes, in the Firebase console)

1. **Authentication → Sign-in method → Google → Enable** (pick a support email) → Save.
2. **Authentication → Settings → Authorized domains**: make sure `localhost` is listed (add your hosting domain later).
3. **Project settings → Your apps → Add app → Web (`</>`)**, name it "SwarmGuard", don't enable Hosting. Copy the
   config values into `frontend/.env.local` (see `frontend/.env.example`):
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.
   These web values are public by design (they identify the project); security comes from the backend check below.
4. In `backend/.env`:
   ```
   SWARMGUARD_FIREBASE_AUTH_PROJECT=<the same project id>
   SWARMGUARD_ALLOWED_EMAILS=you@gmail.com,@your-college.edu   # who may sign in (strongly recommended)
   SWARMGUARD_ADMIN_EMAILS=you@gmail.com                         # admins see every run
   ```
5. Restart backend and frontend. The app now opens on "Continue with Google".

Each signed-in person sees only the runs they started (and their reviews and live messages); admins see all. API keys
(`SWARMGUARD_API_KEYS`) keep working for scripts and real agents, with the team-wide view.

## 2. Save history in Firestore instead of the local SQLite file (optional)

Runs, events, incidents, reviews and pipeline data are already saved, in `backend/swarmguard.db` by default. To keep
them in your Firebase project instead (shared across machines, survives a laptop change):

1. **Firestore Database → Create database** (if your project has none yet; production mode is fine: only the backend
   writes, using a service account).
2. **Project settings → Service accounts → Generate new private key**. Save the JSON outside the repo.
3. `pip install -r backend/requirements-firestore.txt`, then in `backend/.env`:
   ```
   FIREBASE_CREDENTIALS=C:/path/to/service-account.json
   FIREBASE_PROJECT_ID=<project id>
   ```
4. Restart the backend; `/api/health` shows `"storage": "firestore"`.

Never commit `backend/.env`, `frontend/.env.local` or the service-account JSON.
