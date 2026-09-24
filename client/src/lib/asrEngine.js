/* global globalThis */

const DEFAULT_MODEL_ID = process.env.REACT_APP_ASR_MODEL_ID || "onnx-community/whisper-tiny";
const DEFAULT_MODEL_PATH = process.env.REACT_APP_ASR_MODEL_PATH || "/models/";

let pipelinePromise = null;

function getDevicePreference() {
  return typeof navigator !== "undefined" && navigator.gpu ? "webgpu" : "wasm";
}

async function loadTransformers() {
  const module = await import("@huggingface/transformers");
  const { env, LogLevel } = module;

  env.logLevel = LogLevel.ERROR;
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.localModelPath = DEFAULT_MODEL_PATH;
  env.useBrowserCache = true;
  env.useCustomCache = false;
  env.remoteHost = globalThis.location.origin;

  return module;
}

async function getTranscriber(progressCallback) {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline } = await loadTransformers();
      return pipeline("automatic-speech-recognition", DEFAULT_MODEL_ID, {
        device: getDevicePreference(),
        progress_callback: progressCallback,
      });
    })().catch((error) => {
      pipelinePromise = null;
      throw error;
    });
  }

  return pipelinePromise;
}

export async function transcribe(audio, { language = "kannada", task = "transcribe", progressCallback } = {}) {
  const transcriber = await getTranscriber(progressCallback);
  const output = await transcriber(audio, {
    language,
    task,
  });

  return {
    text: String(output?.text || "").trim(),
    avgLogProb: Number.isFinite(output?.avg_logprob) ? output.avg_logprob : null,
  };
}
