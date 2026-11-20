// Public request options shown on /get-help. Shared by the server loader and
// the client form; contains no server-only code.

export const speciesScopes = ["all", "dog", "cat"] as const;

export type PublicServiceOption = {
  id: string;
  name: string;
  speciesScope: (typeof speciesScopes)[number];
};

export const serviceAdviceLabel = "Not sure — I'd like advice";

// Options the applicant may choose for the selected species. "Other" and an
// unanswered species get none: only "Not sure — I'd like advice" applies.
export function optionsForSpecies(options: readonly PublicServiceOption[], species: unknown): PublicServiceOption[] {
  if (species !== "dog" && species !== "cat") return [];
  return options.filter((option) => option.speciesScope === "all" || option.speciesScope === species);
}
