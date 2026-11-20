import { z } from "zod";
import { getHelpSchema, getHelpV1Schema } from "./getHelpSchema";

// Every new submission is contract v2. v1 exists only so an attempt saved in a
// browser before Slice 2a can still be retried (and replayed) after it; the
// database keeps accepting v1 until a follow-up migration retires it.
// Strict envelopes: unexpected keys are corruption, not data to strip.
export const getHelpSubmissionSchema = z.union([
  z.strictObject({ submissionId: z.uuid(), contractVersion: z.literal(2), data: getHelpSchema }),
  z.strictObject({ submissionId: z.uuid(), data: getHelpV1Schema }),
]);

export type GetHelpSubmission = z.output<typeof getHelpSubmissionSchema>;
