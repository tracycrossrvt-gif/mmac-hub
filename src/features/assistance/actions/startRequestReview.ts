"use server";

import { transitionRequestStatus } from "./transitionRequestStatus";

// Compatibility entry point: the shared action independently verifies the admin.
// The reviewed version is required; never fetch a new version and silently retry.
export async function startRequestReview(requestId: string, expectedVersion: number) {
  return transitionRequestStatus({ requestId, expectedStatus: "new", expectedVersion,
    newStatus: "under_review", reason: "" });
}
