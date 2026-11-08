import Link from "next/link";
import { SignOutButton } from "@/features/auth/components/SignOutButton";

export const dynamic = "force-dynamic";

export default function AdminDeniedPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold">Administrator access unavailable</h1>
      <p className="mt-4">We couldn&apos;t authorize administrator access. Sign out to try another account, or contact the site administrator.</p>
      <SignOutButton />
      <Link href="/admin/login" className="underline">Return to sign in</Link>
    </main>
  );
}
