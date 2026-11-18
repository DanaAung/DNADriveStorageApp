import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase";
import { describeError, ensureUserProfile } from "@/lib/supabase/profile";

/**
 * Only used when "Confirm email" is enabled in Supabase: the confirmation link
 * redirects here with `?code=...`. Exchange it for a session (cookies are written by
 * createSessionClient's setAll), make sure the user has a row in public.users,
 * then send them into the app.
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

  try {
    await ensureUserProfile(data.user);
  } catch (profileError) {
    console.error("Failed to create user profile:", describeError(profileError));
    await supabase.auth.signOut();
    return fail("profile_creation_failed");
  }

  return NextResponse.redirect(new URL(redirectTo, origin));
}
