import type { ReactNode } from "react";
import type { CaseEvent, RequestDetail } from "../server/getRequestDetail";
import { statusLabels } from "../statusWorkflow";
import { interactionLabels } from "../interactionOptions";
import { caseDate, displayCode, displayValue } from "./caseDisplay";

export function CaseField({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-sm font-medium">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{children}</dd></div>;
}

export function CaseSummary({ request, latest }: { request: RequestDetail; latest?: CaseEvent }) {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  return <>
    <header className="border-b border-slate-300 pb-6">
      <p className="text-sm font-medium uppercase tracking-wide">Assistance request</p>
      <h1 className="mt-2 text-3xl font-bold">{request.requester.first_name} {request.requester.last_name}</h1>
      <p className="mt-2">{request.request_animals.length} {request.request_animals.length === 1 ? "animal" : "animals"}
        {request.request_animals.length > 0 && ` · ${request.request_animals.map(({ animal }) => animal.name || "Unnamed animal").join(", ")}`}</p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <CaseField label="Status">{displayCode(request.status)}</CaseField>
        <CaseField label="Service area">{request.service_area ? `${request.service_area.name}, ${request.service_area.state}` : "Not recorded"}</CaseField>
        <CaseField label="Submitted">{caseDate(request.submitted_at)}</CaseField>
      </dl>
      <p className="mt-3 text-sm">Case dates and times are shown in Eastern Time (America/New_York).</p>
    </header>
    <section aria-labelledby="operational-summary">
      <h2 id="operational-summary" className="text-xl font-semibold">Case summary</h2>
      <dl className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <CaseField label="Phone">{displayValue(request.requester.phone)}</CaseField>
        <CaseField label="Email">{displayValue(request.requester.email)}</CaseField>
        <CaseField label="Preferred contact">{displayCode(request.requester.preferred_contact_method)}</CaseField>
        <CaseField label="Transportation">{displayValue(request.transportation_notes)}</CaseField>
        <CaseField label="Availability">{request.request_availability.length ? <ul className="space-y-1">
          {[...request.request_availability].sort((a, b) => days.indexOf(a.day_of_week) - days.indexOf(b.day_of_week)).map((availability) =>
            <li key={`${availability.day_of_week}-${availability.availability_window}`}>
              {displayCode(availability.day_of_week)} · {displayCode(availability.availability_window)}
              {availability.notes && <p>{availability.notes}</p>}
            </li>)}
        </ul> : "Not provided"}</CaseField>
        <CaseField label="Stated contribution">
          {request.stated_contribution_amount === null ? "Not provided" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(request.stated_contribution_amount)}
          <p className="mt-1 text-sm">Stated amount; payment has not been recorded here.</p>
        </CaseField>
        <CaseField label="Latest recorded activity">{latest
          ? `${latest.event_type === "status_change" ? `${statusLabels[latest.old_status]} → ${statusLabels[latest.new_status]}` : interactionLabels[latest.interaction_type]} · ${caseDate(latest.occurred_at)}`
          : `Request submitted · ${caseDate(request.submitted_at)}`}</CaseField>
      </dl>
    </section>
    <section aria-labelledby="requested-help" className="rounded-xl border border-slate-300 p-5">
      <h2 id="requested-help" className="text-xl font-semibold">Requested Help</h2>
      <h3 className="mt-4 font-medium">Requested services</h3>
      {request.request_animals.length ? <ul className="mt-2 space-y-2">
        {request.request_animals.map((item) => <li key={item.id}>
          <span className="font-medium">{item.animal.name || "Unnamed animal"}: </span>
          {item.request_animal_services.length ? item.request_animal_services.map(({ service }) => service.name).join(", ") : "No structured services recorded"}
        </li>)}
      </ul> : <p className="mt-2">No structured services recorded.</p>}
      <h3 className="mt-5 font-medium">Original request explanation</h3>
      <p className="mt-2 whitespace-pre-wrap break-words">{displayValue(request.help_summary)}</p>
    </section>
  </>;
}
