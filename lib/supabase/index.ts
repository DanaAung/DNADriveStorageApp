import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabaseConfig } from "./config";

/**
 * Per-request Supabase client bound to the signed-in user's auth cookies.
 * All table/storage access goes through Row Level Security (see supabase/schema.sql),
 * so no service-role key is needed.
 */
export const createSessionClient = async () => {
  // Supabase's auth client reads Date.now() (token expiry). With cacheComponents and
  // partial prefetching, that is only allowed at request time, so wait for one.
  await connection();
  const cookieStore = await cookies();

  return createServerClient(supabaseConfig.url, supabaseConfig.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore: proxy.ts refreshes the session on every request.
        }
      },
    },
  });
};
