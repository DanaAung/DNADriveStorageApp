export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // Supabase's newer "publishable" key; falls back to the legacy anon key.
  anonKey: (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,

  // PostgreSQL tables (replacing Appwrite collections)
  usersTable: "users",
  filesTable: "files",

  // Storage bucket (replacing the Appwrite bucket)
  bucketId: "files",
};
