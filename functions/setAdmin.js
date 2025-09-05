const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function makeAdmin(uid) {
  await admin.auth().setCustomUserClaims(uid, { isAdmin: true });
  console.log(`✅ User ${uid} is now an admin`);
  process.exit();
}

// pass uid as arg: node setAdmin.js <UID>
makeAdmin(process.argv[2]);
