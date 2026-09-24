import { combinedTextScore } from "./lib/textScoring";

test("text scoring produces a bounded score", () => {
  const score = combinedTextScore({
    hypothesis: "ನಾನು ಶಾಲೆಗೆ ಹೋಗುತ್ತೇನೆ",
    reference: "ನಾನು ಶಾಲೆಗೆ ಹೋಗುತ್ತೇನೆ",
    avgLogProb: -0.3,
  });

  expect(score.value).toBeGreaterThan(0);
  expect(score.value).toBeLessThanOrEqual(1);
});
