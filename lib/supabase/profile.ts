import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseConfig } from "@/lib/supabase/config";

export const DEFAULT_AVATAR = "/assets/images/avatar.png";

// Supabase errors are Error subclasses whose fields don't survive console.log
// serialization (they print as "{}"), so flatten them into a string.
export const describeError = (error: unknown) => {
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
 * Makes sure the auth user has a row in public.users (idempotent).
 * Uses the service role so it works before the user has a session (sign-up with
 * email confirmation on) and doesn't depend on RLS — public.users has no insert policy.
 *
 * Live columns: id (uuid), fullName, email, avatar, accountId, created_at (defaulted).
 * id = auth user id so files.owner (FK → users.id) can be set to auth.uid().
 */
// Thrown when public.users already has this email on a profile that belongs to a
// different auth user (users.email is UNIQUE — constraint users_email_key).
export class ProfileEmailConflictError extends Error {
  code = "profile_email_conflict";
  constructor(
    public email: string,
    public authUserId: string,
    public existingProfile: { id: string; accountId: string },
  ) {
    super(
      `public.users already has email ${email} on profile id=${existingProfile.id} ` +
        `(accountId=${existingProfile.accountId}), which is not auth user ${authUserId}. ` +
        `Usually that auth user was deleted but its profile row was not.`,
    );
    this.name = "ProfileEmailConflictError";
  }
}

export const ensureUserProfile = async (
  user: User,
  overrides: { fullName?: string; avatar?: string } = {},
) => {
  const admin = getSupabaseAdmin();
  const table = supabaseConfig.usersTable;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  const email = (user.email ?? "").toLowerCase();

  // Already set up? Leave it untouched.
  const { data: existing, error: lookupError } = await admin
    .from(table)
    .select("id")
    .eq("accountId", user.id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return;

  const { error } = await admin.from(table).insert({
    id: user.id,
    accountId: user.id,
    email,
    fullName:
      overrides.fullName ?? str(meta.fullName) ?? str(meta.full_name) ?? "",
    avatar: overrides.avatar ?? str(meta.avatar) ?? DEFAULT_AVATAR,
  });
  if (!error) return;

  // 23505 = unique_violation. On the email constraint, report which row holds it.
  if (error.code === "23505" && /email/i.test(`${error.message} ${error.details}`)) {
    const { data: holder } = await admin
      .from(table)
      .select("id, accountId")
      .eq("email", email)
      .maybeSingle();
    if (holder) throw new ProfileEmailConflictError(email, user.id, holder);
  }
  throw error;
};
