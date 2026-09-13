import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getAdminUserIds } from "./adminAllowlist";

type AdminAccess =
  | { allowed: true; user: User }
  | { allowed: false; reason: "configuration" | "unauthenticated" | "forbidden" };

export async function getAdminAccess(): Promise<AdminAccess> {
  const adminIds = getAdminUserIds();
  if (!adminIds) return { allowed: false, reason: "configuration" };

  try {
    const supabase = await createClient();
    // Verify with Supabase Auth. Never authorize from getSession(), form fields,
    // email, or editable user metadata.
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { allowed: false, reason: "unauthenticated" };
    if (!adminIds.has(user.id.toLowerCase())) {
      return { allowed: false, reason: "forbidden" };
    }
    return { allowed: true, user };
  } catch {
    // Connection/configuration/verification failures cannot grant access.
    return { allowed: false, reason: "unauthenticated" };
  }
}

export async function requireAdmin(): Promise<User> {
  const access = await getAdminAccess();
  if (!access.allowed) {
    redirect(access.reason === "unauthenticated" ? "/admin/login" : "/admin/denied");
  }
  return access.user;
}
