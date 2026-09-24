// Deprecated runtime path:
// this logic has been ported client-side for privacy-first on-device scoring.
const levenshtein = require("fast-levenshtein");

const normalizeKannada = (s) =>
  String(s || "")
    .normalize("NFC")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'“”‘’\[\]।॥]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (s) => normalizeKannada(s).split(/\s+/).filter(Boolean);

const KN_SUFFIXES = [
  "ಗಳಿಗೂ","ಗಳಾದ","ಗಳಿಗೆ","ಗಳಿಂದ","ಗಳಲ್ಲಿ","ಕ್ಕಿಂತ","ಕ್ಕೆ","ಕ್ಕು",
  "ಯಿಂದ","ಯಲ್ಲಿ","ಯಾಗಿ","ಯನ್ನು","ಯರು","ಯೆ","ಯುವ",
  "ವಾಗಿ","ವಲ್ಲಿ","ವನು",
  "ತ್ತಿದ್ದೇನೆ","ತ್ತೇನೆ","ತ್ತಿದೆ","ತ್ತಿದ್ದ","ತ್ತಿದ",
  "ನಾದನು","ರಾದರು","ರಾಯಿತು","ರಾಗಿದ್ದ","ರಾದ",
  "ಯಿತು","ಯಿತು","ನೆ","ನು","ನ್ನು","ನಲ್ಲಿ","ದಲ್ಲಿ","ದಲ್ಲಿ",
  "ಗೆ","ಲಿ","ಕು","ಡು","ದೆ","ದು","ವು","ವಾ"
].sort((a,b)=>b.length-a.length);

const splitRootSuffixes = (token) => {
  const t = String(token || "");
  for (let suf of KN_SUFFIXES) {
    if (t.endsWith(suf) && t.length > suf.length) {
      return { root: t.slice(0, t.length - suf.length), suffixes: [suf] };
    }
  }
  return { root: t, suffixes: [] };
};

const editDistanceTokens = (a, b) => {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
};

const lcsAlignApprox = (a, b, approxEq) => {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (approxEq(a[i - 1], b[j - 1])) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const pairs = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (approxEq(a[i - 1], b[j - 1])) { pairs.push([i - 1, j - 1]); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  pairs.reverse();
  return pairs;
};

const stories = { default: "ನಾನು ಶಾಲೆಗೆ ಹೋಗುತ್ತೇನೆ" };
const resolveRef = (body) =>
  body.refText ? String(body.refText)
  : (body.storyId && stories[body.storyId]) ? stories[body.storyId]
  : stories.default;

// ---------- Pure metric helpers ----------
function computeNLED(body) {
  const { transcription, normalize = "token" } = body || {};
  const refText = resolveRef(body);
  const t = String(transcription || "");
  if (normalize === "char") {
    const r = normalizeKannada(refText), h = normalizeKannada(t);
    const edits = levenshtein.get(r, h);
    const denom = Math.max(r.length, h.length, 1);
    return { metric: "nled", value: edits / denom, edits, refLen: denom, mode: "char" };
  }
  const rTok = tokenize(refText), hTok = tokenize(t);
  const edits = editDistanceTokens(rTok, hTok);
  const denom = Math.max(rTok.length, hTok.length, 1);
  return { metric: "nled", value: edits / denom, edits, refLen: denom, mode: "token" };
}

function computeLDR(body) {
  const t = String(body?.transcription || "");
  const rTok = tokenize(resolveRef(body));
  const hTok = tokenize(t);
  const refCount = rTok.length, hypCount = hTok.length;
  const value = Math.abs(refCount - hypCount) / Math.max(refCount, hypCount, 1);
  return { metric: "ldr", value, refCount, hypCount };
}

function computeASR(body) {
  const confidence = body?.confidence;
  const arr = Array.isArray(confidence)
    ? confidence.map(Number).filter(Number.isFinite)
    : String(confidence || "")
        .split(/\s+/)
        .map(Number)
        .filter(Number.isFinite);
  const value = arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  return { metric: "asr_confidence", value };
}

function computeSuffix(body) {
  const t = String(body?.transcription || "");
  const rootMatch = body?.rootMatch || "levenshtein<=1";
  const suffixSet = body?.suffixSet ?? true;

  const rTok = tokenize(resolveRef(body)).map(splitRootSuffixes);
  const hTok = tokenize(t).map(splitRootSuffixes);

  const approxEq = (a, b) => {
    if (rootMatch === "exact") return a === b;
    if (rootMatch.startsWith("levenshtein<=")) {
      const k = Number(rootMatch.split("<=")[1] || 1);
      return levenshtein.get(a || "", b || "") <= k;
    }
    return a === b;
  };

  const rRoots = rTok.map(t => t.root), hRoots = hTok.map(t => t.root);
  const pairs = lcsAlignApprox(rRoots, hRoots, approxEq);

  let matchedSuffixes = 0, totalSuffixes = 0;
  for (const [i, j] of pairs) {
    const r = rTok[i], h = hTok[j];
    const rS = r.suffixes || [], hS = h.suffixes || [];
    totalSuffixes += rS.length;
    if (suffixSet) {
      const setH = new Set(hS);
      rS.forEach(s => { if (setH.has(s)) matchedSuffixes++; });
    } else {
      const m = Math.min(rS.length, hS.length);
      for (let k = 0; k < m; k++) if (rS[k] === hS[k]) matchedSuffixes++;
    }
  }
  const value = totalSuffixes ? matchedSuffixes / totalSuffixes : 1;
  return { metric: "suffix_accuracy", value, matchedSuffixes, totalSuffixes };
}

// ---------- Express handlers ----------
exports.nled = async (req, res) => res.json(computeNLED(req.body));
exports.ldr = async (req, res) => res.json(computeLDR(req.body));
exports.asrConfidence = async (req, res) => res.json(computeASR(req.body));
exports.suffixAccuracy = async (req, res) => res.json(computeSuffix(req.body));



// exports.scoreAll = async (req, res) => {
  // try {
  //   const nledRes = computeNLED(req.body);
  //   const ldrRes = computeLDR(req.body);
  //   const asrRes = computeASR(req.body);
  //   const suffixRes = computeSuffix(req.body);

  //   const simNLED = 1- nledRes.value;
  //   const simLDR = 1 - ldrRes.value;
  //   const asrVal = asrRes.value;
  //   const sufVal = suffixRes.value;

  //   // new simple length metric
  //   const refText = resolveRef(req.body);
  //   const refLen = refText.length;
  //   const hypLen = req.body?.transcription.length;
  //   console.log("Length check -> ref:", refLen, " hyp:", hypLen);

  //   const tolerance = 10; // allow ±10 tokens difference
  //   const lengthMatch = Math.abs(refLen - hypLen) <= tolerance ? 1 : 0;

  //   const pieces = [simNLED, simLDR, asrVal, sufVal, lengthMatch];
  //   combined = pieces.reduce((a, b) => a + b, 0) / pieces.length;
  //   if(combined < 0.8)
  //       combined += 0.2;
  //   const threshold = 0.7;
  //   passed = combined >= threshold;

  //   if(hypLen == 0) {
  //       passed = false;
  //       combined = 0; 
  //   }

  //   console.log(nledRes, ldrRes, asrRes, suffixRes, lengthMatch);

  //   // if(lengthMatch != 1) { //length is not right
  //   //     passed = false;
  //   //     combined = 0; 
  //   // }

  //   res.json({
  //     nled: nledRes,
  //     ldr: ldrRes,
  //     asr_confidence: asrRes,
  //     suffix_accuracy: suffixRes,
  //     length_match: { metric: "length_match", value: lengthMatch, refLen, hypLen },
  //     combined: {
  //       metric: "combined_avg",
  //       value: combined,
  //       passed,
  //       threshold,
  //       components: { simNLED, simLDR, asrConfidence: asrVal, suffixAccuracy: sufVal, lengthMatch }
  //     }
  //   });
  // } catch (e) {
  //   console.error("scoreAll error", e);
  //   res.status(500).json({ error: "scoreAll failed" });
  // }


exports.scoreAll = async (req, res) => {
  try {
    const transcription = normalizeKannada(req.body?.transcription || "");
    const refText = normalizeKannada(resolveRef(req.body));

    // 🔹 Auto-fail if empty transcription
    if (!transcription || transcription.length === 0) {
      return res.json({
        combined: {
          metric: "combined_simple",
          value: 0,
          passed: false,
          threshold: 0.65,
        },
        reason: "No transcription",
      });
    }

    // 🔹 Length check (too short → fail)
    if (transcription.length < refText.length * 0.3) {
      return res.json({
        combined: {
          metric: "combined_simple",
          value: 0,
          passed: false,
          threshold: 0.65,
        },
        reason: "Recording too short",
      });
    }

    // 🔹 Compute similarity with Levenshtein
    const edits = levenshtein.get(refText, transcription);
    const maxLen = Math.max(refText.length, transcription.length, 1);
    const similarity = 1 - edits / maxLen; // normalized similarity

    const threshold = 0.65;
    const passed = similarity >= threshold;

    console.log(similarity);

    res.json({
      transcription,
      reference: refText,
      similarity: { metric: "levenshtein_similarity", value: similarity },
      combined: {
        metric: "combined_simple",
        value: similarity,
        passed,
        threshold,
      },
    });
  } catch (e) {
    console.error("scoreAll error", e);
    res.status(500).json({ error: "scoreAll failed" });
  }
};


