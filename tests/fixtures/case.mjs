import { randomUUID } from "node:crypto";

export function caseFixture() {
  return {
    id: randomUUID(), status: "under_review", status_version: 0, created_at: "2026-01-01T12:00:00Z", submitted_at: "2026-01-01T12:00:00Z",
    help_summary: "Help requested for Roscoe and Pigeon.", stated_contribution_amount: 0,
    transportation_notes: "Needs a ride", additional_information: "Call after work", internal_notes: null,
    requester: { first_name: "Jamie", last_name: "Example", phone: "555-0101", email: "jamie@example.com", preferred_contact_method: null },
    service_area: null,
    request_animals: [
      {
        id: randomUUID(), outcome: null, outcome_notes: null,
        animal: { name: "Roscoe", species: "dog", sex: "male", altered_status: "altered", age_years: 6,
          breed: "Mixed", color_description: "Brown", microchip_number: null, notes: null },
        prescreens: { rabies_status: "current", vaccine_status: "partial", prevention_use_status: "using",
          prevention_product: "Recorded prevention", prevention_last_given_date: "2026-01-01",
          established_veterinarian: null, last_vet_visit: null, medical_concerns: "Recorded concern",
          last_heat_cycle_notes: null, estimated_care_scope: null,
          prescreen_diagnostics: [{ id: randomUUID(), diagnostic_type: "heartworm", status: "negative", notes: "Recorded diagnostic" }] },
        request_animal_services: [{ id: randomUUID(), service: { name: "Microchipping", description: "Microchip placement" }, notes: "Service note" }],
      },
      {
        id: randomUUID(), outcome: null, outcome_notes: null,
        animal: { name: "Pigeon", species: "cat", sex: "female", altered_status: "unknown", age_years: 0,
          breed: null, color_description: null, microchip_number: null, notes: null },
        prescreens: null, request_animal_services: [],
      },
    ],
    request_availability: [{ day_of_week: "friday", availability_window: "am_dropoff", notes: null }],
  };
}
export function eventFixture(overrides = {}) {
  return { id: randomUUID(), event_type: "interaction", old_status: null, new_status: null, status_version: null, interaction_type: "call", contact_result: "left_message",
    case_outcome: "follow_up_needed", notes: "Left a message.", occurred_at: "2026-01-03T12:00:00Z",
    created_at: "2026-01-04T12:00:00Z", actor_label: "administrator@example.com", ...overrides };
}
