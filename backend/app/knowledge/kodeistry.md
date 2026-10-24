# Verified Kodeistry knowledge for Kody

## Product
Kodeistry reviews GitHub pull requests with AI and presents findings about bugs, security, performance, and code quality. Its dashboard lets signed-in users view repositories, review runs, and findings. Kody provides general guidance only; it cannot access or inspect a visitor's account or perform actions.

## Sign-in and onboarding
Visitors can register at /register, verify their email, and sign in at /login. The login page also offers GitHub OAuth for identity. GitHub OAuth sign-in is separate from the GitHub App that grants selected repository access. After sign-in, onboarding guides users through installing the Kodeistry GitHub App and selecting repositories. The app creates a personal workspace automatically; users are not asked to choose a workspace during current onboarding.

## GitHub repositories and pull requests
Use /settings/integrations/github to install or manage the GitHub App. The installation grants access only to repositories selected in GitHub. The GitHub settings page can synchronize available repositories. Connected repositories appear at /repositories. Pull request review runs appear at /reviews, with detail at /reviews/[id]. The backend can submit inline GitHub review comments for findings when review processing succeeds.

## Findings and reports
Review findings appear at /findings. The /analytics page shows trends and summaries, and /analytics/reports supports CSV report downloads. Fix suggestions and copyable prompts are available from supported finding detail workflows; they are guidance, not automatic code changes.

## Coming soon
The separate Secret Scanner page at /secret-scanner is marked Coming Soon in the dashboard. Do not present it as an available on-demand product feature.

## Troubleshooting
If repositories are missing: 1. Check that GitHub sign-in is complete. 2. Visit /settings/integrations/github and confirm the Kodeistry GitHub App is installed. 3. In GitHub, confirm that the intended repositories were selected for the installation. 4. Return to the GitHub settings page and synchronize repositories. 5. Check /repositories again. Do not claim to have checked the user's account or GitHub installation.

If a review is missing: check that the repository is connected, then inspect /reviews after a pull request is opened or updated. Processing may take time. Do not promise a completion time.

## Verified internal links
/, /register, /login, /onboarding, /onboarding/github, /dashboard, /repositories, /reviews, /findings, /analytics, /analytics/reports, /settings/integrations/github, /secret-scanner.
