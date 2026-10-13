/* Real PostgreSQL / TWO independent psql connections. Never points at Supabase.
 * Requires an already-migrated disposable local DB (see acceptance document).
 * Deliberately retains fictional fixtures; destroy the disposable DB afterwards.
 * No npm dependency, credentials on command lines, or implicit migration apply.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
const database = process.env.MMAC_TEST_DATABASE;
const host = process.env.PGHOST;
if (process.env.MMAC_DISPOSABLE_DB !== "yes" || !/^mmac_idempotency_test_[a-z0-9_]+$/.test(database ?? "")
  || !(host === "127.0.0.1" || host === "localhost" || host === "::1" || host?.startsWith("/"))) {
  console.error("BLOCKED: explicit MMAC_DISPOSABLE_DB=yes, MMAC_TEST_DATABASE=mmac_idempotency_test_<name>, and local PGHOST required.");
  process.exit(2);
}
const env = { ...process.env, PGDATABASE: database };
delete env.PGSERVICE;
delete env.PGHOSTADDR; // Cannot override the explicitly approved local host.
delete env.PGSERVICEFILE;
env.PGOPTIONS = "-c statement_timeout=15000 -c lock_timeout=12000";
const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"];
const probe = spawnSync("psql", ["--version"], { encoding: "utf8" });
if (probe.error || probe.status !== 0) { console.error("BLOCKED: psql is unavailable."); process.exit(2); }
function sql(statement) {
  const r = spawnSync("psql", args, { env, input: statement, encoding: "utf8", timeout: 15000 });
  assert.equal(r.status, 0, "psql check failed: " + (r.stderr || r.error?.message));
  return r.stdout.trim();
}
assert.equal(sql("select current_database();"), database);
assert.equal(sql("select coalesce(inet_server_addr()::text in ('127.0.0.1','::1'),true);"), "t");
assert.equal(sql("select to_regclass('public.public_assistance_submission_receipts') is not null;"), "t", "Apply migrations to the DISPOSABLE database first");
const tables = ["people","households","household_members","animals","assistance_requests","request_animals","prescreens","request_availability","public_assistance_submission_receipts"];
const counts = () => JSON.parse(sql("select json_build_array(" + tables.map(t => `(select count(*) from public.${t})`).join(",") + ");"));
function invocation(key, summary = "Fictional concurrency test") {
  // All interpolated inputs here are locally generated UUIDs or fixed test text.
  return `select assistance_request_id from public.submit_public_assistance_request('${key}'::uuid,
    'Fictional','Concurrency','555-0102','','Test animal','dog','male','unknown',2.5,
    '','','${summary}',null,'','','unknown','unknown','','','',array['monday']::text[]);`;
}
function session(name) {
  const child = spawn("psql", args, { env: { ...env, PGAPPNAME: name }, stdio: ["pipe","pipe","pipe"] });
  let out = "", err = "";
  child.stdout.on("data", d => { out += d; }); child.stderr.on("data", d => { err += d; });
  const done = new Promise((resolve, reject) => { child.on("error", reject); child.on("close", code => resolve({ code, out, err })); });
  return { child, done, output: () => out };
}
async function until(check, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (check()) return; await delay(30); }
  throw Error("Timed out: " + label);
}
async function race({ mismatch = false, rollback = false, isolation = "read committed" }) {
  const key = randomUUID(), before = counts();
  const name = "mmac_submission_" + key.replaceAll("-", "");
  const a = session(name + "a"), b = session(name + "b");
  try {
    a.child.stdin.write(`begin isolation level ${isolation}; set local role service_role;\n` + invocation(key) + "\n\\echo CLAIM_READY\n");
    await until(() => a.output().includes("CLAIM_READY"), "A claimed identifier");
    b.child.stdin.end(`begin isolation level ${isolation}; set local role service_role;\n` + invocation(key, mismatch ? "Different fictional details" : undefined) + "\ncommit;\n");
    await until(() => sql(`select exists(select 1 from pg_stat_activity b join pg_stat_activity a on a.pid = any(pg_blocking_pids(b.pid)) where b.application_name='${name}b' and a.application_name='${name}a' and a.pid <> b.pid and b.wait_event_type='Lock');`) === "t", "B waits on A's uncommitted claim");
    a.child.stdin.end(rollback ? "rollback;\n" : "commit;\n");
    const [ra, rb] = await Promise.all([a.done, b.done]);
    assert.equal(ra.code, 0, ra.err);
    if (isolation !== "read committed" && !rollback) { assert.notEqual(rb.code, 0); assert.match(rb.err, /40001/); }
    else if (mismatch && !rollback) { assert.notEqual(rb.code, 0); assert.match(rb.err, /PT409/); }
    else { assert.equal(rb.code, 0, rb.err); if (!rollback) assert.equal(ra.out.split("\n")[0], rb.out.split("\n")[0]); }
    const after = counts();
    after.forEach((n,i) => assert.equal(n, before[i] + 1, "exactly one row in " + tables[i]));
    // Simulate lost success response: discard it and retry the original payload.
    const beforeReplay = counts();
    const replay = sql("set role service_role;\n" + invocation(key, mismatch && rollback ? "Different fictional details" : undefined));
    assert.match(replay, /^[0-9a-f-]{36}$/);
    assert.equal(replay, (rollback ? rb : ra).out.split("\n")[0], "replay returns the COMMITTED winner, not a rolled-back ID");
    assert.deepEqual(counts(), beforeReplay);
    console.log("PASS real concurrency", { mismatch, rollback, isolation });
  } finally {
    a.child.kill(); b.child.kill();
  }
}
for (const isolation of ["read committed", "repeatable read", "serializable"]) {
  await race({ isolation });
  await race({ isolation, mismatch: true });
  await race({ isolation, rollback: true });
  await race({ isolation, mismatch: true, rollback: true });
}
console.log("PASS all 12 real PostgreSQL concurrency scenarios; fictional fixtures remain in the disposable database.");
