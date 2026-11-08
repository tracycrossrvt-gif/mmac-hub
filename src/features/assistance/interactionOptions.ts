export const interactionTypes = ["call", "text", "email", "note"] as const;
export const contactResults = {
  call: ["contacted", "left_message", "no_answer", "other"],
  text: ["sent", "received", "other"],
  email: ["sent", "received", "other"],
  note: [],
} as const;
export const caseOutcomes = [
  "care_established", "awaiting_information", "follow_up_needed",
  "referred_elsewhere", "unable_to_establish_care", "no_further_action_needed",
] as const;

export const interactionLabels: Record<string, string> = {
  call: "Call", text: "Text", email: "Email", note: "Note",
  contacted: "Contacted", left_message: "Left message", no_answer: "No answer",
  other: "Other", sent: "Sent", received: "Received",
  care_established: "Care established", awaiting_information: "Awaiting information",
  follow_up_needed: "Follow-up needed", referred_elsewhere: "Referred elsewhere",
  unable_to_establish_care: "Unable to establish care", no_further_action_needed: "No further action needed",
};

export const MAX_INTERACTION_NOTES = 10_000;
// Small clock differences are allowed; this is not a scheduling feature.
// Keep in sync with the database insert trigger's two-minute tolerance.
export const FUTURE_TOLERANCE_MS = 120_000;
