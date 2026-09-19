import type { RequestDetail } from "../server/getRequestDetail";
import { CaseField } from "./CaseSummary";
import { dateOnly, displayCode, displayValue } from "./caseDisplay";

export function CaseAnimals({ animals }: { animals: RequestDetail["request_animals"] }) {
  return <section aria-labelledby="animal-information">
    <h2 id="animal-information" className="text-xl font-semibold">Animal information</h2>
    {animals.length === 0 && <p className="mt-4">No animals recorded.</p>}
    <div className="mt-4 space-y-5">{animals.map(({ id, animal, prescreens: health, request_animal_services: services, outcome, outcome_notes }) =>
      <article key={id} className="rounded-xl border border-slate-300 p-5">
        <h3 className="text-lg font-semibold">{animal.name || "Unnamed animal"} · {displayCode(animal.species)}</h3>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <CaseField label="Sex">{displayCode(animal.sex)}</CaseField>
          <CaseField label="Spay/neuter status">{displayCode(animal.altered_status)}</CaseField>
          <CaseField label="Age (years)">{displayValue(animal.age_years)}</CaseField>
          <CaseField label="Breed">{displayValue(animal.breed)}</CaseField>
          <CaseField label="Color / description">{displayValue(animal.color_description)}</CaseField>
          <CaseField label="Microchip">{displayValue(animal.microchip_number)}</CaseField>
        </dl>
        {animal.notes && <p className="mt-4 whitespace-pre-wrap break-words">Animal notes: {animal.notes}</p>}
        <h4 className="mt-6 font-semibold">Health &amp; prevention</h4>
        {health ? <>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <CaseField label="Rabies">{displayCode(health.rabies_status)}</CaseField>
            <CaseField label="Vaccines">{displayCode(health.vaccine_status)}</CaseField>
            <CaseField label="Prevention use">{displayCode(health.prevention_use_status)}</CaseField>
            <CaseField label="Prevention product">{displayValue(health.prevention_product)}</CaseField>
            <CaseField label="Prevention last given">{dateOnly(health.prevention_last_given_date)}</CaseField>
            <CaseField label="Last heat cycle">{displayValue(health.last_heat_cycle_notes)}</CaseField>
            <CaseField label="Established veterinarian">{displayValue(health.established_veterinarian)}</CaseField>
            <CaseField label="Last veterinary visit">{displayValue(health.last_vet_visit)}</CaseField>
            <CaseField label="Previously recorded care scope">{displayCode(health.estimated_care_scope)}</CaseField>
            <CaseField label="Medical concerns">{displayValue(health.medical_concerns)}</CaseField>
          </dl>
          <h4 className="mt-5 font-semibold">Diagnostics</h4>
          {health.prescreen_diagnostics.length ? <ul className="mt-2 space-y-2">
            {health.prescreen_diagnostics.map((diagnostic) => <li key={diagnostic.id}>
              {displayCode(diagnostic.diagnostic_type)}: {displayCode(diagnostic.status)}
              {diagnostic.notes && <p className="whitespace-pre-wrap break-words">{diagnostic.notes}</p>}
            </li>)}
          </ul> : <p className="mt-2">No diagnostics recorded.</p>}
        </> : <p className="mt-3">No prescreen information recorded.</p>}
        <h4 className="mt-5 font-semibold">Service details</h4>
        {services.length ? <ul className="mt-2 space-y-3">{services.map(({ id: serviceId, service, notes }) =>
          <li key={serviceId}><p className="font-medium">{service.name}</p>
            {service.description && <p>{service.description}</p>}
            {notes && <p className="whitespace-pre-wrap break-words">{notes}</p>}
          </li>)}</ul> : <p className="mt-2">No structured services recorded.</p>}
        {(outcome || outcome_notes) && <div className="mt-5">
          <h4 className="font-semibold">Previously recorded animal outcome</h4>
          <p>{displayCode(outcome)}</p><p className="whitespace-pre-wrap break-words">{outcome_notes}</p>
        </div>}
      </article>)}</div>
  </section>;
}
