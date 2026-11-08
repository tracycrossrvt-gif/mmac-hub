// Shared pill-button styles from docs/DESIGN.md ("Components"). Apply to a
// <Link>, <a> or <button>: className={buttonStyles("accent")}.
export type ButtonVariant =
  | "primary" // navy fill, white text
  | "accent" // gold fill, navy text (never white on gold)
  | "outlineLight" // white outline, for dark backgrounds
  | "outlineDark"; // navy outline, for light backgrounds

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 py-2.5 " +
  "text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary/90",
  accent: "bg-accent text-primary hover:bg-accent/85",
  outlineLight: "border-2 border-white text-white hover:bg-white/10",
  outlineDark: "border-2 border-primary text-primary hover:bg-primary/5",
};

export function buttonStyles(variant: ButtonVariant = "primary", extra = "") {
  return `${base} ${variants[variant]} ${extra}`.trim();
}
