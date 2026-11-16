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

// public.users.id for the signed-in user (files.owner references it).
const getProfileId = async (
  supabase: Awaited<ReturnType<typeof createSessionClient>>,
  authUserId: string,
) => {
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
    const { supabase } = await getAuthUser();

    // Visibility (owned by me OR shared with my email) is enforced by RLS — see supabase/schema.sql.
    let query = supabase
      .from(supabaseConfig.filesTable)
      .select(FILE_SELECT, { count: "exact" });

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
    return parseStringify({
      documents: (data ?? []) as unknown as FileDocument[],
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
    const { supabase } = await getAuthUser();

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
      .select(FILE_SELECT)
      .single();
    if (error) throw error;

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
    const { supabase } = await getAuthUser();

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
      .select(FILE_SELECT)
      .single();
    if (error) throw error;

    revalidatePath(path);
    return parseStringify(updatedFile as unknown as FileDocument);
  } catch (error) {
    handleError(error, "Failed to update file users");
  }
};

export const deleteFile = async ({ fileId, path }: DeleteFileProps) => {
  try {
    const { supabase } = await getAuthUser();

    // Delete the row first (RLS: owner only) and use the stored object path
    // rather than the client-supplied bucketFileId.
    const { data: deleted, error } = await supabase
      .from(supabaseConfig.filesTable)
      .delete()
      .eq("id", fileId)
      .select("bucketFileId")
      .single();
    if (error) throw error;

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
    const ownerId = await getProfileId(supabase, user.id);

    const { data: files, error } = await supabase
      .from(supabaseConfig.filesTable)
      .select("type, size, created_at")
      .eq("owner", ownerId);
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
    handleError(error, "Error calculating total space used:, ");
  }
}
