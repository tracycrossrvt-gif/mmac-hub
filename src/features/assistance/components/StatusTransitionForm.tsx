"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { transitionRequestStatus } from "../actions/transitionRequestStatus";
import { startRequestReview } from "../actions/startRequestReview";
import { MAX_STATUS_REASON, statusLabels, statusTransitions, type RequestStatus } from "../statusWorkflow";
import type { StatusTransitionState } from "../validation/statusTransitionSchema";

export function StatusTransitionForm({ requestId, status, version }: {
  requestId: string; status: RequestStatus; version: number;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [selection, setSelection] = useState("");
  // Retain the reviewed state until a successful save or an explicit reload. A
  // background refresh must not silently apply a draft decision to a new version.
  const [reviewed, setReviewed] = useState({ status, version });
  const [state, action, pending] = useActionState(async (_previous: StatusTransitionState, form: FormData) => {
    const next = reviewed.status === "new"
      ? await startRequestReview(requestId, reviewed.version)
      : await transitionRequestStatus({ requestId, expectedStatus: reviewed.status,
        expectedVersion: reviewed.version, newStatus: form.get("newStatus"), reason: form.get("reason") });
    if (next.success && next.status !== undefined && next.version !== undefined) {
      setReason(""); setSelection(""); setReviewed({ status: next.status, version: next.version });
    }
    return next;
  }, { success: false, message: "" });
  const outOfDate = reviewed.status !== status || reviewed.version !== version;
  const blocked = outOfDate || state.kind === "stale" || state.kind === "uncertain";
  const [acknowledgedState, setAcknowledgedState] = useState<StatusTransitionState | null>(null);
  const needsReload = outOfDate || (blocked && acknowledgedState !== state);
  const nextStates = statusTransitions[status];
  const fieldClass = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900";

  return <section aria-labelledby="decision-workflow" className="rounded-xl border border-slate-300 p-5">
    <h2 id="decision-workflow" className="text-xl font-semibold">Request status</h2>
    <p className="mt-1">Current status: {statusLabels[status]}</p>
    {nextStates.length === 0 ? <p className="mt-3">This decision workflow has no further transitions. You can continue documenting case activity below.</p>
      : <form action={action} className="mt-4 space-y-4" aria-busy={pending}>
        <fieldset disabled={pending || needsReload} className="space-y-4 disabled:opacity-60">
          {status !== "new" && <>
            <label className="block font-medium">Next status
              <select name="newStatus" value={selection} required className={fieldClass} onChange={(event) => setSelection(event.target.value)}>
                <option value="">Choose a status</option>
                {nextStates.map((next) => <option key={next} value={next}>{statusLabels[next]}</option>)}
              </select>
            </label>
            <label className="block font-medium">Reason for this decision
              <textarea name="reason" value={reason} required rows={3} maxLength={MAX_STATUS_REASON}
                className={fieldClass} onChange={(event) => setReason(event.target.value)} />
            </label>
          </>}
          <button type="submit" className="rounded-md bg-slate-900 px-5 py-2 font-medium text-white">
            {pending ? "Saving…" : status === "new" ? "Start Review" : "Change status"}
          </button>
        </fieldset>
      </form>}
    {state.message && <p className="mt-3" role={state.success ? "status" : "alert"}>{state.message}</p>}
    {needsReload && <div className="mt-3 space-y-2">
      <p>Review the refreshed status and timeline before selecting a decision again. Your reason is retained.</p>
      <button type="button" className="underline" disabled={pending} onClick={() => router.refresh()}>Reload case</button>
      <button type="button" className="ml-4 underline" disabled={pending} onClick={() => {
        setReviewed({ status, version }); setSelection(""); setAcknowledgedState(state);
      }}>I have reviewed the current case</button>
    </div>}
  </section>;
}
