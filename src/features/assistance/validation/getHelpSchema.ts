import { z } from "zod";

const optionalText = z.string().trim().transform((value) => value || undefined).optional();
// Accept decimal/exponent notation from number inputs, not Number()'s hex or
// boolean/null coercions. Keep age as text so client output can be revalidated.
const numericText = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

// Cross-field rules must report alongside field errors (so users see every
// problem in one pass), but this schema also parses untrusted server input.
// Run a rule only when the object itself parsed and every field it reads
// passed its own checks; otherwise the rule could see malformed values.
const fieldsPassed = (...fields: string[]) =>
  (payload: { issues: readonly { path?: readonly PropertyKey[] }[] }) =>
    payload.issues.every((issue) => {
      const field = issue.path?.[0];
      return field !== undefined && !fields.includes(String(field));
    });

// Fields shared by the v1 (pre-Slice 2a) and v2 public submission contracts.
const baseFields = {
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),

  phone: optionalText,

  // Reuse the email bound already enforced by the authentication boundary.
  email: optionalText.pipe(z.email("Enter a valid email address.").max(254).optional()),

  animalName: optionalText,

  // String input preserves the form's empty select defaults; parsed values
  // are restricted to the existing UI options and database CHECK constraints.
  species: z.string().pipe(z.enum(["dog", "cat", "other"], { error: "Select a species." })),
  sex: z.string().pipe(z.enum(["male", "female", "unknown"], { error: "Select a sex." })),
  alteredStatus: z.string().pipe(z.enum(["altered", "unaltered", "unknown"], { error: "Select a spay/neuter status." })),

  // UI min=0; the upper bound is numeric(4,1) storage, not an age/eligibility policy.
  age: optionalText.refine((value) => value === undefined || (
    numericText.test(value) && Number.isFinite(Number(value))
    && Number(value) >= 0 && Number(value) <= 999.9
  ), "Enter a valid nonnegative age within the supported range (0–999.9 years)."),
  breed: optionalText,
  colorDescription: optionalText,

  lastHeatCycleNotes: optionalText,

  helpSummary: z
    .string()
    .trim()
    .min(5, "Please tell us a little more (at least 5 characters)."),

  rabiesStatus: z.string().pipe(z.enum(["current", "not_current", "unknown"], { error: "Select a rabies status." })),

  preventionUseStatus: z.string().pipe(z.enum(["using", "not_using", "unknown"], { error: "Select a prevention status." })),

  preventionProduct: optionalText,
  medicalConcerns: optionalText,

  availableDays: z.array(z.string().pipe(z.enum(weekdays))).max(7)
    .refine((days) => new Set(days).size === days.length, "Select each day only once.").optional(),

  transportationNotes: optionalText,

  statedContributionAmount: z
    .preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.union([z.number(), z.string().trim().regex(numericText, "Enter a valid contribution amount.").transform(Number)])
        .pipe(z.number()
        .min(0, "Contribution amount cannot be negative.")
        // Existing numeric(10,2) storage; this is not a funding decision.
        .max(99999999.99, "Contribution amount exceeds the supported range."))
        .optional()
    ),

  additionalInformation: optionalText,
};

const hasContact = (data: { phone?: string; email?: string }) => Boolean(data.phone?.trim() || data.email?.trim());
const contactRule = {
  message: "Please provide a phone number or email address.",
  path: ["phone"],
  when: fieldsPassed("phone", "email"),
};

const hasHeatCycleAnswer = (data: { sex: string; alteredStatus: string; lastHeatCycleNotes?: string }) =>
  !(data.sex === "female" && data.alteredStatus === "unaltered") || Boolean(data.lastHeatCycleNotes?.trim());
const heatCycleRule = {
  message: 'Please enter the last heat cycle or "Unknown."',
  path: ["lastHeatCycleNotes"],
  when: fieldsPassed("sex", "alteredStatus", "lastHeatCycleNotes"),
};

export const servicesRequiredMessage = "Choose at least one service, or choose “Not sure — I'd like advice.”";
export const otherSpeciesServicesMessage = "For other animals, choose “Not sure — I'd like advice” and tell us what you need below.";
const serviceListMessage = "Choose services from the list.";

// Format only. Whether an ID is an active public option for this species is
// decided by the database function in the same transaction that writes it.
// z.guid, not z.uuid: the fixed category IDs are not RFC-versioned UUIDs.
const serviceIds = z.array(z.guid(serviceListMessage), serviceListMessage)
  .max(20, serviceListMessage)
  .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, "Select each service only once.")
  // Canonical order makes saved snapshots and RPC arguments deterministic.
  .transform((ids) => ids.map((id) => id.toLowerCase()).sort());

// v2 (current): the public form, including requested services.
export const getHelpSchema = z
  .object({
    ...baseFields,
    serviceIds,
    serviceAdviceRequested: z.boolean(),
  })
  .refine(hasContact, contactRule)
  .refine(hasHeatCycleAnswer, heatCycleRule)
  // Required: at least one option, or "Not sure — I'd like advice".
  .refine((data) => data.serviceIds.length > 0 || data.serviceAdviceRequested, {
    message: servicesRequiredMessage,
    path: ["serviceIds"],
    when: fieldsPassed("serviceIds", "serviceAdviceRequested"),
  })
  // Species "other" may only ask for advice (mirrors the database rule).
  .refine((data) => data.species !== "other" || data.serviceIds.length === 0, {
    message: otherSpeciesServicesMessage,
    path: ["serviceIds"],
    when: fieldsPassed("species", "serviceIds"),
  });

// v1 (frozen): attempts saved in a browser before Slice 2a, retried after it.
// Service keys are refused rather than silently stripped, so v2 data can
// never be downgraded to v1.
export const getHelpV1Schema = z
  .object({
    ...baseFields,
    serviceIds: z.never().optional(),
    serviceAdviceRequested: z.never().optional(),
  })
  .refine(hasContact, contactRule)
  .refine(hasHeatCycleAnswer, heatCycleRule);

export type GetHelpFormInput = z.input<typeof getHelpSchema>;
export type GetHelpFormData = z.output<typeof getHelpSchema>;
export type GetHelpV1Data = z.output<typeof getHelpV1Schema>;
