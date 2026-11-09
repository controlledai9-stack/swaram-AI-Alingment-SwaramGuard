# Deploy SwaramGuard

## Firebase Hosting and Render for the hackathon

The frontend has a dedicated Firebase Hosting site, `swarmguard.web.app` (the older `swaramguard.web.app` serves the same build), in project `ca-study-partner-e8b2c`. The FastAPI service needs its own HTTPS and WebSocket endpoint. Render's free web service can provide that endpoint. Its SQLite file is temporary and can be lost after a restart, redeploy, or idle shutdown. [Render free service limits](https://render.com/docs/free) · [Render WebSockets](https://render.com/docs/websocket)

1. Create a free Python web service from the hackathon repository in Render. Use the repository root, build command `pip install -r backend/requirements.txt`, start command `python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT --no-access-log`, and health check path `/api/health`.
2. Set `SWARMGUARD_FIREBASE_AUTH_PROJECT=ca-study-partner-e8b2c`, `SWARMGUARD_CORS_ORIGINS=https://swarmguard.web.app,https://swaramguard.web.app`, and `SWARMGUARD_CODE_EXEC=off`. Set `SWARMGUARD_ALLOWED_EMAILS` to include the judges and maintainers who should be able to sign in. Set `SWARMGUARD_ADMIN_EMAILS` to the maintainer accounts only. Check that the public backend health endpoint reports `"auth":"on"`.
3. Add `swarmguard.web.app` and `swaramguard.web.app` to Firebase Authentication's Authorized domains. Keep the SwaramGuard Web app config in `frontend/.env.local` and add `VITE_SWARMGUARD_API_ORIGIN` with the Render HTTPS origin.
4. From the repository root, run `npm --prefix frontend ci` and `npm --prefix frontend run build`, then `firebase deploy --only hosting --project ca-study-partner-e8b2c`.
5. Sign in at `https://swarmguard.web.app` with an allowed account and verify identity, a named run, live updates, History, and sign-out before sharing the link.

## Oracle Cloud Always Free VM

Use one Ubuntu VM to run FastAPI on loopback and Caddy on the public interface. Caddy serves the built React app and proxies `/api/*`, including the `/api/live` WebSocket, over the same HTTPS origin.

### Provision the VM

1. In your OCI home region, create an Ubuntu instance on an Always Free eligible shape. For Ampere A1 Flex, choose an Arm64 image and a size within your tenancy's free allocation. Check current allocations and capacity in the [OCI Always Free documentation](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).
2. Use a public subnet with an internet gateway and a public IPv4 address. Point your domain's DNS A record at that address. Add an AAAA record only if the VM is reachable over IPv6.
3. Allow inbound TCP 80 and 443 in the OCI network security group or security list and the VM firewall. Restrict SSH on TCP 22 to your administrative IP. Leave TCP 8000 private.
4. Install Git, Python 3 with venv support, Node.js 24 with npm, and [Caddy](https://caddyserver.com/docs/install). Create a dedicated service user called `swarmguard`. Check out the approved revision at `/opt/swarmguard` and give the service user read access.

### Configure Firebase

In Firebase Authentication, enable Google under **Sign-in method**. Under **Settings → Authorized domains**, add the hosting hostname, such as `swarmguard.example.com`. For local testing, verify that `localhost` is authorized in the development project. Use the Web app's supplied `authDomain` for the Google popup. [Firebase Google sign-in](https://firebase.google.com/docs/auth/web/google-signin) · [Authorized domains](https://firebase.google.com/docs/auth/faq-and-troubleshooting#limit_your_authorized_authentication_domains)

Create `/opt/swarmguard/backend/.env` with mode `0600` and ownership by the service user. Set the Firebase Auth project, allowed emails, and admin emails before exposing the app. An empty allowed-email list permits any verified email from the configured Firebase project.

```dotenv
SWARMGUARD_FIREBASE_AUTH_PROJECT=your-project-id
SWARMGUARD_ALLOWED_EMAILS=operator@example.com,admin@example.com
SWARMGUARD_ADMIN_EMAILS=admin@example.com
SWARMGUARD_STORAGE=sqlite
SWARMGUARD_SQLITE_PATH=/var/lib/swarmguard/swarmguard.db
GEMINI_QUOTA_FILE=/var/lib/swarmguard/gemini_quota.json
SWARMGUARD_CODE_EXEC=off
```

For Firestore, create the database in the Firebase console, install `backend/requirements-firestore.txt`, and set `SWARMGUARD_STORAGE=firestore`, `FIREBASE_CREDENTIALS`, and `FIREBASE_PROJECT_ID`. Store the service-account JSON outside the checkout with mode `0600` and grant the service user read access. Keep `SWARMGUARD_WORKSPACE` consistent with the data you intend to use.

Create `frontend/.env.local` with the four Firebase Web app values and, optionally, the video URL. Vite embeds these values at build time. Keep provider keys, API keys, and service-account credentials on the backend.

### Build and start

From `/opt/swarmguard`, as a user with write access to the checkout:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
# If using Firestore, also install backend/requirements-firestore.txt with the same Python.
npm --prefix frontend ci
npm --prefix frontend run build
sudo install -d -o swarmguard -g swarmguard -m 0700 /var/lib/swarmguard
sudo install -d -m 0755 /srv/swarmguard
sudo cp -a frontend/dist/. /srv/swarmguard/
```

Create `/etc/systemd/system/swarmguard.service`. Use one worker so live streams and background run state share the same process.

```ini
[Unit]
Description=SwarmGuard API
After=network-online.target
Wants=network-online.target

[Service]
User=swarmguard
WorkingDirectory=/opt/swarmguard
ExecStart=/opt/swarmguard/backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --no-access-log
Restart=on-failure
UMask=0077

[Install]
WantedBy=multi-user.target
```

Set `/etc/caddy/Caddyfile` to the following, substituting your hostname. Caddy provisions and renews the certificate and redirects HTTP to HTTPS. Uvicorn access logging is disabled because WebSocket authentication can carry a credential in the URL query. [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https) · [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)

```caddyfile
swarmguard.example.com {
    handle /api/* {
        reverse_proxy 127.0.0.1:8000
    }

    handle {
        root * /srv/swarmguard
        try_files {path} /index.html
        file_server
    }
}
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now swarmguard
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
curl --fail --show-error https://swarmguard.example.com/api/health
```

Check that health reports the intended storage backend. Open the HTTPS site, sign in with an allowed Google account, verify the email and role in the account view, and start a named run. Check that live updates arrive and History shows the run after reload. After backend env changes, restart `swarmguard`. After frontend env changes, rebuild and copy the new `dist/` contents.

## Environment variables

The backend reads `backend/.env` and then falls back to a repository-root `.env`. Values already in the process environment take precedence. Use one assignment per line with comments on separate lines.

| Backend variable | Purpose |
| --- | --- |
| `SWARMGUARD_FIREBASE_AUTH_PROJECT` | Firebase project ID used to verify browser ID tokens |
| `SWARMGUARD_ALLOWED_EMAILS` | Comma-separated emails and optional `@domain` entries allowed to sign in |
| `SWARMGUARD_ADMIN_EMAILS` | Comma-separated exact emails that receive the admin role |
| `SWARMGUARD_API_KEYS` | Optional comma-separated `name:key:role` entries for scripts and agents |
| `SWARMGUARD_CORS_ORIGINS` | Comma-separated origins for cross-origin browser clients. The Caddy setup is same-origin |
| `SWARMGUARD_STORAGE` | `auto` (default), `sqlite`, `firestore`, or `memory`. Auto selects Firestore when a credentials path is set |
| `SWARMGUARD_WORKSPACE` | Storage namespace, default `default` |
| `SWARMGUARD_SQLITE_PATH` | SQLite file path, default `backend/data/swarmguard.db` |
| `FIREBASE_CREDENTIALS` | Absolute path to the Firestore service-account JSON |
| `FIREBASE_PROJECT_ID` | Firestore project ID |
| `SWARMGUARD_LLM_PROVIDER` | Provider setting read by the backend config, default `deterministic`. Runs select their provider through the run configuration |
| `SWARMGUARD_LLM_MODEL` | Default model for the Anthropic adapter |
| `SWARMGUARD_LLM_MAX_CALLS` | Model call cap, default 80 |
| `GEMINI_API_KEY` | Server-side Gemini API key |
| `GEMINI_MODEL` | Gemini model override |
| `GEMINI_DAILY_BUDGET`, `GEMINI_MAX_RPM` | Local daily and per-minute request budgets |
| `GEMINI_QUOTA_FILE` | Local quota state path, default `backend/data/gemini_quota.json` |
| `GEMINI_TIMEOUT`, `GEMINI_MAX_RETRIES`, `GEMINI_MAX_WAIT_S` | Request timeout, retry limit, and quota-slot wait in seconds where applicable |
| `ANTHROPIC_API_KEY` | Optional Anthropic API key |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` | Optional OpenAI-compatible provider configuration |
| `OLLAMA_MODEL`, `OLLAMA_BASE_URL` | Optional Ollama model and endpoint |
| `SWARMGUARD_CODE_EXEC` | Simulator code execution mode. Use `off` to disable |
| `SWARMGUARD_REDACT_PII` | Collector PII redaction toggle, enabled by default |
| `SWARMGUARD_IDENTITY_SECRET` | Stable secret for signing ingest identity tokens |
| `SWARMGUARD_INJECTION_SCORER_URL` | Optional external injection scorer endpoint |
| `SWARMGUARD_WEBHOOK_URL` | Optional notification webhook |
| `SWARMGUARD_SIEM_URL`, `SWARMGUARD_SIEM_AUTH` | Optional SIEM endpoint and authentication value |
| `SWARMGUARD_REVIEW_ESCALATE_MIN` | Review escalation threshold in minutes, default 15 |
| `SWARMGUARD_EGRESS_PROXY_HOST`, `SWARMGUARD_EGRESS_PROXY_PORT` | Optional egress proxy bind address and port. Setting the port enables the proxy |
| `SWARMGUARD_EGRESS_MODE`, `SWARMGUARD_EGRESS_ALLOW`, `SWARMGUARD_EGRESS_RESOLVE` | Egress policy mode, allowed hosts, and resolver overrides |

| Frontend variable | Purpose |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Firebase Web app `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Web app `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Web app `projectId`, matching `SWARMGUARD_FIREBASE_AUTH_PROJECT` |
| `VITE_FIREBASE_APP_ID` | Firebase Web app `appId` |
| `VITE_HOW_TO_VIDEO_URL` | Optional YouTube link in the How to use dialog |
| `VITE_SWARMGUARD_API_ORIGIN` | Optional HTTPS backend origin for split hosting. Leave unset with Caddy |
| `SWARMGUARD_API` | Vite development proxy target in the shell environment, default `http://127.0.0.1:8000`. The production proxy is configured in Caddy |
