import { z } from "zod";
import { getHelpSchema } from "./getHelpSchema";

export const getHelpSubmissionSchema = z.object({
  submissionId: z.uuid(),
  data: getHelpSchema,
});

export type GetHelpSubmission = z.output<typeof getHelpSubmissionSchema>;
