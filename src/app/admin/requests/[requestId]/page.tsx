import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { startRequestReview } from "@/features/assistance/actions/startRequestReview";

type AssistanceRequestDetail = {
  id: string;
  status: string;
  help_summary: string | null;
  stated_contribution_amount: number | null;
  transportation_notes: string | null;
  additional_information: string | null;
  submitted_at: string;
  requester: {
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
  };
  request_animals: {
    animal: {
      name: string | null;
      species: string;
      sex: string | null;
      altered_status: string | null;
      age_years: number | null;
      breed: string | null;
      color_description: string | null;
    };
    prescreens: {
      rabies_status: string | null;
      prevention_use_status: string | null;
      prevention_product: string | null;
      medical_concerns: string | null;
      last_heat_cycle_notes: string | null;
    }[];
  }[];
  request_availability: {
    day_of_week: string;
    availability_window: string;
  }[];
};

type RequestPageProps = {
  params: Promise<{
    requestId: string;
  }>;
};

function displayValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === ""
    ? "Not provided"
    : String(value);
}

export default async function RequestPage({
  params,
}: RequestPageProps) {
  const { requestId } = await params;
  const supabase = createAdminClient();

  const { data: request, error } = await supabase
    .from("assistance_requests")
    .select(`
      id,
      status,
      help_summary,
      stated_contribution_amount,
      transportation_notes,
      additional_information,
      submitted_at,
      requester:people!assistance_requests_requester_person_id_fkey!inner (
        first_name,
        last_name,
        phone,
        email
      ),
      request_animals!inner (
        animal:animals!request_animals_animal_id_fkey!inner (
          name,
          species,
          sex,
          altered_status,
          age_years,
          breed,
          color_description
        ),
        prescreens (
          rabies_status,
          prevention_use_status,
          prevention_product,
          medical_concerns,
          last_heat_cycle_notes
        )
      ),
      request_availability (
        day_of_week,
        availability_window
      )
    `)
    .eq("id", requestId)
    .single()
    .returns<AssistanceRequestDetail>();

  if (error || !request) {
    console.error("Failed to load assistance request:", error);
    notFound();
  }

  const requester = request.requester;
  const requestAnimal = request.request_animals[0];
  const animal = requestAnimal?.animal;
  const prescreen = requestAnimal?.prescreens?.[0];
  

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/admin/requests" className="underline">
        ← Back to requests
      </Link>

      <div className="mt-6 border-b pb-6">
        <p className="text-sm font-medium uppercase tracking-wide">
          Assistance Request
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          {requester.first_name} {requester.last_name}
        </h1>

        <p className="mt-2">
          {animal?.name || "Unnamed animal"}
          {animal?.species ? ` · ${animal.species}` : ""}
        </p>

                <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <span>Status: {request.status}</span>
          <span>
            Submitted {new Date(request.submitted_at).toLocaleString()}
          </span>
        </div>
      </div>

      {request.status === "new" && (
        <form
          action={async () => {
            "use server";
            await startRequestReview(request.id);
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="rounded-md border px-4 py-2 font-medium"
          >
            Start Review
          </button>
        </form>
      )}

      <div className="space-y-8 py-8">
        <section>
          <h2 className="text-xl font-semibold">Contact</h2>
          <dl className="mt-3 space-y-2">
            <div>
              <dt className="font-medium">Phone</dt>
              <dd>{displayValue(requester.phone)}</dd>
            </div>
            <div>
              <dt className="font-medium">Email</dt>
              <dd>{displayValue(requester.email)}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Animal</h2>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="font-medium">Name</dt>
              <dd>{displayValue(animal?.name)}</dd>
            </div>
            <div>
              <dt className="font-medium">Species</dt>
              <dd>{displayValue(animal?.species)}</dd>
            </div>
            <div>
              <dt className="font-medium">Sex</dt>
              <dd>{displayValue(animal?.sex)}</dd>
            </div>
            <div>
              <dt className="font-medium">Spay/neuter status</dt>
              <dd>{displayValue(animal?.altered_status)}</dd>
            </div>
            <div>
              <dt className="font-medium">Age</dt>
              <dd>{displayValue(animal?.age_years)}</dd>
            </div>
            <div>
              <dt className="font-medium">Breed</dt>
              <dd>{displayValue(animal?.breed)}</dd>
            </div>
            <div>
              <dt className="font-medium">Color / description</dt>
              <dd>{displayValue(animal?.color_description)}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Requested Help</h2>
          <p className="mt-3">{displayValue(request.help_summary)}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Health & Prevention</h2>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="font-medium">Rabies status</dt>
              <dd>{displayValue(prescreen?.rabies_status)}</dd>
            </div>
            <div>
              <dt className="font-medium">Prevention status</dt>
              <dd>{displayValue(prescreen?.prevention_use_status)}</dd>
            </div>
            <div>
              <dt className="font-medium">Prevention product</dt>
              <dd>{displayValue(prescreen?.prevention_product)}</dd>
            </div>
            <div>
              <dt className="font-medium">Last heat cycle</dt>
              <dd>{displayValue(prescreen?.last_heat_cycle_notes)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-medium">Medical concerns</dt>
              <dd>{displayValue(prescreen?.medical_concerns)}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="text-xl font-semibold">
            Transportation & Availability
          </h2>

          <dl className="mt-3 space-y-4">
            <div>
              <dt className="font-medium">Available mornings</dt>
              <dd>
                {request.request_availability.length > 0
                  ? request.request_availability
                      .map((item) => item.day_of_week)
                      .join(", ")
                  : "None provided"}
              </dd>
            </div>

            <div>
              <dt className="font-medium">Transportation notes</dt>
              <dd>{displayValue(request.transportation_notes)}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Contribution</h2>
          <p className="mt-3">
            {request.stated_contribution_amount === null
              ? "Not provided"
              : `$${request.stated_contribution_amount}`}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Additional Information</h2>
          <p className="mt-3">
            {displayValue(request.additional_information)}
          </p>
        </section>
      </div>
    </main>
  );
}