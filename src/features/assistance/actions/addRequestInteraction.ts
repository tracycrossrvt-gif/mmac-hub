"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/features/auth/server/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { occurrenceError, requestInteractionSchema, type InteractionActionState } from "../validation/requestInteractionSchema";

export async function addRequestInteraction(
  _previous: InteractionActionState, formData: FormData,
): Promise<InteractionActionState> {
  const actor = await requireAdmin();
  if (!(formData instanceof FormData)) return { success: false, message: "Unable to read the interaction. Please try again." };
  // Explicitly pick user-editable fields. Identity/audit/status fields never come from the form.
  const parsed = requestInteractionSchema.safeParse({
    requestId: formData.get("requestId"),
    interactionType: formData.get("interactionType"),
    contactResult: formData.get("contactResult") || null,
    caseOutcome: formData.get("caseOutcome") || null,
    notes: formData.get("notes"),
    occurredAt: formData.get("occurredAt") || undefined,
  });
  if (!parsed.success) return { success: false, message: "Check the interaction type, result, notes, and date." };
  const input = parsed.data;

  try {
    const supabase = createAdminClient();
    const { data: request, error: requestError } = await supabase.from("assistance_requests")
      .select("created_at").eq("id", input.requestId).maybeSingle();
    if (requestError || !request) return { success: false, message: "Unable to load this request. Your interaction was not saved." };
    const dateError = occurrenceError(input.occurredAt, request.created_at);
    if (dateError) return { success: false, message: dateError };

    const { error } = await supabase.from("assistance_request_events").insert({
      assistance_request_id: input.requestId,
      interaction_type: input.interactionType,
      contact_result: input.contactResult,
      case_outcome: input.caseOutcome,
      notes: input.notes,
      ...(input.occurredAt ? { occurred_at: input.occurredAt } : {}),
      actor_user_id: actor.id,
      actor_label: actor.email?.trim() || "Administrator",
    });
    if (error) return { success: false, message: "Unable to confirm the save. Check the date, then reload the timeline before retrying." };
  } catch {
    // Do not log case notes, actor identity, or raw provider errors.
    return { success: false, message: "Unable to confirm the save. Reload and check the timeline before retrying." };
  }

  revalidatePath(`/admin/requests/${input.requestId}`);
  return { success: true, message: "Interaction saved." };
}
