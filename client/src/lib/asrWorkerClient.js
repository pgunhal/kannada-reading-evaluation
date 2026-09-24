let worker = null;
let requestId = 0;
const pendingRequests = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("../workers/asrWorker.js", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (event) => {
      const { id, ok, result, error } = event.data || {};
      const handlers = pendingRequests.get(id);
      if (!handlers) return;

      pendingRequests.delete(id);
      if (ok) handlers.resolve(result);
      else handlers.reject(new Error(error || "Local transcription failed."));
    };

    worker.onerror = (event) => {
      pendingRequests.forEach(({ reject }) => {
        reject(new Error(event.message || "ASR worker crashed."));
      });
      pendingRequests.clear();
    };
  }

  return worker;
}

export function transcribeInWorker(audioFloat32Array) {
  return new Promise((resolve, reject) => {
    if (!(audioFloat32Array instanceof Float32Array)) {
      reject(new Error("Expected Float32Array audio input."));
      return;
    }

    const activeWorker = getWorker();
    const id = `asr-${Date.now()}-${requestId += 1}`;
    pendingRequests.set(id, { resolve, reject });
    activeWorker.postMessage(
      { id, audioBuffer: audioFloat32Array.buffer },
      [audioFloat32Array.buffer]
    );
  });
}

export function terminateAsrWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  pendingRequests.forEach(({ reject }) => reject(new Error("ASR worker terminated.")));
  pendingRequests.clear();
}
