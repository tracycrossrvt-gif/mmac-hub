import "server-only";

import { z } from "zod";
import { requireAdmin } from "@/features/auth/server/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { caseOutcomes, interactionTypes } from "../interactionOptions";

const text = z.string().nullable();
const prescreenSchema = z.object({
  rabies_status: text, vaccine_status: text, prevention_use_status: text,
  prevention_product: text, prevention_last_given_date: text,
  established_veterinarian: text, last_vet_visit: text, medical_concerns: text,
  last_heat_cycle_notes: text, estimated_care_scope: text,
  prescreen_diagnostics: z.array(z.object({
    id: z.uuid(), diagnostic_type: z.string(), status: z.string(), notes: text,
  })),
});

export const requestDetailSchema = z.object({
  id: z.uuid(), status: z.string(), submitted_at: z.string(), created_at: z.string(),
  help_summary: text, stated_contribution_amount: z.number().nullable(),
  transportation_notes: text, additional_information: text, internal_notes: text,
  requester: z.object({ first_name: z.string(), last_name: z.string(), phone: text,
    email: text, preferred_contact_method: text }),
  service_area: z.object({ name: z.string(), state: z.string() }).nullable(),
  request_animals: z.array(z.object({
    id: z.uuid(), outcome: text, outcome_notes: text,
    animal: z.object({ name: text, species: z.string(), sex: text, altered_status: text,
      age_years: z.number().nullable(), breed: text, color_description: text,
      microchip_number: text, notes: text }),
    // Unique request_animal_id makes this an object (or null), not an array.
    prescreens: prescreenSchema.nullable(),
    request_animal_services: z.array(z.object({
      id: z.uuid(), notes: text,
      service: z.object({ name: z.string(), description: text }),
    })),
  })),
  request_availability: z.array(z.object({ day_of_week: z.string(), availability_window: z.string(), notes: text })),
});

export const interactionEventSchema = z.object({
  id: z.uuid(), event_type: z.literal("interaction"), interaction_type: z.enum(interactionTypes),
  contact_result: text, case_outcome: z.enum(caseOutcomes).nullable(), notes: z.string(),
  occurred_at: z.string(), created_at: z.string(), actor_label: z.string(),
});

export type RequestDetail = z.infer<typeof requestDetailSchema>;
export type InteractionEvent = z.infer<typeof interactionEventSchema>;

export function sortInteractions(events: InteractionEvent[]) {
  return [...events].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)
    || Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id));
}

export async function getRequestDetail(requestId: string) {
  await requireAdmin();
  if (!z.uuid().safeParse(requestId).success) return null;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("assistance_requests").select(`
      id, status, submitted_at, created_at, help_summary, stated_contribution_amount,
      transportation_notes, additional_information, internal_notes,
      requester:people!assistance_requests_requester_person_id_fkey (
        first_name, last_name, phone, email, preferred_contact_method
      ),
      service_area:service_areas!assistance_requests_service_area_id_fkey (name, state),
      request_animals (
        id, outcome, outcome_notes,
        animal:animals!request_animals_animal_id_fkey (
          name, species, sex, altered_status, age_years, breed, color_description, microchip_number, notes
        ),
        prescreens (
          rabies_status, vaccine_status, prevention_use_status, prevention_product,
          prevention_last_given_date, established_veterinarian, last_vet_visit,
          medical_concerns, last_heat_cycle_notes, estimated_care_scope,
          prescreen_diagnostics (id, diagnostic_type, status, notes)
        ),
        request_animal_services (id, notes, service:services (name, description))
      ),
      request_availability (day_of_week, availability_window, notes)
    `).eq("id", requestId).maybeSingle();
    if (error) throw new Error("Request read failed");
    if (!data) return null;
    const request = requestDetailSchema.parse(data);

    // Page by immutable ID to avoid the API row cap silently truncating history.
    // Operational ordering is applied after collecting every page.
    const events: InteractionEvent[] = [];
    let beforeId: string | undefined;
    for (;;) {
      let query = supabase.from("assistance_request_events").select(
        "id, event_type, interaction_type, contact_result, case_outcome, notes, occurred_at, created_at, actor_label",
      ).eq("assistance_request_id", requestId).order("id", { ascending: false }).limit(200);
      if (beforeId) query = query.lt("id", beforeId);
      const { data: rows, error: historyError } = await query;
      if (historyError || !rows) throw new Error("History read failed");
      const page = z.array(interactionEventSchema).parse(rows);
      events.push(...page);
      if (page.length < 200) break;
      beforeId = page[page.length - 1].id;
    }
    return { request, events: sortInteractions(events) };
  } catch {
    // Missing history is not an empty history, and a provider error is not a 404.
    throw new Error("Unable to load this case and its history. Please try again.");
  }
}
