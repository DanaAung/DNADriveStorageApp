"use server";

import { createSessionClient } from "@/lib/supabase";
import { supabaseConfig } from "@/lib/supabase/config";
import { parseStringify } from "@/lib/utils";
import { avatarPlaceholderUrl } from "@/constants";
import { redirect, unstable_rethrow } from "next/navigation";
import { headers } from "next/headers";

// Live public.users columns: id, fullName, email, avatar, accountId (= auth user id), created_at.
const USER_SELECT = "id, fullName, email, avatar, accountId, createdAt:created_at";

// Result of sending a confirmation / sign-in link. `email` is non-null when the email was sent.
type AuthStartResult = { email: string | null; error?: string };

function handleError(error: unknown, message: string): never {
  unstable_rethrow(error);
  console.log(error, message);
  throw error;
}

// Absolute URL of app/auth/callback/route.ts, where Supabase sends the user back with ?code=...
// This URL must be listed under Supabase → Auth → URL Configuration → Redirect URLs.
const getCallbackUrl = async () => {
  const origin =
    (await headers()).get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  return `${origin}/auth/callback`;
};

/**
 * Sends a 6-digit email OTP to an existing user (also used by "Resend code").
 * Supabase only returns the auth user id after the code is verified, so the
 * email is what identifies the pending sign-in.
 */
export const sendEmailOTP = async ({ email }: { email: string }) => {
  const supabase = await createSessionClient();

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) throw error;

    return true;
  } catch (error) {
    handleError(error, "Failed to send email OTP");
  }
};

export const createAccount = async ({
  fullName,
  email,
}: {
  fullName: string;
  email: string;
}) => {
  const supabase = await createSessionClient();

  try {
    // Creates the auth user if needed and emails a confirmation link (Supabase's default template).
    // The metadata is copied into public.users by app/auth/callback/route.ts once the link is opened.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: await getCallbackUrl(),
        data: { full_name: fullName, avatar: avatarPlaceholderUrl },
      },
    });
    if (error) throw error;

    return parseStringify<AuthStartResult>({ email });
  } catch (error) {
    handleError(error, "Failed to create account");
  }
};

export const verifySecret = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  try {
    const supabase = await createSessionClient();

    // On success @supabase/ssr writes the session cookies via createSessionClient's setAll.
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: password,
      type: "email",
    });
    if (error) throw error;
    if (!data.session) throw new Error("No session returned");

    return parseStringify({ sessionId: data.session.user.id });
  } catch (error) {
    handleError(error, "Failed to verify OTP");
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
    console.log(error);
  }
};

export const signOutUser = async () => {
  const supabase = await createSessionClient();

  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    handleError(error, "Failed to sign out user");
  } finally {
    redirect("/sign-in");
  }
};

export const signInUser = async ({ email }: { email: string }) => {
  const supabase = await createSessionClient();

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: await getCallbackUrl(),
      },
    });

    // With shouldCreateUser: false, Supabase refuses unknown emails.
    if (error?.code === "otp_disabled") {
      return parseStringify<AuthStartResult>({
        email: null,
        error: "User not found",
      });
    }
    if (error) throw error;

    return parseStringify<AuthStartResult>({ email });
  } catch (error) {
    handleError(error, "Failed to sign in user");
  }
};
