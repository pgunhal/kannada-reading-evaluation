# Exposed legacy service-account key: remediation

On 2026-09-24, Google disabled a key for `speech-transcriber@kannada-kali-site.iam.gserviceaccount.com` because it was exposed in an old GitHub commit of `backend/.env`. The key identifier ended in `341d793`.

## Completed

- Confirmed IAM reported `SERVICE_ACCOUNT_KEY_DISABLE_REASON_EXPOSED`.
- Permanently deleted the exposed key at 20:40:57 UTC. A subsequent IAM listing returned no user-managed keys for that service account.
- Removed the credential from the ignored local `backend/.env`.
- Scanned tracked files and ZIP archive contents for private-key material; none found in the current tree.
- Expanded Git ignore rules to exclude environment files while retaining sanitized `.env.example` and `.env.*.example` templates.
- Confirmed both `kannada-kali-site` and the current app project, `kkalisite-4fc4e`, report lifecycle state `ACTIVE`.
- Verified all four live mock student logins and story lists, plus teacher login, studio navigation, and gradebook access after deletion.

The current application uses managed Cloud Functions credentials and Firebase Authentication. It does not depend on the legacy speech key, so no replacement was created. Do not re-enable a compromised credential or create a new downloadable private key for this application.

## Scope and remaining limitations

A 30-day Cloud Audit Logs query scoped to this key returned Google's disable event and our deletion event. This is not proof that the key was never abused: older activity, services without enabled data-access logs, and events without a key identifier are outside that check. Billing and a broader incident investigation were not performed.

Old Git history still contains the revoked credential. Current source and archives do not. Deletion in IAM makes old copies unusable; removing historical copies is a separate coordinated history rewrite and GitHub cache/fork cleanup. No history was rewritten or force-pushed during this remediation.

Project lifecycle `ACTIVE` alone does not establish the status of every API or billing service. The live app checks above establish that its tested authentication, story-list, and teacher-gradebook flows continued to work.

Reference: [Google Cloud guidance for compromised credentials](https://docs.cloud.google.com/docs/security/compromised-credentials).
