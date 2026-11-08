export const requestStatuses = ["new", "under_review", "needs_info", "accepted", "referred", "unable_to_assist"] as const;
export type RequestStatus = (typeof requestStatuses)[number];

// UI/action validation mirrors the SQL predicate; the database remains authoritative.
export const statusTransitions: Record<RequestStatus, readonly RequestStatus[]> = {
  new: ["under_review"],
  under_review: ["needs_info", "accepted", "referred", "unable_to_assist"],
  needs_info: ["under_review", "accepted", "referred", "unable_to_assist"],
  accepted: [], referred: [], unable_to_assist: [],
};
export const statusLabels: Record<RequestStatus, string> = {
  new: "New", under_review: "Under review", needs_info: "Needs information",
  accepted: "Accepted", referred: "Referred", unable_to_assist: "Unable to assist",
};
export const MAX_STATUS_REASON = 10000;
export function isStatusTransitionAllowed(from: RequestStatus, to: RequestStatus) {
  return statusTransitions[from].includes(to);
}
