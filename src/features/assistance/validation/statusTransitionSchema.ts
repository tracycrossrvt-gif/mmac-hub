import { z } from "zod";
import { isStatusTransitionAllowed, MAX_STATUS_REASON, requestStatuses, type RequestStatus } from "../statusWorkflow";

export const statusTransitionSchema = z.object({
  requestId: z.uuid(),
  expectedStatus: z.enum(requestStatuses),
  expectedVersion: z.number().int().min(0).max(2147483646),
  newStatus: z.enum(requestStatuses),
  reason: z.string().trim().max(MAX_STATUS_REASON).default(""),
}).superRefine((input, context) => {
  if (!isStatusTransitionAllowed(input.expectedStatus, input.newStatus)) {
    context.addIssue({ code: "custom", path: ["newStatus"], message: "Choose a valid next status." });
  }
  if (input.expectedStatus !== "new" && !input.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Explain why this status was selected." });
  }
});

export type StatusTransitionState = {
  success: boolean;
  message: string;
  kind?: "saved" | "invalid" | "stale" | "missing" | "denied" | "uncertain";
  status?: RequestStatus;
  version?: number;
};
