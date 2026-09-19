import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/features/auth/server/requireAdmin";
import { SignOutButton } from "@/features/auth/components/SignOutButton";
import { startRequestReview } from "@/features/assistance/actions/startRequestReview";
import { getRequestDetail } from "@/features/assistance/server/getRequestDetail";
import { CaseSummary } from "@/features/assistance/components/CaseSummary";
import { CaseAnimals } from "@/features/assistance/components/CaseAnimals";
import { CaseTimeline } from "@/features/assistance/components/CaseTimeline";
import { InteractionForm } from "@/features/assistance/components/InteractionForm";
import { displayValue } from "@/features/assistance/components/caseDisplay";

export const dynamic = "force-dynamic";

export default async function RequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  await requireAdmin();
  const { requestId } = await params;
  const detail = await getRequestDetail(requestId);
  if (!detail) notFound();
  const { request, events } = detail;
  return <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <Link href="/admin/requests" className="underline">← Back to requests</Link>
      <SignOutButton />
    </div>
    <div className="space-y-8">
      <CaseSummary request={request} latest={events[0]} />
      {request.status === "new" && <form action={async () => {
        "use server";
        await startRequestReview(request.id);
      }}>
        <button type="submit" className="rounded-md border px-4 py-2 font-medium">Start Review</button>
      </form>}
      <InteractionForm requestId={request.id} />
      <CaseTimeline events={events} submittedAt={request.submitted_at} />
      <CaseAnimals animals={request.request_animals} />
      <section>
        <h2 className="text-xl font-semibold">Additional information</h2>
        <p className="mt-3 whitespace-pre-wrap break-words">{displayValue(request.additional_information)}</p>
      </section>
      {request.internal_notes && <section>
        <h2 className="text-xl font-semibold">Existing internal notes</h2>
        <p className="mt-3 whitespace-pre-wrap break-words">{request.internal_notes}</p>
      </section>}
    </div>
  </main>;
}
