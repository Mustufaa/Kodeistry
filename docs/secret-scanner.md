# Manual Secret Scanner

Secret Scanner is separate from pull request reviews. Only the authenticated Start Scan and Rescan action creates a run through POST /api/secret-scans. Webhooks, repository sync, login, page loads, and polling never create scans.

## Architecture

- The API checks tenant membership, connected repository state, the active GitHub App installation, and live GitHub access. Branches come from GitHub; users cannot submit clone URLs or server paths.
- PostgreSQL stores durable run state, finding identities, and per-run occurrences. A partial unique index prevents equivalent queued/running scans. Every results and disposition endpoint checks repository access.
- Start requests commit a job. Run the worker as a separate process. It claims jobs using a PostgreSQL advisory lock and row locks; leases let another worker recover interrupted jobs. Each process handles one scan at a time. Use no more worker replicas than SECRET_SCAN_MAX_CONCURRENT.
- The worker obtains an installation token just before Git fetch. It passes it only through a child process environment and GIT_ASKPASS. It does not put tokens in clone URLs, process arguments, database rows, or logs. Git hooks, global/system Git configuration, LFS smudge, and submodule recursion are disabled.
- Gitleaks 8.30.1 runs with a fixed project config and built-in provider rules. Its raw JSON report stays in a restricted temporary directory, then is deleted. Database rows contain metadata, [REDACTED], and keyed HMAC fingerprints. No source is sent to an LLM or posted to GitHub.
- Current files scans tracked regular files at the selected branch head. Git history scans commits reachable from that head, including secrets removed in later commits. Other branches and public sources are outside scope.
- A successful current-files run marks absent open findings removed only when no tracked files were skipped. Failed, cancelled, and limited-coverage runs leave prior dispositions unchanged. History mode does not mark findings removed because oversized blobs can be skipped.
- All findings are potential secrets. Credential validity is never checked. Dismissal applies to one finding identity and uses a fixed reason code.

Coverage limits: files over SECRET_SCAN_MAX_FILE_MB, Git LFS object contents, submodules, symlinks, and archives are not scanned. A history run fetches full reachable history and rejects a shallow checkout, but reports limited coverage because Gitleaks can skip oversized blobs. Scan time and temporary disk usage are bounded. The scanner never rotates credentials, rewrites history, or modifies repositories.

## Configuration

Add the names in backend/.env.example to the backend's private .env or deployment secret manager:

- SECRET_SCANNER_HMAC_KEY: a separate random key of at least 32 bytes. Keep it stable; changing it changes finding identities. Never commit it.
- GITLEAKS_PATH: path to the pinned 8.30.1 executable, or gitleaks if on PATH.
- SECRET_SCAN_MAX_SECONDS, SECRET_SCAN_MAX_DISK_MB, SECRET_SCAN_MAX_FILE_MB, SECRET_SCAN_MAX_CONCURRENT, SECRET_SCAN_MAX_QUEUED_PER_USER: optional limits.

The worker needs the same DATABASE_URL and GitHub App private key configuration as the API. Inject secrets at runtime. The frontend continues using its existing NEXT_PUBLIC_API_URL.

## Windows PowerShell: local run

Download the official executable outside Git and verify its published checksum:

~~~powershell
cd F:\Kodeistry\backend
$release = '8.30.1'
$archive = Join-Path $env:TEMP "gitleaks_$($release)_windows_x64.zip"
$checksums = Join-Path $env:TEMP "gitleaks_$($release)_checksums.txt"
Invoke-WebRequest "https://github.com/gitleaks/gitleaks/releases/download/v$release/gitleaks_$($release)_windows_x64.zip" -OutFile $archive
Invoke-WebRequest "https://github.com/gitleaks/gitleaks/releases/download/v$release/gitleaks_$($release)_checksums.txt" -OutFile $checksums
$expected = ((Get-Content $checksums | Where-Object { $_ -match "gitleaks_$($release)_windows_x64.zip$" }) -split '\s+')[0].ToLowerInvariant()
$actual = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw 'Gitleaks checksum mismatch' }
$scannerDir = Join-Path $env:LOCALAPPDATA 'Kodeistry\gitleaks-8.30.1'
Expand-Archive $archive -DestinationPath $scannerDir -Force
& (Join-Path $scannerDir 'gitleaks.exe') version
~~~

Generate a separate random fingerprint key and place it in the private backend .env as SECRET_SCANNER_HMAC_KEY. Do not paste it into a tracked file or terminal log:

~~~powershell
[byte[]]$keyBytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($keyBytes) } finally { $rng.Dispose() }
[Convert]::ToBase64String($keyBytes)
~~~

Also set GITLEAKS_PATH in the private backend .env to the full gitleaks.exe path. Then use three terminals. If port 8000 already serves an older Kodeistry API, stop that process before starting the API below; two servers cannot bind the same port:

~~~powershell
cd F:\Kodeistry\backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
~~~

~~~powershell
cd F:\Kodeistry\backend
.\.venv\Scripts\python.exe -m app.secret_scanner.worker
~~~

~~~powershell
cd F:\Kodeistry\frontend
npm.cmd install
npm.cmd run dev
~~~

After signing in, open http://localhost:3000/secret-scanner. The worker can stop and restart; queued jobs remain in PostgreSQL.

## Deployment

Build backend/Dockerfile.secret-scanner from the backend directory and deploy it as a separate service:

~~~powershell
cd F:\Kodeistry\backend
docker build -f Dockerfile.secret-scanner -t kodeistry-secret-worker:8.30.1 .
~~~

Provide database, GitHub App, and scanner HMAC variables through the deployment secret store. The container runs as UID 10001. Mount the private GitHub App key file readable by that UID if using GITHUB_PRIVATE_KEY_PATH, or inject GITHUB_APP_PRIVATE_KEY. Do not bake secrets into the image. Apply Alembic migration 7c4a1d93e5b2 before starting the new API and worker. Set a restart policy and temporary disk quota. The Dockerfile targets Linux x64; build an architecture-specific image for another CPU target.

## Verification

~~~powershell
cd F:\Kodeistry\backend
$env:GITLEAKS_PATH = Join-Path $env:LOCALAPPDATA 'Kodeistry\gitleaks-8.30.1\gitleaks.exe'
.\.venv\Scripts\python.exe -B -m pytest -q tests\test_secret_scanner.py
cd F:\Kodeistry\frontend
npx.cmd tsc --noEmit --incremental false
npm.cmd run lint
npm.cmd run build
~~~

The pinned commands and flags follow the [official Gitleaks usage guide](https://github.com/gitleaks/gitleaks#usage) and [v8.30.1 release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1).
