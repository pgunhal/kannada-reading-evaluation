const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../speaking/core");
const samples = require("../speaking/samples");
test("PINs preserve leading zeroes, are salted, and validate exactly four digits", () => {
  const a = core.pinHash("0042");
  const b = core.pinHash("0042");
  assert.notEqual(a.hash, b.hash);
  assert(core.verifyPin("0042", a));
  assert(!core.verifyPin("0043", a));
  for (const value of [42, "42", "12345", "abcd"]) {
    assert.throws(() => core.pinHash(value));
  }
  assert.equal(
    core.studentId("class", "  Ananya  R. "),
    core.studentId("class", "ananya r"),
  );
});
test("assignments balance one or two students, reject overload and foreign IDs", () => {
  const students = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}` }));
  const a = core.assign(students, samples);
  assert.equal(Object.keys(a).length, 20);
  for (const p of samples) {
    assert.equal(Object.values(a).filter((id) => id === p.id).length, 2);
  }
  core.validateAssignments(a, students, samples);
  assert.throws(() => core.assign([...students, { id: "overflow" }], samples));
  assert.throws(() =>
    core.validateAssignments({ ...a, unknown: "p1" }, students, samples),
  );
});
test("only the assigned reading is returned, never instructor questions", () => {
  const result = core.studentReading(
    {
      id: "w",
      week: "2026-10-05",
      topic: "Stars",
      paragraphs: samples,
      assignments: { s: "p2" },
    },
    "s",
  );
  assert.equal(result.title, samples[1].title);
  assert(!("questions" in result));
  assert(!("paragraphs" in result));
  assert.equal(
    core.studentReading({ paragraphs: samples, assignments: {} }, "s"),
    null,
  );
});
test("curriculum rejects duplicate subjects and grades accept only integer 1–10", () => {
  assert.equal(core.paragraphs(samples).length, 10);
  const duplicate = structuredClone(samples);
  duplicate[1].title = duplicate[0].title;
  assert.throws(() => core.paragraphs(duplicate));
  for (const score of [0, 11, 1.5, "8", null]) {
    assert.throws(() => core.grade(score));
  }
  assert.equal(core.grade(10), 10);
  assert.throws(() => core.weekId("demo", "2026-02-30"));
});
test("OpenAI requests use structured output and omit roster, PINs and stored responses", async () => {
  const { generate } = require("../speaking/openai");
  const prior = process.env.SPEAKING_OPENAI_API_KEY;
  process.env.SPEAKING_OPENAI_API_KEY = "test-only";
  try {
    const result = await generate(
      { topic: "Movie stars", count: 10 },
      async (url, options) => {
        assert.equal(url, "https://api.openai.com/v1/responses");
        const body = JSON.parse(options.body);
        assert.equal(body.store, false);
        assert.equal(body.text.format.strict, true);
        assert.deepEqual(JSON.parse(body.input), {
          topic: "Movie stars",
          count: 10,
        });
        return {
          ok: true,
          json: async () => ({
            status: "completed",
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({ paragraphs: samples }),
                  },
                ],
              },
            ],
          }),
        };
      },
    );
    assert.equal(result.length, 10);
    await assert.rejects(
      generate({ topic: "x", count: 10 }, async () => ({
        ok: false,
        status: 429,
      })),
      /quota/,
    );
  } finally {
    if (prior === undefined) delete process.env.SPEAKING_OPENAI_API_KEY;
    else process.env.SPEAKING_OPENAI_API_KEY = prior;
  }
});
