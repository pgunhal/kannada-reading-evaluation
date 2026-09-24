const {randomInt} = require("node:crypto");

const normalize = (text) => text.normalize("NFC").replace(/\s/gu, "");

const shuffle = (items) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const validateQuestion = (q) => {
  if (
    !q ||
    typeof q.id !== "string" ||
    !q.id ||
    !["easy", "medium", "hard"].includes(q.difficulty) ||
    !["mcq", "true_false", "cloze"].includes(q.type) ||
    typeof q.prompt !== "string" ||
    !q.prompt.trim() ||
    typeof q.correctAnswer !== "string" ||
    !normalize(q.correctAnswer)
  ) {
    throw new Error("Invalid question bank. Ask staff to fix it.");
  }
  if (
    (q.type === "mcq" || (q.type === "cloze" && q.options)) &&
    (!Array.isArray(q.options) ||
      q.options.length !== 4 ||
      new Set(q.options).size !== 4 ||
      q.options.some((o) => typeof o !== "string" || !o.trim()) ||
      !q.options.includes(q.correctAnswer))
  ) {
    throw new Error(
        "MCQ requires four unique options and a matching answer.",
    );
  }
  if (
    q.type === "true_false" &&
    !["true", "false"].includes(q.correctAnswer)
  ) {
    throw new Error("True/false answer must be true or false.");
  }
};

const assignQuestions = (bank, count = 4, usedIds = []) => {
  if (!Number.isInteger(count) || count < 3 || count > 5) {
    throw new Error("Question count must be between 3 and 5.");
  }
  bank.forEach(validateQuestion);
  if (
    bank.length < count ||
    new Set(bank.map((q) => q.id)).size !== bank.length
  ) {
    throw new Error("Not enough distinct questions in the bank.");
  }
  const difficulties = ["easy", "medium", "hard"];
  const used = new Set(usedIds);
  let remaining = shuffle(bank).sort(
      (a, b) => Number(used.has(a.id)) - Number(used.has(b.id)),
  );
  const selected = difficulties.map((difficulty, index) => {
    const nearest = [...difficulties].sort(
        (a, b) =>
          Math.abs(difficulties.indexOf(a) - index) -
        Math.abs(difficulties.indexOf(b) - index),
    );
    const unseen = remaining.filter((q) => !used.has(q.id));
    const candidates = unseen.length ? unseen : remaining;
    const bucket = nearest.find((d) =>
      candidates.some((q) => q.difficulty === d),
    );
    const choice = candidates.find((q) => q.difficulty === bucket);
    remaining = remaining.filter((q) => q.id !== choice.id);
    return choice;
  });
  return shuffle([...selected, ...remaining.slice(0, count - 3)]).map(
      (q) => {
        const result = {
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          difficulty: q.difficulty,
          correctAnswer: q.correctAnswer,
        };
        if (q.options) result.options = shuffle(q.options);
        return result;
      },
  );
};

// Explicit allowlist: answer keys and future author-only fields never escape.
const publicQuestion = (q) => {
  const result = {id: q.id, type: q.type, prompt: q.prompt};
  if (q.options) result.options = q.options;
  return result;
};

// Distance <= 1 over Unicode code points; do not discard Kannada marks.
const isNearMiss = (left, right) => {
  const a = Array.from(left);
  const b = Array.from(right);
  if (!a.length || !b.length || Math.abs(a.length - b.length) > 1) {
    return false;
  }
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

const summarize = (answers, threshold) => {
  const needsReview = answers.some((a) => a.correct === null);
  const score = needsReview ?
    null :
    answers.filter((a) => a.correct).length / answers.length;
  return {
    needsReview,
    score,
    passed: needsReview ? null : score >= threshold,
  };
};

const gradeAnswers = (questions, responses, threshold) => {
  if (
    !Array.isArray(responses) ||
    responses.length !== questions.length ||
    new Set(responses.map((a) => a && a.questionId)).size !==
      questions.length ||
    responses.some(
        (a) =>
          !a ||
        typeof a.response !== "string" ||
        a.response.length > 1000 ||
        !questions.some((q) => q.id === a.questionId),
    )
  ) {
    throw new Error(
        "Submit exactly one response for each assigned question.",
    );
  }
  const answers = questions.map((q) => {
    const response = responses.find((a) => a.questionId === q.id).response;
    let correct = response === q.correctAnswer;
    if (q.type === "cloze" && !q.options) {
      const actual = normalize(response);
      const expected = normalize(q.correctAnswer);
      correct =
        actual === expected ?
          true :
          isNearMiss(actual, expected) ?
            null :
            false;
    }
    return {
      questionId: q.id,
      response,
      correct,
      needsReview: correct === null,
    };
  });
  return {answers, ...summarize(answers, threshold)};
};

module.exports = {
  validateQuestion,
  assignQuestions,
  publicQuestion,
  gradeAnswers,
  summarize,
  normalize,
  isNearMiss,
};
