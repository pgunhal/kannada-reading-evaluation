const KANNADA_PUNCTUATION = /[.,/#!$%^&*;:{}=\-_`~()?"'“”‘’।॥]/g;
const INVISIBLE_CHARACTERS = /[\u200B-\u200D\u2060]/g;

const KN_SUFFIXES = [
  "ಗಳಿಗೂ", "ಗಳಾದ", "ಗಳಿಗೆ", "ಗಳಿಂದ", "ಗಳಲ್ಲಿ", "ಕ್ಕಿಂತ", "ಕ್ಕೆ", "ಕ್ಕು",
  "ಯಿಂದ", "ಯಲ್ಲಿ", "ಯಾಗಿ", "ಯನ್ನು", "ಯರು", "ಯೆ", "ಯುವ",
  "ವಾಗಿ", "ವಲ್ಲಿ", "ವನು",
  "ತ್ತಿದ್ದೇನೆ", "ತ್ತೇನೆ", "ತ್ತಿದೆ", "ತ್ತಿದ್ದ", "ತ್ತಿದ",
  "ನಾದನು", "ರಾದರು", "ರಾಯಿತು", "ರಾಗಿದ್ದ", "ರಾದ",
  "ಯಿತು", "ನೆ", "ನು", "ನ್ನು", "ನಲ್ಲಿ", "ದಲ್ಲಿ",
  "ಗೆ", "ಲಿ", "ಕು", "ಡು", "ದೆ", "ದು", "ವು", "ವಾ",
].sort((a, b) => b.length - a.length);

export function normalizeKannadaText(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(INVISIBLE_CHARACTERS, "")
    .replace(KANNADA_PUNCTUATION, " ")
    .replace(/\[|\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeKannada(value) {
  return normalizeKannadaText(value).split(/\s+/).filter(Boolean);
}

function splitRootSuffixes(token) {
  const source = String(token || "");
  for (const suffix of KN_SUFFIXES) {
    if (source.endsWith(suffix) && source.length > suffix.length) {
      return { root: source.slice(0, source.length - suffix.length), suffixes: [suffix] };
    }
  }
  return { root: source, suffixes: [] };
}

function levenshteinDistance(left, right) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const table = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let row = 0; row < rows; row += 1) table[row][0] = row;
  for (let col = 0; col < cols; col += 1) table[0][col] = col;

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
      table[row][col] = Math.min(
        table[row - 1][col] + 1,
        table[row][col - 1] + 1,
        table[row - 1][col - 1] + substitutionCost
      );
    }
  }

  return table[left.length][right.length];
}

function lcsAlignApprox(referenceRoots, hypothesisRoots, approxEqual) {
  const rows = referenceRoots.length + 1;
  const cols = hypothesisRoots.length + 1;
  const table = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      if (approxEqual(referenceRoots[row - 1], hypothesisRoots[col - 1])) {
        table[row][col] = table[row - 1][col - 1] + 1;
      } else {
        table[row][col] = Math.max(table[row - 1][col], table[row][col - 1]);
      }
    }
  }

  const pairs = [];
  let row = referenceRoots.length;
  let col = hypothesisRoots.length;
  while (row > 0 && col > 0) {
    if (approxEqual(referenceRoots[row - 1], hypothesisRoots[col - 1])) {
      pairs.push([row - 1, col - 1]);
      row -= 1;
      col -= 1;
    } else if (table[row - 1][col] >= table[row][col - 1]) {
      row -= 1;
    } else {
      col -= 1;
    }
  }

  return pairs.reverse();
}

function mapLogProbToConfidence(avgLogProb) {
  if (!Number.isFinite(avgLogProb)) return 0.5;
  const normalized = Math.exp(Math.max(-8, Math.min(0, avgLogProb)));
  return Math.max(0, Math.min(1, normalized));
}

export function normalizedEditDistance(hypothesis, reference) {
  const referenceTokens = tokenizeKannada(reference);
  const hypothesisTokens = tokenizeKannada(hypothesis);
  const edits = levenshteinDistance(referenceTokens, hypothesisTokens);
  const denominator = Math.max(referenceTokens.length, hypothesisTokens.length, 1);

  return {
    metric: "nled",
    value: edits / denominator,
    edits,
    denominator,
  };
}

export function suffixAccuracy(hypothesis, reference, options = {}) {
  const rootMatchThreshold = Number.isFinite(options.rootMatchThreshold)
    ? options.rootMatchThreshold
    : 1;

  const referenceTokens = tokenizeKannada(reference).map(splitRootSuffixes);
  const hypothesisTokens = tokenizeKannada(hypothesis).map(splitRootSuffixes);

  const approxEqual = (left, right) =>
    levenshteinDistance([left || ""], [right || ""]) <= rootMatchThreshold ||
    levenshteinDistance(left || "", right || "") <= rootMatchThreshold;

  const pairs = lcsAlignApprox(
    referenceTokens.map((token) => token.root),
    hypothesisTokens.map((token) => token.root),
    approxEqual
  );

  let matchedSuffixes = 0;
  let totalSuffixes = 0;

  for (const [referenceIndex, hypothesisIndex] of pairs) {
    const referenceSuffixes = referenceTokens[referenceIndex]?.suffixes || [];
    const hypothesisSuffixSet = new Set(hypothesisTokens[hypothesisIndex]?.suffixes || []);
    totalSuffixes += referenceSuffixes.length;
    for (const suffix of referenceSuffixes) {
      if (hypothesisSuffixSet.has(suffix)) matchedSuffixes += 1;
    }
  }

  return {
    metric: "suffix_accuracy",
    value: totalSuffixes === 0 ? 1 : matchedSuffixes / totalSuffixes,
    matchedSuffixes,
    totalSuffixes,
  };
}

export function combinedTextScore(
  { hypothesis, reference, avgLogProb },
  weights = { similarity: 0.55, suffix: 0.3, confidence: 0.15 }
) {
  const nled = normalizedEditDistance(hypothesis, reference);
  const suffix = suffixAccuracy(hypothesis, reference);
  const similarity = 1 - nled.value;
  const asrConfidence = mapLogProbToConfidence(avgLogProb);

  const totalWeight = weights.similarity + weights.suffix + weights.confidence;
  const combined = totalWeight > 0
    ? (
        (similarity * weights.similarity) +
        (suffix.value * weights.suffix) +
        (asrConfidence * weights.confidence)
      ) / totalWeight
    : 0;

  return {
    metric: "combined_text_score",
    value: Math.max(0, Math.min(1, combined)),
    similarity,
    nled,
    suffix,
    asrConfidence,
    weights,
  };
}
