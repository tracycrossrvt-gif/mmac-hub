"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/features/auth/server/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestStatuses } from "../statusWorkflow";
import { statusTransitionSchema, type StatusTransitionState } from "../validation/statusTransitionSchema";

const resultSchema = z.array(z.object({
  status: z.enum(requestStatuses), status_version: z.number().int().positive(),
})).length(1);
const uncertain: StatusTransitionState = {
  success: false, kind: "uncertain",
  message: "Unable to confirm the status change. Reload and check the timeline before trying again.",
};

export async function transitionRequestStatus(input: unknown): Promise<StatusTransitionState> {
  const actor = await requireAdmin();
  // Zod selects only transition fields; browser actor/audit fields are discarded.
  const parsed = statusTransitionSchema.safeParse(input);
  if (!parsed.success) return { success: false, kind: "invalid",
    message: "Choose a valid next status and provide a reason (up to 10,000 characters). Reload if the case has changed." };
  const value = parsed.data;
  let result: z.infer<typeof resultSchema>;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("transition_assistance_request_status", {
      p_request_id: value.requestId,
      p_expected_status: value.expectedStatus,
      p_expected_version: value.expectedVersion,
      p_new_status: value.newStatus,
      p_reason: value.reason,
      p_actor_user_id: actor.id,
      p_actor_label: actor.email?.trim() || "Administrator",
    });
    if (error) {
      if (error.code === "PT409" || error.code === "40001") return { success: false, kind: "stale",
        message: "This case changed after you opened it. Reload the current status and timeline, then review your decision. Nothing was changed by this attempt." };
      if (error.code === "PT404") return { success: false, kind: "missing", message: "This request is no longer available. Return to the request queue." };
      if (error.code === "PT422") return { success: false, kind: "invalid", message: "The database rejected this transition. Check the status and reason, then reload the case." };
      if (error.code === "42501") return { success: false, kind: "denied", message: "Status changes are unavailable with the current database permissions. Contact the project administrator." };
      return uncertain;
    }
    const checked = resultSchema.safeParse(data);
    if (!checked.success || checked.data[0].status !== value.newStatus
      || checked.data[0].status_version !== value.expectedVersion + 1) return uncertain;
    result = checked.data;
  } catch {
    // No raw provider errors, case reasons, actor IDs or credentials in logs/feedback.
    return uncertain;
  }
  revalidatePath("/admin/requests");
  revalidatePath(`/admin/requests/${value.requestId}`);
  return { success: true, kind: "saved", message: "Status changed and recorded in the timeline.",
    status: result[0].status, version: result[0].status_version };
}
