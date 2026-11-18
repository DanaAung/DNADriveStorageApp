"use server";

import { createSessionClient } from "@/lib/supabase";
import { supabaseConfig } from "@/lib/supabase/config";
import { getFileType, parseStringify, TOTAL_STORAGE_BYTES } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

// Live public.files columns (camelCase like users), with the owner's profile embedded
// via the files.owner → users.id foreign key. The table has no updated_at column,
// so updatedAt mirrors created_at.
const FILE_SELECT = `
  id, name, url, type, extension, size, users, accountId, bucketFileId,
  createdAt:created_at, updatedAt:created_at,
  owner:users!files_owner_fkey(id, fullName, email, avatar)
`;

// Whitelist of sortable columns (sort values look like "createdAt-desc").
const SORT_COLUMNS: Record<string, string> = {
  createdAt: "created_at",
  $createdAt: "created_at",
  updatedAt: "created_at",
  name: "name",
  size: "size",
};

const FILE_TYPES: FileType[] = ["document", "image", "video", "audio", "other"];
const SIGNED_URL_TTL = 60 * 60; // seconds; the bucket is private, so links expire
const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

// Supabase errors are Error subclasses whose fields don't survive console.log
// (they print as "{}"), and Server Actions should throw plain Errors.
function handleError(error: unknown, message: string): never {
  unstable_rethrow(error); // let redirect()/notFound() through untouched

  const e = (error ?? {}) as Record<string, unknown>;
  const detail = [e.message, e.code && `code=${e.code}`, e.details, e.hint]
    .filter(Boolean)
    .join(" | ");

  console.error(`${message}: ${detail || String(error)}`);
  throw new Error(`${message}${e.message ? `: ${e.message}` : ""}`);
}

const getAuthUser = async () => {
  const supabase = await createSessionClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  // Pages and Server Actions can render independently of the (root) layout's
  // auth gate (partial prefetching), so redirect here too instead of throwing.
  if (error || !user) redirect("/sign-in");

  return { supabase, user };
};

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;

// Row ownership: files."accountId" is the uploader's auth user id (set server-side in
// uploadFile, never from the client). Every query below filters on it explicitly, so
// isolation does not depend on RLS alone; RLS (supabase/schema.sql) is the second layer.
const OWNER_COLUMN = "accountId";

// PostgREST filter: rows I own OR rows whose `users` array contains my email.
const ownedOrSharedFilter = (userId: string, email?: string) => {
  const owned = `${OWNER_COLUMN}.eq.${userId}`;
  if (!email) return owned;
  const quoted = `"${email.toLowerCase().replace(/["\\]/g, "\\$&")}"`;
  return `${owned},users.cs.{${quoted}}`;
};

// Mutations must hit exactly one row I own; anything else reads as "not found".
const notFoundOrForbidden = () =>
  new Error("File not found or you don't have permission to change it");

// The bucket is private: replace stored URLs with short-lived signed URLs. Signing goes
// through the user's session, so storage RLS decides which objects can be signed.
const withSignedUrls = async (
  supabase: SessionClient,
  files: FileDocument[],
): Promise<FileDocument[]> => {
  const paths = [...new Set(files.map((f) => f.bucketFileId).filter(Boolean))];
  if (paths.length === 0) return files;

  const { data, error } = await supabase.storage
    .from(supabaseConfig.bucketId)
    .createSignedUrls(paths, SIGNED_URL_TTL);
  if (error) throw error;

  const byPath = new Map(
    data
      .filter((d) => d.path && d.signedUrl && !d.error)
      .map((d) => [d.path as string, d.signedUrl]),
  );
  return files.map((f) => ({ ...f, url: byPath.get(f.bucketFileId) ?? "" }));
};

// public.users.id for the signed-in user (files.owner references it).
const getProfileId = async (supabase: SessionClient, authUserId: string) => {
  const { data, error } = await supabase
    .from(supabaseConfig.usersTable)
    .select("id")
    .eq("accountId", authUserId)
    .single();
  if (error) throw error;

  return data.id as string;
};

export const uploadFile = async ({ file, path }: UploadFileProps) => {
  try {
    // Owner is always the signed-in user; client-supplied ownerId/accountId are not trusted.
    const { supabase, user } = await getAuthUser();
    const ownerId = await getProfileId(supabase, user.id);
    const bucket = supabase.storage.from(supabaseConfig.bucketId);

    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const objectPath = `${user.id}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await bucket.upload(objectPath, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { type, extension } = getFileType(file.name);

    const { data: newFile, error } = await supabase
      .from(supabaseConfig.filesTable)
      .insert({
        type,
        name: file.name,
        url: bucket.getPublicUrl(objectPath).data.publicUrl,
        extension,
        size: file.size,
        owner: ownerId,
        accountId: user.id,
        users: [],
        bucketFileId: objectPath,
      })
      .select(FILE_SELECT)
      .single();

    if (error) {
      await bucket.remove([objectPath]);
      throw error;
    }

    revalidatePath(path);
    return parseStringify(newFile as unknown as FileDocument);
  } catch (error) {
    handleError(error, "Failed to upload file");
  }
};

export const getFiles = async ({
  types = [],
  searchText = "",
  sort = "createdAt-desc",
  limit,
}: GetFilesProps) => {
  try {
    const { supabase, user } = await getAuthUser();

    // Only files I own or that were explicitly shared with my email.
    let query = supabase
      .from(supabaseConfig.filesTable)
      .select(FILE_SELECT, { count: "exact" })
      .or(ownedOrSharedFilter(user.id, user.email));

    if (types.length > 0) query = query.in("type", types);

    if (searchText) {
      const escaped = searchText.replace(/[\\%_]/g, (c) => `\\${c}`);
      query = query.ilike("name", `%${escaped}%`);
    }

    const [sortBy, orderBy] = sort.split("-");
    query = query.order(SORT_COLUMNS[sortBy] ?? "created_at", {
      ascending: orderBy === "asc",
    });

    if (limit) query = query.limit(limit);

    const { data, count, error } = await query;
    if (error) throw error;

    // Keep the { documents, total } shape the pages already consume.
    const documents = await withSignedUrls(
      supabase,
      (data ?? []) as unknown as FileDocument[],
    );

    return parseStringify({
      documents,
      total: count ?? 0,
    });
  } catch (error) {
    handleError(error, "Failed to get files");
  }
};

export const renameFile = async ({
  fileId,
  name,
  extension,
  path,
}: RenameFileProps) => {
  try {
    const { supabase, user } = await getAuthUser();

    // The rename dialog starts with the full name ("photo.png"); don't append ".png" twice.
    const suffix = `.${extension}`.toLowerCase();
    let baseName = name.trim();
    if (extension && baseName.toLowerCase().endsWith(suffix)) {
      baseName = baseName.slice(0, -suffix.length).trim();
    }
    if (!baseName) throw new Error("File name cannot be empty");

    const { data: updatedFile, error } = await supabase
      .from(supabaseConfig.filesTable)
      .update({ name: extension ? `${baseName}.${extension}` : baseName })
      .eq("id", fileId)
      .eq(OWNER_COLUMN, user.id)
      .select(FILE_SELECT)
      .maybeSingle();
    if (error) throw error;
    if (!updatedFile) throw notFoundOrForbidden();

    revalidatePath(path);
    return parseStringify(updatedFile as unknown as FileDocument);
  } catch (error) {
    handleError(error, "Failed to rename file");
  }
};

export const updateFileUsers = async ({
  fileId,
  emails,
  path,
}: UpdateFileUsersProps) => {
  try {
    const { supabase, user } = await getAuthUser();

    // Normalise: trim, lowercase, drop blanks/invalid entries, de-duplicate.
    const users = [
      ...new Set(
        emails
          .map((email) => email.trim().toLowerCase())
          .filter((email) => EMAIL_RE.test(email)),
      ),
    ];

    const { data: updatedFile, error } = await supabase
      .from(supabaseConfig.filesTable)
      .update({ users })
      .eq("id", fileId)
      .eq(OWNER_COLUMN, user.id)
      .select(FILE_SELECT)
      .maybeSingle();
    if (error) throw error;
    if (!updatedFile) throw notFoundOrForbidden();

    revalidatePath(path);
    return parseStringify(updatedFile as unknown as FileDocument);
  } catch (error) {
    handleError(error, "Failed to update file users");
  }
};

export const deleteFile = async ({ fileId, path }: DeleteFileProps) => {
  try {
    const { supabase, user } = await getAuthUser();

    // Delete the row first (owner only) and use the stored object path
    // rather than the client-supplied bucketFileId.
    const { data: deleted, error } = await supabase
      .from(supabaseConfig.filesTable)
      .delete()
      .eq("id", fileId)
      .eq(OWNER_COLUMN, user.id)
      .select("bucketFileId")
      .maybeSingle();
    if (error) throw error;
    if (!deleted) throw notFoundOrForbidden();

    const { error: storageError } = await supabase.storage
      .from(supabaseConfig.bucketId)
      .remove([deleted.bucketFileId]);
    if (storageError) console.log(storageError, "Orphaned storage object");

    revalidatePath(path);
    return parseStringify({ status: "success" });
  } catch (error) {
    handleError(error, "Failed to delete file");
  }
};

// ============================== TOTAL FILE SPACE USED
export async function getTotalSpaceUsed() {
  try {
    const { supabase, user } = await getAuthUser();

    // Storage usage counts only my own uploads, not files shared with me.
    const { data: files, error } = await supabase
      .from(supabaseConfig.filesTable)
      .select("type, size, created_at")
      .eq(OWNER_COLUMN, user.id);
    if (error) throw error;

    const totalSpace = {
      image: { size: 0, latestDate: "" },
      document: { size: 0, latestDate: "" },
      video: { size: 0, latestDate: "" },
      audio: { size: 0, latestDate: "" },
      other: { size: 0, latestDate: "" },
      used: 0,
      all: TOTAL_STORAGE_BYTES,
    };

    files.forEach((file) => {
      const fileType: FileType = FILE_TYPES.includes(file.type as FileType)
        ? (file.type as FileType)
        : "other";
      const size = Number(file.size) || 0;
      totalSpace[fileType].size += size;
      totalSpace.used += size;

      if (
        !totalSpace[fileType].latestDate ||
        new Date(file.created_at) > new Date(totalSpace[fileType].latestDate)
      ) {
        totalSpace[fileType].latestDate = file.created_at;
      }
    });

    return parseStringify(totalSpace);
  } catch (error) {
    handleError(error, "Failed to calculate total space used");
  }
}
