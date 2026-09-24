import {
  combinedTextScore,
  normalizedEditDistance,
  normalizeKannadaText,
  suffixAccuracy,
  tokenizeKannada,
} from "./textScoring";

describe("textScoring", () => {
  test("normalizes and tokenizes Kannada text", () => {
    expect(normalizeKannadaText(" ನಾನು   ಶಾಲೆಗೆ, ಹೋಗುತ್ತೇನೆ! ")).toBe("ನಾನು ಶಾಲೆಗೆ ಹೋಗುತ್ತೇನೆ");
    expect(tokenizeKannada("ನಾನು ಶಾಲೆಗೆ ಹೋಗುತ್ತೇನೆ")).toEqual(["ನಾನು", "ಶಾಲೆಗೆ", "ಹೋಗುತ್ತೇನೆ"]);
  });

  test("computes normalized edit distance", () => {
    const result = normalizedEditDistance("ನಾನು ಶಾಲೆಗೆ ಹೋಗುತ್ತೇನೆ", "ನಾನು ಶಾಲೆಗೆ ಹೋಗುತ್ತೇನೆ");
    expect(result.value).toBe(0);
  });

  test("penalizes substituted words", () => {
    const result = normalizedEditDistance("ನಾನು ಮನೆಗೆ ಹೋಗುತ್ತೇನೆ", "ನಾನು ಶಾಲೆಗೆ ಹೋಗುತ್ತೇನೆ");
    expect(result.value).toBeGreaterThan(0);
  });

  test("matches suffixes for close readings", () => {
    const result = suffixAccuracy("ಅವನು ಶಾಲೆಗೆ ಹೋಗುತ್ತಾನೆ", "ಅವನು ಶಾಲೆಗೆ ಹೋಗುತ್ತಾನೆ");
    expect(result.value).toBe(1);
  });

  test("combines similarity and suffix signals into bounded score", () => {
    const result = combinedTextScore({
      hypothesis: "ನಾನು ಶಾಲೆಗೆ ಹೋಗುತ್ತೇನೆ",
      reference: "ನಾನು ಶಾಲೆಗೆ ಹೋಗುತ್ತೇನೆ",
      avgLogProb: -0.2,
    });

    expect(result.value).toBeGreaterThan(0.8);
    expect(result.value).toBeLessThanOrEqual(1);
  });
});
