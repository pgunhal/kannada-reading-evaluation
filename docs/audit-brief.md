# Kannada Kali audit handoff

Message to send with a sanitized source/review-branch link and `implementation.md`:

---

Please review Kannada Kali, a Kannada reading and quiz app for children, for privacy, security, student safety and usability.

**Live app:** https://kkalisite-4fc4e.web.app/app  
**Teacher login:** https://kkalisite-4fc4e.web.app/admin/login  
**Source/review branch:** [add link]  
**Technical walkthrough:** attached `implementation.md`

I’ll share mock-student credentials separately. The available accounts are `ananya.demo@example.test`, `kiran.demo@example.test`, and `meera.demo@example.test`. Use a separate browser profile for teacher access; request a dedicated test teacher account rather than using the project owner's account.

The current student flow is story reading → four choice questions → server-graded result, with up to three attempts after failure. Teachers can author/publish stories and view missing work, best scores and attempt history. Instructions are English; learning content is Kannada. The current UI does not record audio. Legacy audio code/data remains separate in the repository and should be included in the code/data inventory review.

Please focus on:

- **Privacy:** What identifiers, profiles, answers, scores, timestamps and telemetry are collected; who can read them; retention/deletion; logs, browser storage and third-party requests; whether the parent/student-facing explanation matches actual behavior. Check existing legacy records as well as new quiz data. Do not assume identity-linked scores are anonymous.
- **Authorization and security:** Student isolation; teacher class/center boundaries; current staff records versus cached role claims; private answer keys; direct Firestore access versus callable functions; server-side assignment/grading; retries and duplicate requests. Review deployed legacy functions too, not just the current source exports.
- **Student safety and content:** Story/question suitability, answer correctness, grading fairness, publication controls, and student-facing error/result language. There is no student free-text quiz input or chat.
- **UX and accessibility:** Mobile layout, Kannada rendering, keyboard/screen-reader use, contrast, answer selection, navigation, pausing/resuming reading, retries, and gradebook clarity. New signups currently need class assignment; review how clearly that is handled.

Please flag assumptions that aren't enforced. In particular, clipboard blocking is only a deterrent, and focus/visibility signals do not prove that a child is reading. The mock does not yet have a retention/deletion workflow or a class-enrollment UI.

This is a live project with existing records. Use only the mock accounts for ordinary walkthroughs. Run cross-account attacks, destructive tests and load tests against the local Firebase emulators or an isolated staging project. Do not alter unrelated students, stories or scores. Please avoid student-identifying information in shared screenshots or tickets.

For each finding, send: severity, affected screen/function, reproduction steps, expected versus actual behavior, impact, and a suggested fix. Separate release blockers from improvements and list anything you could not verify.

---

## Attachments and access

- Share the review branch plus `docs/implementation.md`, `docs/assessment.md`, and the relevant screenshot gallery. Older screenshots include legacy screens that are no longer routed; distinguish them from the live app.
- Highlight `functions/quiz.js`, `functions/quizCore.js`, `functions/gradebook.js`, `firestore.rules`, and `client/src/components/assessment/`.
- Share credentials privately. Do not send the owner login or service-account keys to the whole group.
- Exclude `.env*` values, credential JSONs, `mock-students.local.json`, local provisioning plans, debug logs, emulator exports, recorded audio/uploads and private datasets from a source archive. An audit handoff does not require exposing those records.
- There is no dedicated audit-teacher account yet. Provision one with the narrow test-class scope before teacher walkthroughs, or demonstrate that screen yourself.
