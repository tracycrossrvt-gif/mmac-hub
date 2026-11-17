/* Execute real migration SQL in disposable, in-memory PGlite PostgreSQL.
 * No Supabase/network connection and no concurrency acceptance claim.
 * Supply an external PGlite module path; no application dependency is added.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const modulePath = process.env.MMAC_PGLITE_MODULE;
const { PGlite } = modulePath ? await import(pathToFileURL(modulePath).href) : {};
const options = { skip: !modulePath && "Set MMAC_PGLITE_MODULE to run actual in-memory migration SQL" };
const directory = "supabase/migrations/";
const prerequisite = "20260919000000_normalize_assistance_request_privileges.sql";
const unit4 = "20260920000000_audited_request_status_workflow.sql";
const migrations = fs.readdirSync(directory).filter((f) => f.endsWith(".sql")).sort();
const sql = (file) => fs.readFileSync(directory + file, "utf8");

async function fixture(t, broad = false, nonSuperuserOwner = false) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email text);
    grant usage on schema public to anon, authenticated, service_role;
    ${nonSuperuserOwner ? `create role migration_owner bypassrls;
    grant usage, create on schema public to migration_owner;
    grant usage on schema auth to migration_owner;
    grant references on auth.users to migration_owner;
    set role migration_owner;` : ""}
    ${broad ? `alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;` : ""}
  `);
  for (const file of migrations.filter((f) => f < prerequisite)) await db.exec(sql(file));
  return db;
}

async function catalog(db) {
  return (await db.query(`select c.relowner, c.relacl::text, c.relrowsecurity,
    (select coalesce(jsonb_agg(p order by p.policyname), '[]') from pg_policies p
      where p.schemaname='public' and p.tablename='assistance_requests') as policies,
    (select jsonb_agg(d order by d.oid) from pg_default_acl d) as defaults,
    (select jsonb_agg(m order by m.oid) from pg_auth_members m) as memberships
    from pg_class c where c.oid='public.assistance_requests'::regclass`)).rows[0];
}

async function rejectsMigration(db, pattern) {
  await assert.rejects(db.exec(sql(prerequisite)), (e) => e.code === "P0001" && pattern.test(e.message));
  await db.exec("rollback");
}

async function checkAccess(db) {
  for (const role of ["anon", "authenticated", "service_role"]) {
    for (const statement of [
      "insert into public.assistance_requests (requester_person_id) values ('00000000-0000-4000-8000-000000000001')",
      "update public.assistance_requests set status='accepted'",
      "update public.assistance_requests set status_version=99",
      "delete from public.assistance_requests",
      "truncate public.assistance_requests", // FK dependency is irrelevant: ACL must reject first.
    ]) {
      await db.exec(`begin; set local role ${role};`);
      await assert.rejects(db.exec(statement), (e) => e.code === "42501");
      await db.exec("rollback");
    }
    await db.exec(`begin; set local role ${role};`);
    if (role === "service_role") {
      assert.equal((await db.query("select count(*)::int n from public.assistance_requests")).rows[0].n, 1);
    } else {
      await assert.rejects(db.query("select * from public.assistance_requests"), (e) => e.code === "42501");
    }
    await db.exec("rollback");
  }
}

for (const broad of [false, true]) {
  test(`migration chain and access boundary with ${broad ? "Supabase-style broad" : "restrictive"} defaults`, options, async (t) => {
    const db = await fixture(t, broad);
    t.diagnostic((await db.query("select version() as engine")).rows[0].engine);
    if (broad) await db.exec("grant all on public.assistance_requests to public");
    const before = await catalog(db);
    if (broad) {
      await assert.rejects(db.exec(sql(unit4)), (e) => e.code === "P0001" && /Unexpected effective status write access for anon/.test(e.message));
      await db.exec("rollback");
      assert.equal((await db.query("select exists(select 1 from pg_attribute where attrelid='public.assistance_requests'::regclass and attname='status_version') found")).rows[0].found, false);
    }
    await db.exec(sql(prerequisite));
    const after = await catalog(db);
    for (const key of ["relowner", "relrowsecurity", "policies", "defaults", "memberships"]) assert.deepEqual(after[key], before[key], key);
    // Repeat safely, including after Unit 4: never restore direct status UPDATE.
    await db.exec(sql(prerequisite));
    for (const file of migrations.filter((f) => f > prerequisite)) await db.exec(sql(file));
    await db.exec(sql(prerequisite));
    for (const file of ["public_submission_privileges.sql", "public_submission_idempotency.sql",
      "public_submission_services.sql",
      "assistance_request_events.sql", "assistance_request_status.sql", "unit4_privileges.sql"]) {
      await db.exec(fs.readFileSync("supabase/tests/" + file, "utf8"));
    }
    await db.exec(`insert into public.people (id, first_name, last_name)
      values ('00000000-0000-4000-8000-000000000001','Fictional','Privilege Test');
      insert into public.assistance_requests (requester_person_id)
      values ('00000000-0000-4000-8000-000000000001');`);
    await checkAccess(db);
  });
}

for (const grant of ["select", "update(status)", "insert(help_summary)", "delete", "truncate", "references(status)", "trigger", "maintain"]) {
  test(`inherited ${grant} rejects prerequisite and rolls back direct ACL changes`, options, async (t) => {
    const db = await fixture(t, true);
    await db.exec(`create role unexpected_access; grant ${grant} on public.assistance_requests to unexpected_access; grant unexpected_access to anon;`);
    const before = await catalog(db);
    await rejectsMigration(db, /Unexpected effective request/);
    assert.deepEqual(await catalog(db), before);
  });
}

for (const role of ["authenticated", "service_role"]) {
  test(`inherited status write for ${role} fails closed`, options, async (t) => {
    const db = await fixture(t);
    await db.exec(`create role unexpected_access; grant update(status) on public.assistance_requests to unexpected_access; grant unexpected_access to ${role};`);
    const before = await catalog(db);
    await rejectsMigration(db, /Unexpected effective request UPDATE/);
    assert.deepEqual(await catalog(db), before);
  });
}

test("owner membership without inheritance still fails closed", options, async (t) => {
  const db = await fixture(t, true);
  await db.exec("grant postgres to anon with inherit false, set true");
  const before = await catalog(db);
  await rejectsMigration(db, /can assume the request owner/);
  assert.deepEqual(await catalog(db), before);
});

test("a non-owner with grant options cannot normalize privileges", options, async (t) => {
  const db = await fixture(t, true);
  await db.exec("create role unrelated_migrator; grant usage on schema public to unrelated_migrator; grant all on public.assistance_requests to unrelated_migrator with grant option; set role unrelated_migrator");
  await rejectsMigration(db, /Trusted assistance_requests owner/);
  await db.exec("reset role");
  assert.equal((await db.query("select has_table_privilege('anon','public.assistance_requests','UPDATE') allowed")).rows[0].allowed, true);
});

test("the trusted non-superuser table owner can apply the complete chain", options, async (t) => {
  const db = await fixture(t, true, true);
  assert.equal((await db.query("select rolsuper from pg_roles where rolname=current_user")).rows[0].rolsuper, false);
  for (const file of migrations.filter((f) => f >= prerequisite)) await db.exec(sql(file));
  assert.equal((await db.query("select has_table_privilege('service_role','public.assistance_requests','SELECT') allowed")).rows[0].allowed, true);
  assert.equal((await db.query("select has_any_column_privilege('service_role','public.assistance_requests','UPDATE') allowed")).rows[0].allowed, false);
});

for (const fault of ["NO ACTION", "wrong constraint", "successful statement"]) {
  test(`event deletion assertion rejects ${fault}`, options, async (t) => {
    const db = await fixture(t);
    const state = Number((await db.query("show server_version_num")).rows[0].server_version_num) >= 180000 ? "23001" : "23503";
    if (fault === "NO ACTION") {
      // Deliberately damaged disposable fixture; never changes migration source.
      await db.exec(`alter table public.assistance_request_events
        drop constraint assistance_request_events_assistance_request_id_fkey,
        add constraint assistance_request_events_assistance_request_id_fkey
        foreign key (assistance_request_id) references public.assistance_requests(id) on delete no action;`);
    } else {
      await db.exec(`create function public.test_delete_fault() returns trigger language plpgsql as $$ begin
        ${fault === "wrong constraint" ? `raise exception 'Unrelated failure' using errcode='${state}',
          constraint='unrelated_constraint', schema='public', table='assistance_request_events';` : "return null;"}
        end; $$;
        create trigger test_delete_fault before delete on public.assistance_requests
        for each row execute function public.test_delete_fault();`);
    }
    await assert.rejects(db.exec(fs.readFileSync("supabase/tests/assistance_request_events.sql", "utf8")), (e) => {
      if (fault === "NO ACTION") return e.code === "P0001" && /Expected validated event RESTRICT/.test(e.message);
      if (fault === "successful statement") return e.code === "P0001" && /statement succeeded/.test(e.message);
      return e.code === state && e.constraint === "unrelated_constraint";
    });
    await db.exec("rollback");
  });
}

// Slice 2a: 20261117000000_submit_requested_services.sql
const slice2a = "20261117000000_submit_requested_services.sql";
const v1Call = (key, changes = {}) => {
  const p = { first_name: "Fictional", last_name: "Before2a", phone: "555-0105", species: "dog", help: "Fictional pre-2a request", ...changes };
  return `select assistance_request_id::text id from public.submit_public_assistance_request('${key}'::uuid,
    '${p.first_name}','${p.last_name}','${p.phone}','','','${p.species}','male','unknown',1.50,'','',
    '${p.help}',5.0,'','','unknown','unknown','','','',array['friday','monday'])`;
};
async function chainThrough(t, last, broad = false) {
  const db = await fixture(t, broad);
  for (const file of migrations.filter((f) => f >= prerequisite && f <= last)) await db.exec(sql(file));
  return db;
}

for (const broad of [false, true]) {
  test(`v1 receipts written before Slice 2a still verify after it (${broad ? "broad" : "restrictive"} defaults)`, options, async (t) => {
    const db = await chainThrough(t, "20261012000000_add_public_submission_idempotency.sql", broad);
    t.diagnostic((await db.query("select version() as engine")).rows[0].engine);
    const key = "7d3c8a5e-0b1f-4a8e-9c2d-000000002a01";
    await db.exec("set role service_role");
    const [{ id: original }] = (await db.query(v1Call(key))).rows;
    await db.exec("reset role");
    const receipt = (await db.query("select payload_hash, contract_version from public.public_assistance_submission_receipts")).rows[0];
    await db.exec(sql(slice2a));
    await db.exec("set role service_role");
    // Same submission through the NEW function (old app: new arguments omitted).
    assert.equal((await db.query(v1Call(key))).rows[0].id, original);
    await assert.rejects(db.query(v1Call(key, { help: "Different fictional help" })), (e) => e.code === "PT409");
    await db.exec("reset role");
    assert.deepEqual((await db.query("select payload_hash, contract_version from public.public_assistance_submission_receipts")).rows[0], receipt);
    assert.equal((await db.query("select count(*)::int n from public.assistance_requests")).rows[0].n, 1);
  });
}

test("Slice 2a fails closed on an unexpected submission overload", options, async (t) => {
  const db = await chainThrough(t, "20261012000000_add_public_submission_idempotency.sql");
  await db.exec("create function public.submit_public_assistance_request(p text) returns void language sql as 'select null'");
  await assert.rejects(db.exec(sql(slice2a)), (e) => e.code === "P0001" && /Unexpected submission overload/.test(e.message));
  await db.exec("rollback");
  // Rolled back: the old signature and the stray overload both remain; no new column.
  assert.equal((await db.query("select count(*)::int n from pg_proc where proname='submit_public_assistance_request'")).rows[0].n, 2);
  assert.equal((await db.query("select to_regprocedure('public.submit_public_assistance_request(uuid,text,text,text,text,text,text,text,text,numeric,text,text,text,numeric,text,text,text,text,text,text,text,text[])') is not null ok")).rows[0].ok, true);
  assert.equal((await db.query("select exists(select 1 from pg_attribute where attrelid='public.services'::regclass and attname='is_public_request_option') found")).rows[0].found, false);
});

test("Slice 2a fails closed when a category slug is taken by another row", options, async (t) => {
  const db = await chainThrough(t, "20261012000000_add_public_submission_idempotency.sql");
  await db.exec("insert into public.services (name, slug) values ('Surgery', 'surgery-legacy')");
  await assert.rejects(db.exec(sql(slice2a)), (e) => e.code === "P0001" && /Unexpected public request options/.test(e.message));
  await db.exec("rollback");
});

for (const broad of [false, true]) {
  test(`full chain plus seed, then submission SQL tests (${broad ? "broad" : "restrictive"} defaults)`, options, async (t) => {
    const db = await chainThrough(t, migrations.at(-1), broad);
    t.diagnostic((await db.query("select version() as engine")).rows[0].engine);
    await db.exec(fs.readFileSync("supabase/seed.sql", "utf8"));
    assert.deepEqual((await db.query("select slug from public.services where is_public_request_option order by sort_order")).rows.map((r) => r.slug),
      ["surgery", "medical-care", "vaccine-clinic"]);
    assert.equal((await db.query("select count(*)::int n from public.services where not is_public_request_option")).rows[0].n, 8);
    for (const file of ["public_submission_idempotency.sql", "public_submission_services.sql"]) {
      await db.exec(fs.readFileSync("supabase/tests/" + file, "utf8"));
    }
    // A v2 request with seeded data, read back the way the admin detail page does.
    const key = "7d3c8a5e-0b1f-4a8e-9c2d-000000002a02";
    await db.exec("set role service_role");
    await db.query(`select * from public.submit_public_assistance_request('${key}'::uuid,'Fictional','Seeded','555-0106','','',
      'cat','female','altered',null,'','','Fictional seeded request',null,'','','current','using','','','',array[]::text[],
      2::smallint, array['50000000-0000-0000-0000-000000000103','50000000-0000-0000-0000-000000000101']::uuid[], true)`);
    const rows = (await db.query(`select s.name, ra.service_advice_requested from public.request_animals ra
      join public.request_animal_services ras on ras.request_animal_id = ra.id join public.services s on s.id = ras.service_id
      order by s.sort_order`)).rows;
    await db.exec("reset role");
    assert.deepEqual(rows, [{ name: "Surgery", service_advice_requested: true }, { name: "Vaccine clinic", service_advice_requested: true }]);
  });
}
