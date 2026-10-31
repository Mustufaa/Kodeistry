# Kody assistant

## One-time dashboard invitation

Before deploying the updated API/frontend, run `alembic upgrade head` from the backend environment. The [Kody migration](../backend/alembic/versions/cd53ea42f803_kody_invitation.py) backfills every existing account with an invitation timestamp within the schema migration transaction. New accounts default to a null timestamp and `NOT_STARTED`. Do not delete or reset invitation timestamps when deploying or rolling back application code; this migration deliberately refuses downgrade to preserve account history.

After an authenticated dashboard summary loads successfully, the [dashboard tour](../frontend/components/kody/dashboard-tour.tsx) calls `POST /api/onboarding/tour/claim`. A conditional database update grants at most one request permission to display the invitation, across tabs and devices. The transaction commits before returning that permission. Errors never grant permission. A lost response or a closed page after the commit can consume the invitation without displaying it: this deliberately favors the strict at-most-once requirement. Manual access remains available.

`PUT /api/onboarding/tour/status` stores `IN_PROGRESS`, `SKIPPED`, or `COMPLETED` separately. Starting manually preserves an existing invitation timestamp and consumes an outstanding invitation if necessary. Closing an unfinished tour leaves `IN_PROGRESS`, without automatically resuming it. Help → Take a Tour and Kody's “Show me the dashboard tutorial” action start the tour manually. No browser storage controls invitation eligibility. If saving a decision fails, a toast offers a retry; the invitation remains consumed regardless.

Regression coverage: [account persistence and concurrent claims](../backend/tests/test_kody_tour.py). Run `python -m pytest tests/test_kody_tour.py -q` in the configured backend environment.

Kody is a public guidance chatbot. The frontend mounts one SVG launcher in the shared root layout, including dashboard pages. Conversation messages stay in React memory for the current page session; clearing or reloading removes them. The frontend sends only text typed in the chat and bounded conversation history to the chat API. It does not attach account, repository, finding, or source-code data.

## Local setup

1. Configure the existing backend environment in backend/.env. Set GEMINI_API_KEY to a server-side Google Gen AI API key. Never add it to the frontend or a NEXT_PUBLIC_ variable.
2. Optionally tune KODY_MODEL, KODY_TIMEOUT_SECONDS, KODY_MAX_OUTPUT_TOKENS, KODY_MAX_CONCURRENT, KODY_REQUESTS_PER_MINUTE, and KODY_GLOBAL_REQUESTS_PER_MINUTE. Defaults are in backend/.env.example.
3. Set NEXT_PUBLIC_API_URL in frontend/.env.local to the backend API base, such as http://127.0.0.1:8000/api. Ensure the frontend origin is listed in CORS_ALLOWED_ORIGINS.
4. Start the existing FastAPI server from backend using uvicorn app.main:app --reload, then start the frontend from frontend using npm run dev.

The public endpoint is POST /api/chat with a JSON message and optional history of user/assistant messages. It returns a reply string in a JSON object. Missing credentials or provider failure return 503 without revealing provider details. The frontend shows the unavailable state and provides retry.

## Knowledge maintenance

Edit backend/app/knowledge/kodeistry.md after checking relevant frontend routes and backend implementations. Mark unfinished features Coming Soon, keep links current, and do not add private data or unsupported claims. The service loads the file relative to its Python module, so it works regardless of the process working directory. Ensure deployments package the entire backend/app/knowledge directory. Restart the API after updating the file because it is cached per process.

## Deployment controls and scope

The API limits JSON body size, message and history lengths, output tokens, provider time, concurrent requests, and requests per client IP and per API process. The in-process IP limiter applies independently to each API worker. Configure a shared rate limit for /api/chat at the ingress or CDN for multi-worker deployments, and configure trusted proxy headers so the ASGI client IP represents the visitor. Do not expose this public model endpoint without that shared limit.

Kody gives general guidance only. It has no account tools, database access, or account actions. It cannot verify the visitor's GitHub installation or review status. The chat UI never renders raw HTML, and only allowlisted internal Markdown links become clickable. The user-entered chat text is sent to the configured model, so the UI warns visitors not to share passwords or tokens.
