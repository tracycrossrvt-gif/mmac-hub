import test from "node:test";
import assert from "node:assert/strict";
import { appLoader } from "./helpers/load-app.mjs";

const actionPath = "src/features/assistance/actions/submitGetHelpRequest.ts";
const schemaPath = "src/features/assistance/validation/getHelpSchema.ts";
const submissionId = "7b828e94-bc49-435b-a1dc-f2d4d01f6fe0";
const requestId = "bc9db68e-6eae-4aca-a22e-3571ae10e8b4";
const receipt = { assistance_request_id: requestId, status: "new" };
const privateDetail = "PRIVATE_DATABASE_DETAIL_AND_SUBMITTED_CONTACT";
const plain = (value) => JSON.parse(JSON.stringify(value));

function input(overrides = {}) {
  return {
    firstName: " Jamie ", lastName: " Example ", phone: " 555-0102 ", email: "",
    animalName: " Roscoe ", species: "dog", sex: "male", alteredStatus: "unaltered",
    age: " 2.5 ", breed: " Mixed ", colorDescription: " Brown ",
    helpSummary: " Help with veterinary care ", rabiesStatus: "unknown",
    preventionUseStatus: "not_using", preventionProduct: "", medicalConcerns: "",
    lastHeatCycleNotes: "", availableDays: ["monday", "friday"],
    transportationNotes: " Morning only ", statedContributionAmount: "25",
    additionalInformation: "", ...overrides,
  };
}

function harness(options = {}) {
  const calls = { clients: 0, rpc: [] };
  const load = appLoader({
    "@/lib/supabase/admin": { createAdminClient: () => {
      calls.clients++;
      if (options.throwClient) throw new Error(privateDetail);
      return { rpc: async (name, payload) => {
        calls.rpc.push({ name, payload });
        if (options.throwRpc) throw new Error(privateDetail);
        return Object.hasOwn(options, "response") ? options.response : { data: [receipt], error: null };
      } };
    } },
  });
  const rawSubmit = load(actionPath).submitGetHelpRequest;
  return { calls, schema: load(schemaPath).getHelpSchema, rawSubmit,
    submit: (data) => rawSubmit({ submissionId, data }) };
}

test("valid anonymous submission uses only the existing RPC and returns a minimal confirmed receipt", async () => {
  const h = harness({ response: { data: [{ ...receipt, person_id: privateDetail, animal_id: privateDetail }], error: null } });
  const result = await h.submit(input({ status: "accepted", status_version: 20, actor_user_id: "forged" }));
  assert.deepEqual(plain(result), { success: true, requestId, status: "new" });
  assert.equal(h.calls.clients, 1);
  assert.equal(h.calls.rpc.length, 1);
  assert.equal(h.calls.rpc[0].name, "submit_public_assistance_request");
  assert.deepEqual(plain(h.calls.rpc[0].payload), {
    p_submission_id: submissionId, p_first_name: "Jamie", p_last_name: "Example", p_phone: "555-0102", p_email: "",
    p_animal_name: "Roscoe", p_species: "dog", p_sex: "male", p_altered_status: "unaltered",
    p_age_years: 2.5, p_breed: "Mixed", p_color_description: "Brown",
    p_help_summary: "Help with veterinary care", p_stated_contribution_amount: 25,
    p_transportation_notes: "Morning only", p_additional_information: "",
    p_rabies_status: "unknown", p_prevention_use_status: "not_using",
    p_prevention_product: "", p_medical_concerns: "", p_last_heat_cycle_notes: "",
    p_available_days: ["monday", "friday"],
  });
});

test("client-parsed values can be revalidated by the action, including blanks and numeric contribution", async () => {
  const h = harness();
  const parsed = h.schema.parse(input({ phone: " ", email: " owner@example.com ", age: " \t ",
    animalName: " ", statedContributionAmount: "   ", availableDays: undefined }));
  assert.equal(parsed.age, undefined);
  assert.equal(parsed.phone, undefined);
  assert.equal(parsed.statedContributionAmount, undefined);
  assert.equal((await h.submit(parsed)).success, true);
  const payload = h.calls.rpc[0].payload;
  assert.equal(payload.p_age_years, null);
  assert.equal(payload.p_stated_contribution_amount, null);
  assert.equal(payload.p_phone, "");
  assert.equal(payload.p_email, "owner@example.com");
  assert.equal(payload.p_animal_name, "");
  assert.deepEqual(plain(payload.p_available_days), []);
  assert.equal((await h.submit(h.schema.parse(input()))).success, true);
  assert.equal(h.calls.rpc[1].payload.p_stated_contribution_amount, 25);
});

for (const [label, value] of [
  ["null payload", null], ["non-object payload", "request"],
  ["blank name", input({ firstName: " " })],
  ["missing contact", input({ phone: " ", email: "" })],
  ["malformed email", input({ email: "not-an-email" })],
  ["overlong email", input({ email: `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.com` })],
  ["short help summary", input({ helpSummary: " hi " })],
  ["invalid species", input({ species: "horse" })],
  ["invalid sex", input({ sex: "other" })],
  ["invalid altered status", input({ alteredStatus: "yes" })],
  ["invalid rabies status", input({ rabiesStatus: "vaccinated" })],
  ["invalid prevention status", input({ preventionUseStatus: "yes" })],
  ["invalid day", input({ availableDays: ["Monday"] })],
  ["duplicate day", input({ availableDays: ["monday", "monday"] })],
  ["heat-cycle rule", input({ sex: "female", alteredStatus: "unaltered", lastHeatCycleNotes: " " })],
  ["negative contribution", input({ statedContributionAmount: -1 })],
  ["out-of-storage contribution", input({ statedContributionAmount: 100000000 })],
  ["boolean contribution", input({ statedContributionAmount: true })],
  ["null contribution", input({ statedContributionAmount: null })],
  ["array contribution", input({ statedContributionAmount: [] })],
  ["hex contribution", input({ statedContributionAmount: "0x10" })],
  ["infinite contribution", input({ statedContributionAmount: Infinity })],
]) {
  test(`${label} fails validation before privileged client construction`, async () => {
    const h = harness();
    assert.equal(h.schema.safeParse(value).success, false);
    const result = await h.submit(value);
    assert.deepEqual(plain(result), { success: false, code: "validation", message: "Please review the information you submitted." });
    assert.equal(h.calls.clients, 0);
    assert.equal(h.calls.rpc.length, 0);
  });
}

for (const age of ["-1", "1000", "999.91", "NaN", "Infinity", "1e999", "two", "0x10", null, 2]) {
  test(`invalid age ${JSON.stringify(age)} is rejected before database access`, async () => {
    const h = harness();
    assert.equal((await h.submit(input({ age }))).success, false);
    assert.equal(h.calls.clients, 0);
  });
}

test("existing select options, unknown answers, number-input notation and storage boundaries remain usable", async () => {
  const h = harness();
  for (const age of [undefined, "", "0", "0.1", "2.25", "1e1", "999.9"]) {
    assert.equal((await h.submit(input({ age }))).success, true);
    assert.equal(h.calls.rpc.at(-1).payload.p_age_years, age === undefined || age === "" ? null : Number(age));
  }
  for (const species of ["dog", "cat", "other"]) {
    assert.equal((await h.submit(input({ species, sex: "unknown", alteredStatus: "unknown",
      rabiesStatus: "not_current", preventionUseStatus: "unknown", statedContributionAmount: 0 }))).success, true);
  }
  assert.equal((await h.submit(input({ sex: "female", alteredStatus: "unaltered", lastHeatCycleNotes: " Unknown ",
    rabiesStatus: "current", preventionUseStatus: "using", statedContributionAmount: "99999999.99",
    availableDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] }))).success, true);
  assert.equal(h.calls.rpc.at(-1).payload.p_last_heat_cycle_notes, "Unknown");
});

for (const [label, options] of [
  ["RPC error", { response: { data: null, error: { code: "XX000", message: privateDetail, details: privateDetail } } }],
  ["RPC error even with data", { response: { data: [receipt], error: { message: privateDetail } } }],
  ["empty result", { response: { data: [], error: null } }],
  ["null result", { response: { data: null, error: null } }],
  ["missing result", { response: { error: null } }],
  ["missing response", { response: undefined }],
  ["object instead of result array", { response: { data: receipt, error: null } }],
  ["multiple receipts", { response: { data: [receipt, receipt], error: null } }],
  ["missing ID", { response: { data: [{ status: "new" }], error: null } }],
  ["invalid ID", { response: { data: [{ ...receipt, assistance_request_id: privateDetail }], error: null } }],
  ["invalid status", { response: { data: [{ ...receipt, status: "accepted" }], error: null } }],
  ["client construction throws", { throwClient: true }],
  ["RPC execution throws", { throwRpc: true }],
]) {
  test(`${label} returns safe uncertainty without raw details or automatic retries`, async (t) => {
    const logger = t.mock.method(console, "error", () => {});
    const h = harness(options);
    const result = await h.submit(input());
    assert.equal(result.success, false);
    assert.deepEqual(Object.keys(result).sort(), ["code", "message", "success"]);
    assert.match(result.message, /couldn't confirm whether your request was received/);
    assert.match(result.message, /Retry this submission/);
    assert.equal(result.code, "unconfirmed");
    assert.doesNotMatch(JSON.stringify(result), new RegExp(privateDetail));
    assert.doesNotMatch(JSON.stringify(logger.mock.calls.map((call) => call.arguments)), new RegExp(privateDetail));
    assert.equal(h.calls.clients, 1);
    assert.equal(h.calls.rpc.length, options.throwClient ? 0 : 1);
  });
}

for (const envelope of [null, {}, { data: input() }, { submissionId: "bad", data: input() }, input()]) {
  test("invalid or legacy submission envelope is rejected before I/O: " + JSON.stringify(envelope).slice(0,45), async () => {
    const h = harness();
    assert.equal((await h.rawSubmit(envelope)).code, "validation");
    assert.equal(h.calls.clients, 0);
  });
}

test("identifier mismatch is a safe classified conflict; no retry or raw provider detail", async (t) => {
  const logger = t.mock.method(console, "error", () => {});
  const h = harness({ response: { data: null, error: { code: "PT409", message: privateDetail } } });
  const result = await h.submit(input());
  assert.equal(result.success, false);
  assert.equal(result.code, "submission_conflict");
  assert.equal(h.calls.rpc.length, 1);
  assert.doesNotMatch(JSON.stringify([result, logger.mock.calls.map(c => c.arguments)]), new RegExp(privateDetail));
});

test("repeat action calls forward the identical identifier and normalized payload", async () => {
  const h = harness();
  assert.deepEqual(plain(await h.submit(input())), plain(await h.submit(input())));
  assert.deepEqual(plain(h.calls.rpc[0]), plain(h.calls.rpc[1]));
});
