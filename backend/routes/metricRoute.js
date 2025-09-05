const express = require("express");
const router = express.Router();

const {
  nled,
  ldr,
  matchRatio,
  asrConfidence,
  suffixAccuracy,
  scoreAll,
} = require("../controllers/metricController");

// Each expects JSON with { transcription, ... } and optionally { confidence }.
// They do not accept audio; audio goes to /api/transcribe.
router.post("/nled", nled);
router.post("/ldr", ldr);
router.post("/asr-confidence", asrConfidence);
router.post("/suffix-accuracy", suffixAccuracy);
router.post("/score-all", scoreAll);

module.exports = router;
