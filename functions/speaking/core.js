const {
  createHash,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} = require("node:crypto");

function check(ok, message) {
  if (!ok) throw new Error(message);
}
function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}
function classCode(value) {
  const code = normalize(value).replace(/\s+/g, "-");
  check(/^[a-z0-9-]{2,50}$/.test(code), "Enter a valid class code.");
  return code;
}
function studentId(classId, name) {
  return createHash("sha256")
    .update(`${classId}:${normalize(name)}`)
    .digest("hex")
    .slice(0, 32);
}
function pinHash(pin, salt = randomBytes(16).toString("hex")) {
  check(
    typeof pin === "string" && /^\d{4}$/.test(pin),
    "PIN must have four digits.",
  );
  return { salt, hash: scryptSync(pin, salt, 32).toString("hex") };
}
function verifyPin(pin, record) {
  const result = pinHash(pin, record.salt);
  return timingSafeEqual(
    Buffer.from(result.hash, "hex"),
    Buffer.from(record.hash, "hex"),
  );
}
function weekId(classId, date) {
  check(
    typeof date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      !Number.isNaN(Date.parse(date)) &&
      new Date(date).toISOString().slice(0, 10) === date,
    "Choose a valid week date.",
  );
  return `${classId}_${date}`;
}
function paragraphs(value) {
  check(
    Array.isArray(value) && value.length >= 10 && value.length <= 15,
    "A curriculum needs 10–15 paragraphs.",
  );
  const titles = new Set();
  return value.map((p, i) => {
    check(
      typeof p.title === "string" &&
        p.title.trim().length > 0 &&
        p.title.length <= 150,
      "Every paragraph needs a short title.",
    );
    check(
      !titles.has(normalize(p.title)),
      "Use a different subject for each paragraph.",
    );
    titles.add(normalize(p.title));
    check(
      typeof p.body === "string" &&
        p.body.trim().length >= 50 &&
        p.body.length <= 4000 &&
        /[\u0C80-\u0CFF]/.test(p.body) &&
        !/\n\s*\n/.test(p.body.trim()),
      "Each reading must be one Kannada paragraph (50–4000 characters).",
    );
    check(
      Array.isArray(p.questions) &&
        p.questions.length >= 3 &&
        p.questions.length <= 6 &&
        p.questions.every(
          (q) => typeof q === "string" && q.trim() && q.length <= 600,
        ),
      "Add 3–6 instructor questions per paragraph.",
    );
    return {
      id: `p${i + 1}`,
      title: p.title.trim(),
      body: p.body.trim(),
      questions: p.questions.map((q) => q.trim()),
    };
  });
}
function assign(students, readings, random = randomInt) {
  check(
    students.length <= readings.length * 2,
    "There are more than two students per paragraph. Split the class.",
  );
  const ids = students.map((s) => s.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return Object.fromEntries(
    ids.map((id, i) => [id, readings[i % readings.length].id]),
  );
}
function validateAssignments(mapping, students, readings) {
  const ids = new Set(students.map((s) => s.id));
  const available = new Set(readings.map((p) => p.id));
  const counts = {};
  check(
    mapping && typeof mapping === "object" && !Array.isArray(mapping),
    "Assignments are required.",
  );
  check(
    Object.keys(mapping).length === ids.size,
    "Assign every active student exactly once.",
  );
  for (const [id, paragraph] of Object.entries(mapping)) {
    check(
      ids.has(id) && available.has(paragraph),
      "Assignment contains an unknown student or paragraph.",
    );
    counts[paragraph] = (counts[paragraph] || 0) + 1;
    check(
      counts[paragraph] <= 2,
      "Assign no more than two students to each paragraph.",
    );
  }
  return mapping;
}
function grade(value) {
  check(
    Number.isInteger(value) && value >= 1 && value <= 10,
    "Grade must be a whole number from 1 to 10.",
  );
  return value;
}
function studentReading(week, id) {
  const p = week.paragraphs.find((p) => p.id === week.assignments[id]);
  return p ?
    {
        id: week.id,
        week: week.week,
        topic: week.topic,
        title: p.title,
        body: p.body,
      } :
    null;
}
module.exports = {
  check,
  normalize,
  classCode,
  studentId,
  pinHash,
  verifyPin,
  weekId,
  paragraphs,
  assign,
  validateAssignments,
  grade,
  studentReading,
};
