/* Slice 2a — requested services: schema, action, saved-attempt compatibility,
 * species filtering, form behavior, option loading and admin display.
 * Form tests run the actual component with real RHF + zodResolver and controlled
 * React hooks; this is NOT a DOM/browser test. */
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createFormControl } from "react-hook-form";
import { appLoader } from "./helpers/load-app.mjs";
import { caseFixture } from "./fixtures/case.mjs";

const surgery = "50000000-0000-0000-0000-000000000101";
const medicalCare = "50000000-0000-0000-0000-000000000102";
const vaccineClinic = "50000000-0000-0000-0000-000000000103";
const dogOnly = "50000000-0000-0000-0000-000000000199";
const submissionId = "7b828e94-bc49-435b-a1dc-f2d4d01f6fe0";
const requestId = "bc9db68e-6eae-4aca-a22e-3571ae10e8b4";
const privateDetail = "PRIVATE_DATABASE_DETAIL";
const plain = (value) => JSON.parse(JSON.stringify(value));
const options = [
  { id: surgery, name: "Surgery", speciesScope: "all" },
  { id: medicalCare, name: "Medical care", speciesScope: "all" },
  { id: vaccineClinic, name: "Vaccine clinic", speciesScope: "all" },
  { id: dogOnly, name: "Test dog-only option", speciesScope: "dog" },
];

const legacyInput = (overrides = {}) => ({
  firstName: "Jamie", lastName: "Example", phone: "555-0102", email: "", animalName: "", species: "dog",
  sex: "male", alteredStatus: "unknown", age: "", breed: "", colorDescription: "", lastHeatCycleNotes: "",
  helpSummary: "Fictional help request", rabiesStatus: "unknown", preventionUseStatus: "unknown",
  preventionProduct: "", medicalConcerns: "", availableDays: [], transportationNotes: "",
  additionalInformation: "", ...overrides,
});
const input = (overrides = {}) => legacyInput({ serviceIds: [surgery], serviceAdviceRequested: false, ...overrides });

const load = appLoader();
const { getHelpSchema, servicesRequiredMessage, otherSpeciesServicesMessage } =
  load("src/features/assistance/validation/getHelpSchema.ts");
const { optionsForSpecies, serviceAdviceLabel } = load("src/features/assistance/serviceOptions.ts");
const issuesOf = (result) => result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);

// --- Schema -------------------------------------------------------------------

test("services, advice only, and both are valid; output is lowercased and sorted", () => {
  for (const [serviceIds, serviceAdviceRequested] of [[[surgery], false], [[], true], [[vaccineClinic, surgery], true]]) {
    assert.equal(getHelpSchema.safeParse(input({ serviceIds, serviceAdviceRequested })).success, true);
  }
  const parsed = getHelpSchema.parse(input({ serviceIds: [vaccineClinic.toUpperCase(), surgery] }));
  assert.deepEqual(plain(parsed.serviceIds), [surgery, vaccineClinic]);
});

test("the fixed category IDs (version nibble 0) are accepted as format-valid", () => {
  assert.equal(getHelpSchema.safeParse(input({ serviceIds: [surgery, medicalCare, vaccineClinic] })).success, true);
});

test("required: neither a service nor advice reports the plain-language message", () => {
  const result = getHelpSchema.safeParse(input({ serviceIds: [], serviceAdviceRequested: false }));
  assert.deepEqual(issuesOf(result), [`serviceIds: ${servicesRequiredMessage}`]);
  assert.equal(servicesRequiredMessage, "Choose at least one service, or choose “Not sure — I'd like advice.”");
});

test("the services rule reports in the same pass as other field errors", () => {
  const result = getHelpSchema.safeParse(input({ species: "", firstName: "", serviceIds: [], serviceAdviceRequested: false }));
  assert.deepEqual(issuesOf(result).sort(), [
    "firstName: First name is required.", `serviceIds: ${servicesRequiredMessage}`, "species: Select a species.",
  ]);
});

test("species other may only ask for advice", () => {
  assert.deepEqual(issuesOf(getHelpSchema.safeParse(input({ species: "other", serviceIds: [surgery] }))),
    [`serviceIds: ${otherSpeciesServicesMessage}`]);
  assert.equal(getHelpSchema.safeParse(input({ species: "other", serviceIds: [], serviceAdviceRequested: true })).success, true);
});

for (const [label, overrides] of [
  ["non-GUID ID", { serviceIds: ["surgery"] }],
  ["duplicate ID", { serviceIds: [surgery, surgery] }],
  ["case-only duplicate", { serviceIds: [surgery, surgery.toUpperCase()] }],
  ["21 IDs", { serviceIds: Array.from({ length: 21 }, (_, i) => `50000000-0000-0000-0000-${String(i).padStart(12, "0")}`) }],
  ["missing serviceIds", { serviceIds: undefined }],
  ["string serviceIds", { serviceIds: surgery }],
  ["null element", { serviceIds: [surgery, null] }],
  ["missing advice flag", { serviceAdviceRequested: undefined }],
  ["string advice flag", { serviceAdviceRequested: "true" }],
]) {
  test(`${label} fails validation without crashing`, () => {
    let result;
    assert.doesNotThrow(() => { result = getHelpSchema.safeParse(input(overrides)); });
    assert.equal(result.success, false);
  });
}

// --- Server action ---------------------------------------------------------------

function actionHarness(response = { data: [{ assistance_request_id: requestId, status: "new" }], error: null }) {
  const calls = { clients: 0, rpc: [] };
  const loadAction = appLoader({
    "@/lib/supabase/admin": { createAdminClient: () => {
      calls.clients++;
      return { rpc: async (name, payload) => { calls.rpc.push({ name, payload }); return response; } };
    } },
  });
  return { calls, submit: loadAction("src/features/assistance/actions/submitGetHelpRequest.ts").submitGetHelpRequest };
}

test("v2 submission sends contract 2 with canonical service IDs and the advice flag", async () => {
  const h = actionHarness();
  const result = await h.submit({ submissionId, contractVersion: 2,
    data: input({ serviceIds: [vaccineClinic.toUpperCase(), surgery], serviceAdviceRequested: true }) });
  assert.equal(result.success, true);
  const { p_contract_version, p_service_ids, p_service_advice_requested } = h.calls.rpc[0].payload;
  assert.deepEqual(plain({ p_contract_version, p_service_ids, p_service_advice_requested }),
    { p_contract_version: 2, p_service_ids: [surgery, vaccineClinic], p_service_advice_requested: true });
});

test("a legacy v1 envelope (saved before Slice 2a) is sent as contract 1 with no services", async () => {
  const h = actionHarness();
  assert.equal((await h.submit({ submissionId, data: legacyInput() })).success, true);
  const { p_contract_version, p_service_ids, p_service_advice_requested, p_first_name } = h.calls.rpc[0].payload;
  assert.deepEqual(plain({ p_contract_version, p_service_ids, p_service_advice_requested, p_first_name }),
    { p_contract_version: 1, p_service_ids: [], p_service_advice_requested: false, p_first_name: "Jamie" });
});

for (const [label, envelope] of [
  ["v1 envelope carrying service fields (no silent downgrade)", { submissionId, data: input() }],
  ["v2 envelope missing service fields", { submissionId, contractVersion: 2, data: legacyInput() }],
  ["unknown contract version", { submissionId, contractVersion: 3, data: input() }],
  ["contract version as a string", { submissionId, contractVersion: "2", data: input() }],
  ["unexpected envelope key", { submissionId, contractVersion: 2, data: input(), extra: true }],
  ["v2 required rule", { submissionId, contractVersion: 2, data: input({ serviceIds: [], serviceAdviceRequested: false }) }],
]) {
  test(`${label} is rejected before any database client is created`, async () => {
    const h = actionHarness();
    assert.deepEqual(plain(await h.submit(envelope)),
      { success: false, code: "validation", message: "Please review the information you submitted." });
    assert.equal(h.calls.clients, 0);
  });
}

test("a database rejection of an option is reported as unconfirmed without provider detail", async (t) => {
  const logger = t.mock.method(console, "error", () => {});
  const h = actionHarness({ data: null, error: { code: "PT422", message: privateDetail } });
  const result = await h.submit({ submissionId, contractVersion: 2, data: input() });
  assert.equal(result.code, "unconfirmed");
  assert.doesNotMatch(JSON.stringify([result, logger.mock.calls.map((c) => c.arguments)]), new RegExp(privateDetail));
});

// --- Saved attempts (sessionStorage) ------------------------------------------------

const attempts = load("src/features/assistance/lib/publicSubmissionAttempt.ts");
function memoryStorage() {
  const values = new Map();
  return { values, getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) };
}
const formData = (overrides) => getHelpSchema.parse(input(overrides));

test("new attempts save contract 2 with the services; the snapshot is frozen", () => {
  const s = memoryStorage();
  const pending = attempts.beginSubmissionAttempt(s, formData({ serviceIds: [vaccineClinic, surgery], serviceAdviceRequested: true }), () => submissionId);
  const saved = JSON.parse(s.getItem(attempts.submissionStorageKey));
  assert.equal(saved.submission.contractVersion, 2);
  assert.deepEqual(saved.submission.data.serviceIds, [surgery, vaccineClinic]);
  assert.equal(saved.submission.data.serviceAdviceRequested, true);
  assert.throws(() => pending.submission.data.serviceIds.push(medicalCare));
  const restored = attempts.readSubmissionAttempt(s);
  assert.equal(JSON.stringify(attempts.verifyPendingAttempt(s, restored)), JSON.stringify(pending.submission));
});

for (const state of ["pending", "conflict"]) {
  test(`an old ${state} attempt without service fields still restores`, () => {
    const s = memoryStorage();
    s.setItem(attempts.submissionStorageKey, JSON.stringify({ version: 1, state, submission: { submissionId, data: legacyInput() } }));
    const restored = attempts.readSubmissionAttempt(s);
    assert.equal(restored.state, state);
    assert.equal("contractVersion" in restored.submission, false);
    assert.equal(restored.submission.data.serviceIds, undefined);
    assert.equal(s.getItem(attempts.submissionGuardKey), submissionId);
  });
}

test("an old pending attempt retries end to end as contract 1, exactly as saved", async () => {
  const s = memoryStorage();
  s.setItem(attempts.submissionStorageKey, JSON.stringify({ version: 1, state: "pending", submission: { submissionId, data: legacyInput() } }));
  const restored = attempts.readSubmissionAttempt(s);
  const h = actionHarness();
  assert.equal((await h.submit(attempts.verifyPendingAttempt(s, restored))).success, true);
  assert.equal(h.calls.rpc[0].payload.p_submission_id, submissionId);
  assert.equal(h.calls.rpc[0].payload.p_contract_version, 1);
  assert.equal(attempts.finishSubmissionAttempt(s, restored, requestId).state, "complete");
});

for (const [label, tamper] of [
  ["contract version removed from a v2 snapshot", (raw) => { delete raw.submission.contractVersion; }],
  ["contract version added to a v1 snapshot", (raw) => { raw.submission.contractVersion = 2; delete raw.submission.data.serviceIds; delete raw.submission.data.serviceAdviceRequested; }],
  ["service ID replaced with a non-GUID", (raw) => { raw.submission.data.serviceIds = ["surgery"]; }],
]) {
  test(`tampered snapshot fails closed: ${label}`, () => {
    const s = memoryStorage();
    attempts.beginSubmissionAttempt(s, formData(), () => submissionId);
    const raw = JSON.parse(s.getItem(attempts.submissionStorageKey));
    tamper(raw);
    s.setItem(attempts.submissionStorageKey, JSON.stringify(raw));
    assert.throws(() => attempts.readSubmissionAttempt(s));
  });
}

// --- Species filtering ------------------------------------------------------------------

test("options are filtered by species; other and unanswered get none", () => {
  const ids = (species) => plain(optionsForSpecies(options, species).map((option) => option.id));
  assert.deepEqual(ids("dog"), [surgery, medicalCare, vaccineClinic, dogOnly]);
  assert.deepEqual(ids("cat"), [surgery, medicalCare, vaccineClinic]);
  for (const species of ["other", "", undefined, "horse"]) assert.deepEqual(ids(species), []);
});

// --- Form -----------------------------------------------------------------------------------

function find(node, predicate, found = []) {
  if (!node || typeof node !== "object") return found;
  if (predicate(node)) found.push(node);
  for (const child of [node.props?.children].flat(Infinity)) find(child, predicate, found);
  return found;
}
const textOf = (node) => typeof node === "string" ? node : [node?.props?.children].flat(Infinity).map((c) =>
  typeof c === "string" || typeof c === "number" ? String(c) : c && typeof c === "object" ? textOf(c) : "").join("");
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function formHarness(props) {
  const values = new Map();
  const storage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) };
  const states = [], refs = [], effects = [];
  let si = 0, ri = 0, mounted = false, form;
  const loadForm = appLoader({
    react: {
      useState(initial) { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], (v) => { states[i] = typeof v === "function" ? v(states[i]) : v; }]; },
      useRef(initial) { const i = ri++; return refs[i] ??= { current: initial }; },
      useEffect(effect) { if (!mounted) effects.push(effect); },
    },
    "react-hook-form": {
      useForm(formOptions) { form ??= createFormControl(formOptions); return { ...form, formState: { errors: form.control._formState.errors, isSubmitting: false } }; },
      useWatch({ name }) { return form.control._formValues[name]; },
    },
    "@/features/assistance/actions/submitGetHelpRequest": { async submitGetHelpRequest() { throw new Error("not sent in these tests"); } },
  }, {}, { window: { sessionStorage: storage }, queueMicrotask });
  const { GetHelpForm } = loadForm("src/features/assistance/components/GetHelpForm.tsx");
  const render = () => { si = 0; ri = 0; const tree = GetHelpForm(props); mounted = true; return tree; };
  render(); effects.forEach((effect) => effect()); await tick();
  return { render, get form() { return form; } };
}
const serviceInputs = (tree) => find(tree, (n) => n.type === "input" && /^service-\d+$/.test(n.props.id ?? ""));
const serviceNames = (tree) => find(tree, (n) => n.type === "label" && find(n, (c) => /^service-\d+$/.test(c.props?.id ?? "")).length)
  .map((label) => textOf(label));
const changeSpecies = async (h, value) => {
  const select = find(h.render(), (n) => n.type === "select" && n.props.id === "species")[0];
  await select.props.onChange({ target: { name: "species", value }, type: "change" });
};

test("before a species is chosen only “Not sure” is offered, with a hint", async () => {
  const h = await formHarness({ serviceOptions: options });
  const tree = h.render();
  assert.equal(serviceInputs(tree).length, 0);
  assert.equal(find(tree, (n) => n.props?.id === "service-advice").length, 1);
  assert.match(textOf(tree), /Choose a species above to see the services we can help with\./);
  assert.match(textOf(tree), /Which services are you asking about\?/);
  assert.match(textOf(tree), new RegExp(serviceAdviceLabel));
});

test("dog, cat and other show the right options in catalog order", async () => {
  const h = await formHarness({ serviceOptions: options });
  await changeSpecies(h, "dog");
  assert.deepEqual(serviceNames(h.render()), ["Surgery", "Medical care", "Vaccine clinic", "Test dog-only option"]);
  assert.deepEqual(serviceInputs(h.render()).map((n) => n.props.value), [surgery, medicalCare, vaccineClinic, dogOnly]);
  await changeSpecies(h, "cat");
  assert.deepEqual(serviceNames(h.render()), ["Surgery", "Medical care", "Vaccine clinic"]);
  await changeSpecies(h, "other");
  assert.equal(serviceInputs(h.render()).length, 0);
  assert.equal(find(h.render(), (n) => n.props?.id === "service-advice").length, 1);
});

test("changing species removes selections that no longer apply and announces it", async () => {
  const h = await formHarness({ serviceOptions: options });
  await changeSpecies(h, "dog");
  h.form.setValue("serviceIds", [surgery, dogOnly]);
  await changeSpecies(h, "cat");
  assert.deepEqual(plain(h.form.control._formValues.serviceIds), [surgery]);
  const live = () => find(h.render(), (n) => n.props?.["aria-live"] === "polite")[0];
  assert.equal(textOf(live()), "Test dog-only option was removed because it isn't offered for this animal.");
  await changeSpecies(h, "other");
  assert.deepEqual(plain(h.form.control._formValues.serviceIds), []);
  assert.equal(textOf(live()), "Surgery was removed. For other animals, choose “Not sure — I'd like advice” and tell us what you need below.");
  await changeSpecies(h, "dog"); // Nothing removed: the old notice is cleared.
  assert.equal(textOf(live()), "");
});

test("when options fail to load, only “Not sure” is offered with an explanation", async () => {
  const h = await formHarness({ serviceOptions: [], serviceOptionsUnavailable: true });
  await changeSpecies(h, "dog");
  const tree = h.render();
  assert.equal(serviceInputs(tree).length, 0);
  assert.equal(find(tree, (n) => n.props?.id === "service-advice").length, 1);
  assert.match(textOf(tree), /We couldn.t load the list of services right now\./);
});

for (const [species, target] of [["dog", "#service-0"], ["other", "#service-advice"]]) {
  test(`error summary lists the services error in form order, linking to ${target}`, async () => {
    const h = await formHarness({ serviceOptions: options });
    await changeSpecies(h, species);
    const form = find(h.render(), (n) => n.type === "form")[0];
    await form.props.onSubmit({ preventDefault() {}, persist() {} });
    await tick();
    const tree = h.render();
    const links = find(tree, (n) => n.type === "a" && n.props.href?.startsWith("#")).map((a) => [a.props.href, textOf(a)]);
    const hrefs = links.map(([href]) => href);
    assert.ok(hrefs.includes(target), JSON.stringify(links));
    assert.equal(links.find(([href]) => href === target)[1], servicesRequiredMessage);
    assert.ok(hrefs.indexOf(target) < hrefs.indexOf("#help-summary"));
    assert.ok(hrefs.indexOf("#species") < 0 || hrefs.indexOf("#species") < hrefs.indexOf(target));
    const fieldset = find(tree, (n) => n.type === "fieldset" && /services-hint/.test(n.props["aria-describedby"] ?? ""))[0];
    assert.equal(fieldset.props["aria-describedby"], "services-hint services-error");
    // FieldError is a component element: its message is a prop, rendered as #services-error.
    assert.equal(find(fieldset, (n) => n.props?.id === "services" && "message" in n.props)[0].props.message, servicesRequiredMessage);
  });
}

test("service tiles are 44px targets in one column on mobile; “Not sure” spans the row", async () => {
  const h = await formHarness({ serviceOptions: options });
  await changeSpecies(h, "dog");
  const tree = h.render();
  const tiles = find(tree, (n) => n.type === "label" && find(n, (c) => /^service-/.test(c.props?.id ?? "")).length);
  assert.equal(tiles.length, 5);
  for (const tile of tiles) assert.match(tile.props.className, /\bmin-h-11\b/);
  assert.match(tiles.at(-1).props.className, /\bsm:col-span-2\b/);
  const grid = find(tree, (n) => n.type === "div" && serviceInputs(n).length === 4 && /\bgrid\b/.test(n.props.className ?? ""))[0];
  assert.match(grid.props.className, /\bsm:grid-cols-2\b/);
  assert.doesNotMatch(grid.props.className, /(^|\s)grid-cols-/);
});

test("nothing is pre-ticked, including when rabies is not current", async () => {
  const h = await formHarness({ serviceOptions: options });
  await changeSpecies(h, "dog");
  h.form.setValue("rabiesStatus", "not_current");
  h.render();
  assert.deepEqual(plain(h.form.control._formValues.serviceIds), []);
  assert.equal(h.form.control._formValues.serviceAdviceRequested, false);
});

// --- Option loader --------------------------------------------------------------------------

function loaderHarness(result) {
  const calls = [];
  const query = {
    select(columns) { calls.push(["select", columns]); return this; },
    eq(column, value) { calls.push(["eq", column, value]); return this; },
    order(column) { calls.push(["order", column]); return this; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  const loadLoader = appLoader({ "@/lib/supabase/admin": { createAdminClient: () => ({ from(table) { calls.push(["from", table]); return query; } }) } });
  return { calls, get: loadLoader("src/features/assistance/server/getPublicServiceOptions.ts").getPublicServiceOptions };
}

test("loader reads only active public options and returns only id, name and species scope", async () => {
  const h = loaderHarness({ data: [
    { id: surgery, name: "Surgery", species_scope: "all", description: "staff wording", slug: "surgery" },
  ], error: null });
  assert.deepEqual(plain(await h.get()), [{ id: surgery, name: "Surgery", speciesScope: "all" }]);
  assert.deepEqual(h.calls, [["from", "services"], ["select", "id, name, species_scope"],
    ["eq", "is_active", true], ["eq", "is_public_request_option", true], ["order", "sort_order"], ["order", "name"]]);
});

for (const [label, result] of [
  ["provider error", { data: null, error: { message: privateDetail } }],
  ["malformed row", { data: [{ id: "x", name: privateDetail, species_scope: "all" }], error: null }],
  ["unknown species scope", { data: [{ id: surgery, name: "Surgery", species_scope: "bird" }], error: null }],
  ["missing data", { data: null, error: null }],
]) {
  test(`loader returns null with a fixed log on ${label}`, async (t) => {
    const logger = t.mock.method(console, "error", () => {});
    assert.equal(await loaderHarness(result).get(), null);
    assert.deepEqual(plain(logger.mock.calls.map((c) => c.arguments)), [["Public service options could not be loaded."]]);
  });
}

// --- Admin display -------------------------------------------------------------------------------

test("admin summary and animal cards show requested categories and the advice flag", () => {
  const loadAdmin = appLoader();
  const { CaseSummary } = loadAdmin("src/features/assistance/components/CaseSummary.tsx");
  const { CaseAnimals } = loadAdmin("src/features/assistance/components/CaseAnimals.tsx");
  const { requestedServicesText } = loadAdmin("src/features/assistance/components/caseDisplay.ts");
  const request = caseFixture(); // Roscoe: Microchipping; Pigeon: advice only.
  request.request_animals[0].request_animal_services = [
    { id: surgery, notes: null, service: { name: "Surgery", description: null } },
    { id: vaccineClinic, notes: null, service: { name: "Vaccine clinic", description: null } },
  ];
  const summary = renderToStaticMarkup(createElement(CaseSummary, { request }));
  assert.match(summary, /Roscoe: <\/span>Surgery · Vaccine clinic/);
  assert.match(summary, /Pigeon: <\/span>Not sure — asked for advice/);
  const animals = renderToStaticMarkup(createElement(CaseAnimals, { animals: request.request_animals }));
  assert.match(animals, /Applicant chose “Not sure — I&#x27;d like advice\.”/);
  assert.doesNotMatch(animals, /No structured services recorded/);
  const item = (names, advice) => ({ request_animal_services: names.map((name) => ({ service: { name } })), service_advice_requested: advice });
  assert.equal(requestedServicesText(item([], false)), "No structured services recorded");
  assert.equal(requestedServicesText(item(["Surgery"], true)), "Surgery · Not sure — asked for advice");
});

test("admin detail schema requires the advice flag on every animal", () => {
  const { requestDetailSchema } = appLoader({ "@/lib/supabase/admin": {}, "@/features/auth/server/requireAdmin": {} })(
    "src/features/assistance/server/getRequestDetail.ts");
  const request = caseFixture();
  assert.equal(requestDetailSchema.safeParse(request).success, true);
  delete request.request_animals[1].service_advice_requested;
  assert.equal(requestDetailSchema.safeParse(request).success, false);
});
