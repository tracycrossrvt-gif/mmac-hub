import type { InteractionEvent } from "../server/getRequestDetail";
import { interactionLabels } from "../interactionOptions";
import { caseDate } from "./caseDisplay";

export function CaseTimeline({ events, submittedAt }: { events: InteractionEvent[]; submittedAt: string }) {
  return <section aria-labelledby="case-timeline">
    <h2 id="case-timeline" className="text-xl font-semibold">Case timeline</h2>
    <p className="mt-1 text-sm">Newest interactions first. Times shown in Eastern Time. Add a new note to correct an earlier entry.</p>
    {events.length === 0 && <p className="mt-4">No interactions recorded yet.</p>}
    <ol className="mt-4 space-y-4">
      {events.map((event) => <li key={event.id} className="rounded-xl border border-slate-300 p-5">
        <div className="flex flex-wrap justify-between gap-2">
          <h3 className="font-semibold">{interactionLabels[event.interaction_type]}{event.contact_result ? ` · ${interactionLabels[event.contact_result]}` : ""}</h3>
          <time dateTime={event.occurred_at}>{caseDate(event.occurred_at)}</time>
        </div>
        <p className="mt-1 text-sm">Recorded by {event.actor_label} · <time dateTime={event.created_at}>{caseDate(event.created_at)}</time></p>
        {event.case_outcome && <p className="mt-3 font-medium">Case outcome: {interactionLabels[event.case_outcome]}</p>}
        <p className="mt-3 whitespace-pre-wrap break-words">{event.notes}</p>
      </li>)}
      <li className="rounded-xl border border-slate-300 p-5">
        <h3 className="font-semibold">Request submitted</h3>
        <time dateTime={submittedAt}>{caseDate(submittedAt)}</time>
      </li>
    </ol>
  </section>;
}
