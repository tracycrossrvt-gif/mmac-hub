import Link from "next/link";
import { AdminLoginForm } from "@/features/auth/components/AdminLoginForm";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      <p className="text-sm font-medium uppercase tracking-wide">MMAC Operations</p>
      <h1 className="mt-2 text-3xl font-bold">Administrator sign in</h1>
      <p className="mt-3">Sign in with your MMAC administrator account to review assistance requests.</p>
      <AdminLoginForm />
      <Link href="/get-help" className="mt-6 inline-block underline">Need assistance? Get Help</Link>
    </main>
  );
}
