import test from "node:test";
import assert from "node:assert/strict";
import { createFormControl } from "react-hook-form";
import { appLoader } from "./helpers/load-app.mjs";

// Run the actual component callbacks with real RHF reset/register behavior.
// React scheduling and browser storage are controlled; this is NOT a DOM/browser test.
const helper = appLoader()("src/features/assistance/lib/publicSubmissionAttempt.ts");
const requestId = "bc9db68e-6eae-4aca-a22e-3571ae10e8b4";
const submissionId = "7b828e94-bc49-435b-a1dc-f2d4d01f6fe0";
const tick = () => new Promise(resolve => setImmediate(resolve));
function find(node, predicate) {
  if (!node || typeof node !== "object") return;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const match = find(child, predicate); if (match) return match;
  }
}
for (const storageFailure of [false, true]) {
  test(`restored retry clears actual RHF values/defaults on success (storage failure: ${storageFailure})`, async () => {
    const values = new Map();
    const storage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
    helper.beginSubmissionAttempt(storage, {firstName:"PRIVATE",lastName:"PRIVATE",phone:"555-0102",
      species:"dog",sex:"male",alteredStatus:"unknown",helpSummary:"PRIVATE MEDICAL",
      rabiesStatus:"unknown",preventionUseStatus:"unknown",availableDays:["monday"],statedContributionAmount:25}, () => submissionId);
    const states = [], refs = [], effects = [];
    let si = 0, ri = 0, mounted = false, form, calls = 0;
    const load = appLoader({
      react: {
        useState(initial) { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], v => { states[i] = v; }]; },
        useRef(initial) { const i = ri++; return refs[i] ??= {current:initial}; },
        useEffect(effect) { if (!mounted) effects.push(effect); },
      },
      "react-hook-form": {
        useForm(options) { form ??= createFormControl(options); return {...form, formState:{errors:{},isSubmitting:false}}; },
        useWatch({name}) { return form.control._formValues[name]; },
      },
      "@/features/assistance/actions/submitGetHelpRequest": {
        async submitGetHelpRequest(envelope) {
          calls++; assert.equal(envelope.submissionId, submissionId);
          assert.equal(envelope.data.helpSummary, "PRIVATE MEDICAL");
          if (storageFailure) storage.setItem = () => { throw Error("quota"); };
          return {success:true, requestId, status:"new"};
        },
      },
    }, {}, { window:{sessionStorage:storage}, queueMicrotask });
    const {GetHelpForm} = load("src/features/assistance/components/GetHelpForm.tsx");
    const render = () => { si = 0; ri = 0; const tree = GetHelpForm(); mounted = true; return tree; };
    render(); effects.forEach(effect => effect()); await tick();
    const retry = find(render(), n => n.type === "button" && n.props.children === "Retry this submission");
    assert.ok(retry);
    assert.equal(form.control._formValues.firstName, "PRIVATE");
    retry.props.onClick(); retry.props.onClick(); // Same-turn double click must only send once.
    await tick();
    assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(form.control._formValues), /PRIVATE|555-0102/);
    assert.doesNotMatch(JSON.stringify(form.control._defaultValues), /PRIVATE|555-0102/);
    assert.ok(!form.control._formValues.statedContributionAmount);
    assert.equal(find(render(), n => n.type === "button" && n.props.type === "submit").props.disabled, true);
    assert.doesNotMatch(JSON.stringify([...values]), /PRIVATE|555-0102/);
    if (storageFailure) assert.throws(() => helper.readSubmissionAttempt(storage));
    else assert.equal(helper.readSubmissionAttempt(storage).state, "complete");
  });
}
