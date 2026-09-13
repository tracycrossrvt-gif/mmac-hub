/* Security boundary tests using Node's runner and the existing TS compiler.
 * Only framework/Supabase I/O is stubbed; the application guards, actions,
 * allowlist parser, and protected pages execute from their real source files.
 * These tests do not claim to validate a live Supabase session or database.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server.js";

const requireModule = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const adminId = randomUUID();
const otherId = randomUUID();

function harness({ ids = adminId, user = null, verifyError = null, throwVerify = false,
  signInError = null, signOutError = null, ssrFactory, cookieStore } = {}) {
  const calls = { privileged: 0, verification: 0, signIn: 0, signOut: [], revalidate: [] };
  const environment = ids === null ? {} : { MMAC_ADMIN_USER_IDS: ids };
  const cache = new Map();
  const redirects = (destination) => { throw Object.assign(new Error("redirect"), { destination }); };
  const client = { auth: {
    getUser: async () => {
      calls.verification++;
      if (throwVerify) throw new Error("Verification unavailable");
      return { data: { user }, error: verifyError };
    },
    signInWithPassword: async () => { calls.signIn++; return { error: signInError }; },
    signOut: async (options) => { calls.signOut.push(options); return { error: signOutError }; },
  } };
  const mocks = {
    "server-only": {},
    "next/navigation": { redirect: redirects, notFound: () => { throw new Error("not found"); } },
    "next/cache": { revalidatePath: (...args) => calls.revalidate.push(args) },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/supabase/admin": { createAdminClient: () => {
      calls.privileged++;
      return { from: () => ({ update: () => ({ eq: () => ({ eq: () => ({
        select: () => ({ single: async () => ({ data: { status: "under_review" }, error: null }) }),
      }) }) }) }) };
    } },
    "@supabase/ssr": { createServerClient: ssrFactory },
    "next/headers": { cookies: async () => cookieStore },
  };
  function load(file) {
    const absolute = path.resolve(root, file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const loadedModule = { exports: {} };
    cache.set(absolute, loadedModule);
    const compiled = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    function localRequire(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const base = specifier.startsWith("@/")
          ? path.join(root, "src", specifier.slice(2)) : path.resolve(path.dirname(absolute), specifier);
        const resolved = [base, base + ".ts", base + ".tsx"].find((candidate) =>
          fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        if (!resolved) throw new Error(`Unresolved application module: ${specifier}`);
        return load(resolved);
      }
      return requireModule(specifier);
    }
    vm.runInNewContext(compiled, {
      exports: loadedModule.exports, module: loadedModule, require: localRequire,
      process: { env: environment }, console, FormData,
    }, { filename: absolute });
    return loadedModule.exports;
  }
  return { load, calls, environment };
}

test("allowlist trims, normalizes, and supports multiple UUIDs", () => {
  const h = harness({ ids: ` ${adminId.toUpperCase()} , ${otherId} ` });
  const ids = h.load("src/features/auth/server/adminAllowlist.ts").getAdminUserIds();
  assert.equal(ids.size, 2);
  assert.ok(ids.has(adminId));
  assert.ok(ids.has(otherId));
});

for (const [name, ids] of [["missing", null], ["empty", ""], ["blank", "  "],
  ["email", "not-a-uuid@example.com"], ["mixed valid/invalid", `${adminId},bad`],
  ["trailing comma", `${adminId},`], ["empty entry", `${adminId},,${otherId}`]]) {
  test(`${name} allowlist denies even a verified administrator before private writes`, async () => {
    const h = harness({ ids, user: { id: adminId } });
    const { startRequestReview } = h.load("src/features/assistance/actions/startRequestReview.ts");
    await assert.rejects(startRequestReview(randomUUID()), { destination: "/admin/denied" });
    assert.equal(h.calls.privileged, 0);
    assert.equal(h.calls.verification, 0);
  });
}

for (const [name, options, destination] of [
  ["anonymous", {}, "/admin/login"],
  ["non-admin with misleading email/metadata", { user: { id: otherId,
    email: "administrator@example.com", user_metadata: { role: "admin", id: adminId } } }, "/admin/denied"],
  ["user returned alongside a verification error", { user: { id: adminId }, verifyError: {} }, "/admin/login"],
  ["verification throws", { throwVerify: true }, "/admin/login"],
]) {
  test(`${name} cannot invoke Start Review directly`, async () => {
    const h = harness(options);
    await assert.rejects(h.load("src/features/assistance/actions/startRequestReview.ts")
      .startRequestReview(randomUUID()), { destination });
    assert.equal(h.calls.privileged, 0);
  });
  test(`${name} cannot read any protected page`, async () => {
    const h = harness(options);
    for (const file of ["src/app/admin/page.tsx", "src/app/admin/requests/page.tsx",
      "src/app/admin/requests/[requestId]/page.tsx"]) {
      await assert.rejects(h.load(file).default({ params: Promise.resolve({ requestId: randomUUID() }) }),
        { destination });
    }
    assert.equal(h.calls.privileged, 0);
  });
}

test("verified allowlisted user reaches the existing mutation", async () => {
  const h = harness({ user: { id: adminId } });
  const result = await h.load("src/features/assistance/actions/startRequestReview.ts")
    .startRequestReview(randomUUID());
  assert.equal(result.success, true);
  assert.equal(result.status, "under_review");
  assert.equal(h.calls.verification, 1);
  assert.equal(h.calls.privileged, 1);
});

test("a previously approved user is denied after their allowlist entry is removed", async () => {
  const h = harness({ user: { id: adminId } });
  const { getAdminAccess } = h.load("src/features/auth/server/requireAdmin.ts");
  assert.equal((await getAdminAccess()).allowed, true);
  h.environment.MMAC_ADMIN_USER_IDS = otherId;
  assert.equal((await getAdminAccess()).allowed, false);
});

function credentials() {
  const form = new FormData();
  form.set("email", "test@example.com");
  // Random, transient test input; never a real account credential or logged.
  form.set("password", randomBytes(32).toString("hex"));
  return form;
}

test("sign-in returns a generic failure without provider details or submitted credentials", async () => {
  const h = harness({ signInError: { message: "PRIVATE_PROVIDER_DETAIL" } });
  const result = await h.load("src/features/auth/actions/adminAuth.ts")
    .signInAdmin({ message: "" }, credentials());
  assert.equal(result.message, "Unable to sign in. Check your details and try again.");
  assert.equal(Object.keys(result).join(), "message");
  assert.equal(h.calls.privileged, 0);
});

test("sign-in with invalid allowlist does not contact password authentication", async () => {
  const h = harness({ ids: "malformed" });
  await h.load("src/features/auth/actions/adminAuth.ts").signInAdmin({ message: "" }, credentials());
  assert.equal(h.calls.signIn, 0);
});

test("sign-in rejects malformed form data before contacting Auth", async () => {
  const h = harness();
  await h.load("src/features/auth/actions/adminAuth.ts").signInAdmin({ message: "" }, new FormData());
  assert.equal(h.calls.signIn, 0);
});

for (const [label, user, destination] of [["approved", { id: adminId }, "/admin"],
  ["unauthorized", { id: otherId }, "/admin/denied"], ["unverified", null, "/admin/denied"]]) {
  test(`successful password response still verifies ${label} identity`, async () => {
    const h = harness({ user });
    await assert.rejects(h.load("src/features/auth/actions/adminAuth.ts")
      .signInAdmin({ message: "" }, credentials()), { destination });
    assert.equal(h.calls.verification, 1);
    assert.equal(h.calls.privileged, 0);
  });
}

test("sign-out is available to a non-admin and uses only their local session", async () => {
  const h = harness({ ids: null, user: { id: otherId } });
  await assert.rejects(h.load("src/features/auth/actions/adminAuth.ts").signOutAdmin(),
    { destination: "/admin/login" });
  assert.equal(h.calls.signOut[0].scope, "local");
  assert.equal(h.calls.privileged, 0);
});

test("failed sign-out is not presented as success", async () => {
  const h = harness({ signOutError: {} });
  assert.equal((await h.load("src/features/auth/actions/adminAuth.ts").signOutAdmin()).message,
    "Unable to sign out. Please try again.");
});

test("session refresh forwards cookie replacements/deletions and disables caching", async () => {
  const h = harness({ ssrFactory: (_url, _key, options) => ({ auth: { getUser: async () => {
    options.cookies.setAll([{ name: "test-session.0", value: "refreshed", options: { path: "/" } }],
      { "Cache-Control": "private, no-store" });
    options.cookies.setAll([{ name: "test-session.1", value: "", options: { path: "/", maxAge: 0 } }], {});
    return { data: { user: null }, error: null };
  } } }) });
  h.environment.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  h.environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-placeholder";
  const request = new NextRequest("http://localhost/admin/requests");
  const response = await h.load("src/lib/supabase/proxy.ts").updateSession(request);
  assert.ok(response instanceof NextResponse);
  assert.equal(request.cookies.get("test-session.0").value, "refreshed");
  assert.equal(response.cookies.get("test-session.0").value, "refreshed");
  assert.equal(response.cookies.get("test-session.1").maxAge, 0);
  assert.match(response.headers.get("cache-control"), /private.*no-store/);
});

test("auth-action client propagates failed session cookie writes", async () => {
  const h = harness({
    cookieStore: { getAll: () => [], set: () => { throw new Error("Cookie write failed"); } },
    ssrFactory: (_url, _key, options) => options,
  });
  h.environment.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  h.environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-placeholder";
  const { createClient } = h.load("src/lib/supabase/server.ts");
  const writable = await createClient({ requireCookieWrites: true });
  assert.throws(() => writable.cookies.setAll([{ name: "test", value: "", options: {} }]),
    /Cookie write failed/);
  const readOnly = await createClient();
  assert.doesNotThrow(() => readOnly.cookies.setAll([{ name: "test", value: "", options: {} }]));
});
