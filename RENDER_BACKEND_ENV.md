# Render backend environment

Configure these on the `kodeistry-api` Docker web service. All entries are **backend** variables available at **runtime**; none belong in the frontend image. Render supplies `PORT` at runtime and the Docker command uses it. The values shown are placeholders, never copy local secrets into documentation. The project uses `python-decouple` via `backend/app/core/config.py`.


## Copy into Render

In **kodeistry-api > Environment > Add from .env**, paste only the lines inside this block. Replace every `REPLACE_...` value and use the actual URLs Render assigns. This Markdown file is a safe template; do not upload the `.md` file itself or commit filled-in secrets.

```dotenv
DATABASE_URL=postgresql+asyncpg://postgres.gpqahgmhouxgdsckhmpy:REPLACE_WITH_URL_ENCODED_DB_PASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
DATABASE_ECHO=false
JWT_SECRET_KEY=REPLACE_WITH_RANDOM_32_PLUS_BYTE_SECRET
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAMESITE=none
CORS_ALLOWED_ORIGINS=https://kodeistry-web.onrender.com
BACKEND_URL=https://kodeistry-api.onrender.com
FRONTEND_URL=https://kodeistry-web.onrender.com
GITHUB_REDIRECT_URI=https://kodeistry-api.onrender.com/api/auth/github/callback
GITHUB_CLIENT_ID=REPLACE_WITH_GITHUB_APP_CLIENT_ID
GITHUB_CLIENT_SECRET=REPLACE_WITH_GITHUB_APP_CLIENT_SECRET
GITHUB_APP_ID=REPLACE_WITH_GITHUB_APP_ID
GITHUB_APP_SLUG=kodeistry
GITHUB_PRIVATE_KEY_PATH=/etc/secrets/kodeistry-app.pem
GITHUB_WEBHOOK_SECRET=REPLACE_WITH_GITHUB_WEBHOOK_SECRET
GEMINI_API_KEY=REPLACE_WITH_GEMINI_API_KEY
GEMINI_MODEL=gemini-3-flash-preview
KODY_MODEL=gemini-3-flash-preview
```

Upload the GitHub App PEM separately as a Render **Secret File** named `kodeistry-app.pem`. Set the same webhook secret in the GitHub App. For optional email, OpenRouter, scanner, and tuning variables, use the table below. On a Render Free web service, SMTP ports 25, 465, and 587 are blocked.

| Variable | Purpose | Required? | Where to obtain / example | Secret? | Reuse local value? | Update after Render URL? |
| --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | SQLAlchemy async PostgreSQL | Yes | Supabase Connect > Session pooler: `postgresql+asyncpg://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres` | Yes | Yes, if it reaches Supabase | No |
| `DATABASE_ECHO` | SQL statement logging | No, default false | `false` | No | Yes | No |
| `JWT_SECRET_KEY` | Sign auth and state JWTs | Yes | Generate a random 32+ byte secret | Yes | Yes, if strong; retain to keep existing sessions | No |
| `SECRET_KEY` | Legacy fallback for `JWT_SECRET_KEY` | No | Prefer `JWT_SECRET_KEY` | Yes | Avoid | No |
| `ALGORITHM` | JWT algorithm | No, default HS256 | `HS256` | No | Yes | No |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Session length | No, default 30 | `60` | No | Yes | No |
| `AUTH_COOKIE_NAME` | Auth cookie name | No | `kodeistry_session` | No | Yes | No |
| `CSRF_COOKIE_NAME` | CSRF cookie name | No | `kodeistry_csrf` | No | Yes | No |
| `OAUTH_STATE_COOKIE_NAME` | OAuth state cookie | No | `kodeistry_oauth_state` | No | Yes | No |
| `GITHUB_SETUP_STATE_COOKIE_NAME` | App setup cookie | No | `kodeistry_github_setup_state` | No | Yes | No |
| `AUTH_COOKIE_SECURE` | Require HTTPS cookie | Yes for Render | `true` | No | No if local false | No |
| `AUTH_COOKIE_SAMESITE` | Cross-site cookies | Yes for separate Render domains | `none` | No | No if local lax | No |
| `CORS_ALLOWED_ORIGINS` | Trusted browser origins | Yes | `https://kodeistry-web.onrender.com` | No | No if local | Yes |
| `BACKEND_URL` | Public backend origin and OpenRouter referrer | Yes | `https://kodeistry-api.onrender.com` | No | No if local | Yes |
| `FRONTEND_URL` | Redirects, email, invitation links | Yes | `https://kodeistry-web.onrender.com` | No | No if local | Yes |
| `GITHUB_REDIRECT_URI` | OAuth callback URL; defaults from BACKEND_URL | Recommended | `https://kodeistry-api.onrender.com/api/auth/github/callback` | No | No if local | Yes |
| `GITHUB_CLIENT_ID` | GitHub App user authorization | Yes for OAuth | GitHub App settings; `Iv1_EXAMPLE` | No | Yes | No |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth exchange | Yes for OAuth | GitHub App settings; `REPLACE_ME` | Yes | Yes | No |
| `GITHUB_APP_ID` | Installation JWT issuer | Yes for GitHub App | GitHub App settings; `123456` | No | Yes | No |
| `GITHUB_APP_SLUG` | Installation URL | No, default kodeistry | GitHub App slug; `kodeistry` | No | Yes | No |
| `GITHUB_PRIVATE_KEY_PATH` | GitHub App PEM path | Yes unless inline key | Render secret file; `/etc/secrets/kodeistry-app.pem` | Path no, file yes | Path must change | No |
| `GITHUB_APP_PRIVATE_KEY` | Alternative inline PEM | Yes unless path | GitHub App private key | Yes | Yes | No |
| `GITHUB_WEBHOOK_SECRET` | Verify GitHub webhook HMAC | Yes for webhooks | GitHub App webhook settings; `REPLACE_ME` | Yes | Yes | No |
| `GEMINI_API_KEY` | Gemini reviews and Kody | Yes for AI features | Google AI Studio; `REPLACE_ME` | Yes | Yes | No |
| `GEMINI_MODEL` | Review model | No | `gemini-3-flash-preview` | No | Yes | No |
| `KODY_MODEL` | Kody model | No | `gemini-3-flash-preview` | No | Yes | No |
| `KODY_TIMEOUT_SECONDS` | Kody timeout | No | `20` | No | Yes | No |
| `KODY_MAX_OUTPUT_TOKENS` | Kody output cap | No | `512` | No | Yes | No |
| `KODY_MAX_CONCURRENT` | Kody concurrent calls | No | `4` | No | Yes | No |
| `KODY_REQUESTS_PER_MINUTE` | Kody per-client limit | No | `12` | No | Yes | No |
| `KODY_GLOBAL_REQUESTS_PER_MINUTE` | Kody per-process limit | No | `60` | No | Yes | No |
| `OPENROUTER_API_KEY` | Optional AI fallback | No | OpenRouter; `REPLACE_ME` | Yes | Yes | No |
| `OPENROUTER_MODEL` | Fallback model | No | `google/gemma-4-31b-it:free` | No | Yes | No |
| `MAIL_USERNAME` | SMTP login | Yes for email | SMTP provider; `user@example.com` | Usually | Yes | No |
| `MAIL_PASSWORD` | SMTP login | Yes for email | SMTP provider; `REPLACE_ME` | Yes | Yes | No |
| `MAIL_FROM` | Sender address | Yes for email | Verified SMTP sender; `no-reply@example.com` | No | Yes | No |
| `MAIL_SERVER` | SMTP host | Yes for email | SMTP provider; `smtp.example.com` | No | Yes | No |
| `MAIL_PORT` | SMTP port | No, default 587 | SMTP provider; `587` | No | Yes | No |
| `MAIL_STARTTLS` | STARTTLS switch | No, default true | SMTP provider; `true` | No | Yes | No |
| `MAIL_SSL_TLS` | Implicit TLS switch | No, default false | SMTP provider; `false` | No | Yes | No |
| `SECRET_SCANNER_HMAC_KEY` | Scanner token integrity | Yes if scanner enabled | Separate random 32+ byte secret | Yes | Yes | No |
| `GITLEAKS_PATH` | Scanner executable | Yes if scanner enabled | Worker image; `gitleaks` | No | Yes | No |
| `SECRET_SCAN_MAX_SECONDS` | Scanner time cap | No | `900` | No | Yes | No |
| `SECRET_SCAN_MAX_DISK_MB` | Scanner disk cap | No | `1024` | No | Yes | No |
| `SECRET_SCAN_MAX_FILE_MB` | Scanner file cap | No | `10` | No | Yes | No |
| `SECRET_SCAN_MAX_CONCURRENT` | Scanner concurrency | No | `2` | No | Yes | No |
| `SECRET_SCAN_MAX_QUEUED_PER_USER` | Scanner queue cap | No | `3` | No | Yes | No |

Set **either** `GITHUB_PRIVATE_KEY_PATH` with a Render secret file or `GITHUB_APP_PRIVATE_KEY`, not both. The Blueprint chooses the secret file path; upload the PEM as `kodeistry-app.pem`. The backend Docker user belongs to group 1000 to read Render secret files.

Supabase's project API URL is not a PostgreSQL connection URL. Use the Supabase dashboard's exact Session pooler host, user, and port. Percent-encode reserved characters in the password. The backend and migrations request TLS for Supabase connections. Migrations use the same `DATABASE_URL` with a synchronous PostgreSQL driver; the Docker image includes `psycopg2-binary`. Never run migrations automatically at web startup. Verify status with `docker compose run --rm backend alembic current` and compare with `alembic heads`; apply only reviewed migrations with `alembic upgrade head` after backup.

Render Free blocks outbound SMTP ports 25, 465, and 587. Email verification and reset need a compatible paid service or an HTTP mail API implementation. The scanner and fix workers are separate existing services and are not started by this two-web-service Blueprint.

GitHub App settings: homepage `https://kodeistry-web.onrender.com`, user authorization callback `https://kodeistry-api.onrender.com/api/auth/github/callback`, setup callback `https://kodeistry-api.onrender.com/api/github/setup/callback`, webhook `https://kodeistry-api.onrender.com/api/github/webhook`. Set the same webhook secret in GitHub and Render. Change the hostnames if Render assigns different URLs.

`/health` checks only API liveness. `GET /health/db` performs a read-only `SELECT 1`; a 200 response from the Render URL proves that Render can reach Supabase. A 503 response means the database is unavailable. This endpoint does not reveal connection credentials. The webhook currently performs review work inside the HTTP request. Render Free sleeps after idle, so GitHub may time out during cold start or long AI reviews. The existing advisory lock and review-run checks suppress some duplicates, but interruptions can leave a RUNNING row and side effects may already have reached GitHub. For production reliability, move review work to a durable queue and worker, with delivery IDs and retry handling; this is beyond the deployment-only changes here.
