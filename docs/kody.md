# Kody assistant

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
