# Kannada Kali

Kannada story reading and choice-based quizzes for students, with teacher authoring and a class gradebook. React frontend, Firebase Auth, Firestore, and Cloud Functions. Question assignment and grading run on the server.

- Student app: https://kkalisite-4fc4e.web.app/app
- Teacher login: https://kkalisite-4fc4e.web.app/admin/login
- [Implementation guide](docs/implementation.md)
- [Deployment instructions](docs/firebase-live-setup.md)
- [Privacy/security/UX audit brief](docs/audit-brief.md)
- [Full-page screenshots](docs/screenshots/README.md) — includes historical legacy screens, marked in the gallery.

## How to test

Open the student app in a private window and sign in with a supplied mock account, such as `testuser@example.com` (credentials shared separately). Open a story, switch tabs to check that reading time pauses, return and complete the four-question quiz. Confirm that a passing result completes the story, a failed result allows another attempt, and no story allows more than three total attempts; all answers use choices rather than typing. In a separate browser profile, sign in as a teacher, edit/save a story and its questions, check Draft/Published visibility, then refresh Gradebook to confirm missing work and the student's highest score. Click the student to check the full attempt history. Repeat the main flow at mobile width and with keyboard navigation. Use only mock accounts on the live site; use Firebase emulators for destructive or security tests.

## Local development

Use Node 22. Install dependencies:

```sh
npm --prefix functions ci
npm --prefix client ci
```

Start emulators:

```sh
npx --yes firebase-tools@15.31.0 emulators:start \
  --only auth,firestore,functions --project demo-kkali-quiz
```

In another terminal, seed and start the frontend:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
node functions/scripts/seedQuizEmulator.js
REACT_APP_USE_FIREBASE_EMULATORS=true npm --prefix client start
```

Local accounts: `student@example.test` and `teacher@example.test`, password `local-demo-only`. These are emulator-only accounts. Reseeding replaces the four demo story banks; see the implementation guide before reseeding edited content.

## Checks

With the Firestore emulator running:

```sh
npm --prefix functions run lint
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm --prefix functions test
CI=true npm --prefix client test -- --watchAll=false --runInBand
```

## Deploy

Configure the ignored `client/.env.production.local` from `client/.env.production.example`, authenticate with Firebase, then run:

```sh
./scripts/deploy.sh
```

The script targets `kkalisite-4fc4e`. It deploys named application functions, Firestore rules/indexes, and Hosting, preserving unrelated deployed functions.

## Repository scope

`client/src/components/assessment`, `functions/quiz.js`, `functions/quizCore.js`, `functions/gradebook.js`, and `firestore.rules` implement the current app. Legacy audio sources remain for reference, but recording screens are no longer routed. Dependencies, local environments, recordings, private credentials, logs, and generated training data should remain outside Git.
