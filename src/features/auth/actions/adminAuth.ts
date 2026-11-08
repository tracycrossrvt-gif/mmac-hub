"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getAdminUserIds } from "@/features/auth/server/adminAllowlist";
import { getAdminAccess } from "@/features/auth/server/requireAdmin";

export type AuthActionState = { message: string };

const credentialsSchema = z.object({
  email: z.string().trim().pipe(z.email().max(254)),
  password: z.string().min(1).max(4096),
});

export async function signInAdmin(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const credentials = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!credentials.success) {
    return { message: "Enter a valid email address and password." };
  }
  if (!getAdminUserIds()) {
    return { message: "Administrator sign-in is unavailable. Please contact the site administrator." };
  }

  try {
    const supabase = await createClient({ requireCookieWrites: true });
    const { error } = await supabase.auth.signInWithPassword(credentials.data);
    // Never return provider errors, submitted credentials, or session tokens.
    if (error) return { message: "Unable to sign in. Check your details and try again." };
  } catch {
    return { message: "Unable to sign in. Please try again later." };
  }

  const access = await getAdminAccess();
  if (!access.allowed) redirect("/admin/denied");
  revalidatePath("/admin", "layout");
  redirect("/admin");
}

export async function signOutAdmin(): Promise<AuthActionState> {
  // Sign-out needs no administrator grant: an unauthorized user must be able
  // to clear their own session too. No privileged client is used here.
  try {
    const supabase = await createClient({ requireCookieWrites: true });
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return { message: "Unable to sign out. Please try again." };
  } catch {
    return { message: "Unable to sign out. Please try again." };
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/login");
}
