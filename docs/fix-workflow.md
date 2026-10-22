# Fix Assistant and Fix Tracking

Apply the migration before deploying the new API and worker:

~~~powershell
cd backend
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m app.services.fix_worker
~~~

Run the worker as a separate persistent service. For container deployment, build `backend/Dockerfile.fix-worker` from the `backend` directory. The API commits jobs to PostgreSQL; it does not run them in FastAPI background tasks. Multiple worker replicas claim jobs with row locks and leases. Keep the worker running to process queued suggestions and PR rechecks.

The worker needs the existing `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and GitHub App credentials at runtime. No new secret is required. The GitHub App requires repository **Contents: Read-only** in addition to its existing Pull requests permission. Update the App permission and approve the change for existing installations before using Fix Assistant or rechecks. Never put credentials in source control.

The Fix Assistant reads files at the analyzed commit through the installation token. It sends bounded, redacted context to Gemini and stores a structured suggestion. A diff is omitted when source context is unavailable or the proposed diff cannot be grounded in that source. The interface labels generated code and tests as suggestions; the worker does not run repository code, commit, push, or merge.

A push queues rechecks for active tracked issues. Verification history records the checked commit, result, reason, and source location evidence. The current status changes only when that commit is still the live PR head. Missing source, ambiguous moves, GitHub access errors, and provider failures result in `NEEDS_REVIEW`; they do not verify a fix. Repeated review observations are linked conservatively by exact normalized issue identity and path within a PR. Ambiguous cases remain separate issues.

The manual **Recheck now** action is limited to one completed request per finding per minute. Concurrent requests for the same commit reuse pending work. Suggestion generation is cached by finding, source commit, and generation version.

Run backend tests with `python -m pytest`, frontend type checks with `node_modules/.bin/tsc --noEmit`, and the production build with `npm run build`. A live PostgreSQL migration and GitHub App permission change must be performed in the target deployment.
