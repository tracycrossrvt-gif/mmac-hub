import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { speciesScopes, type PublicServiceOption } from "../serviceOptions";

const optionRowsSchema = z.array(z.object({
  // z.guid: the fixed category IDs are not RFC-versioned UUIDs.
  id: z.guid(),
  name: z.string().trim().min(1),
  species_scope: z.enum(speciesScopes),
})).max(20);

// Active public request options, read server-side with the service-role client.
// Only id, name and species scope reach the browser. Returns null on any
// failure so the form can still offer "Not sure — I'd like advice".
export async function getPublicServiceOptions(): Promise<PublicServiceOption[] | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("services")
      .select("id, name, species_scope")
      .eq("is_active", true)
      .eq("is_public_request_option", true)
      .order("sort_order")
      .order("name");
    if (error) throw new Error("Service options read failed");
    return optionRowsSchema.parse(data).map((row) => ({ id: row.id, name: row.name, speciesScope: row.species_scope }));
  } catch {
    // Fixed diagnostic only: provider details are not logged.
    console.error("Public service options could not be loaded.");
    return null;
  }
}
