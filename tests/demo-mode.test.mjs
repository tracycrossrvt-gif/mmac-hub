import test from "node:test";
import assert from "node:assert/strict";
import { appLoader } from "./helpers/load-app.mjs";

const load = (env) => appLoader({}, env)("src/lib/demoMode.ts");

test("demo mode is on unless NEXT_PUBLIC_DEMO_MODE is exactly \"false\"", () => {
  assert.equal(load({}).demoMode, true);
  for (const value of ["", "true", "1", "0", "no", "False", "FALSE", " false"]) {
    assert.equal(load({ NEXT_PUBLIC_DEMO_MODE: value }).demoMode, true, JSON.stringify(value));
  }
  assert.equal(load({ NEXT_PUBLIC_DEMO_MODE: "false" }).demoMode, false);
});
