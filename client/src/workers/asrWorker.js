/* global globalThis */

import { transcribe } from "../lib/asrEngine";

async function handleTranscriptionRequest(message) {
  const { id, audioBuffer } = message.data || {};
  if (!id || !(audioBuffer instanceof ArrayBuffer)) {
    return;
  }

  let audio = new Float32Array(audioBuffer);

  try {
    const result = await transcribe(audio);
    globalThis.postMessage({ id, ok: true, result });
  } catch (error) {
    globalThis.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : "Local transcription failed.",
    });
  } finally {
    if (audio) audio.fill(0);
    audio = null;
  }
}

globalThis.onmessage = (message) => {
  handleTranscriptionRequest(message);
};
