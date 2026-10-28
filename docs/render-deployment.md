# Deploy Kodeistry on Render

The repository contains a two-service `render.yaml` Blueprint with free Docker web services and no new database. Fill in the [backend](../RENDER_BACKEND_ENV.md) and [frontend](../RENDER_FRONTEND_ENV.md) environment values in Render before deploying. The backend uses the existing Supabase PostgreSQL session pooler. Docker builds exclude local `.env` files and keys.

1. In Supabase, open **Connect > Session pooler**, use the exact host and user shown, and set `DATABASE_URL` on `kodeistry-api` with the `postgresql+asyncpg://` driver. The backend and Alembic request TLS for Supabase.
2. Add a Render secret file named `kodeistry-app.pem` containing the GitHub App private key. Set `GITHUB_PRIVATE_KEY_PATH=/etc/secrets/kodeistry-app.pem`. Set all other backend values listed in the backend environment guide.
3. Set `NEXT_PUBLIC_API_URL=https://<actual-backend-host>/api` on `kodeistry-web` **before building**. Render passes this value into the frontend Docker build. A later change requires rebuilding the image.
4. Once Render assigns URLs, update `FRONTEND_URL`, `BACKEND_URL`, `CORS_ALLOWED_ORIGINS`, and `GITHUB_REDIRECT_URI` on the backend. Set `AUTH_COOKIE_SECURE=true` and `AUTH_COOKIE_SAMESITE=none` for separate HTTPS origins. Set GitHub App homepage, OAuth callback, setup callback, and webhook URL as listed in the backend environment guide.
5. Check `https://<actual-backend-host>/health` for API startup and `https://<actual-backend-host>/health/db` for a read-only database connection. `GET /health/db` returns 503 when Render cannot reach Supabase.
6. Compare Alembic `current` and `heads` using the backend image. The existing Supabase project may have no `alembic_version` table yet. Review migrations and take a backup before running `alembic upgrade head`; no migration runs automatically on deploy.
7. Test registration, login, GitHub OAuth, installation setup, a signed webhook delivery, dashboard data, and CSV export using the public URLs. Check GitHub App webhook delivery logs for retries and non-2xx responses.

For local Docker testing, populate `backend/.env`, then run `docker compose up -d --build`. Browse `http://localhost:3001` and `http://localhost:8000/health`. GitHub cannot send webhooks to localhost; use the deployed HTTPS webhook endpoint for GitHub integration tests.

Render Free sleeps after idle and blocks outbound SMTP ports 25, 465, and 587. Long AI reviews run inside the webhook request today; a cold start or timeout can interrupt a review. The advisory lock and review status checks reduce duplicate processing but do not make delivery durable. A queue with a separate worker is needed for reliable production review processing. The scanner and fix workers are also separate services and are outside this two-web-service Blueprint.

The local frontend uses host port 3001 by default so it can run alongside another app on port 3000. To choose another free port in Windows Command Prompt, run `set FRONTEND_PORT=3002` before the Compose command. Compose updates the backend frontend URL and CORS origin to match. The frontend still listens on port 3000 inside its container.
