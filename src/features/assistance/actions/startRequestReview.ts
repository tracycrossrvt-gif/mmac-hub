"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

export async function startRequestReview(requestId: string) {
  const supabase = createAdminClient();

  const { data: updatedRequest, error } = await supabase
    .from("assistance_requests")
    .update({
      status: "under_review",
    })
    .eq("id", requestId)
    .eq("status", "new")
    .select("id, status")
    .single();

  if (error) {
    console.error("Failed to start request review:", error);

    return {
      success: false as const,
      message: "We couldn't start the review.",
    };
  }

  revalidatePath("/admin/requests");
  revalidatePath(`/admin/requests/${requestId}`);

  return {
    success: true as const,
    status: updatedRequest.status,
  };
}