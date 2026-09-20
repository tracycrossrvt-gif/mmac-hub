/* Integration check for the production Next server and actual Supabase SDK.
 * Auth and REST are synthetic local HTTP services, NOT live Supabase/PostgreSQL.
 * Run after npm run build. No credentials, dependencies or application files change.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { caseFixture } from "./fixtures/case.mjs";
const requireModule = createRequire(import.meta.url);
const { encodeReply } = requireModule("next/dist/compiled/react-server-dom-webpack/client.node");
const request = caseFixture();
const approvedId = randomUUID();
const otherId = randomUUID();
const events = [];
const unit4 = process.argv.includes("--unit4");
const traffic = { reads: 0, inserts: 0, publicWrites: 0, transitions: 0 };
const users = new Map();
function sessionCookie(id) {
  const user = { id, aud: "authenticated", role: "authenticated", email: "verified@example.com",
    app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const encode = (data) => Buffer.from(JSON.stringify(data)).toString("base64url");
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, exp: expires, aud: "authenticated" })}.synthetic-test-signature`;
  users.set(token, user);
  const session = { access_token: token, refresh_token: "synthetic-test-refresh", token_type: "bearer",
    expires_at: expires, expires_in: 3600, user };
  return `sb-127-auth-token=base64-${encode(session)}`;
}
const approvedCookie = sessionCookie(approvedId);
const otherCookie = sessionCookie(otherId);
const mock = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body));
  };
  if (url.pathname === "/auth/v1/user") {
    const user = users.get(req.headers.authorization?.replace("Bearer ", ""));
    return send(user ? 200 : 401, user ?? { message: "No user" });
  }
  if (url.pathname === "/rest/v1/assistance_requests") {
    traffic.reads++;
    const single = req.headers.accept?.includes("application/vnd.pgrst.object+json");
    return send(200, single ? request : [request]);
  }
  if (url.pathname === "/rest/v1/assistance_request_events") {
    if (req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body);
      traffic.inserts++;
      events.push({ ...payload, id: randomUUID(), event_type: "interaction", old_status: null, new_status: null, status_version: null,
        occurred_at: payload.occurred_at ?? new Date().toISOString(), created_at: new Date().toISOString() });
      return send(201, null);
    }
    traffic.reads++;
    return send(200, events);
  }
  if (url.pathname === "/rest/v1/rpc/transition_assistance_request_status" && unit4) {
    let body = "";
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    traffic.transitions++;
    // Synthetic contract response only. SQL rules/atomicity are tested separately
    // against PostgreSQL, not proven by this in-memory endpoint.
    if (payload.p_expected_status !== request.status || payload.p_expected_version !== request.status_version) {
      return send(409, { code: "PT409", message: "Stale case" });
    }
    const previous = request.status;
    request.status = payload.p_new_status;
    request.status_version++;
    events.push({ id: randomUUID(), event_type: "status_change", assistance_request_id: request.id,
      old_status: previous, new_status: request.status, status_version: request.status_version,
      interaction_type: null, contact_result: null, case_outcome: null,
      notes: payload.p_reason || "Review started.", actor_user_id: payload.p_actor_user_id,
      actor_label: payload.p_actor_label, occurred_at: new Date().toISOString(), created_at: new Date().toISOString() });
    return send(200, [{ status: request.status, status_version: request.status_version }]);
  }
  if (url.pathname === "/rest/v1/rpc/submit_public_assistance_request") {
    traffic.publicWrites++;
    return send(200, [{ assistance_request_id: randomUUID(), status: "new" }]);
  }
  return send(404, { message: "Unexpected test endpoint" });
});
mock.listen(0, "127.0.0.1");
await once(mock, "listening");
// Reserve an ephemeral app port, then release it immediately before Next starts.
const portProbe = createServer();
portProbe.listen(0, "127.0.0.1");
await once(portProbe, "listening");
const appPort = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const base = `http://127.0.0.1:${appPort}`;
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(appPort), "-H", "127.0.0.1"], {
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${mock.address().port}`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "unit3-public-test-placeholder",
    SUPABASE_SECRET_KEY: "unit3-privileged-test-placeholder", MMAC_ADMIN_USER_IDS: approvedId },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
child.stdout.on("data", (data) => { serverOutput += data; });
child.stderr.on("data", (data) => { serverOutput += data; });
const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
function actionId(name) {
  const entry = Object.entries(manifest.node).find(([, action]) => action.exportedName === name);
  assert.ok(entry, `Built server action ${name} exists`);
  return entry[0];
}
async function callAction(route, name, args, cookie) {
  return fetch(base + route, { method: "POST", redirect: "manual", body: await encodeReply(args),
    headers: { "Next-Action": actionId(name), Origin: base, ...(cookie ? { Cookie: cookie } : {}) } });
}
try {
  for (let attempts = 0; ; attempts++) {
    try { await fetch(base + "/admin/login"); break; } catch {
      if (attempts >= 100 || child.exitCode !== null) throw new Error("Next server did not start");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  for (const route of ["/get-help", "/admin/login", "/admin/denied"]) {
    assert.equal((await fetch(base + route)).status, 200, route);
    console.log(`PASS ${route}: 200`);
  }
  const detailRoute = `/admin/requests/${request.id}`;
  for (const route of ["/admin/requests", detailRoute]) {
    const before = traffic.reads;
    for (const [cookie, destination] of [[null, "/admin/login"], [otherCookie, "/admin/denied"]]) {
      const response = await fetch(base + route, { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
      assert.equal(response.status, 307);
      assert.equal(new URL(response.headers.get("location"), base).pathname, destination);
    }
    assert.equal(traffic.reads, before, "denied pages must never reach privileged REST reads");
  }
  console.log("PASS anonymous and non-admin queue/detail: denied before database reads");
  const allowed = await fetch(base + detailRoute, { headers: { Cookie: approvedCookie } });
  assert.equal(allowed.status, 200);
  const html = await allowed.text();
  for (const phrase of ["Roscoe", "Pigeon", "Microchipping", "Recorded diagnostic", "Document an interaction"]) assert.ok(html.includes(phrase), phrase);
  for (const privateValue of [approvedId, "unit3-privileged-test-placeholder", "MMAC_ADMIN_USER_IDS"]) assert.ok(!html.includes(privateValue));
  console.log("PASS approved detail: all animals/services/diagnostics render; no actor UUID or secret serialized");
  const form = new FormData();
  for (const [key, value] of Object.entries({ requestId: request.id, interactionType: "call", contactResult: "contacted",
    caseOutcome: "care_established", notes: "HTTP integration interaction", actor_user_id: otherId, actor_label: "Forged" })) form.set(key, value);
  for (const [cookie, destination] of [[null, "/admin/login"], [otherCookie, "/admin/denied"]]) {
    const before = { ...traffic };
    const response = await callAction(detailRoute, "addRequestInteraction", [{ success: false, message: "" }, form], cookie);
    assert.ok(response.headers.get("x-action-redirect")?.startsWith(destination));
    await response.text();
    assert.deepEqual(traffic, before);
  }
  console.log("PASS anonymous and non-admin direct action POST: denied before database access");
  const saved = await callAction(detailRoute, "addRequestInteraction", [{ success: false, message: "" }, form], approvedCookie);
  const savedBody = await saved.text();
  assert.match(savedBody, /Interaction saved/);
  assert.equal(events.length, 1);
  assert.equal(events[0].actor_user_id, approvedId);
  assert.equal(events[0].actor_label, "verified@example.com");
  assert.equal(request.status, "under_review");
  const reloaded = await fetch(base + detailRoute, { headers: { Cookie: approvedCookie } });
  assert.match(await reloaded.text(), /HTTP integration interaction/);
  console.log("PASS approved action POST and reload: interaction retained by mock store; status unchanged; actor verified");
  const invalid = new FormData();
  for (const [key, value] of form) invalid.set(key, value);
  invalid.set("occurredAt", "2025-01-01T00:00:00Z");
  const rejected = await callAction(detailRoute, "addRequestInteraction", [{ success: false, message: "" }, invalid], approvedCookie);
  assert.match(await rejected.text(), /cannot predate/);
  assert.equal(events.length, 1);
  console.log("PASS pre-request interaction rejected through actual server-action transport");
  const intake = { firstName: "Public", lastName: "Fixture", phone: "555-0102", email: "",
    animalName: "Test pet", species: "dog", sex: "male", alteredStatus: "altered", age: "2",
    helpSummary: "Fictional test request", rabiesStatus: "current", preventionUseStatus: "unknown", availableDays: [] };
  const publicResponse = await callAction("/get-help", "submitGetHelpRequest", [intake]);
  assert.match(await publicResponse.text(), /"success":true/);
  assert.equal(traffic.publicWrites, 1);
  console.log("PASS anonymous public intake still reaches its existing RPC (mocked)");
  if (unit4) {
    const decision = { requestId: request.id, expectedStatus: "under_review", expectedVersion: 0,
      newStatus: "needs_info", reason: "HTTP decision reason", actor_user_id: otherId, actor_label: "Forged" };
    for (const [cookie, destination] of [[null, "/admin/login"], [otherCookie, "/admin/denied"]]) {
      const before = { ...traffic };
      const denied = await callAction(detailRoute, "transitionRequestStatus", [decision], cookie);
      assert.ok(denied.headers.get("x-action-redirect")?.startsWith(destination));
      await denied.text();
      assert.deepEqual(traffic, before);
    }
    const changed = await callAction(detailRoute, "transitionRequestStatus", [decision], approvedCookie);
    assert.match(await changed.text(), /Status changed and recorded/);
    assert.equal(request.status, "needs_info");
    assert.equal(request.status_version, 1);
    assert.equal(events[1].actor_user_id, approvedId);
    assert.equal(events[1].actor_label, "verified@example.com");
    const stale = await callAction(detailRoute, "transitionRequestStatus", [decision], approvedCookie);
    assert.match(await stale.text(), /case changed after you opened/);
    assert.equal(request.status_version, 1);
    assert.equal(events.length, 2);
    const mixed = await fetch(base + detailRoute, { headers: { Cookie: approvedCookie } });
    const mixedHtml = await mixed.text();
    for (const text of ["Under review → Needs information", "HTTP decision reason", "HTTP integration interaction"]) assert.ok(mixedHtml.includes(text), text);
    console.log("PASS Unit 4 actual action transport: denial, verified actor, RPC result, stale feedback and mixed timeline reload (mock DB)");
  }
  console.log("HTTP integration checks passed. This is not live database or browser acceptance.");
} catch (error) {
  console.error(serverOutput.slice(-4000));
  throw error;
} finally {
  child.kill();
  await once(child, "exit");
  await new Promise((resolve) => mock.close(resolve));
}
