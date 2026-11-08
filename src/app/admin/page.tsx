import { redirect } from "next/navigation";
import { requireAdmin } from "@/features/auth/server/requireAdmin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  redirect("/admin/requests");
}
