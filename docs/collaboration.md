# Persistent notifications and team chat

## Deployment

1. Back up PostgreSQL and compare **alembic current** with **alembic heads**. The new head is **c61e8a9204bd**, following **bc42d931e702**.
2. From the backend deployment environment run **alembic upgrade head before deploying the API**. No migration runs automatically. Five new tables and their indexes are added without rewriting existing users, grants, or repositories. Downgrade deletes collaboration data.
3. Deploy the API and any existing secret-scanner worker, then rebuild/deploy the frontend with **npm ci** and **npm run build**.
4. Reuse DATABASE_URL, JWT_SECRET_KEY, NEXT_PUBLIC_API_URL, AUTH_COOKIE_SECURE, AUTH_COOKIE_SAMESITE, FRONTEND_URL, BACKEND_URL, and CORS_ALLOWED_ORIGINS. **No new required variables or Redis service.** The frontend origin must appear exactly in CORS_ALLOWED_ORIGINS. Keep DATABASE_ECHO=false; SQLAlchemy also hides bound parameters.
5. The browser derives wss: from the API's HTTPS URL. Render supports WebSocket upgrade directly. Any additional reverse proxy must forward Upgrade/Connection headers and permit idle timeouts above 45 seconds. Uvicorn transport pings run every 20 seconds; application ping/pong also checks liveness.
6. Verify in staging with two real accounts: exchange messages, disconnect one browser, send offline messages, reconnect, mark notifications/read cursors, and revoke repository access while its chat is open. Validate signed GitHub retries and actual PostgreSQL concurrency. Local tests do not establish live Render behavior.

Render Free sleeps and can interrupt sockets and in-request reviews. Committed collaboration data survives restarts. This change does not turn the existing synchronous GitHub review pipeline into a durable job queue; that deployment limitation remains.

## Data and delivery

- **chat_channels**: tenant, existing repository reference, channel kind, archive state, revision.
- **chat_channel_members**: DM participants, monotonic read cursor, presence and typing timestamps. Team channels inherit tenant membership; repository channels inherit repository assignments.
- **chat_messages**: stable client UUID, author, text, parent message, create/edit/delete timestamps. Deletion erases the body while retaining a tombstone.
- **notifications**: recipient, tenant, repository/channel reference, event type, safe destination, read timestamp, unique recipient/event key.
- **collaboration_tickets**: hashes of single-use, tenant-scoped, 30-second tickets.

REST uses existing cookie/CSRF or bearer authentication. Tickets are minted over authenticated HTTP and consumed in the first WebSocket frame, never in URLs. Origin checks apply even with a valid ticket. Sockets renew through HTTP authentication every 15 minutes.

Delivery uses **PostgreSQL-backed change snapshots every two seconds**. Every socket rechecks current permissions, unread counts, channel revisions, and active-channel presence. Clients fetch authorized pages on changes and reconnect. This works across API instances without sticky sessions or an in-memory fanout bus. PostgreSQL is authoritative; rollbacks never broadcast. Expected delivery latency is about two seconds plus HTTP retrieval.

This fits the current small deployment, trading database queries for a simpler shared transport. Before increasing concurrent sockets substantially, load-test the connection pool and database. A transactional outbox plus Redis Pub/Sub invalidations would reduce polling load; retain the same authorized resync path. Large-scale throughput has not been established.

Presence is conversation-scoped and expires after 35 seconds; typing expires after five. Read receipts advance only to validated messages and never move backward. The browser advances cursors only while the conversation is visible, at the bottom, and outside search.

## Events and authorization

Transactional observers in the [collaboration service](../backend/app/services/collaboration.py) generate notifications from actual repository, review, finding, invitation and membership transitions. Assignment changes are emitted inside the existing team API transaction.

Review-started/completed/failed and critical/high review findings are deduplicated by repository, PR, commit SHA and event type. High/critical findings produce one notification per severity and review commit, not per finding. Low-severity findings produce none. Mentions and DMs deduplicate by persisted message ID.

Recipients come from existing roles and repository grants. Inbox reads recheck access, including historical read notifications. Administrator-only activity disappears on demotion. Personal role/assignment notifications link to the dashboard. Previews contain no code, secret values, invitation tokens, email addresses, or private message bodies.

Team channels are team-wide, not custom private groups. Owners/admins create/archive team and repository channels and manage access through the existing team and assignment screens. Members may initialize general chat or start DMs with current teammates. Admin status does not grant access to others' DMs.

## API

All paths use prefix **/api/tenants/{tenant_id}/collaboration**.

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | /channels | Authorized discovery and unread totals / create or reuse |
| DELETE | /channels/{id} | Archive team/repository channel (admin) |
| GET | /people?channel_id={id} | Minimal identities; optional channel filtering |
| GET | /channels/{id}/messages?before={cursor}&limit=40&q={search} | Keyset history/search |
| POST | /channels/{id}/messages | Send client_id, body, optional reply_to_id and mentions; return persisted acknowledgement |
| PATCH / DELETE | /channels/{id}/messages/{message_id} | Edit/delete own message |
| POST | /channels/{id}/read | Advance message_id cursor |
| GET | /notifications?unread=true&before={cursor}&limit=30 | Paginated inbox |
| GET | /notifications/unread-count | Authorized unread total |
| POST | /notifications/{id}/read | Mark one read |
| POST | /notifications/read-all | Mark authorized notifications read |
| POST | /ticket | Mint connection ticket |
| WS | /ws | First frame: ticket; client: subscribe, typing, pong; server: sync, ping |

Messages accept 1–4000 trimmed characters. Controls, unauthorized replies and mentions are rejected. HTTP bodies are bounded at 24 KB; socket frames at 1 KB application-level and 2 KB at Uvicorn. Sending is limited in PostgreSQL to 30 messages/minute/user; row locks serialize concurrent sends and UUID retries. Socket frame rates are bounded. Add edge IP/connection limits for larger public deployments.

## UI and limitations

The sample widgets are replaced with real data. Radix-backed shadcn-style Sheet, ScrollArea, Avatar and Tooltip reuse the existing Button/Input/theme. The portal escapes the blurred header; width is 410px desktop and full-screen mobile. The launcher sits beside Kody. Desktop has a channel rail; mobile has back-to-channel navigation. Focus trapping/restoration, Escape, scroll locking, safe areas, visual-viewport keyboard resizing and reduced motion are included.

Chat includes search, earlier-history loading on scroll, sender grouping, dates, replies, copy/edit/delete, mentions, optimistic sends and retry with the same UUID. Failed drafts remain while the conversation is mounted; unsent drafts are not stored across a page reload. Persisted history resynchronizes on reconnect.

The notification dialog includes All/Unread, severity icons, relative times, read actions, pagination and loading/error/empty states. Optional OS browser notifications and automatic repository-channel system posts are not enabled. Completed manual secret scans emit one notification per critical/high severity per run, without secret previews.

## Validation

Run from backend:

    .venv/Scripts/python.exe -m pytest tests -q
    .venv/Scripts/python.exe -m alembic upgrade bc42d931e702:c61e8a9204bd --sql

Set TEAM_TEST_DATABASE_URL to a **disposable PostgreSQL database** to exercise real row/advisory locks, concurrent sends, and signed webhook retries. Fixtures create/drop isolated schemas. Never use production.

Run from frontend:

    npx tsc --noEmit
    npm test
    npm run build
    npm run test:collaboration

Start the frontend before the browser test. Defaults are TEST_BASE_URL=http://127.0.0.1:3000 and TEST_BROWSER_CHANNEL=chrome. Backend tests use SQLAlchemy persistence and an ASGI WebSocket harness. UI tests deliberately use HTTP/WebSocket fixtures for deterministic failures and retries; they are not evidence of a live Render deployment.

## Recorded validation (2026-10-30)

- Backend suite: **113 passed, 9 skipped**. Seven skipped cases require disposable PostgreSQL (row locks, FK enforcement, signed webhook retry); two require the pinned Gitleaks binary. One existing Starlette/AnyIO deprecation warning remains.
- Existing frontend tests: **30 passed**.
- Collaboration browser scenarios: **passed at 375px and 1366px**, including loading/error/retry states, viewport resizing, safe text rendering, stable retry IDs, reconnection, notification read actions, focus and Escape.
- Targeted ESLint, TypeScript, editor diagnostics, and production Next.js build passed.
- Alembic reported a single head and generated PostgreSQL migration SQL offline. No deployed database was migrated, and no live Render WebSocket upgrade was tested.

## Files created and modified

Backend additions:
- [Models](../backend/app/models/collaboration.py), [events/authorization service](../backend/app/services/collaboration.py), [REST/WebSocket API](../backend/app/api/collaboration.py)
- [Migration](../backend/alembic/versions/c61e8a9204bd_collaboration.py), [integration tests](../backend/tests/test_collaboration.py)

Backend modifications:
- [Alembic registration](../backend/alembic/env.py), [routing/body limits](../backend/app/main.py), [assignment notifications](../backend/app/api/team.py)
- [Uvicorn configuration](../backend/app/server.py), [SQL parameter redaction](../backend/app/db/database.py)
- [Secret-scanner worker event registration](../backend/app/secret_scanner/worker.py)

Frontend additions:
- [Connection provider](../frontend/components/layout/collaboration-provider.tsx), [conversation](../frontend/components/layout/team-chat-conversation.tsx), [API/types](../frontend/lib/api/collaboration.ts)
- [Sheet](../frontend/components/ui/sheet.tsx), [ScrollArea](../frontend/components/ui/scroll-area.tsx), [Avatar](../frontend/components/ui/avatar.tsx), [Tooltip](../frontend/components/ui/tooltip.tsx), [Badge](../frontend/components/ui/badge.tsx), [Skeleton](../frontend/components/ui/skeleton.tsx)
- [Browser tests](../frontend/tests/collaboration.e2e.mjs)

Frontend modifications:
- [Drawer](../frontend/components/layout/team-chat-drawer.tsx), [notification bell](../frontend/components/layout/notification-bell.tsx), [app shell](../frontend/components/layout/app-shell.tsx)
- [Styles](../frontend/app/globals.css), [package manifest](../frontend/package.json), [lockfile](../frontend/package-lock.json)

Documentation:
- This guide and [Render deployment guide](./render-deployment.md).
