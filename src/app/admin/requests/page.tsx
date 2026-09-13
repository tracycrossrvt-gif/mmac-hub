import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/features/auth/server/requireAdmin";
import { SignOutButton } from "@/features/auth/components/SignOutButton";

export const dynamic = "force-dynamic";

type AssistanceRequestQueueItem = {
  id: string;
  status: string;
  help_summary: string | null;
  submitted_at: string;
  requester: {
    first_name: string;
    last_name: string;
  };
  request_animals: {
    animal: {
      name: string | null;
      species: string;
    };
  }[];
};

export default async function RequestsPage() {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data: requests, error } = await supabase
  .from("assistance_requests")
  .select(`
    id,
    status,
    help_summary,
    submitted_at,
    requester:people!assistance_requests_requester_person_id_fkey!inner (
      first_name,
      last_name
    ),
    request_animals!inner (
      animal:animals!request_animals_animal_id_fkey!inner (
        name,
        species
      )
    )
  `)
  .order("submitted_at", { ascending: false })
.returns<AssistanceRequestQueueItem[]>();

  if (error) {
    console.error("Failed to load assistance requests:", error);

    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold">Assistance Requests</h1>
        <SignOutButton />
        <p className="mt-4">
          We couldn&apos;t load assistance requests.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <SignOutButton />
        <p className="mb-2 text-sm font-medium uppercase tracking-wide">
          MMAC Operations
        </p>

        <h1 className="text-3xl font-bold tracking-tight">
          Assistance Requests
        </h1>

        <p className="mt-3">
          Review requests submitted through the Get Help form.
        </p>
      </div>

      <div className="space-y-4">
        {requests.length === 0 ? (
          <p>No assistance requests yet.</p>
        ) : (
          requests.map((request) => {
            const requester = request.requester;
const animal = request.request_animals?.[0]?.animal;

            return (
              <article
                key={request.id}
                className="rounded-lg border p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">
  {requester
    ? `${requester.first_name} ${requester.last_name}`
    : "Unknown requester"}
</h2>

                    <p className="mt-1">
                      {animal?.name || "Unnamed animal"}
                      {animal?.species
                        ? ` · ${animal.species}`
                        : ""}
                    </p>

                    <p className="mt-3">
                      {request.help_summary}
                    </p>

                    <p className="mt-3 text-sm">
                      Submitted{" "}
                      {new Date(
                        request.submitted_at
                      ).toLocaleString()}
                    </p>
                  </div>

                  <span className="text-sm font-medium">
                    {request.status}
                  </span>
                </div>

                <Link
                  href={`/admin/requests/${request.id}`}
                  className="mt-4 inline-block font-medium underline"
                >
                  Review Request
                </Link>
              </article>
            );
          })
        )}
      </div>
    </main>
  );
}
