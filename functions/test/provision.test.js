const {test} = require("node:test");
const assert = require("node:assert/strict");
const {validate} = require("../scripts/provisionFirebase");
const plan = () => ({centers: [{id: "c", name: "Center"}],
  classes: [{id: "g", name: "Grade", centerId: "c", teacherUids: ["t"]}],
  staff: [{uid: "t", role: "volunteer", centerIds: ["c"], displayName: "T"}],
  students: [{id: "s", uid: "auth-s", classId: "g", centerId: "c",
    displayName: "S"}]});
test("provisioning rejects inconsistent memberships before writes", () => {
  assert.equal(validate(plan()).students.length, 1);
  const mismatch = plan(); mismatch.students[0].centerId = "wrong";
  assert.throws(() => validate(mismatch), /membership/);
  const duplicate = plan(); duplicate.students[0].uid = "t";
  assert.throws(() => validate(duplicate), /UID/);
  const missing = plan(); missing.classes[0].teacherUids = ["unknown"];
  assert.throws(() => validate(missing), /declared/);
});
