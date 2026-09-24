# Test the live application

These steps use the deployed Firebase project, not localhost. Use mock accounts only. Live passwords are shared privately with the project owner and are not committed to GitHub.

## Accounts and links

| Role | Login | Email |
| --- | --- | --- |
| Student | [Student dashboard](https://kkalisite-4fc4e.web.app/app) | `testuser@example.com` |
| Teacher | [Teacher login](https://kkalisite-4fc4e.web.app/admin/login) | `testteacher@example.com` |

Use separate browser profiles or a normal window and a private window for the two roles. Tabs in the same profile share the Firebase login.

## Student

1. Open the student link and sign in. Expect **Dashboard**, four Kannada story cards, and English navigation. There should be no recording screen, microphone prompt, or recording consent.
2. Open an unfinished story. The Kannada passage should remain visible. Switch to another tab, wait a few seconds, and return: the reading timer should pause while away. Stay on the reader until the quiz becomes available.
3. Start the quiz. Expect four questions with selectable choices, no Kannada typing, and clickable answer labels. Select answers and submit.
4. Check the result, then return to Dashboard. The story status and colored card strip should agree: **New** yellow, **In progress** red, **Completed** green.
5. On a failed result, retry. There are at most **three total attempts**, not three extra retries. A passed story is complete. The sample banks contain 12 questions; smaller banks may reuse questions. Shared mock accounts retain previous progress, so use another supplied mock student or another story if an attempt limit has already been reached.
6. Reload and sign in again. Saved results should persist. Repeat at phone width and use Tab/Space to check answer controls.

## Teacher

1. In the other browser profile, open the teacher link and sign in. Expect the story editor/studio. This test account is scoped to the main center/class; it is not the owner's administrator account.
2. Open [Gradebook](https://kkalisite-4fc4e.web.app/admin/gradebook). Find **Test Student**. Work with no submitted attempt should be missing. Submitted work should show the highest score. Click the student to inspect every attempt and its result. Refresh after student submission.
3. Open [Stories](https://kkalisite-4fc4e.web.app/admin/stories). Inspect a sample's Kannada passage, choices, and answer keys. Do not change shared sample answer keys while others test.
4. To test authoring, create a separate story named **Audit test — your name**. Enter a passage and at least four valid choice questions with correct answers. Keep Publication set to Draft, save, reopen, and check that edits persist; use 12 distinct questions to exercise three nonrepeating attempts.
5. On Passage, set Publication to Published and click Save changes. New stories are assigned to the teacher’s center automatically. Refresh the student dashboard and confirm it appears. Return it to Draft when done; do not remove other testers' stories or results.
6. Sign out of the teacher account. A student should not be able to access teacher pages or the class gradebook.

For privacy/security testing, use the emulator instructions in [README](../README.md) and the [audit brief](audit-brief.md). Report the page URL, browser, role, steps, and expected/actual result. Never include real student data or access tokens in screenshots or reports.
