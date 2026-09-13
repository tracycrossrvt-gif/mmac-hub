import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient(
  { requireCookieWrites = false }: { requireCookieWrites?: boolean } = {},
) {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch (error) {
          // Auth actions must not report success if the session cookie failed
          // to persist or clear. Read-only Server Components cannot set cookies.
          if (requireCookieWrites) throw error;
          // Cookie writes may be unavailable in Server Components.
          // src/proxy.ts refreshes cookies before administrator page rendering.
          // Administrator action responses are also private/no-store via proxy.
        }
      },
    },
  });
}
