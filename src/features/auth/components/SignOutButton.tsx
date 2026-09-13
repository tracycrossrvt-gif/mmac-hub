"use client";

import { useActionState } from "react";
import { signOutAdmin } from "@/features/auth/actions/adminAuth";

export function SignOutButton() {
  const [state, action, pending] = useActionState(signOutAdmin, { message: "" });
  return (
    <form action={action} className="my-4" aria-busy={pending}>
      <button type="submit" disabled={pending}
        className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {state.message && <p role="alert" className="mt-2 text-sm">{state.message}</p>}
    </form>
  );
}
