"use client";

import { useActionState } from "react";
import { signInAdmin } from "@/features/auth/actions/adminAuth";

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(signInAdmin, { message: "" });

  return (
    <form action={action} className="mt-8 space-y-5" aria-busy={pending}>
      <div>
        <label htmlFor="admin-email" className="block font-medium">Email</label>
        <input id="admin-email" name="email" type="email" autoComplete="username"
          required maxLength={254} className="mt-2 w-full rounded-md border px-3 py-2" />
      </div>
      <div>
        <label htmlFor="admin-password" className="block font-medium">Password</label>
        <input id="admin-password" name="password" type="password" autoComplete="current-password"
          required maxLength={4096} className="mt-2 w-full rounded-md border px-3 py-2" />
      </div>
      {state.message && <p role="alert" className="text-sm">{state.message}</p>}
      <button type="submit" disabled={pending}
        className="w-full rounded-md border px-4 py-3 font-medium disabled:opacity-50">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
