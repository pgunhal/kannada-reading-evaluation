# Kannada Kali: reading and instructor demo

## Open the running app

- Student shelf: http://localhost:3000/app
- Instructor login: http://localhost:3000/admin/login
- Instructor story studio: http://localhost:3000/admin/stories
- Class gradebook: http://localhost:3000/admin/gradebook

| Role | Email | Password |
|---|---|---|
| Student | `student@example.test` | `local-demo-only` |
| Instructor | `teacher@example.test` | `local-demo-only` |

These are local emulator accounts. Use separate browser profiles or a private window to test both roles simultaneously, since tabs in the same browser profile share the Firebase login.

## Test the student experience

1. Sign in as the student. The Dashboard shows four stories: Rama’s garden, a rainy day, the library, and friends cleaning a playground. Each has a 12-question bank.
2. Open any story. The entire Kannada passage appears immediately. Reading progress begins only while this reading page is visible and its window is focused.
3. Switch tabs, minimize the window, switch applications, or return to the shelf. Reading time pauses. Return to the story to continue. Previously credited active time survives navigation and reloads.
4. Once reading time is complete, open the quiz. Answer four questions using the choice cards. There are no typing inputs for children, including fill-in-the-blank questions. Keyboard Tab/arrow keys and touch/click selection work through native radio controls.
5. Use **Read the story again** at any point in the quiz. Your answers remain selected when you resume. Browser-session answer drafts also survive refreshes; grades are never computed from those drafts.
6. Finish the quiz. If the score is below 70%, **Read & try again** starts the next attempt, including another active reading period. A story allows three attempts total. Passing, pending human review on a legacy attempt, or exhausting all three attempts prevents further retries. Completed stories remain readable.
7. With the standard 12-question bank, each of the three attempts gets four different questions. If fewer unseen questions remain, the function fills the assignment from previously used questions. A smaller bank can therefore support retries with repeated questions. Each individual quiz still needs at least four distinct eligible questions.

Changing the browser clock, reloading, duplicate requests, or opening multiple windows does not reset the server’s attempt counter. Repeated submissions return the saved grade.

## Test the instructor experience

1. Open a private window and sign in at `/admin/login` with `teacher@example.test` / `local-demo-only`. You will land in **Story studio**. The student and instructor screens use English instructions, buttons and navigation, Kannada learning content, and the original red/yellow palette.
2. Select a story. The **Passage** tab lets you edit its title and body. Choose **Save changes**. Existing attempts keep their original passage and questions; new attempts use the updated content.
3. Change **Publication** to **Draft** and save. The story disappears when the student reopens the shelf. Choose **Published** and save to restore it.
4. Open **Questions (12)**. Edit each question’s prompt, difficulty, type, choices and correct answer. Use **Add question** to add a question, or **Remove** to remove one. Changes take effect when saved. Fill-in-the-blank questions also require choices; children never type answers. Aim for 12 different questions. Publishing requires at least four valid questions; smaller banks reuse questions across attempts.
5. Choose **New story** to create a draft. Add the title, passage and questions, then publish it. New demo stories use the teacher’s assigned center. New stories appear on the student shelf after publication.
6. Open **Student progress** and choose **Refresh progress**. Each attempt appears separately with its number, current status and server-computed score. Complete or retry a student quiz in the other window, then refresh to see the result.
7. Open **Gradebook** in the top navigation. Every rostered student appears, including those with no attempts. Each story column shows the highest submitted score or **Missing**; the missing count includes stories still being read or answered. Only published stories assigned to the student’s class are counted. Click a student’s name for their complete attempt list, scores and submission times. **Refresh** loads new results.
8. The old Answer review page is removed from navigation and redirects to Gradebook. Choice-only quizzes need no cloze review screen; the legacy server review functions remain available for historical data.

The mock roster includes Demo student, Ananya, Kiran and Meera. The latter three have no attempts so you can see missing work.

The demo CMS supports story creation, passage and question-bank editing, draft/publication controls, and attempt history. AI generation, roster/PIN administration and publishing/version-history tools are not part of this mock. Question IDs are preserved when editing existing questions; newly added questions receive server-generated IDs. Existing attempt snapshots stay immutable.

## Start locally after stopping the servers

Use Node 22 and the Firebase CLI. From the repository root:

```sh
npm --prefix functions ci
firebase emulators:start --only auth,firestore,functions --project demo-kkali-quiz
```

In another terminal:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node functions/scripts/seedQuizEmulator.js
REACT_APP_USE_FIREBASE_EMULATORS=true npm --prefix client start
```

Run the seed after each fresh emulator startup unless you export/import emulator data. It replaces only the four demo stories and their question banks, preserves attempts and provisions the demo account claims. It refuses to run without both emulator host variables. It always targets `demo-kkali-quiz`.

## Implementation boundaries

- `listStudentStories` returns class/center-scoped story metadata and the latest attempt status.
- `startReading` creates or resumes the current attempt. A retry sends `retryFromAttemptId`; a Firestore transaction checks that the current attempt failed and the next number is at most three. Concurrent or replayed retries resume the newly created attempt instead of consuming another retry. Historical attempts are retained. `assessmentProgress` is a server-only pointer to the current attempt.
- `readingHeartbeat` accepts short foreground-reading intervals. The browser observes page visibility and window focus, and stops collecting intervals on blur/hide/unmount. The server caps each credit to the reported active interval, elapsed server time and three seconds. Session ownership and sequence numbers prevent duplicate credit and simultaneous-window accumulation. Long scheduling gaps after sleep do not count. The server gates assignment on the accumulated reading time; it never uses a browser-supplied total. Browser visibility is still a client signal, not proof of attention or protection against someone deliberately spoofing ongoing heartbeats.
- `assignQuiz` chooses and persists the assignment server-side, preferring question IDs not used in prior attempts. It prefers difficulty coverage among unseen questions and falls back to reused questions when needed. Options are shuffled once. The bank and answer keys stay in `attemptKeys`, inaccessible to client SDKs. Public question payloads use an explicit allowlist.
- `submitAttempt` grades raw responses against the private snapshot and ignores client score/correctness fields. Choice-based cloze is exact graded; historical typed cloze retains NFC normalization and near-miss review logic.
- `listCmsStories`, `createCmsStory` and `saveCmsStory` check the current staff record and center access. Attempt history also checks class assignment for volunteers. Staff editing does not rewrite prior attempts.
- Copy/cut/paste/context-menu/drag listeners and selection CSS apply only while viewing passages or quizzes. Results, the shelf, and instructor editing permit normal selection/copy/paste. Paste telemetry never affects grades. Content remains accessible DOM text.
- Question banks currently use one private Firestore snapshot document per attempt, subject to the document-size limit. Larger deployments may need chunked snapshots.
- The old audio app and its browser-computed `scores` collection remain separate. They are not trusted quiz grades. CMS accounts use `role` claims and `staffUsers`; legacy `isAdmin` alone does not grant CMS access.

## Automated checks

With a Firestore emulator already running:

```sh
npm --prefix functions run lint
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm --prefix functions test
CI=true npm --prefix client test -- --watchAll=false --runInBand
npm --prefix client run build
```

Or start an isolated emulator test run:

```sh
firebase emulators:exec --only firestore --project demo-kkali-quiz-tests 'npm --prefix functions test'
```

The integration tests use `demo-kkali-quiz-tests`, a separate database from the interactive demo. They cover forged writes, private reads, offscreen wall time, heartbeat replay/session ownership, twelve unique assignments, small-bank reuse, concurrent retries, three-attempt enforcement, passing locks and instructor access, story creation, bank editing and publish validation. React tests verify focus/visibility/unmount timer pauses and clipboard listener cleanup. Local browser checks cover mobile layout, native radio interaction, reading/quiz navigation, retries and instructor screens.

Live deployment completed on 24 September 2026: https://kkalisite-4fc4e.web.app. Use the existing kkalisite@gmail.com administrator account for teacher access. Future updates: run ./scripts/deploy.sh from the repository root. Existing student accounts need explicit CMS class assignment; legacy scores were not migrated.
