// Public MMAC facts, copied from docs/DESIGN.md ("Brand facts"). Change them
// there first; don't add contact details or links that aren't in the spec.
export const siteInfo = {
  name: "Macon Moves Animal Care",
  phoneDisplay: "828-200-9686",
  phoneHref: "tel:+18282009686",
  email: "Maconmovesanimalcare@gmail.com",
  facebookUrl: "https://www.facebook.com/profile.php?id=61576031116351",
  donateUrl: "https://www.zeffy.com/en-US/donation-form/sponsor-a-macon-moves-rescue",
  portfolioUrl: "https://dev-portfolio-woad-seven.vercel.app/",
  fiscalSponsor:
    "Macon Moves Animal Care is a proud partner of Horse Tales Farm Inc., a 501(c)(3) nonprofit (EIN 45-3336241).",
} as const;

export type NavItem =
  | { label: string; href: string }
  | { label: string; comingSoon: true };

export const navItems: readonly NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Get Help", href: "/get-help" },
  { label: "Our Programs", href: "/programs" },
  { label: "Get Involved", href: "/get-involved" },
  { label: "Resources", comingSoon: true },
];
