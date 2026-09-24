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

// Deprecated runtime path:
// scoring now lives in the browser so transcripts/audio never leave the device.
// These endpoints remain temporarily for reference during the client-side port.
router.post("/nled", nled);
router.post("/ldr", ldr);
router.post("/asr-confidence", asrConfidence);
router.post("/suffix-accuracy", suffixAccuracy);
router.post("/score-all", scoreAll);

module.exports = router;
