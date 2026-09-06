"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getHelpSchema } from "@/features/assistance/validation/getHelpSchema";

export async function submitGetHelpRequest(input: unknown) {
  const result = getHelpSchema.safeParse(input);

  if (!result.success) {
    return {
      success: false as const,
      message: "Please review the information you submitted.",
    };
  }

  const data = result.data;
  const supabase = createAdminClient();

  const ageYears =
    data.age?.trim() === "" || data.age === undefined
      ? null
      : Number(data.age);

  if (ageYears !== null && !Number.isFinite(ageYears)) {
    return {
      success: false as const,
      message: "Please enter a valid age.",
    };
  }

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
    console.error("Get-help database submission failed:", error);

    return {
      success: false as const,
      message: "We couldn't submit your request. Please try again.",
    };
  }

  const created = createdRequest?.[0];

  if (!created) {
    return {
      success: false as const,
      message: "We couldn't confirm your submitted request.",
    };
  }

  return {
    success: true as const,
    requestId: created.assistance_request_id,
    status: created.status,
  };
}