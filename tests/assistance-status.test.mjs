/* Executes real TS/TSX with only framework/Auth/RPC I/O substituted.
 * SQL enforcement/locking requires the separate PostgreSQL acceptance scripts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { appLoader } from "./helpers/load-app.mjs";
import { caseFixture, eventFixture } from "./fixtures/case.mjs";

const actionPath = "src/features/assistance/actions/transitionRequestStatus.ts";
const schemaPath = "src/features/assistance/validation/statusTransitionSchema.ts";
const queryPath = "src/features/assistance/server/getRequestDetail.ts";
const formPath = "src/features/assistance/components/StatusTransitionForm.tsx";
const adminId = randomUUID();
const otherId = randomUUID();
const requestId = randomUUID();
const statuses = ["new", "under_review", "needs_info", "accepted", "referred", "unable_to_assist"];
const allowed = new Set(["new/under_review", "under_review/needs_info", "under_review/accepted",
  "under_review/referred", "under_review/unable_to_assist", "needs_info/under_review",
  "needs_info/accepted", "needs_info/referred", "needs_info/unable_to_assist"]);
const input = (overrides = {}) => ({ requestId, expectedStatus: "under_review", expectedVersion: 4,
  newStatus: "needs_info", reason: "  Waiting for requested information. \n", ...overrides });
function harness({ user = { id: adminId, email: " verified@example.com " }, ids = adminId,
  verifyError = null, error = null, throws = false, response } = {}) {
  const calls = { privileged: 0, rpc: [], refresh: [] };
  const load = appLoader({
    "next/navigation": { redirect: (destination) => { throw Object.assign(new Error("redirect"), { destination }); } },
    "next/cache": { revalidatePath: (route) => calls.refresh.push(route) },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: verifyError }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => {
      calls.privileged++;
      return { rpc: async (name, args) => {
        calls.rpc.push({ name, args });
        if (throws) throw new Error("PRIVATE_PROVIDER_DETAIL");
        return { data: response === undefined ? [{ status: args.p_new_status, status_version: args.p_expected_version + 1 }] : response, error };
      } }; // No .from/.update: a direct write would fail this harness.
    } },
  }, ids === null ? {} : { MMAC_ADMIN_USER_IDS: ids });
  return { load, calls, action: (value) => load(actionPath).transitionRequestStatus(value) };
}

for (const from of statuses) for (const to of statuses) {
  test(`workflow pair ${from} → ${to}`, async () => {
    const h = harness();
    const permitted = allowed.has(`${from}/${to}`);
    const result = await h.action(input({ expectedStatus: from, newStatus: to }));
    assert.equal(result.success, permitted);
    assert.equal(h.calls.rpc.length, permitted ? 1 : 0);
    if (permitted) { assert.equal(result.version, 5); assert.equal(result.status, to); }
  });
}
for (const [name, options, destination] of [
  ["anonymous", { user: null }, "/admin/login"],
  ["forged administrator metadata/email", { user: { id: otherId, email: "verified@example.com", user_metadata: { id: adminId, role: "admin" } } }, "/admin/denied"],
  ["missing allowlist", { ids: null }, "/admin/denied"],
  ["malformed allowlist", { ids: `${adminId},bad` }, "/admin/denied"],
  ["failed identity verification", { verifyError: {} }, "/admin/login"],
]) test(`${name} denied before privileged client creation`, async () => {
  const h = harness(options);
  await assert.rejects(h.action(input()), { destination });
  assert.equal(h.calls.privileged, 0);
});

for (const overrides of [
  { requestId: "bad" }, { expectedStatus: "completed" }, { newStatus: "care_established" },
  { expectedVersion: -1 }, { expectedVersion: 0.5 }, { expectedVersion: "4" },
  { expectedVersion: undefined }, { expectedVersion: 2147483647 },
  { reason: " \n\t" }, { reason: "x".repeat(10001) }, { reason: null },
]) test(`invalid input rejected: ${Object.keys(overrides)[0]}=${String(Object.values(overrides)[0]).slice(0, 20)}`, async () => {
  const h = harness();
  assert.equal((await h.action(input(overrides))).success, false);
  assert.equal(h.calls.privileged, 0);
});

test("every decision transition requires a reason; only Start Review permits blank", () => {
  const { statusTransitionSchema } = appLoader()(schemaPath);
  for (const pair of allowed) {
    const [expectedStatus, newStatus] = pair.split("/");
    assert.equal(statusTransitionSchema.safeParse(input({ expectedStatus, newStatus, reason: " \n\t" })).success, expectedStatus === "new");
  }
  assert.equal(statusTransitionSchema.safeParse(input({ reason: "x".repeat(10000) })).success, true);
});

test("only verified actor is sent; reason trimmed, expected version preserved, no client timestamps", async () => {
  const h = harness();
  const result = await h.action(input({ actor_user_id: otherId, actor_label: "Forged", occurred_at: "1990-01-01",
    status_version: 999, case_outcome: "care_established", event_type: "interaction" }));
  assert.equal(result.success, true);
  const { name, args } = h.calls.rpc[0];
  assert.equal(name, "transition_assistance_request_status");
  assert.deepEqual(JSON.parse(JSON.stringify(args)), {
    p_request_id: requestId, p_expected_status: "under_review", p_expected_version: 4,
    p_new_status: "needs_info", p_reason: "Waiting for requested information.",
    p_actor_user_id: adminId, p_actor_label: "verified@example.com",
  });
  assert.deepEqual(h.calls.refresh, ["/admin/requests", `/admin/requests/${requestId}`]);
  assert.ok(!JSON.stringify(result).includes(adminId));
});

test("Start Review uses the guarded RPC, accepts no typed reason, requires reviewed version", async () => {
  const h = harness({ user: { id: adminId } });
  const { startRequestReview } = h.load("src/features/assistance/actions/startRequestReview.ts");
  assert.equal((await startRequestReview(requestId, 0)).success, true);
  assert.equal(h.calls.rpc[0].args.p_reason, "");
  assert.equal(h.calls.rpc[0].args.p_actor_label, "Administrator");
  assert.equal(h.calls.rpc[0].args.p_expected_status, "new");
  assert.equal((await startRequestReview(requestId)).success, false);
  assert.equal(h.calls.rpc.length, 1);
});
for (const [code, kind] of [["PT409", "stale"], ["40001", "stale"], ["PT404", "missing"],
  ["PT422", "invalid"], ["42501", "denied"], ["23503", "uncertain"], ["500", "uncertain"]]) {
  test(`RPC ${code} gives safe ${kind} feedback, no automatic retry or cache refresh`, async () => {
    const h = harness({ error: { code, message: "PRIVATE_PROVIDER_DETAIL" } });
    const result = await h.action(input());
    assert.equal(result.success, false);
    assert.equal(result.kind, kind);
    assert.doesNotMatch(result.message, /PRIVATE_PROVIDER_DETAIL/);
    assert.equal(h.calls.rpc.length, 1);
    assert.equal(h.calls.refresh.length, 0);
  });
}
for (const options of [{ throws: true }, { response: null }, { response: [] },
  { response: [{ status: "needs_info", status_version: 6 }] }, { response: [{ status: "accepted", status_version: 5 }] }]) {
  test(`unconfirmed RPC result is never reported as successful: ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    assert.equal((await h.action(input())).kind, "uncertain");
    assert.equal(h.calls.refresh.length, 0);
  });
}

function statusEvent(overrides = {}) {
  return eventFixture({ event_type: "status_change", old_status: "under_review", new_status: "needs_info", status_version: 5,
    interaction_type: null, contact_result: null, case_outcome: null, notes: "Waiting for information.", ...overrides });
}
test("runtime event union rejects mixed/unknown shapes and impossible status pairs", () => {
  const { caseEventSchema } = appLoader()(queryPath);
  assert.equal(caseEventSchema.safeParse(eventFixture()).success, true);
  assert.equal(caseEventSchema.safeParse(statusEvent()).success, true);
  for (const event of [eventFixture({ old_status: "new" }), eventFixture({ interaction_type: null }),
    statusEvent({ interaction_type: "call" }), statusEvent({ contact_result: "sent" }),
    statusEvent({ case_outcome: "care_established" }), statusEvent({ status_version: 0 }),
    statusEvent({ old_status: null }), statusEvent({ old_status: "accepted" }), statusEvent({ event_type: "recording" })]) {
    assert.equal(caseEventSchema.safeParse(event).success, false);
  }
});
test("mixed timeline and latest activity display status names, actor, reason and both dates safely", () => {
  const load = appLoader();
  const event = statusEvent({ notes: '<script>alert("test")</script>' });
  const request = caseFixture();
  const { sortCaseEvents } = load(queryPath);
  const events = sortCaseEvents([eventFixture({ occurred_at: "2026-01-02T12:00:00Z" }), event]);
  assert.equal(events[0].event_type, "status_change");
  const html = renderToStaticMarkup(createElement(load("src/features/assistance/components/CaseTimeline.tsx").CaseTimeline,
    { events, submittedAt: request.submitted_at }));
  assert.match(html, /Under review → Needs information/);
  assert.match(html, /Left message/);
  assert.match(html, /Recorded by administrator@example.com/);
  assert.match(html, /&lt;script&gt;/);
  assert.ok(html.includes(event.occurred_at) && html.includes(event.created_at));
  const summary = renderToStaticMarkup(createElement(load("src/features/assistance/components/CaseSummary.tsx").CaseSummary,
    { request, latest: event }));
  assert.match(summary, /Under review → Needs information/);
});

test("controls expose only valid next states; terminal decisions keep activity wording, no submit", () => {
  const load = appLoader({ "next/navigation": { useRouter: () => ({ refresh() {} }) } });
  const { StatusTransitionForm } = load(formPath);
  for (const status of statuses) {
    const html = renderToStaticMarkup(createElement(StatusTransitionForm, { requestId, status, version: 0 }));
    const options = Array.from(html.matchAll(/<option value="([^"]+)"/g), (match) => match[1]);
    const expected = [...allowed].filter((pair) => pair.startsWith(`${status}/`)).map((pair) => pair.split("/")[1]);
    assert.deepEqual(options, status === "new" ? [] : expected);
    if (status === "new") { assert.match(html, /Start Review/); assert.doesNotMatch(html, /textarea/); }
    else if (expected.length) { assert.match(html, /textarea[^>]+required/); assert.match(html, /Choose a status/); }
    else { assert.doesNotMatch(html, /type="submit"/); assert.match(html, /continue documenting case activity/); }
  }
});

test("no application status writer bypasses RPC; migration includes lock and effective privilege safeguards", () => {
  for (const file of [actionPath, "src/features/assistance/actions/startRequestReview.ts",
    "src/features/assistance/actions/addRequestInteraction.ts"]) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /\.update\(/);
  }
  const sql = fs.readFileSync("supabase/migrations/20260920000000_audited_request_status_workflow.sql", "utf8");
  // Structure checks only, not proof of executable SQL or PostgreSQL permissions.
  assert.match(sql, /for update;/);
  assert.match(sql, /status_version is distinct from p_expected_version/);
  assert.match(sql, /revoke update \(status, status_version\)/);
  assert.match(sql, /has_column_privilege/);
  assert.match(sql, /pg_has_role/);
  assert.match(sql, /security definer set search_path = ''/);
});

// Small hook-state harness to exercise real form handlers without a DOM library.
// Browser rendering/focus/navigation acceptance is still a separate requirement.
function formHarness(reply) {
  let cursor = 0;
  const slots = [];
  const calls = { transitions: [], refresh: 0 };
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
  };
  const load = appLoader({
    react: { useState, useActionState: (callback, initial) => {
      const [state, setState] = useState(initial);
      return [state, async (form) => { setState(await callback(state, form)); }, false];
    } },
    "next/navigation": { useRouter: () => ({ refresh: () => calls.refresh++ }) },
    "../actions/transitionRequestStatus": { transitionRequestStatus: async (value) => { calls.transitions.push(value); return reply; } },
    "../actions/startRequestReview": { startRequestReview: async () => reply },
  });
  function render(props = { requestId, status: "under_review", version: 4 }) {
    cursor = 0;
    return load(formPath).StatusTransitionForm(props);
  }
  return { render, calls };
}
function elements(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  return [...(predicate(node) ? [node] : []), ...elements(node.props?.children, predicate)];
}
function element(node, type, name) {
  return elements(node, (item) => item.type === type && (!name || item.props.name === name))[0];
}

test("stale feedback retains reason, disables resubmission and never silently adopts a refreshed version", async () => {
  const h = formHarness({ success: false, kind: "stale", message: "The case changed." });
  let view = h.render();
  element(view, "textarea").props.onChange({ target: { value: "Keep this draft reason." } });
  element(view, "select").props.onChange({ target: { value: "accepted" } });
  view = h.render();
  const form = new FormData(); form.set("newStatus", "accepted"); form.set("reason", "Keep this draft reason.");
  await element(view, "form").props.action(form);
  view = h.render({ requestId, status: "needs_info", version: 5 });
  assert.equal(element(view, "textarea").props.value, "Keep this draft reason.");
  assert.equal(element(view, "fieldset").props.disabled, true);
  assert.equal(h.calls.transitions.length, 1);
  assert.equal(h.calls.transitions[0].expectedVersion, 4);
  const buttons = elements(view, (item) => item.type === "button");
  buttons.find((button) => button.props.children === "Reload case").props.onClick();
  assert.equal(h.calls.refresh, 1);
  assert.equal(h.calls.transitions.length, 1);
  buttons.find((button) => button.props.children === "I have reviewed the current case").props.onClick();
  view = h.render({ requestId, status: "needs_info", version: 5 });
  assert.equal(element(view, "fieldset").props.disabled, false);
  assert.equal(element(view, "select").props.value, "");
  assert.equal(element(view, "textarea").props.value, "Keep this draft reason.");
  // Only a new deliberate submit uses the newly acknowledged state/version.
  await element(view, "form").props.action(form);
  assert.equal(h.calls.transitions[1].expectedStatus, "needs_info");
  assert.equal(h.calls.transitions[1].expectedVersion, 5);
});

test("a successful response clears draft selection/reason and adopts returned version", async () => {
  const h = formHarness({ success: true, kind: "saved", status: "needs_info", version: 5, message: "Saved" });
  let view = h.render();
  element(view, "textarea").props.onChange({ target: { value: "Decision reason" } });
  view = h.render();
  const form = new FormData(); form.set("newStatus", "needs_info"); form.set("reason", "Decision reason");
  await element(view, "form").props.action(form);
  view = h.render({ requestId, status: "needs_info", version: 5 });
  assert.equal(element(view, "textarea").props.value, "");
  assert.equal(element(view, "select").props.value, "");
  assert.equal(element(view, "fieldset").props.disabled, false);
  assert.match(renderToStaticMarkup(view), /role="status">Saved/);
});
