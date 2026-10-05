# Test commands

Run the frontend and Cloud Functions unit suites from the repository root with:

```sh
npm run test:unit
```

To run only the Cloud Functions unit suite:

```sh
npm --prefix functions run test:unit
```

Run the guest migration Firebase integration suite with:

```sh
npm run test:integration
```

This builds the Functions code, then starts only the Auth, Firestore, and Functions emulators with project ID `demo-milk-tracker-migration`. The test refuses to run unless the Functions emulator supplies that exact project ID. It uses isolated anonymous Auth clients and Firestore client SDK reads/writes, and calls the exported callable endpoints. It does not need Firebase credentials or `.env` files. Java 21 is required; the Firebase CLI downloads emulator binaries on first use. Set `FIREBASE_EMULATORS_PATH` to a task-specific cache directory when the default cache location is unavailable.

The CI workflow runs the unit and emulator suites, then builds the frontend and Cloud Functions, checks TypeScript, and runs ESLint.
