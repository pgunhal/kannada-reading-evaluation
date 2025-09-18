const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.resolve(__dirname, ".env") });

const express = require("express");
const cors = require("cors");

const metricRoute = require("./routes/metricRoute");
const storyRoute = require("./routes/storyRoute");


const app = express();
const PORT = process.env.PORT || 5000;

const ORIGINS = [
  process.env.FRONTEND_ORIGIN || "http://localhost:3000",
  "http://127.0.0.1:3000", "https://bakannadakali.netlify.app"
];

app.use(cors({
  origin: ORIGINS,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false
}));

// make sure preflights get the headers
app.options("*", cors({
  origin: ORIGINS,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false
}));

app.use(express.json());

app.use("/api/metrics", metricRoute);
app.use("/api/story", storyRoute);


app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
