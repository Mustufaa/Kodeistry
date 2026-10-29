# Render frontend environment

Configure this on the `kodeistry-web` Docker web service. It belongs to the **frontend**, is needed at **build time**, and is publicly visible in browser JavaScript. Render passes the environment value as a Docker build argument. Rebuild the frontend after changing it.


## Copy into Render

In **kodeistry-web > Environment > Add from .env**, paste only this line, using your actual backend URL. This value is included in the browser bundle when Render builds the frontend, so rebuild after changing it.

```dotenv
NEXT_PUBLIC_API_URL=https://kodeistry-api.onrender.com/api
```

| Variable | Purpose | Required? | Where to obtain / example | Secret? | Reuse local value? | Update after Render URL? |
| --- | --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Browser-facing API base for login, GitHub OAuth, dashboard, reviews, analytics, and CSV | Yes | Render backend URL plus `/api`; `https://kodeistry-api.onrender.com/api` | No | No if it points to localhost | Yes |

The existing `frontend/.env.example` is a safe localhost template. The Docker image excludes `.env.local` and requires `NEXT_PUBLIC_API_URL` at build time. The frontend Dockerfile reads Render's `PORT` at runtime through the standalone Next.js server and binds to `0.0.0.0`.

The backend must set `FRONTEND_URL` and `CORS_ALLOWED_ORIGINS` to this frontend's HTTPS origin. For separate Render origins, use `AUTH_COOKIE_SECURE=true` and `AUTH_COOKIE_SAMESITE=none`. Keep database, Gemini, GitHub private key, OAuth client secret, and JWT secrets on the backend only.

## SEO metadata

Set `SITE_URL=https://kodeistry.onrender.com` on the frontend service. Optional `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` values must be real search-console tokens; the previously supplied Google token remains the fallback. These values have Docker build arguments and require a rebuild when changed. See [SEO operations](docs/seo-operations.md) for verification, sitemap submission, crawler policy, and validation commands.
