# GitHub configuration for Kodeistry

Kodeistry uses the GitHub App web authorization flow for identity and GitHub App installation tokens for repository access. User access tokens and installation access tokens remain backend-only and are not stored in the browser.

## GitHub App settings

Use the routes below exactly as written.

| GitHub setting | Local development | Public/tunnel development |
| --- | --- | --- |
| Homepage URL | `http://localhost:3000` | your deployed frontend URL |
| User authorization callback URL | `http://localhost:8000/api/auth/github/callback` | `https://<backend-domain>/api/auth/github/callback` |
| Setup URL | `http://localhost:8000/api/github/setup/callback` | `https://<backend-domain>/api/github/setup/callback` |
| Webhook URL | not reachable by GitHub without a tunnel | `https://<backend-domain>/api/github/webhook` |

Settings:

- **Request user authorization (OAuth) during installation: OFF.** Kodeistry authorizes the user before installation. GitHub disables the separate Setup URL when this option is enabled.
- **Redirect on update: ON.** This returns users to Kodeistry after they change repository access on an existing installation. Kodeistry includes a signed short-lived state in every installation URL and verifies the installation with GitHub before linking it.
- **Webhook Active: ON.**
- **Webhook secret:** the same strong random value as `GITHUB_WEBHOOK_SECRET`.

Repository permissions:

- Metadata: Read-only (GitHub enables this required permission automatically).
- Pull requests: Read and write (read PR details/files and publish review comments).
- Contents: Read-only (Fix Assistant and Fix Tracking read source at specific commits). Existing installations must approve this added permission.

Account permissions:

- Email addresses: Read-only (used only to retrieve a verified email during GitHub login).
- All organization permissions: No access.

Subscribe to this event:

- Pull request

GitHub automatically delivers `installation` and `installation_repositories` events to GitHub Apps; they are not selectable subscriptions.

If you add the Email addresses account permission to an existing app, save the change and authorize the app again. GitHub does not apply a newly added account permission to an existing user authorization until that user approves it.

Users choose **All repositories** or **Only select repositories** in GitHub's own installation UI. Kodeistry never asks for an installation ID, owner, or repository name.

## Localhost versus a public backend URL

The OAuth callback and Setup URL are top-level browser redirects. They may use `localhost` when GitHub and the browser are running on the same development machine. The webhook is a server-to-server request from GitHub and **must** use a public HTTPS URL such as ngrok.

For the least confusing end-to-end test, expose backend port 8000 through ngrok and use that same HTTPS backend origin for the authorization callback, Setup URL, Webhook URL, `BACKEND_URL`, `GITHUB_REDIRECT_URI`, and `NEXT_PUBLIC_API_URL` (with `/api` appended only for `NEXT_PUBLIC_API_URL`).

When the frontend and backend are on different sites, set:

```dotenv
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAMESITE=none
```

For an all-local setup on `localhost`, use `AUTH_COOKIE_SECURE=false` and `AUTH_COOKIE_SAMESITE=lax`. Keep `CORS_ALLOWED_ORIGINS` explicit; never use `*` with credentialed requests.

## Required backend variables

```dotenv
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/kodeistry
JWT_SECRET_KEY=<at-least-32-random-bytes>
FRONTEND_URL=http://localhost:3000
BACKEND_URL=https://<backend-domain>
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

GITHUB_CLIENT_ID=<github-app-client-id>
GITHUB_CLIENT_SECRET=<github-app-client-secret>
GITHUB_REDIRECT_URI=https://<backend-domain>/api/auth/github/callback
GITHUB_APP_ID=<github-app-id>
GITHUB_APP_SLUG=kodeistry
GITHUB_PRIVATE_KEY_PATH=secrets/kodeistry-app.pem
GITHUB_APP_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=<strong-random-secret>
```

Use either `GITHUB_PRIVATE_KEY_PATH` or `GITHUB_APP_PRIVATE_KEY`, not both. Never put a private key, client secret, webhook secret, JWT secret, OAuth token, or installation token in a `NEXT_PUBLIC_*` variable.
