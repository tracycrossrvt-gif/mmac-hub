import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const { data: serviceAreas, error } = await supabase
    .from("service_areas")
    .select("id, name, state, service_level")
    .eq("is_active", true)
    .order("name");

  if (error) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">MMAC Hub</h1>
        <p className="mt-4">Unable to load service areas.</p>
        <pre className="mt-4 text-sm">{error.message}</pre>
      </main>
    );
  }

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">MMAC Hub</h1>

      <p className="mt-2">
        Active service areas loaded from PostgreSQL:
      </p>

      <ul className="mt-6 space-y-2">
        {serviceAreas?.map((area) => (
          <li key={area.id}>
            {area.name}, {area.state} — {area.service_level}
          </li>
        ))}
      </ul>
    </main>
  );
}