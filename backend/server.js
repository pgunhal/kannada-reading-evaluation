// require("dotenv").config({ path: "./.env" });


const express = require("express");
const dotenv = require("dotenv");
dotenv.config({ path: "./.env" });
const cors = require("cors");
const path = require("path");
const transcribeRoute = require("./routes/transcribeRoute");

dotenv.config({ path: path.resolve(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

// Routes
app.use("/api/transcribe", transcribeRoute);

// Startup
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
