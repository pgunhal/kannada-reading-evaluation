const fs = require("fs");
const path = require("path");
const speechClient = require("../utils/gcloudClient");

exports.handleTranscription = async (req, res) => {
  try {
    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath);

    const audio = { content: fileContent.toString("base64") };
    const config = {
      encoding: "WEBM_OPUS",
      sampleRateHertz: 48000,
      languageCode: "kn-IN",
      audioChannelCount: 1,
    };

    console.log("ABOUT TO TRANSCRIBE");

    const [response] = await speechClient.recognize({ config, audio });

    const transcription = response.results
      .map((r) => r.alternatives[0].transcript)
      .join(" ");
    
    const confidence = response.results
      .map((r) => r.alternatives[0].confidence)
      .join(" ");    console.log(confidence)
    
    console.log(transcription);
    console.log("DONE");

    fs.unlinkSync(filePath); // delete temp file
    res.json({ "transcription": transcription, "confidence" : confidence });
  } catch (err) {
    console.error("STT error:", err);
    res.status(500).json({ error: "Transcription failed." });
  }
};
