const {test} = require("node:test");
const assert = require("node:assert/strict");
const {
  assignQuestions,
  publicQuestion,
  gradeAnswers,
} = require("../quizCore");
const bank = Array.from({length: 10}, (_, i) => ({
  id: `q${i}`,
  difficulty: ["easy", "medium", "hard"][i % 3],
  type: "mcq",
  prompt: "Question",
  options: ["a", "b", "c", "d"],
  correctAnswer: "a",
}));
test("assignment is stratified, sanitized and immutable", () => {
  const before = JSON.stringify(bank);
  for (let i = 0; i < 50; i++) {
    const selected = assignQuestions(bank);
    assert.equal(selected.length, 4);
    assert.equal(new Set(selected.map((q) => q.id)).size, 4);
    assert.equal(new Set(selected.map((q) => q.difficulty)).size, 3);
    for (const q of selected) {
      assert.deepEqual([...q.options].sort(), ["a", "b", "c", "d"]);
      assert.deepEqual(
          Object.keys(publicQuestion({...q, secret: "private"})).sort(),
          ["id", "options", "prompt", "type"],
      );
    }
  }
  assert.equal(JSON.stringify(bank), before);
});
test("empty buckets fall back; undersized banks fail", () => {
  assert.equal(
      assignQuestions(
          bank.map((q) => ({...q, difficulty: "hard"})),
          5,
      ).length,
      5,
  );
  assert.throws(() => assignQuestions(bank.slice(0, 2)));
  assert.throws(() => assignQuestions(bank, 6));
});
test("cloze normalizes Kannada while preserving marks", () => {
  const q = [{id: "q", type: "cloze", correctAnswer: "ಕೋ"}];
  assert.equal(
      gradeAnswers(
          q,
          [{questionId: "q", response: " ಕ\u0cc6\u0cc2\u0cd5 "}],
          0.7,
      ).score,
      1,
  );
  const near = gradeAnswers(q, [{questionId: "q", response: "ಕೆ"}], 0.7);
  assert.equal(near.answers[0].correct, null);
  assert.equal(near.needsReview, true);
  assert.equal(near.score, null);
  assert.equal(near.passed, null);
  assert.equal(
      gradeAnswers(q, [{questionId: "q", response: ""}], 0.7).score,
      0,
  );
  assert.equal(
      gradeAnswers(q, [{questionId: "q", response: "ಮರಗಳು"}], 0.7).score,
      0,
  );
});
test("grading ignores client correctness and validates IDs", () => {
  const questions = bank.slice(0, 2);
  assert.throws(() =>
    gradeAnswers(questions, [{questionId: "q0", response: "a"}], 0.7),
  );
  assert.throws(() =>
    gradeAnswers(
        questions,
        [
          {questionId: "q0", response: "a"},
          {questionId: "q0", response: "a"},
        ],
        0.7,
    ),
  );
  assert.throws(() =>
    gradeAnswers(
        questions,
        [
          {questionId: "q0", response: "a"},
          {questionId: "secret", response: "a"},
        ],
        0.7,
    ),
  );
  const grade = gradeAnswers(
      questions,
      questions.map((q) => ({
        questionId: q.id,
        response: "b",
        correct: true,
      })),
      0.7,
  );
  assert.equal(grade.score, 0);
  assert.equal(grade.passed, false);
});
test("twelve-question banks produce disjoint attempts with fallback", () => {
  const full = Array.from({length: 12}, (_, i) => ({
    ...bank[i % 10],
    id: `unique${i}`,
  }));
  const used = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const assigned = assignQuestions(full, 4, used);
    assert.equal(
        assigned.some((q) => used.includes(q.id)),
        false,
    );
    used.push(...assigned.map((q) => q.id));
  }
  assert.equal(new Set(used).size, 12);
  const small = full.slice(0, 4);
  assert.equal(
      assignQuestions(
          small,
          4,
          small.map((q) => q.id),
      ).length,
      4,
  );
});
test("choice-based cloze is exact graded without human typing review", () => {
  const q = {
    id: "cloze",
    type: "cloze",
    difficulty: "easy",
    prompt: "____",
    options: ["ಕೋ", "ಕೆ", "ಮರ", "ಹಣ್ಣು"],
    correctAnswer: "ಕೋ",
  };
  const assigned = assignQuestions([q, ...bank.slice(0, 3)]);
  assert.equal(
      publicQuestion(assigned.find((a) => a.id === "cloze")).options.length,
      4,
  );
  const grade = gradeAnswers(
      [q],
      [{questionId: "cloze", response: "ಕೆ"}],
      0.7,
  );
  assert.equal(grade.score, 0);
  assert.equal(grade.needsReview, false);
});
