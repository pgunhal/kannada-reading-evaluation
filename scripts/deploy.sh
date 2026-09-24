#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export REACT_APP_USE_FIREBASE_EMULATORS=false
export GCLOUD_PROJECT=kkalisite-4fc4e
unset FIRESTORE_EMULATOR_HOST FIREBASE_AUTH_EMULATOR_HOST DEBUG

(cd client && node scripts/checkFirebaseEnv.cjs)

kkali_targets=$(node -e 'console.log(Object.keys(require("./functions/index.js")).map(name => `functions:${name}`).join(","))')
npx --yes firebase-tools@15.31.0 deploy --project "$GCLOUD_PROJECT" \
  --only "$kkali_targets,firestore:rules,firestore:indexes" --non-interactive
npx --yes firebase-tools@15.31.0 deploy --project "$GCLOUD_PROJECT" \
  --only hosting --non-interactive
