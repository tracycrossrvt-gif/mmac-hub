import "server-only";

import { z } from "zod";

const uuidSchema = z.uuid();

export function getAdminUserIds(): ReadonlySet<string> | null {
  const configured = process.env.MMAC_ADMIN_USER_IDS;
  if (!configured?.trim()) return null;

  const ids = configured.split(",").map((id) => id.trim());
  // One bad entry invalidates the entire configuration, including empty entries.
  if (ids.some((id) => !uuidSchema.safeParse(id).success)) return null;

  return new Set(ids.map((id) => id.toLowerCase()));
}
