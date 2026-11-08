import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { appLoader } from "./helpers/load-app.mjs";
import { caseFixture, eventFixture } from "./fixtures/case.mjs";

const adminId = randomUUID();
const otherId = randomUUID();
const actionPath = "src/features/assistance/actions/addRequestInteraction.ts";
const queryPath = "src/features/assistance/server/getRequestDetail.ts";
const validationPath = "src/features/assistance/validation/requestInteractionSchema.ts";
const initialState = { success: false, message: "" };

function harness({ ids = adminId, user = { id: adminId, email: "verified@example.com" }, verifyError = null,
  request = caseFixture(), readError = null, historyError = null, insertError = null, throwInsert = false,
  pages = [[]] } = {}) {
  const calls = { privileged: 0, verification: 0, inserts: [], revalidate: [], reads: [], cursors: [] };
  let pageIndex = 0;
  const query = (table) => {
    calls.reads.push(table);
    const chain = {
      select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
      lt: (_column, value) => { calls.cursors.push(value); return chain; },
      maybeSingle: async () => ({ data: request, error: readError }),
      then: (resolve, reject) => Promise.resolve({ data: pages[pageIndex++] ?? [], error: historyError }).then(resolve, reject),
      insert: async (payload) => {
        calls.inserts.push(payload);
        if (throwInsert) throw new Error("PRIVATE_PROVIDER_DETAILS");
        return { error: insertError };
      },
    };
    return chain;
  };
  const load = appLoader({
    "next/navigation": { redirect: (destination) => { throw Object.assign(new Error("redirect"), { destination }); } },
    "next/cache": { revalidatePath: (route) => calls.revalidate.push(route) },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => {
      calls.verification++; return { data: { user }, error: verifyError };
    } } }) },
    "@/lib/supabase/admin": { createAdminClient: () => { calls.privileged++; return { from: query }; } },
  }, ids === null ? {} : { MMAC_ADMIN_USER_IDS: ids });
  return { load, calls, request };
}
function form(requestId, overrides = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ requestId, interactionType: "call", contactResult: "contacted",
    caseOutcome: "care_established", notes: "  Spoke with the requester.  ", ...overrides })) {
    result.set(key, value);
  }
  return result;
}

for (const [name, options, destination] of [
  ["anonymous", { user: null }, "/admin/login"],
  ["non-allowlisted with misleading metadata", { user: { id: otherId, email: "verified@example.com", user_metadata: { role: "admin", id: adminId } } }, "/admin/denied"],
  ["missing config", { ids: null }, "/admin/denied"],
  ["malformed config", { ids: `${adminId},bad` }, "/admin/denied"],
  ["unverified identity", { verifyError: {} }, "/admin/login"],
]) {
  test(`${name}: both new entry points deny before privileged access`, async () => {
    const h = harness(options);
    await assert.rejects(h.load(actionPath).addRequestInteraction(initialState, form(h.request.id)), { destination });
    await assert.rejects(h.load(queryPath).getRequestDetail(h.request.id), { destination });
    assert.equal(h.calls.privileged, 0);
    assert.equal(h.calls.inserts.length, 0);
  });
}

test("valid insert derives actor, omits audit/status fields, trims notes and refreshes detail", async () => {
  const h = harness();
  const result = await h.load(actionPath).addRequestInteraction(initialState, form(h.request.id, {
    actor_user_id: otherId, actor_label: "Forged", created_at: "1999-01-01", status: "accepted", event_type: "status_change",
  }));
  assert.equal(result.success, true);
  const payload = h.calls.inserts[0];
  assert.equal(payload.actor_user_id, adminId);
  assert.equal(payload.actor_label, "verified@example.com");
  assert.equal(payload.notes, "Spoke with the requester.");
  for (const key of ["created_at", "status", "event_type", "occurred_at", "id"]) assert.equal(key in payload, false);
  assert.equal(h.request.status, "under_review");
  assert.deepEqual(h.calls.revalidate, [`/admin/requests/${h.request.id}`]);
});

test("malformed action arguments fail safely before privileged access", async () => {
  const h = harness();
  assert.equal((await h.load(actionPath).addRequestInteraction(initialState, null)).success, false);
  assert.equal(h.calls.privileged, 0);
});

for (const [type, results] of [["call", ["contacted", "left_message", "no_answer", "other"]],
  ["text", ["sent", "received", "other"]], ["email", ["sent", "received", "other"]], ["note", [""]]]) {
  for (const result of results) test(`${type}/${result || "no result"} saves`, async () => {
    const h = harness();
    assert.equal((await h.load(actionPath).addRequestInteraction(initialState,
      form(h.request.id, { interactionType: type, contactResult: result }))).success, true);
  });
}

for (const overrides of [
  { notes: " \n\t" }, { notes: "x".repeat(10001) }, { interactionType: "recording" },
  { contactResult: "sent" }, { contactResult: "" }, { interactionType: "note", contactResult: "contacted" },
  { interactionType: "text", contactResult: "no_answer" }, { caseOutcome: "accepted" },
  { requestId: "bad" }, { occurredAt: "not a date" }, { occurredAt: "2026-01-01T10:00:00" },
]) {
  test(`invalid input is rejected: ${Object.keys(overrides).join()}/${String(Object.values(overrides)[0]).slice(0,25)}`, async () => {
    const h = harness();
    assert.equal((await h.load(actionPath).addRequestInteraction(initialState, form(h.request.id, overrides))).success, false);
    assert.equal(h.calls.privileged, 0);
  });
}

test("date boundaries: request creation allowed, before creation denied, two-minute tolerance", () => {
  const { occurrenceError } = appLoader()(validationPath);
  const now = Date.parse("2026-01-02T12:00:00Z");
  const start = "2026-01-01T12:00:00Z";
  assert.equal(occurrenceError(start, start, now), null);
  assert.match(occurrenceError("2026-01-01T11:59:59Z", start, now), /predate/);
  assert.equal(occurrenceError(undefined, start, now), null);
  assert.equal(occurrenceError(new Date(now + 120000).toISOString(), start, now), null);
  assert.match(occurrenceError(new Date(now + 120001).toISOString(), start, now), /future/);
});

test("action denies dates before the actual parent creation and meaningful future times", async () => {
  for (const occurredAt of ["2025-12-31T12:00:00Z", new Date(Date.now() + 300000).toISOString()]) {
    const h = harness();
    assert.equal((await h.load(actionPath).addRequestInteraction(initialState, form(h.request.id, { occurredAt }))).success, false);
    assert.equal(h.calls.inserts.length, 0);
  }
});

test("backdated insert preserves occurrence time and uses a generic label only when verified email absent", async () => {
  const h = harness({ user: { id: adminId } });
  const occurredAt = "2026-01-02T12:00:00Z";
  assert.equal((await h.load(actionPath).addRequestInteraction(initialState, form(h.request.id, { occurredAt }))).success, true);
  assert.equal(h.calls.inserts[0].occurred_at, occurredAt);
  assert.equal(h.calls.inserts[0].actor_label, "Administrator");
});

for (const options of [{ request: null }, { readError: {} }, { insertError: { message: "PRIVATE_PROVIDER_DETAILS" } }, { throwInsert: true }]) {
  test(`persistence failure is safe: ${Object.keys(options)[0]}`, async () => {
    const h = harness(options);
    const result = await h.load(actionPath).addRequestInteraction(initialState, form(randomUUID()));
    assert.equal(result.success, false);
    assert.doesNotMatch(result.message, /PRIVATE_PROVIDER_DETAILS/);
    assert.equal(h.calls.revalidate.length, 0);
  });
}

test("detail supports singular prescreens, missing prescreens, every animal and no actor UUID payload", async () => {
  const h = harness({ pages: [[eventFixture({ actor_user_id: otherId })]] });
  const detail = await h.load(queryPath).getRequestDetail(h.request.id);
  assert.equal(detail.request.request_animals.length, 2);
  assert.equal(detail.request.request_animals[0].prescreens.rabies_status, "current");
  assert.equal(detail.request.request_animals[1].prescreens, null);
  assert.equal("actor_user_id" in detail.events[0], false);
});

test("history is fully paged and sorted by occurrence rather than recording time", async () => {
  const firstPage = Array.from({ length: 200 }, () => eventFixture());
  const recent = eventFixture({ occurred_at: "2026-01-05T12:00:00Z", created_at: "2026-01-05T12:00:00Z" });
  const h = harness({ pages: [firstPage, [recent]] });
  const detail = await h.load(queryPath).getRequestDetail(h.request.id);
  assert.equal(detail.events.length, 201);
  assert.equal(detail.events[0].id, recent.id);
  assert.equal(h.calls.cursors[0], firstPage[199].id);
});

test("a missing request is distinct from request/history failure and malformed relation data", async () => {
  const missing = harness({ request: null });
  assert.equal(await missing.load(queryPath).getRequestDetail(randomUUID()), null);
  for (const options of [{ readError: {} }, { historyError: {} }, { request: { id: randomUUID() } }]) {
    const h = harness(options);
    await assert.rejects(h.load(queryPath).getRequestDetail(randomUUID()), /Unable to load this case/);
  }
});

test("case components render all animals, health, services and clear missing states; escape notes", () => {
  const load = appLoader();
  const request = caseFixture();
  const { CaseSummary } = load("src/features/assistance/components/CaseSummary.tsx");
  const { CaseAnimals } = load("src/features/assistance/components/CaseAnimals.tsx");
  const { CaseTimeline } = load("src/features/assistance/components/CaseTimeline.tsx");
  const summary = renderToStaticMarkup(createElement(CaseSummary, { request }));
  assert.match(summary, /2 animals/);
  assert.match(summary, /Not recorded/);
  assert.match(summary, /Not provided/);
  assert.match(summary, /\$0\.00/);
  assert.match(summary, /Original request explanation/);
  const animals = renderToStaticMarkup(createElement(CaseAnimals, { animals: request.request_animals }));
  for (const label of ["Roscoe", "Pigeon", "Microchipping", "Recorded concern", "Recorded diagnostic", "No prescreen information recorded"]) assert.ok(animals.includes(label));
  const timeline = renderToStaticMarkup(createElement(CaseTimeline, { submittedAt: request.submitted_at,
    events: [eventFixture({ notes: '<script>alert("test")</script>' })] }));
  assert.doesNotMatch(timeline, /<script>/);
  assert.match(timeline, /&lt;script&gt;/);
  assert.match(timeline, /Recorded by administrator@example.com/);
  assert.ok(timeline.indexOf("Request submitted") > timeline.indexOf("Left message"));
});
