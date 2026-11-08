// Portfolio-demo switch. Demo mode is ON unless NEXT_PUBLIC_DEMO_MODE is
// exactly "false", so a missing or mistyped setting fails safe (banner shown,
// search engines told not to index). NEXT_PUBLIC_ values are inlined at build
// time: changing the setting on Vercel needs a redeploy.
export function isDemoModeEnabled(value: string | undefined = process.env.NEXT_PUBLIC_DEMO_MODE) {
  return value !== "false";
}

export const demoMode = isDemoModeEnabled();
