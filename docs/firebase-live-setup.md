# Firebase deployment

Deployed on 24 September 2026 to **https://kkalisite-4fc4e.web.app**.

Live verification passed: student login, four assigned stories, active reading gate, safe assignment payload, server-saved score, teacher story creation/save, gradebook and attempt history. Temporary test accounts and records were removed. All 13 deployed application functions report ACTIVE on Node 22.

- Login no longer opens the old recording dashboard. Unassigned accounts see the new Dashboard with a class-assignment message. Recording consent was removed from signup.
- Teacher login: https://kkalisite-4fc4e.web.app/admin/login
- Existing administrator: `kkalisite@gmail.com`, using its existing Firebase Auth password. Sign out/in to refresh roles if already signed in.
- Four sample stories are published in the Kannada Kali center / Main class.
- Three mock students are provisioned: `ananya.demo@example.test`, `kiran.demo@example.test`, and `meera.demo@example.test`. They use `/app`, belong to Main class, and appear in Gradebook. Passwords are in the gitignored `mock-students.local.json`.
- Existing accounts, legacy stories, scores and older functions were retained. Existing student accounts still need explicit CMS class membership before using the new quiz flow; they were not automatically reassigned.
- Web configuration is already in ignored `client/.env.production.local`. Billing, Firestore and email/password sign-in are enabled.

For future updates, run from the repository root:

```sh
./scripts/deploy.sh
```

If the login has expired, run `firebase login --reauth` once, finish the browser prompt, then rerun the script. The script uses Firebase CLI 15.31.0, checks the project configuration, deploys only this repository's named functions plus Firestore policy/indexes, and publishes Hosting. It does not delete unrelated deployed functions.

The remaining sections are reference instructions for setting up a different project or adding students. Do not repeat project creation for the deployed site.

## Original setup reference

## What already runs on Firebase

The new app already saves story creation/edits, publication, reading progress, assigned quiz questions, submitted answers, grades and attempt history in **Firestore through Cloud Functions**. Firebase Auth handles login. Gradebook reads the same records. The localhost demo uses emulators. The deployed Hosting site saves those records in live project `kkalisite-4fc4e`.

Moving live changes the connection/deployment, not the scoring architecture. Browser `sessionStorage` holds only unfinished answer selections; grades are computed by the server. Story editing is local until **Save changes** succeeds.

## Code prepared in this handoff

- `client/src/firebaseConfig.js` now reads `REACT_APP_FIREBASE_*` environment values. No embedded fallback to the old Firebase project.
- `client/src/lib/firebaseSettings.js` isolates emulator/live configuration and rejects incomplete live configuration. Emulator mode never inherits a live Storage bucket.
- `client/.env.production.example` provides the required web configuration template.
- `client/scripts/checkFirebaseEnv.cjs` and `npm run build:firebase` check that Hosting builds explicitly disable emulators, contain real configuration, and match the deploy project when Firebase CLI supplies `GCLOUD_PROJECT`.
- `firebase.json` now configures Firebase Hosting for `client/build`, an SPA rewrite to `index.html`, appropriate static cache headers and a frontend predeploy build.
- `functions/scripts/provisionFirebase.js` prepares staff records, centers, classes, student roster and Auth custom claims from an explicit JSON plan. It validates locally by default; `--apply` writes. Optional `--with-demo-stories` adds the four sample stories without replacing existing sample IDs.
- Firestore rules now deny direct client story/question writes, keeping authoring behind validated functions. Direct roster/attempt reads check current staff records and volunteer class assignment, matching the gradebook's access model.
- Existing local emulator workflow and demo accounts continue to work. Live deployment is now complete; see the status above.

## 1. Firebase console setup — your part

1. Choose/create the target Firebase project and record its **project ID**, not its display name.
2. Enable **Authentication → Sign-in method → Email/Password**.
3. Create a **Cloud Firestore** database in Native mode; choose its location before adding data. The code uses the default database, `(default)`.
4. Register a **Web app** in Project settings and copy its Firebase web configuration values into the template below.
5. Enable the billing plan required for deploying Cloud Functions. Firebase's current Functions setup guide requires **Blaze** for production deployment. [Official Functions setup](https://firebase.google.com/docs/functions/get-started)
6. Ensure the deploy identity has permission to deploy Functions, Firestore rules/indexes and Hosting in that project. Complete any API-enablement prompts reported by Firebase CLI.
7. Add the Hosting/custom domain under Authentication's authorized domains as needed. For local testing against the live project, ensure your local development domain is authorized too.

The quiz/CMS needs Auth, Firestore, Functions and a frontend host. It does **not** require a Storage bucket, audio reference files, Express server, or AI API credentials. Storage and local speech-model assets are only for the separate legacy audio feature.

References: [Firebase email/password setup](https://firebase.google.com/docs/auth/web/start), [Firebase Hosting setup](https://firebase.google.com/docs/hosting/quickstart).

## 2. Supply frontend configuration

From the repository root:

```sh
cp client/.env.production.example client/.env.production.local
```

Edit the new file:

```dotenv
REACT_APP_USE_FIREBASE_EMULATORS=false
REACT_APP_FIREBASE_API_KEY=YOUR_WEB_API_KEY
REACT_APP_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT_ID.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
REACT_APP_FIREBASE_APP_ID=YOUR_WEB_APP_ID
```

Optional web config fields for Storage, sender ID and analytics are included in the template. Use the exact values from your Firebase Web app. The Functions client is explicitly `us-central1`, matching the existing server exports; region migration is not part of this setup.

These web values are compiled into the browser bundle and are not Admin credentials. **Never put a service-account private key in a `REACT_APP_*` variable.** Server credentials stay on your machine or trusted server. The local production file is gitignored.

CRA reads environment values at build/start time. Editing them requires rebuilding or restarting; it does not reconfigure an already deployed bundle. Shell environment variables override `.env` files. The existing `client/.env` can still supply local defaults, while `.env.production.local` wins for production builds unless the shell overrides it.

## 3. Install and deploy

Use Node 22 as specified by `functions/package.json`, and install Firebase CLI if it is not already available. Firebase's current documentation lists Node 22 and 22 support; this project remains on its configured Node 22 runtime. [Supported runtimes](https://firebase.google.com/docs/functions/manage-functions)

```sh
npm --prefix functions ci
npm --prefix client ci
firebase login

# Build and validate locally; this command does not deploy.
REACT_APP_USE_FIREBASE_EMULATORS=false npm --prefix client run build:firebase

# Deploy the backend, database policy/indexes, and frontend together.
REACT_APP_USE_FIREBASE_EMULATORS=false firebase deploy \
  --project YOUR_PROJECT_ID \
  --only firestore:rules,firestore:indexes,functions,hosting
```

Use `--project` explicitly: the repository's existing default alias still points to its original project. The Hosting predeploy hook runs `build:firebase`; the Functions predeploy hook runs lint. Hosting's rewrite makes direct visits to `/app/stories/...` and `/admin/gradebook` serve the React application instead of a 404.

For a pre-existing project, these rules replace the project's rules file, and its other application data may have additional access requirements. The checked-in rules retain the known legacy app's collections; reconcile any other production collections before deploying them.

The CLI reports the Hosting URL. The live site above was deployed on 24 September 2026. A local build alone does not publish subsequent edits.

## 4. Create accounts and provision membership

Create the teacher/student email-password users in the **target project's Firebase Authentication console**. Choose your own passwords; the emulator's `local-demo-only` accounts do not automatically exist in production. Copy the generated Auth UIDs.

Prepare a membership plan:

```sh
cp docs/firebase-provision.example.json firebase-provision.local.json
```

Edit names, center/class IDs and Auth UIDs. Example meaning:

```json
{
  "centers": [{"id": "main-center", "name": "Main center"}],
  "classes": [{
    "id": "grade-3", "name": "Grade 3", "centerId": "main-center",
    "teacherUids": ["ACTUAL_TEACHER_AUTH_UID"]
  }],
  "staff": [{
    "uid": "ACTUAL_TEACHER_AUTH_UID", "displayName": "Teacher",
    "role": "volunteer", "centerIds": ["main-center"]
  }],
  "students": [{
    "id": "student-001", "uid": "ACTUAL_STUDENT_AUTH_UID",
    "displayName": "Student", "classId": "grade-3", "centerId": "main-center"
  }]
}
```

The student application ID can differ from the Auth UID. Keep it stable: attempt IDs depend on student ID + story ID. Staff use Auth UIDs as their staff record IDs. Use `volunteer` for a class teacher, `coordinator` for a center coordinator, or `admin` for unrestricted CMS staff access.

The script uses **Application Default Credentials** through the Admin SDK. Supply a trusted server credential for the target project—for example, point `GOOGLE_APPLICATION_CREDENTIALS` at a service-account JSON stored outside the repository. Firebase CLI login and Admin SDK credentials are separate mechanisms. The identity needs Firestore data-write and Firebase Auth user/custom-claim permissions. [Admin SDK setup](https://firebase.google.com/docs/admin/setup)

```sh
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/server-credential.json
unset FIRESTORE_EMULATOR_HOST FIREBASE_AUTH_EMULATOR_HOST

# Validate references without contacting Firebase or writing anything.
node functions/scripts/provisionFirebase.js \
  --project YOUR_PROJECT_ID --file firebase-provision.local.json

# Write membership and claims to the explicit project.
node functions/scripts/provisionFirebase.js \
  --project YOUR_PROJECT_ID --file firebase-provision.local.json --apply
```

The script checks that every declared Auth user exists before writing membership. It does not create passwords or send invitations. It replaces CMS-related claims while preserving unrelated claims, removes the old `isAdmin` flag when applying roles, and writes class teacher lists from the plan. Users must sign out/in afterward to get fresh claims. [Custom claims](https://firebase.google.com/docs/auth/admin/custom-claims)

Writes span Firestore and Auth and cannot be one atomic transaction. If a credential/network error interrupts the run, correct it and rerun the same plan. It is designed to converge by merging declared records and replacing declared membership fields. It does not delete accounts or records omitted from the plan and is not a bulk roster deletion tool.

## 5. Add stories

Either sign in as the teacher and use **Story studio → New story**, author the passage/questions, then Publish, or provision the four built-in sample stories:

```sh
node functions/scripts/provisionFirebase.js \
  --project YOUR_PROJECT_ID --file firebase-provision.local.json \
  --apply --with-demo-stories
```

The optional import creates IDs beginning `sample-demo-`, twelve questions per story, and assigns them to the first center in your plan. It skips an already existing sample story entirely, preserving your edits and bank. It does not import emulator users, passwords, scores or attempt history. Newly published teacher-authored stories use the teacher's first assigned center; class scoping can be set in trusted Firestore/admin tooling, as the current editor has no assignment-picker UI.

## 6. Verify that live data is saved

1. Visit the deployed Hosting URL. Sign in as your provisioned teacher.
2. Create or edit a story and click **Save changes**. In Firestore, inspect `stories` and `questions`.
3. Sign in as a provisioned student in another browser profile. Open the published story. Inspect `attempts`, `attemptKeys` and `assessmentProgress` in the Firebase console.
4. Reading time should update on the focused page. Switch tabs to verify it pauses.
5. Finish reading and start the quiz. The browser should receive only assigned prompts/choices; private keys remain server-side.
6. Submit. Inspect the attempt's server-generated `score`, `passed`, `answers` and `submittedAt` fields.
7. Refresh the teacher Gradebook. Confirm the student's highest score and missing count; select the student to see the attempt history.
8. Close/reopen the browser and confirm the data persists. This is now live Firestore persistence, independent of the local emulator process.

If no stories appear, check Published and center/class assignment. If login works but access fails, check the custom claims, `staffUsers`, class teacher UIDs, and student membership. If browser requests still go to `127.0.0.1:9099`, `:8080`, or `:5001`, you are running an emulator build; rebuild with emulator mode false.

## Boundaries

This prepares the existing Firebase architecture for a live deployment; it is not a migration of old browser audio grades into trusted quiz grades. The separate audio `scores` collection is already Firestore-backed but remains client-calculated. The 24 September deployment added CMS membership for the existing administrator and four sample stories, deployed the functions/rules/indexes, and published Hosting. Existing student accounts were not automatically assigned to the new class.
