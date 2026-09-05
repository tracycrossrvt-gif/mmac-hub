import { z } from "zod";

export const getHelpSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required."),
    lastName: z.string().trim().min(1, "Last name is required."),

    phone: z.string().trim().optional(),

    email: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || z.string().email().safeParse(value).success,
        "Enter a valid email address."
      )
      .optional(),

    animalName: z.string().trim().optional(),

    species: z.string().min(1, "Select a species."),
    sex: z.string().min(1, "Select a sex."),
    alteredStatus: z.string().min(1, "Select a spay/neuter status."),

    age: z.string().trim().optional(),
    breed: z.string().trim().optional(),
    colorDescription: z.string().trim().optional(),

    lastHeatCycleNotes: z.string().trim().optional(),

    helpSummary: z
      .string()
      .trim()
      .min(5, "Please tell us briefly what help you need."),

    rabiesStatus: z.string().min(1, "Select a rabies status."),

    preventionUseStatus: z
      .string()
      .min(1, "Select a prevention status."),

    preventionProduct: z.string().trim().optional(),
    medicalConcerns: z.string().trim().optional(),

    availableDays: z.array(z.string()).optional(),

    transportationNotes: z.string().trim().optional(),

    statedContributionAmount: z
      .preprocess(
        (value) => (value === "" ? undefined : value),
        z.coerce
          .number()
          .min(0, "Contribution amount cannot be negative.")
          .optional()
      ),

    additionalInformation: z.string().trim().optional(),
  })

  .refine(
    (data) => Boolean(data.phone?.trim() || data.email?.trim()),
    {
      message: "Please provide a phone number or email address.",
      path: ["phone"],
    }
  )

  .refine(
    (data) =>
      !(
        data.sex === "female" &&
        data.alteredStatus === "not_altered"
      ) || Boolean(data.lastHeatCycleNotes?.trim()),
    {
      message:
        'Please enter the last heat cycle or "Unknown."',
      path: ["lastHeatCycleNotes"],
    }
  );

export type GetHelpFormInput = z.input<typeof getHelpSchema>;
export type GetHelpFormData = z.output<typeof getHelpSchema>;