import { z } from "zod";
import { caseOutcomes, contactResults, FUTURE_TOLERANCE_MS, interactionTypes,
  MAX_INTERACTION_NOTES } from "../interactionOptions";

export const requestInteractionSchema = z.object({
  requestId: z.uuid(),
  interactionType: z.enum(interactionTypes),
  contactResult: z.enum(["contacted", "left_message", "no_answer", "other", "sent", "received"]).nullable(),
  caseOutcome: z.enum(caseOutcomes).nullable(),
  notes: z.string().trim().min(1, "Notes are required.").max(MAX_INTERACTION_NOTES),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
}).superRefine((value, context) => {
  const allowed: readonly string[] = contactResults[value.interactionType];
  if (value.interactionType === "note" ? value.contactResult !== null
    : value.contactResult === null || !allowed.includes(value.contactResult)) {
    context.addIssue({ code: "custom", path: ["contactResult"], message: "Choose a result for this interaction type." });
  }
});

export function occurrenceError(occurredAt: string | undefined, requestCreatedAt: string, now = Date.now()) {
  const earliest = Date.parse(requestCreatedAt);
  const occurrence = occurredAt === undefined ? now : Date.parse(occurredAt);
  if (!Number.isFinite(earliest) || !Number.isFinite(occurrence)) return "Unable to validate the interaction date.";
  if (occurrence < earliest) return "The interaction cannot predate this request. Put earlier history in the notes.";
  if (occurrence > now + FUTURE_TOLERANCE_MS) return "The interaction cannot be in the future.";
  return null;
}

export type InteractionActionState = { success: boolean; message: string };
