"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getHelpSchema } from "@/features/assistance/validation/getHelpSchema";

export type SubmitGetHelpResult =
  | { success: false; message: string }
  | { success: true; requestId: string; status: "new" };

const createdRequestSchema = z.array(z.object({
  assistance_request_id: z.uuid(),
  status: z.literal("new"),
})).length(1);

const unconfirmedMessage = "We couldn't confirm whether your request was received. Please contact MMAC before submitting again to avoid a duplicate request.";

export async function submitGetHelpRequest(input: unknown): Promise<SubmitGetHelpResult> {
  try {
    const result = getHelpSchema.safeParse(input);

    if (!result.success) {
      return {
        success: false,
        message: "Please review the information you submitted.",
      };
    }

    const data = result.data;
    const supabase = createAdminClient();

    const ageYears = data.age === undefined ? null : Number(data.age);

    const { data: createdRequest, error } = await supabase
      .rpc("submit_public_assistance_request", {
        p_first_name: data.firstName,
        p_last_name: data.lastName,
        p_phone: data.phone ?? "",
        p_email: data.email ?? "",
        p_animal_name: data.animalName ?? "",
        p_species: data.species,
        p_sex: data.sex,
        p_altered_status: data.alteredStatus,
        p_age_years: ageYears,
        p_breed: data.breed ?? "",
        p_color_description: data.colorDescription ?? "",
        p_help_summary: data.helpSummary,
        p_stated_contribution_amount:
          data.statedContributionAmount ?? null,
        p_transportation_notes: data.transportationNotes ?? "",
        p_additional_information: data.additionalInformation ?? "",
        p_rabies_status: data.rabiesStatus,
        p_prevention_use_status: data.preventionUseStatus,
        p_prevention_product: data.preventionProduct ?? "",
        p_medical_concerns: data.medicalConcerns ?? "",
        p_last_heat_cycle_notes: data.lastHeatCycleNotes ?? "",
        p_available_days: data.availableDays ?? [],
      });

    if (error) {
      // Fixed diagnostics only: provider details can contain submitted private data.
      console.error("Get-help submission returned an RPC error.");
      return { success: false, message: unconfirmedMessage };
    }

    const confirmed = createdRequestSchema.safeParse(createdRequest);

    if (!confirmed.success) {
      console.error("Get-help submission returned an unconfirmed receipt.");
      return { success: false, message: unconfirmedMessage };
    }

    const created = confirmed.data[0];
    return {
      success: true,
      requestId: created.assistance_request_id,
      status: created.status,
    };
  } catch {
    // A thrown/transport error is not proof that the database rolled back.
    // No automatic retry: durable submission idempotency is a later change.
    console.error("Get-help submission raised an unexpected error.");
    return { success: false, message: unconfirmedMessage };
  }
}
