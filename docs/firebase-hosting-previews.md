# Firebase Hosting PR previews

The `Firebase Hosting preview` workflow builds each same-repository PR and deploys its `dist` directory to a `pr-<number>` preview channel in the existing Firebase project **track-milk-pump**. Firebase's action comments on the PR with a mobile-accessible HTTPS URL. Later commits update the same channel. The channel expires seven days after its latest deployment.

This workflow deploys Hosting previews only. It does not deploy to the live channel, deploy Functions or Firestore rules, or enable the domain migration campaign. Fork and Dependabot PRs do not receive the deployment credential.

## One-time credential setup

Create the deployment credential in your own browser/computer and store it directly in GitHub; do not put it in the repository or paste it into chat.

1. Open [Google Cloud service accounts for track-milk-pump](https://console.cloud.google.com/iam-admin/serviceaccounts?project=track-milk-pump) and create a service account named `github-hosting-previews`.
2. Give it **Firebase Hosting Admin** (`roles/firebasehosting.admin`), **Firebase Authentication Admin** (`roles/firebaseauth.admin`), and **API Keys Viewer** (`roles/serviceusage.apiKeysViewer`). Hosting Admin deploys channels; Authentication Admin lets the CLI add their URLs to Auth's authorized domains; API Keys Viewer supports the CLI's project configuration lookup. Cloud Run Viewer is unnecessary for the current SPA-only Hosting rewrite.
3. On the service account's **Keys** tab, select **Add key → Create new key → JSON**.
4. Open [repository Actions secrets](https://github.com/ahmadnaufal-f/milk-tracker/settings/secrets/actions), select **New repository secret**, and name it **FIREBASE_SERVICE_ACCOUNT_TRACK_MILK_PUMP**. Paste the downloaded JSON into that secret.
5. Rerun the `Firebase Hosting preview` workflow for the PR. Alternatively, push another commit or reopen the PR. The URL will appear in Firebase's PR comment after deployment succeeds.

`GITHUB_TOKEN` is supplied automatically by GitHub; no personal token is needed. A missing Firebase service-account secret produces an explicit setup error before the build. The setup follows [Firebase's action service-account guide](https://github.com/FirebaseExtended/action-hosting-deploy/blob/v0/docs/service-account.md).

## Frontend configuration

The workflow contains the existing project's **public** Firebase web configuration, verified against `https://track-milk-pump.web.app/__/firebase/init.json`. These values identify the same app/project as production; they are not the private deployment credential. An optional repository variable `VITE_FIREBASE_API_KEY` can override the public API key if the project's key changes.

Configure public build variables under [repository Actions variables](https://github.com/ahmadnaufal-f/milk-tracker/settings/variables/actions) when those features are needed:

| Variable | Purpose |
| --- | --- |
| `VITE_RECAPTCHA_SITE_KEY` | Existing reCAPTCHA v3 public site key used by App Check. Add each preview hostname to the key's allowed domains, then rerun the preview build. App Check-enforced services require a valid token. |
| `VITE_FIREBASE_VAPID_KEY` | Existing public web-push key to enable notification setup on a preview origin. |

Firebase CLI preview deployment normally registers the preview hostname as a Firebase Auth authorized domain when its service account has the Authentication Admin role. Check that domain in Firebase Auth if a Google popup reports `auth/unauthorized-domain`. API-key HTTP-referrer restrictions, if configured, must also permit the preview hostname.

## Using a preview from your phone

Open the URL in the PR comment in your mobile browser. Preview URLs have their own browser storage, sign-in session, and PWA installation. **Auth, Firestore data, and callable Functions are shared with production**, as requested. Saving records or settings updates that same Firebase account; use records you intend to change. Preview deployments do not install the backend changes from the PR.

The migration notice and guest handoff intentionally require the confirmed old/new origins, so the workflow keeps them disabled on preview URLs. Opening `/migration` shows the disabled-campaign guidance. Reviewing the active migration notice and testing a full guest transfer requires the actual domains with the campaign enabled and its backend and rules deployed; the emulator integration suite covers UID/data preservation independently.
