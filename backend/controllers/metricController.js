// controllers/metricController.js
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
  for (let suf of KN_SUFFIXES) if (t.endsWith(suf) && t.length > suf.length) return { root: t.slice(0, t.length - suf.length), suffixes: [suf] };
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
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
};

const lcsLength = (a, b) => {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
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
    if (approxEq(a[i - 1], b[j - 1])) {
      pairs.push([i - 1, j - 1]);
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  pairs.reverse();
  return pairs;
};

const stories = { default: "ನಾನು ಶಾಲೆಗೆ ಹೋಗುತ್ತೇನೆ" };
const resolveRef = (body) => body.refText ? String(body.refText) :
  (body.storyId && stories[body.storyId]) ? stories[body.storyId] : stories.default;

exports.nled = async (req, res) => {
  try {
    const { transcription, normalize = "token" } = req.body || {};
    if (!transcription) return res.status(400).json({ error: "transcription required" });
    const refText = resolveRef(req.body);
    if (normalize === "char") {
      const r = normalizeKannada(refText), h = normalizeKannada(transcription);
      const edits = levenshtein.get(r, h);
      const denom = Math.max(r.length, h.length, 1);
      return res.json({ metric: "nled", value: edits / denom, edits, refLen: denom, mode: "char" });
    }
    const rTok = tokenize(refText), hTok = tokenize(transcription);
    const edits = editDistanceTokens(rTok, hTok);
    const denom = Math.max(rTok.length, hTok.length, 1);
    res.json({ metric: "nled", value: edits / denom, edits, refLen: denom, mode: "token" });
  } catch { res.status(500).json({ error: "nled failed" }); }
};

exports.ldr = async (req, res) => {
  try {
    const { transcription } = req.body || {};
    if (!transcription) return res.status(400).json({ error: "transcription required" });
    const rTok = tokenize(resolveRef(req.body));
    const hTok = tokenize(transcription);
    const refCount = rTok.length, hypCount = hTok.length;
    const value = Math.abs(refCount - hypCount) / Math.max(refCount, hypCount, 1);
    res.json({ metric: "ldr", value, refCount, hypCount });
  } catch { res.status(500).json({ error: "ldr failed" }); }
};

exports.matchRatio = async (req, res) => {
  try {
    const { transcription, matching = "lcs" } = req.body || {};
    if (!transcription) return res.status(400).json({ error: "transcription required" });
    const rTok = tokenize(resolveRef(req.body));
    const hTok = tokenize(transcription);

    if (matching === "set") {
      const refSet = new Set(rTok), hypSet = new Set(hTok);
      const union = new Set([...refSet, ...hypSet]);
      let overlap = 0; refSet.forEach(t => { if (hypSet.has(t)) overlap++; });
      const denom = union.size || 1;
      return res.json({ metric: "match_ratio", value: overlap / denom, matches: overlap, denom });
    }
    if (matching === "exact") {
      const len = Math.max(rTok.length, hTok.length);
      let matches = 0;
      for (let i = 0; i < len; i++) if (rTok[i] !== undefined && hTok[i] !== undefined && rTok[i] === hTok[i]) matches++;
      const denom = rTok.length || 1;
      return res.json({ metric: "match_ratio", value: matches / denom, matches, denom });
    }
    const l = lcsLength(rTok, hTok);
    const denom = rTok.length || 1;
    res.json({ metric: "match_ratio", value: l / denom, matches: l, denom });
  } catch { res.status(500).json({ error: "match_ratio failed" }); }
};

exports.asrConfidence = async (req, res) => {
  try {
    const { confidence } = req.body || {};
    if (confidence === undefined || confidence === null) return res.status(400).json({ error: "confidence required" });
    const arr = Array.isArray(confidence)
      ? confidence.map(Number).filter((x) => Number.isFinite(x))
      : String(confidence).split(/\s+/).map(Number).filter((x) => Number.isFinite(x));
    const value = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    res.json({ metric: "asr_confidence", value });
  } catch { res.status(500).json({ error: "asr_confidence failed" }); }
};

exports.suffixAccuracy = async (req, res) => {
  try {
    const { transcription, rootMatch = "levenshtein<=1", suffixSet = true } = req.body || {};
    if (!transcription) return res.status(400).json({ error: "transcription required" });
    const rTok = tokenize(resolveRef(req.body)).map(splitRootSuffixes);
    const hTok = tokenize(transcription).map(splitRootSuffixes);

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
    res.json({ metric: "suffix_accuracy", value, matchedSuffixes, totalSuffixes });
  } catch { res.status(500).json({ error: "suffix_accuracy failed" }); }
};

exports.scoreAll = async (req, res) => {
  try {
    const { transcription, confidence } = req.body || {};
    if (!transcription) return res.status(400).json({ error: "transcription required" });
    const refText = resolveRef(req.body);

    const rTok = tokenize(refText), hTok = tokenize(transcription);

    const tokenEdits = editDistanceTokens(rTok, hTok);
    const nledDen = Math.max(rTok.length, hTok.length, 1);
    const nledVal = tokenEdits / nledDen;

    const ldrVal = Math.abs(rTok.length - hTok.length) / Math.max(rTok.length, hTok.length, 1);

    const lcs = lcsLength(rTok, hTok);
    const mrDen = rTok.length || 1;
    const mrVal = lcs / mrDen;

    const confArr = confidence === undefined || confidence === null ? [] :
      (Array.isArray(confidence) ? confidence.map(Number).filter(Number.isFinite)
        : String(confidence).split(/\s+/).map(Number).filter(Number.isFinite));
    const asrVal = confArr.length ? confArr.reduce((a,b)=>a+b,0)/confArr.length : 0;

    const rTokParsed = rTok.map(splitRootSuffixes);
    const hTokParsed = hTok.map(splitRootSuffixes);
    const approxEq = (a, b) => levenshtein.get(a || "", b || "") <= 1;
    const pairs = lcsAlignApprox(rTokParsed.map(t=>t.root), hTokParsed.map(t=>t.root), approxEq);
    let matchedSuffixes = 0, totalSuffixes = 0;
    for (const [i,j] of pairs) {
      const r = rTokParsed[i], h = hTokParsed[j];
      const rS = r.suffixes || [], hS = h.suffixes || [];
      totalSuffixes += rS.length;
      const setH = new Set(hS);
      rS.forEach(s => { if (setH.has(s)) matchedSuffixes++; });
    }
    const sufVal = totalSuffixes ? matchedSuffixes / totalSuffixes : 1;

    res.json({
      nled: { metric: "nled", value: nledVal, edits: tokenEdits, refLen: nledDen, mode: "token" },
      ldr: { metric: "ldr", value: ldrVal, refCount: rTok.length, hypCount: hTok.length },
      match_ratio: { metric: "match_ratio", value: mrVal, matches: lcs, denom: mrDen },
      asr_confidence: { metric: "asr_confidence", value: asrVal },
      suffix_accuracy: { metric: "suffix_accuracy", value: sufVal, matchedSuffixes, totalSuffixes }
    });
  } catch { res.status(500).json({ error: "scoreAll failed" }); }
};
