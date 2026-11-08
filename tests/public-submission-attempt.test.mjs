import test from "node:test";
import assert from "node:assert/strict";
import { appLoader } from "./helpers/load-app.mjs";
const load = appLoader();
const helpers = load("src/features/assistance/lib/publicSubmissionAttempt.ts");
const { beginSubmissionAttempt: begin, readSubmissionAttempt: read, verifyPendingAttempt: verify,
  finishSubmissionAttempt: finish, blockSubmissionAttempt: block,
  submissionStorageKey: key } = helpers;
const id = "7b828e94-bc49-435b-a1dc-f2d4d01f6fe0";
const requestId = "bc9db68e-6eae-4aca-a22e-3571ae10e8b4";
const data = () => ({ firstName: "Test", lastName: "Only", phone: "555-0102", species: "dog",
  sex: "male", alteredStatus: "unknown", rabiesStatus: "unknown", preventionUseStatus: "unknown",
  helpSummary: "PRIVATE_HELP_TEXT", medicalConcerns: "PRIVATE_MEDICAL", availableDays: ["monday"] });
function storage() {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
}

test("snapshot is cloned, immutable, stored before return and reusable after reload", () => {
  const s = storage(), form = data();
  let generated = 0;
  const pending = begin(s, form, () => { generated++; return id; });
  form.helpSummary = "edited"; form.availableDays.push("friday");
  assert.equal(pending.submission.data.helpSummary, "PRIVATE_HELP_TEXT");
  assert.throws(() => { pending.submission.data.helpSummary = "edited"; });
  assert.throws(() => pending.submission.data.availableDays.push("friday"));
  const restored = read(s);
  assert.equal(JSON.stringify(verify(s, restored)), JSON.stringify(pending.submission));
  assert.equal(generated, 1);
  assert.throws(() => begin(s, data(), () => { generated++; return id; }));
  assert.equal(generated, 1);
});

test("confirmed success replaces all sensitive data with a minimal receipt", () => {
  const s = storage(), pending = begin(s, data(), () => id);
  const complete = finish(s, pending, requestId);
  assert.equal(complete.state, "complete");
  assert.equal(read(s).requestId, requestId);
  assert.doesNotMatch(s.getItem(key), /PRIVATE|555|firstName|submission":/);
  assert.throws(() => verify(s, pending));
  assert.throws(() => begin(s, data(), () => id));
});

test("conflict survives reload and cannot be retried or replaced", () => {
  const s = storage(), pending = begin(s, data(), () => id);
  block(s, pending);
  assert.equal(read(s).state, "conflict");
  assert.throws(() => verify(s, pending));
  assert.throws(() => begin(s, data(), () => id));
});

for (const raw of ["broken json", "null", '{"version":2,"state":"pending"}', '{"version":1,"state":"pending"}']) {
  test("corrupt/incompatible saved state fails closed: " + raw, () => {
    const s = storage(); s.setItem(key, raw);
    assert.throws(() => read(s));
    assert.throws(() => begin(s, data(), () => id));
    assert.equal(s.getItem(key), raw);
  });
}

test("storage read, write and silent write failures prevent a new attempt", () => {
  assert.throws(() => begin({ getItem() { throw Error(); } }, data(), () => id));
  assert.throws(() => begin({ getItem: () => null, setItem() { throw Error(); } }, data(), () => id));
  assert.throws(() => begin({ getItem: () => null, setItem() {} }, data(), () => id));
});

test("lost or changed stored snapshot cannot be retried", () => {
  const s = storage(), pending = begin(s, data(), () => id);
  const changed = JSON.parse(s.getItem(key)); changed.submission.data.helpSummary = "changed details";
  s.setItem(key, JSON.stringify(changed));
  assert.throws(() => verify(s, pending));
  s.removeItem(key);
  assert.throws(() => verify(s, pending));
});

test("success storage failure attempts sensitive-data removal and reports failure", () => {
  const s = storage(), pending = begin(s, data(), () => id);
  s.setItem = () => { throw Error("quota"); };
  assert.throws(() => finish(s, pending, requestId));
  assert.equal(s.getItem(key), null);
});

test("confirmed success still attempts cleanup when saved state became corrupt", () => {
  const s = storage(), pending = begin(s, data(), () => id);
  s.setItem(key, "corrupt PRIVATE_MEDICAL");
  assert.throws(() => finish(s, pending, requestId));
  assert.equal(s.getItem(key), null);
});

test("a browser refusing both confirmation and removal never reports storage success", () => {
  const s = storage(), pending = begin(s, data(), () => id);
  s.setItem = () => { throw Error("write denied"); };
  s.removeItem = () => { throw Error("removal denied"); };
  assert.throws(() => finish(s, pending, requestId));
  assert.equal(read(s).state, "pending");
});

test("snapshot cleanup failure leaves a non-sensitive guard that blocks a fresh form after reload", () => {
  const s = storage(), pending = begin(s, data(), () => id);
  s.setItem = () => { throw Error("quota"); };
  assert.throws(() => finish(s, pending, requestId));
  assert.equal(s.getItem(key), null);
  assert.equal(s.getItem(helpers.submissionGuardKey), id);
  assert.throws(() => read(s));
  assert.throws(() => begin(s, data(), () => id));
});

test("read-back failure after writing confirmation cannot become a fresh attempt on reload", () => {
  const s = storage(), pending = begin(s, data(), () => id);
  const get = s.getItem, set = s.setItem;
  let failRead = false;
  s.setItem = (k, v) => { set(k,v); if (k === key) failRead = true; };
  s.getItem = k => { if (k === key && failRead) { failRead = false; throw Error(); } return get(k); };
  assert.throws(() => finish(s, pending, requestId));
  assert.equal(s.getItem(key), null);
  assert.throws(() => read(s));
});

test("legacy pending snapshots gain the guard before being eligible for retry", () => {
  const s = storage(); s.setItem(key, JSON.stringify({version:1, state:"pending", submission:{submissionId:id, data:data()}}));
  assert.equal(read(s).state, "pending");
  assert.equal(s.getItem(helpers.submissionGuardKey), id);
  s.removeItem(key);
  assert.throws(() => read(s));
});

test("corrupt or mismatched guard fails closed", () => {
  for (const marker of ["broken", requestId]) {
    const s = storage(); begin(s, data(), () => id);
    s.setItem(helpers.submissionGuardKey, marker);
    assert.throws(() => read(s));
  }
});

test("unexpected stored state fields are corruption, not silently stripped private data", () => {
  const s = storage(), pending = begin(s, data(), () => id);
  finish(s, pending, requestId);
  const raw = JSON.parse(s.getItem(key)); raw.submission = data();
  s.setItem(key, JSON.stringify(raw));
  assert.throws(() => read(s));
});
