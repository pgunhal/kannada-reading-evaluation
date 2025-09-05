const fs = require("fs");
const path = require("path");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("@ffprobe-installer/ffprobe").path;
const ffmpeg = require("fluent-ffmpeg");
const speechClient = require("../utils/gcloudClient");

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

function splitToWav(filePath, chunkDir, chunkLengthSec = 50) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(chunkDir, { recursive: true });

    // force re-encode into WAV PCM 16-bit chunks
    ffmpeg(filePath)
      .audioCodec("pcm_s16le")
      .audioFrequency(16000)
      .audioChannels(1)
      .format("wav")
      .output(path.join(chunkDir, "out%03d.wav"))
      .outputOptions([
        "-f segment",
        `-segment_time ${chunkLengthSec}`,
        "-reset_timestamps 1",
      ])
      .on("end", () => {
        const files = fs
          .readdirSync(chunkDir)
          .filter(f => f.endsWith(".wav"))
          .map(f => path.join(chunkDir, f));
        resolve(files);
      })
      .on("error", reject)
      .run();
  });
}

exports.handleTranscription = async (req, res) => {
  try {
    const filePath = req.file.path;
    const chunkDir = path.join("uploads", "chunks_" + Date.now());

    // Always split into <55s WAV PCM chunks
    console.log("Forcing split to WAV chunks...");
    const audioFiles = await splitToWav(filePath, chunkDir, 50);

    const config = {
      encoding: "LINEAR16",
      sampleRateHertz: 16000,
      languageCode: "kn-IN",
      audioChannelCount: 1,
      enableAutomaticPunctuation: true,
    };

    let transcripts = [];
    let confidences = [];

    for (const af of audioFiles) {
      console.log(`Sending chunk: ${af}`);
      const content = fs.readFileSync(af).toString("base64");
      const audio = { content };

      const [response] = await speechClient.recognize({ config, audio });

      response.results.forEach(r => {
        if (r.alternatives?.[0]) {
          transcripts.push(r.alternatives[0].transcript);
          confidences.push(r.alternatives[0].confidence || 0);
        }
      });
    }

    const transcription = transcripts.join(" ");
    const confidence =
      confidences.length > 0
        ? (confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(3)
        : 0;

    console.log("DONE");

    // cleanup
    fs.unlinkSync(filePath);
    if (fs.existsSync(chunkDir)) {
      fs.readdirSync(chunkDir).forEach(f => fs.unlinkSync(path.join(chunkDir, f)));
      fs.rmdirSync(chunkDir);
    }

    res.json({ transcription, confidence });
  } catch (err) {
    console.error("STT error:", err);
    res.status(500).json({ error: "Transcription failed." });
  }
};
