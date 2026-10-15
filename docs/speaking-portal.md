# Weekly speaking portal — preview branch

This is the `feature/speaking-portal` branch. The existing live quiz application remains on `main` and the live Firebase Hosting channel. This branch is published only to the `speaking-portal` preview channel.

[Student preview](https://kkalisite-4fc4e--speaking-portal-tk4jjjxg.web.app/app) · [Teacher preview](https://kkalisite-4fc4e--speaking-portal-tk4jjjxg.web.app/admin/login) · [Full-page screenshots](speaking-screenshots/README.md)

Preview expires November 4, 2026 unless renewed.

## Simplified curriculum update

[Read all 40 revised Kannada paragraphs and questions](simple-kannada-readings.md). The four units are older film actors (Rajkumar era), Karnataka poets, Karnataka festivals, then Navaratri/Mysuru Dasara. Each targets Grade 2 reading with four or five short sentences and three direct questions. They are available as teacher-review drafts; previously published readings and grades remain unchanged.

## What changed

Students type a class, first name plus last initial, and a preassigned four-digit PIN. Their portal shows one assigned Kannada paragraph. Previous published weeks are available through Previous weeks. There is no quiz, timer, recording, student scoring, or typing exercise.

Teachers choose a topic and generate 10–15 different subjects within it (for example, ten different Karnataka actors). Each subject has one Kannada paragraph and three suggested oral questions. Generated material is always a draft. Teachers can edit paragraphs/questions, review the whole curriculum, and publish. Publication automatically assigns active students if assignments have not been set; teachers can also auto-assign or change assignments themselves. Each paragraph has at most two students; some paragraphs are unused when the roster is small. A class larger than twice the paragraph count must be split.

Teachers open Gradebook, choose a week, and click a student. The student's paragraph and instructor questions appear with a single 1–10 whole-number grade. The gradebook starts with the latest published week, shows Not presented where no grade exists, and includes each student's weekly history. Correcting a grade updates its current value and appends a server-side audit event. It is the current teacher grade, not a highest-quiz-attempt score.

Published paragraph text is locked so students do not prepare one version and get assessed on another. Assignments can change after publication until a student has been graded. The client sends a revision with every curriculum/grade mutation; stale edits fail rather than overwrite another teacher's work. Adding a student to the roster does not silently change old assignments: update assignments explicitly.

## Test accounts

Class: **Speaking Demo** (the server also accepts `speaking-demo`). Names are case-insensitive and a trailing period on the last initial is optional. Preserve leading zeroes in any new PINs.

| Student name | Test PIN |
| --- | --- |
| Ananya R | 1042 |
| Kiran S | 2083 |
| Meera P | 3194 |
| Arjun K | 4205 |
| Diya M | 5316 |
| Nikhil B | 6427 |
| Sahana G | 7538 |
| Vihaan N | 8649 |

These are explicitly synthetic preview accounts. Use no real children in this shared preview. Teacher login uses the existing mock teacher email/password, shared privately with the owner. The ignored `speaking-test-accounts.local.json` contains the complete access list.

Seeded curriculum is **hand-authored sample material**, not an actual OpenAI generation. The current seed creates four consecutive draft weeks in the requested topic order. The existing preview retains its previously published sample weeks for history testing. Teachers should review language, facts, and reading difficulty before using any sample or generated content in a real class.

## Test the flows

1. In a private window, open the preview `/app`. Enter Speaking Demo, Ananya R, and 1042. Expect one Kannada paragraph and no instructor questions. Expand Previous weeks and open the previous reading; return with This week.
2. In another browser profile, open the preview `/admin/login`. Sign in with the mock teacher account. Curriculum should show the current published week. Select the future draft to edit its paragraph and questions, then Save draft.
3. Check the Assignments table. Change a student's paragraph and Save assignments, or use Auto-assign. A third student on a paragraph should be rejected. On a draft, acknowledge review and Publish week. A future-dated week stays hidden from students until its date, even after publication; to test immediately, use a past/current unused date.
4. On Gradebook, select a published week and click Ananya R. Read the suggested oral questions, choose 1–10, and Save grade. Refresh: the score must persist. The student history should list both published weeks. Graded students cannot be reassigned.
5. On Roster, add a synthetic student or reset a test student's PIN. PINs are never displayed after saving. After a reset, the previous login session loses access on its next portal request; the old PIN no longer works.
6. On Curriculum, expand New week, choose an unused date and a topic, and choose 10–15 paragraphs. Generate draft calls OpenAI only after the API key is configured. Otherwise it shows a setup error and creates no week. Start a blank draft works without OpenAI.
7. Repeat at phone width and with keyboard navigation. The live `kkalisite-4fc4e.web.app` must continue to show the older app.

## Backend and privacy

All preview services are hosted in Firebase, not on the developer's computer. The preview shares project `kkalisite-4fc4e` but uses new `sp*` functions and collections. This is logical separation, not a separate cloud project. Existing quiz data, deployed quiz functions, Hosting live channel, and Firestore rules are unchanged. Current rules already deny every unmatched collection; speaking clients access records only through authorized callables.

| Function | Purpose |
| --- | --- |
| `spLogin` | Verify class/name/PIN and issue a Firebase custom token |
| `spPortal` | Return published week metadata and only the selected student's assigned paragraph |
| `spTeacher` | Authorize teacher class access, manage drafts/rosters/assignments, save grades, load gradebook |
| `spGenerate` | Authorize teacher, call OpenAI server-side, validate, save as draft |

`spClasses` stores class access; `spStudents` stores roster names and login UIDs. `spPins` stores scrypt hashes with random salts and a version, never plaintext PINs. A student token has a dedicated `speaking_student` role and its PIN version. Each portal request checks membership, active status, UID, and PIN version. A reset increments the version. Students cannot read other paragraphs, instructor questions, roster records, or grades directly from Firestore. Staff authorization reads the current `staffUsers` record and class teacher list rather than trusting a client-supplied role.

`spWeeks` stores draft/published curriculum and student-to-paragraph assignments. `spGrades` stores the current score per student/week; `spGradeEvents` preserves grade changes. `spLimits` stores hashed rate-limit bucket IDs, counts, and expiration times. Login allows eight requests per name/class and 80 per source IP per 15 minutes; generation allows five requests per teacher per hour. Expired buckets are reused. These controls mitigate guessing but do not make four-digit PINs equivalent to strong passwords. The preview needs a broader privacy/access review before real-student rollout.

The server does not send student names, PINs, assignments, or grades to OpenAI. Its request contains only the topic and paragraph count. The prompt targets Grade 2, 4–5 short sentences, about 20–45 words, and 3–4 concrete facts. Do not enter student personal information into the free-text topic. Generation uses the Responses API with strict structured output, `store: false`, and model `gpt-4.1`. Content validation checks count, unique titles, Kannada text, paragraph length, and 3–6 questions. This does not guarantee factual accuracy or Kannada quality; publication requires teacher review. No external factual-research tool is used. `store: false` does not itself promise zero provider retention; review OpenAI's applicable data policies before production use.

The IAM and IAM Credentials APIs are enabled for managed signing. The runtime service account has token-creator permission scoped to itself for Firebase custom-token signing. No downloadable service-account private key was created.

## OpenAI setup

Run locally; the CLI prompts for the secret. Do not paste it into chat, frontend environment files, or Git.

```sh
npx firebase-tools@15.31.0 functions:secrets:set SPEAKING_OPENAI_API_KEY --project kkalisite-4fc4e
SPEAKING_BIND_OPENAI_SECRET=true ./scripts/deploy-speaking-preview.sh
```

Use an OpenAI API project with billing enabled. A ChatGPT subscription alone does not configure API billing. The generation function is initially deployed without a secret binding so the rest of the preview can run; it returns a clear setup error until the above redeployment. Once enabled, preserve `SPEAKING_BIND_OPENAI_SECRET=true` on subsequent deployments. A generation failure/refusal produces no curriculum record. The frontend never receives the secret. Secret Manager supplies it at runtime.

Reference: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

## Deployment and validation

```sh
./scripts/deploy-speaking-preview.sh
```

The script deploys only the four new functions, builds the client with emulator mode disabled, and publishes a preview channel for 30 days. It never promotes the preview to live. `scripts/deploy.sh` refuses to publish this feature branch to the live channel. Re-run the preview deployment to renew its expiration. Publishing to production requires a separate release decision.

`functions/scripts/seedSpeaking.js` is idempotent: it creates only missing test documents and does not reset existing grades, PINs, or assignments. The CLI is emulator-only; cloud seeding was performed with verified project access and the existing owner OAuth session. For new real classes, provision a `spClasses` document (name, centerId, teacherUids), then add students through Roster.

```sh
npm --prefix functions run lint
npx firebase-tools@15.31.0 emulators:exec --only firestore --project demo-kkali-quiz-tests 'npm --prefix functions test'
CI=true npm --prefix client test -- --watchAll=false --runInBand
REACT_APP_USE_FIREBASE_EMULATORS=false npm --prefix client run build:firebase
```

The backend suite covers PIN hashing/leading zeroes, login rate limits, current staff authorization, draft isolation, paragraph filtering, assignment capacity, publication review, stale revisions, grade validation, PIN-reset invalidation, Firestore denials, and the OpenAI request contract with a mock transport. The provider integration still needs a real key for end-to-end generation testing. `emulators:exec` stops its emulator automatically after testing.

## Verified in the deployed preview

Student PIN login, one-paragraph display, previous-week access, and phone layout passed in Chromium. Teacher draft edits, grade saving, persisted scores after reload, roster display, and phone layout passed. The browser made no localhost requests and reported no JavaScript errors. The original live quiz site was separately checked: its email login and four-story dashboard still work. The preview includes a saved example grade of 8/10 for Ananya R.

Validation: 19 backend tests and 4 existing frontend tests passed, with Functions lint and the production build. All eight mock PINs were individually verified against the deployed login function. The test emulator was stopped afterward.

The deployed Generate draft flow was also checked without a configured key: it displays the explicit setup error and creates no curriculum. Real OpenAI generation remains unverified until the private key is supplied.
