import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseConfig } from "@/lib/supabase/config";
import { avatarPlaceholderUrl } from "@/constants";

// Supabase errors are Error subclasses whose fields don't survive console.log
// serialization (the dev log showed "{}"), so flatten them into a string.
const describeError = (error: unknown) => {
  if (!(error instanceof Object)) return String(error);
  const e = error as Record<string, unknown>;
  return JSON.stringify({
    name: e.name,
    message: e.message,
    code: e.code,
    status: e.status,
    details: e.details,
    hint: e.hint,
  });
};

/**
 * Supabase's confirmation link redirects here with `?code=...`.
 * Exchange it for a session (cookies are written by createSessionClient's setAll),
 * make sure the user has a row in public.users, then send them into the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  // Only allow same-site relative redirects.
  const redirectTo = next?.startsWith("/") && !next.startsWith("//") ? next : "/";

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/sign-in?error=${reason}`, origin));

  if (!code) return fail("missing_code");

  const supabase = await createSessionClient();

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error("Failed to exchange auth code:", describeError(error));
    return fail("auth_callback_failed");
  }

  const { user } = data;

  try {
    // Service role: the insert must not depend on RLS policies on public.users.
    const admin = getSupabaseAdmin();

    const { data: existing, error: lookupError } = await admin
      .from(supabaseConfig.usersTable)
      .select("id")
      .eq("accountId", user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (!existing) {
      const meta = user.user_metadata ?? {};

      // Live columns: id (uuid), fullName, email, avatar, accountId, created_at (defaulted).
      // id = auth user id so files.owner (FK → users.id) can be set to auth.uid().
      const { error: insertError } = await admin
        .from(supabaseConfig.usersTable)
        .insert({
          id: user.id,
          accountId: user.id,
          email: user.email ?? "",
          fullName: (meta.full_name as string | undefined) ?? "",
          avatar: (meta.avatar as string | undefined) ?? avatarPlaceholderUrl,
        });
      if (insertError) throw insertError;
    }
  } catch (profileError) {
    console.error("Failed to create user profile:", describeError(profileError));
    await supabase.auth.signOut();
    return fail("profile_creation_failed");
  }

  return NextResponse.redirect(new URL(redirectTo, origin));
}
