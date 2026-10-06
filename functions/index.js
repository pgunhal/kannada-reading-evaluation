const admin = require("firebase-admin");

admin.initializeApp();
Object.assign(exports, require("./quiz")(admin.firestore()));
Object.assign(exports, require("./speaking")(admin.firestore(), admin.auth()));
