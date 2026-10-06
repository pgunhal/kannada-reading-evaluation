#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export GCLOUD_PROJECT=kkalisite-4fc4e
export REACT_APP_USE_FIREBASE_EMULATORS=false
unset FIRESTORE_EMULATOR_HOST FIREBASE_AUTH_EMULATOR_HOST DEBUG
# Set SPEAKING_BIND_OPENAI_SECRET=true only after creating the Firebase secret.
npx --yes firebase-tools@15.31.0 deploy --project "$GCLOUD_PROJECT" \
  --only functions:spLogin,functions:spPortal,functions:spTeacher,functions:spGenerate --non-interactive
npx --yes firebase-tools@15.31.0 hosting:channel:deploy speaking-portal \
  --project "$GCLOUD_PROJECT" --expires 30d --non-interactive
