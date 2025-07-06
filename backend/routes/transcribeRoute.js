const express = require("express");
const router = express.Router();
const multer = require("multer");
const { handleTranscription } = require("../controllers/transcribeController");

const upload = multer({ dest: "uploads/" });

router.post("/", upload.single("audio"), handleTranscription);

module.exports = router;
