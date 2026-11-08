import { z } from "zod";
import { getHelpSubmissionSchema, type GetHelpSubmission } from "../validation/getHelpSubmissionSchema";
import type { GetHelpFormData } from "../validation/getHelpSchema";

export const submissionStorageKey = "mmac.public-assistance-attempt.v1";
// Non-sensitive marker survives emergency snapshot removal. A reload must not
// interpret lost recovery data as permission to create a new submission.
export const submissionGuardKey = `${submissionStorageKey}.guard`;
const attemptSchema = z.discriminatedUnion("state", [
  z.object({ version: z.literal(1), state: z.literal("pending"), submission: getHelpSubmissionSchema.strict() }).strict(),
  z.object({ version: z.literal(1), state: z.literal("conflict"), submission: getHelpSubmissionSchema.strict() }).strict(),
  z.object({ version: z.literal(1), state: z.literal("complete"), submissionId: z.uuid(), requestId: z.uuid() }).strict(),
]);
export type PublicSubmissionAttempt = z.output<typeof attemptSchema>;
export type PendingSubmissionAttempt = Extract<PublicSubmissionAttempt, { state: "pending" }>;
type AttemptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function freezeAttempt(attempt: PublicSubmissionAttempt): PublicSubmissionAttempt {
  if (attempt.state !== "complete") {
    if (attempt.submission.data.availableDays) Object.freeze(attempt.submission.data.availableDays);
    Object.freeze(attempt.submission.data);
    Object.freeze(attempt.submission);
  }
  return Object.freeze(attempt);
}

export function readSubmissionAttempt(storage: AttemptStorage): PublicSubmissionAttempt | null {
  const raw = storage.getItem(submissionStorageKey);
  const guard = storage.getItem(submissionGuardKey);
  if (guard !== null) z.uuid().parse(guard);
  if (raw === null) {
    if (guard !== null) throw new Error("Submission recovery data is missing");
    return null;
  }
  // Invalid/unsupported state must never be treated as a fresh form.
  const attempt = attemptSchema.parse(JSON.parse(raw));
  ensureGuard(storage, attempt); // Also protects valid snapshots saved before this fix.
  return freezeAttempt(attempt);
}

function ensureGuard(storage: AttemptStorage, attempt: PublicSubmissionAttempt): void {
  const id = attempt.state === "complete" ? attempt.submissionId : attempt.submission.submissionId;
  const existing = storage.getItem(submissionGuardKey);
  if (existing !== null && existing !== id) throw new Error("Submission marker conflicts");
  if (existing === null) storage.setItem(submissionGuardKey, id);
  if (storage.getItem(submissionGuardKey) !== id) throw new Error("Submission marker verification failed");
}

function writeAttempt(storage: AttemptStorage, attempt: PublicSubmissionAttempt): void {
  ensureGuard(storage, attempt);
  const encoded = JSON.stringify(attemptSchema.parse(attempt));
  storage.setItem(submissionStorageKey, encoded);
  if (storage.getItem(submissionStorageKey) !== encoded) throw new Error("Attempt storage verification failed");
}

export function beginSubmissionAttempt(
  storage: AttemptStorage, data: GetHelpFormData, makeId: () => string,
): PendingSubmissionAttempt {
  if (readSubmissionAttempt(storage) !== null) throw new Error("An attempt already exists");
  // Parsing clones the caller's form data. Neither later edits nor retries may
  // change this snapshot. Save and verify it BEFORE the first network call.
  const submission = getHelpSubmissionSchema.parse({ submissionId: makeId(), data });
  const attempt = freezeAttempt({ version: 1, state: "pending", submission }) as PendingSubmissionAttempt;
  writeAttempt(storage, attempt);
  return attempt;
}

export function verifyPendingAttempt(storage: AttemptStorage, expected: PendingSubmissionAttempt): GetHelpSubmission {
  const current = readSubmissionAttempt(storage);
  if (current?.state !== "pending" || JSON.stringify(current) !== JSON.stringify(expected)) {
    throw new Error("Pending attempt changed or disappeared");
  }
  return expected.submission;
}

export function finishSubmissionAttempt(storage: AttemptStorage, pending: PendingSubmissionAttempt, requestId: string): PublicSubmissionAttempt {
  const completed = attemptSchema.parse({ version: 1, state: "complete", submissionId: pending.submission.submissionId, requestId });
  try {
    verifyPendingAttempt(storage, pending);
    // Replace the entire item: no submitted data survives confirmed success.
    writeAttempt(storage, completed);
  } catch {
    // Best-effort removal protects privacy if replacing the item fails. The UI
    // remains blocked across reload because the non-sensitive guard is retained.
    storage.removeItem(submissionStorageKey);
    throw new Error("Could not preserve submission confirmation");
  }
  return freezeAttempt(completed);
}

export function blockSubmissionAttempt(storage: AttemptStorage, pending: PendingSubmissionAttempt): PublicSubmissionAttempt {
  verifyPendingAttempt(storage, pending);
  const blocked = freezeAttempt({ ...pending, state: "conflict" });
  writeAttempt(storage, blocked);
  return blocked;
}
