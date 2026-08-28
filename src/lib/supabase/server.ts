import "server-only";
import { createClient } from "@supabase/supabase-js";

// No generated Database type yet — table typing is done manually via src/types/database.ts
// at each call site instead of threading a Database generic through the client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: ReturnType<typeof createClient<any>> | null = null;

export function getSupabaseServerClient() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Fill them into .env.local (see .env.local.example) and restart the dev server."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client = createClient<any>(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return client;
}
