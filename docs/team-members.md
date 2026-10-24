# Team Members

Team Members extends the existing tenants, tenant_members, and server-side GitHub App installation flows. Open **Team Members** in the main sidebar (/team).

## Deployment

1. Back up the application database and run from backend:
   `.venv\Scripts\python.exe -m alembic upgrade head`
2. Restart the API and deploy the frontend.
3. Configure the existing SMTP settings: MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM (a plain email address), MAIL_SERVER, MAIL_PORT, MAIL_STARTTLS, MAIL_SSL_TLS.
4. Set FRONTEND_URL to the trusted frontend HTTP(S) origin, without a path, query, or fragment. Set CORS_ALLOWED_ORIGINS and authentication-cookie settings for your deployment as before.

Migration af31b820d601 follows 9a0e5d4c2b71. It converts DEVELOPER to MEMBER, constrains roles, adds invitations and shared email rate-limit records, and creates a unique normalized-email index. Historical accounts whose emails differ only in case/outer whitespace must be reconciled before migrating; the migration fails rather than silently merging identities. Other unknown historical role values also fail the role constraint and need explicit review.

No additional provider credentials or personal GitHub tokens are needed. Missing/failed SMTP returns HTTP 503. Successful SMTP handoff is not a guarantee of inbox delivery. Tests mock SMTP; a live delivery smoke test is still needed in the deployment environment.

## Access model

- OWNER: member/role management, GitHub connections, repositories, reviews, settings.
- ADMIN: ordinary-member invitations/removal, repositories and reviews. Cannot grant OWNER/ADMIN or modify/remove either role.
- MEMBER: read-only access to explicitly assigned repositories, their overview, reviews, findings, fix prompts, analytics, and CSV reports. No assignments means no repository data.

Migration bc42d931e702 adds repository_members (many-to-many grants tied to membership IDs), composite team foreign keys, and pending invitation repository_ids. It creates no grants for existing members. Owners/admins retain full access within their teams. Members cannot access member management or GitHub connection settings.

Authenticated HTTP sessions install ORM read criteria for repositories, reviews, findings, fix artifacts, and secret scans. Counts, outer joins, aliased queries, search sources, analytics and CSV exports share this policy. Permission subqueries read current membership and assignments on every statement; JWTs contain no grants. Use ORM queries for repository data in HTTP handlers; raw SQL/Core selects bypass loader criteria. The assignment validator intentionally uses an explicit team-constrained Core query because invitation acceptance precedes membership. Workers and signed webhooks have independent sessions.

Reviews and findings resolve through their repositories. Explicit inaccessible repository filters and guessed IDs return 404. Onboarding/dashboard redact GitHub installation details for members. Public Kody chat accepts no repository/team context and reads only static product knowledge; the repository-aware Fix Assistant uses the same access policy. Secret Scanner reads are scoped too; its UI remains Coming soon.

Owner/admin repository selections can be edited on Team Members in the sidebar or via Settings > Team Members. Only MEMBER invitations accept repository_ids; the default is empty. Acceptance revalidates all stored IDs against the team and active repositories before creating an account or membership. Deleted IDs remain in the invitation and fail validation. Changing a role clears previous explicit grants; demoting to MEMBER requires assigning repositories anew. Repository selection preserves repository IDs and review history.

Membership and role are loaded from the database on requests, rather than JWT claims. Removing membership denies subsequent requests using the same JWT. The last owner cannot be removed or demoted. Team membership changes and invitation acceptance serialize on a tenant row lock.

The first successful invitation converts a legacy PERSONAL tenant to ORGANIZATION in place, preserving its ID, installation, repositories, and history. This removes the old personal-owner recovery behavior and supports ownership transfer safely. No personal/company selection UI is introduced.

## Invitation lifecycle

- 32 random bytes, URL-safe encoding; only SHA-256 hashes persist.
- Seven-day expiry; single use; resend rotates the token and extends expiry.
- Revocation invalidates the link immediately.
- One unaccepted/unrevoked invitation per normalized team/email. Expired invitations can be resent or revoked.
- Twenty send attempts per inviter per rolling hour across teams and API processes, including delivery failures; a one-minute resend cooldown.
- Email links use /invite#token=... so the token is not sent in HTTP URLs, access logs, or Referer headers. The page moves the token into tab-scoped sessionStorage and removes the fragment. Preview/accept/register send the token in the JSON body. Do not configure infrastructure to log authentication or invitation request bodies.
- Preview includes only team name, role, and expiry, without account-existence details or an email address.
- New invite registration binds the email server-side, uses the existing password policy, and treats possession of the valid emailed link as email verification. It creates user + membership + acceptance atomically without a personal team.
- Existing users sign in normally and must have a matching verified email. Invitation registration never changes an existing account or password.
- Email sending happens within the invitation transaction. If sending fails, invitation changes roll back; a resend failure preserves the previous link. A process/database failure after SMTP handoff can deliver an unusable link; an owner can resend. There is no background email outbox.

## Login and cache behavior

A valid last-used membership is restored; otherwise the oldest remaining membership is selected. Users with no memberships follow existing owner onboarding. Shared-team users reach the dashboard even if an owner must reconnect GitHub. Initial standalone owners still complete the existing GitHub setup.

GitHub login accepts only the allowlisted /invite return path, carried in signed OAuth state. Invitation context survives email login, GitHub login, and OAuth errors in the same tab. A newly created GitHub account in that flow gets no personal workspace before acceptance.

The dashboard team switcher appears for multiple memberships. Switching cancels queries, clears the cache, and loads a fresh dashboard document. Team API access-denial responses clear cached data and re-resolve onboarding. The dashboard checks live access on entry, focus and every 15 seconds; a changed role/repository set clears query caches and reloads the dashboard to discard component state. Inaccessible resource responses trigger an access refresh. Backend revocation is immediate on subsequent requests, independent of polling. Report downloads fetch fresh authorized data. Sign-out and invitation acceptance clear caches too.

## API

All paths start with /api.

- GET /tenants/ - current user's teams and roles.
- GET /tenants/{id}/members - manager-only member name/email/role/joined date/repository_ids.
- PUT /tenants/{id}/members/{user_id}/repositories - manager-only replacement of a MEMBER's repository_ids.
- GET /tenants/{id}/access - current role and accessible active repository IDs, never cached.
- PATCH /tenants/{id}/members/{user_id} - role change.
- DELETE /tenants/{id}/members/{user_id} - remove member.
- GET/POST /tenants/{id}/invitations - pending list/create.
- POST /tenants/{id}/invitations/{invitation_id}/resend.
- DELETE /tenants/{id}/invitations/{invitation_id} - revoke.
- POST /invitations/preview - minimal token preview.
- POST /invitations/accept - authenticated acceptance.
- POST /invitations/register - invitation-bound registration/acceptance.
- POST /onboarding/workspace - authorized active-team selection.

The former direct POST /tenants/{id}/members endpoint is removed. Cookie-authenticated mutations retain CSRF checks. Public invitation registration requires possession of the invitation secret.

## Tests

Run the backend suite with:
`.venv\Scripts\python.exe -m pytest -q`

By default team API tests use SQLite; tests that require real PostgreSQL row locks are explicitly skipped. To run them, set TEAM_TEST_DATABASE_URL to a disposable PostgreSQL database. Each test creates and drops its own randomly named schema; never point this variable at a production database.

Coverage includes registration, existing-user acceptance, email mismatch/verification, unusable/reused tokens, SMTP failure, rate limits, rotation/revocation, role boundaries, last-owner protection, resource/CSV isolation, revoked membership with an existing JWT, zero/one/multiple-membership email and GitHub login, allowlisted redirects, secret redaction, concurrent invitation creation/acceptance, and concurrent owner demotions.

Frontend checks: npm run lint, npx tsc --noEmit --incremental false, npm run build.

Repository authorization tests additionally cover same-team unassigned IDs, filtered dashboard/trend/CSV counts, no assignments, immediate unassignment with the same JWT, pending invitation validation, indirect tracked findings, scanner APIs, and database cross-team constraints.
