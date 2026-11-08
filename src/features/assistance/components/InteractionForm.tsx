"use client";

import { useActionState, useState } from "react";
import { addRequestInteraction } from "../actions/addRequestInteraction";
import { caseOutcomes, contactResults, interactionLabels, interactionTypes, MAX_INTERACTION_NOTES } from "../interactionOptions";
import type { InteractionActionState } from "../validation/requestInteractionSchema";

export function InteractionForm({ requestId }: { requestId: string }) {
  const [type, setType] = useState<(typeof interactionTypes)[number]>("call");
  const [result, setResult] = useState("");
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [earlierTime, setEarlierTime] = useState("");
  const [state, action, pending] = useActionState(async (previous: InteractionActionState, form: FormData) => {
    if (earlierTime) {
      const date = new Date(earlierTime);
      if (!Number.isFinite(date.getTime())) return { success: false, message: "Enter a valid occurrence date and time." };
      form.set("occurredAt", date.toISOString());
    }
    const next = await addRequestInteraction(previous, form);
    if (next.success) {
      setResult(""); setOutcome(""); setNotes(""); setEarlierTime("");
    }
    return next;
  }, { success: false, message: "" });

  const fieldClass = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900";
  return (
    <section aria-labelledby="add-interaction" className="rounded-xl border border-slate-300 p-5">
      <h2 id="add-interaction" className="text-xl font-semibold">Document an interaction</h2>
      <p className="mt-1 text-sm">Record contact or a note. This does not change the request status.</p>
      <form action={action} className="mt-4 space-y-4" aria-busy={pending}>
        <input type="hidden" name="requestId" value={requestId} />
        <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block font-medium">Type
              <select name="interactionType" value={type} className={fieldClass}
                onChange={(event) => { setType(event.target.value as typeof type); setResult(""); }}>
                {interactionTypes.map((value) => <option key={value} value={value}>{interactionLabels[value]}</option>)}
              </select>
            </label>
            {type !== "note" && <label className="block font-medium">Contact result
              <select name="contactResult" value={result} required className={fieldClass} onChange={(event) => setResult(event.target.value)}>
                <option value="">Choose a result</option>
                {contactResults[type].map((value) => <option key={value} value={value}>{interactionLabels[value]}</option>)}
              </select>
            </label>}
          </div>
          <label className="block font-medium">Notes
            <textarea name="notes" required maxLength={MAX_INTERACTION_NOTES} rows={4} value={notes}
              onChange={(event) => setNotes(event.target.value)} className={fieldClass} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block font-medium">Case outcome (optional)
              <select name="caseOutcome" value={outcome} className={fieldClass} onChange={(event) => setOutcome(event.target.value)}>
                <option value="">No outcome recorded</option>
                {caseOutcomes.map((value) => <option key={value} value={value}>{interactionLabels[value]}</option>)}
              </select>
            </label>
            <label className="block font-medium">Earlier occurrence (optional)
              <input type="datetime-local" step="1" value={earlierTime} onChange={(event) => setEarlierTime(event.target.value)}
                className={fieldClass} aria-describedby="occurrence-help" />
            </label>
          </div>
          <p id="occurrence-help" className="text-sm">Leave the time blank for now. Earlier times use your device’s local timezone and cannot predate the request.</p>
          <button type="submit" className="rounded-md bg-slate-900 px-5 py-2 font-medium text-white">
            {pending ? "Saving…" : "Save interaction"}
          </button>
        </fieldset>
        {state.message && <p role={state.success ? "status" : "alert"}>{state.message}</p>}
      </form>
    </section>
  );
}
