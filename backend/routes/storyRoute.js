const express = require("express");
const { getCurrentStory } = require("../controllers/storyController");
const router = express.Router();

// Example: current + previous story
router.get("/current", getCurrentStory);


module.exports = router; // ✅ export the router directly
