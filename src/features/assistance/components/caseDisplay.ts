export function displayValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "Not provided" : String(value);
}

export function displayCode(value: string | null | undefined) {
  if (!value) return "Not provided";
  const labels: Record<string, string> = {
    am_dropoff: "Morning drop-off", felv: "FeLV", fiv: "FIV", heartworm: "Heartworm",
    altered: "Spayed / neutered", unaltered: "Not spayed / neutered",
  };
  return labels[value] ?? value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

// A stable timezone avoids server/browser hydration differences. Entry uses the
// device's local timezone; the case view explicitly labels its Eastern display.
export function caseDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function dateOnly(value: string | null) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium" }).format(new Date(`${value}T00:00:00Z`));
}
