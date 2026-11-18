"use server";

import { createSessionClient } from "@/lib/supabase";
import { supabaseConfig } from "@/lib/supabase/config";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_AVATAR,
  describeError,
  ensureUserProfile,
  ProfileEmailConflictError,
} from "@/lib/supabase/profile";
import { parseStringify } from "@/lib/utils";
import { redirect, unstable_rethrow } from "next/navigation";
import { headers } from "next/headers";

// Live public.users columns: id, fullName, email, avatar, accountId (= auth user id), created_at.
const USER_SELECT = "id, fullName, email, avatar, accountId, createdAt:created_at";

/**
 * Result of sign-up / sign-in.
 * - `userId` + `hasSession: true`  → cookies are set; the client goes to "/".
 * - `hasSession: false`            → sign-up succeeded but Supabase's "Confirm email"
 *                                    is on; the user must click the emailed link first.
 * - `error`                        → user-facing message; nothing happened.
 */
export type AuthResult = {
  userId: string | null;
  email: string | null;
  hasSession: boolean;
  error?: string;
};

const failure = (error: string): AuthResult => ({
  userId: null,
  email: null,
  hasSession: false,
  error,
});

// Map Supabase auth error codes to messages that are safe to show in the form.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Invalid email or password",
  email_not_confirmed: "Please confirm your email first (check your inbox)",
  user_already_exists: "An account with this email already exists",
  email_exists: "An account with this email already exists",
  weak_password: "Password is too weak",
  over_request_rate_limit: "Too many attempts. Please wait a moment and try again",
  over_email_send_rate_limit: "Too many emails sent. Please wait a moment and try again",
  signup_disabled: "Sign-ups are currently disabled",
};

const authErrorMessage = (error: { code?: string; message: string }) =>
  (error.code && AUTH_ERROR_MESSAGES[error.code]) ||
  error.message ||
  "Authentication failed";

// Where the confirmation link lands when "Confirm email" is on (app/auth/callback/route.ts).
// Must be listed under Supabase → Auth → URL Configuration → Redirect URLs.
const getCallbackUrl = async () => {
  const origin =
    (await headers()).get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  return `${origin}/auth/callback`;
};

export const createAccount = async ({
  fullName,
  email,
  password,
  avatar,
}: {
  fullName: string;
  email: string;
  password: string;
  avatar?: string;
}): Promise<AuthResult> => {
  const normalizedEmail = email.trim().toLowerCase();
  // Which step failed, for the terminal log.
  let step = "init";

  try {
    const supabase = await createSessionClient();
    const profile = { fullName: fullName.trim(), avatar: avatar || DEFAULT_AVATAR };

    // 1. Create the auth user. With "Confirm email" off this also returns a session,
    //    and @supabase/ssr writes the session cookies via createSessionClient's setAll.
    step = "auth.signUp";
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: profile,
        emailRedirectTo: await getCallbackUrl(),
      },
    });
    if (error) {
      console.error(`[createAccount] ${step} failed:`, describeError(error));
      return failure(authErrorMessage(error));
    }

    const { user } = data;
    let { session } = data;
    // With "Confirm email" on, signing up an existing email returns an obfuscated
    // user with no identities instead of an error.
    if (!user || user.identities?.length === 0) {
      return failure(AUTH_ERROR_MESSAGES.user_already_exists);
    }

    // 2. Create the public.users row (service role, bypasses RLS).
    step = "ensureUserProfile";
    try {
      await ensureUserProfile(user, profile);
    } catch (profileError) {
      console.error(
        `[createAccount] ${step} failed for auth user ${user.id}:`,
        profileError instanceof ProfileEmailConflictError
          ? profileError.message
          : describeError(profileError),
      );

      // Roll back so the email isn't stuck as an auth user without a profile
      // (re-signing up would say "already exists", signing in would fail again).
      if (session) await supabase.auth.signOut();
      const { error: rollbackError } =
        await getSupabaseAdmin().auth.admin.deleteUser(user.id);
      if (rollbackError) {
        console.error(
          `[createAccount] rollback deleteUser(${user.id}) failed:`,
          describeError(rollbackError),
        );
      }

      return failure(
        profileError instanceof ProfileEmailConflictError
          ? "An account with this email already exists"
          : "We couldn't set up your account. Please try again.",
      );
    }

    // 3. No session from signUp → try signing in right away. This fails with
    //    email_not_confirmed while Supabase's "Confirm email" is on; the form then
    //    shows the "check your email" notice.
    if (!session) {
      step = "auth.signInWithPassword";
      const { data: signIn, error: signInError } =
        await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (signInError) {
        if (signInError.code !== "email_not_confirmed") {
          console.error(`[createAccount] ${step} failed:`, describeError(signInError));
        }
      } else {
        session = signIn.session;
      }
    }

    return parseStringify<AuthResult>({
      userId: user.id,
      email: user.email ?? normalizedEmail,
      hasSession: !!session,
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error(
      `[createAccount] unexpected error at step "${step}" for ${normalizedEmail}:`,
      describeError(error),
      error,
    );
    return failure("Failed to create account. Please try again.");
  }
};

export const signInUser = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<AuthResult> => {
  try {
    const supabase = await createSessionClient();

    // On success @supabase/ssr writes the session cookies via createSessionClient's setAll.
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) return failure(authErrorMessage(error));

    // Accounts confirmed before the profile existed (or created in the dashboard)
    // still get their public.users row.
    try {
      await ensureUserProfile(data.user);
    } catch (profileError) {
      console.error("Failed to create user profile:", describeError(profileError));
      await supabase.auth.signOut();
      return failure("We couldn't load your account. Please try again.");
    }

    return parseStringify<AuthResult>({
      userId: data.user.id,
      email: data.user.email ?? email,
      hasSession: true,
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error("Failed to sign in:", describeError(error));
    return failure("Failed to sign in. Please try again.");
  }
};

export const getCurrentUser = async () => {
  try {
    const supabase = await createSessionClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return null;

    const { data: profile, error } = await supabase
      .from(supabaseConfig.usersTable)
      .select(USER_SELECT)
      .eq("accountId", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!profile) return null;

    return parseStringify(profile as unknown as UserProfile);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Failed to get current user:", describeError(error));
    return null;
  }
};

export const signOutUser = async () => {
  try {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Failed to sign out:", describeError(error));
  } finally {
    redirect("/sign-in");
  }
};
