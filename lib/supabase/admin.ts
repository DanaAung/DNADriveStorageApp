import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./config";

let adminClient: SupabaseClient | null = null;

/**
 * Service-role client: bypasses Row Level Security. SERVER ONLY — never import
 * this from a Client Component. Created lazily so a missing key fails with a clear
 * message at call time instead of crashing every module that imports this file.
 */
export const getSupabaseAdmin = () => {
  if (adminClient) return adminClient;

  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) {
    throw new Error(
      "Missing SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env.local",
    );
  }

  adminClient = createClient(supabaseConfig.url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
};
