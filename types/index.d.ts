/* eslint-disable no-unused-vars */

declare type FileType = "document" | "image" | "video" | "audio" | "other";

// Row of public.users as returned by the server actions (camelCase aliases).
declare interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  avatar: string;
  createdAt: string;
  accountId: string; // Supabase auth user id
}

// Row of public.files as returned by the server actions (replaces Appwrite Models.Document).
declare interface FileDocument {
  id: string;
  name: string;
  url: string;
  type: FileType;
  extension: string;
  size: number;
  users: string[];
  accountId: string;
  bucketFileId: string;
  createdAt: string;
  updatedAt: string;
  // null if the owner's profile isn't visible under RLS
  owner: Pick<UserProfile, "id" | "fullName" | "email" | "avatar"> | null;
}

declare interface ActionType {
  label: string;
  icon: string;
  value: string;
}

declare interface SearchParamProps {
  params?: Promise<SegmentParams>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

declare interface UploadFileProps {
  file: File;
  ownerId: string;
  accountId: string;
  path: string;
}
declare interface GetFilesProps {
  types: FileType[];
  searchText?: string;
  sort?: string;
  limit?: number;
}
declare interface RenameFileProps {
  fileId: string;
  name: string;
  extension: string;
  path: string;
}
declare interface UpdateFileUsersProps {
  fileId: string;
  emails: string[];
  path: string;
}
declare interface DeleteFileProps {
  fileId: string;
  bucketFileId?: string; // ignored server-side; the stored path is used
  path: string;
}

declare interface FileUploaderProps {
  ownerId: string;
  accountId: string;
  className?: string;
}

declare interface MobileNavigationProps {
  ownerId: string;
  accountId: string;
  fullName: string;
  avatar: string;
  email: string;
}
declare interface SidebarProps {
  fullName: string;
  avatar: string;
  email: string;
}

declare interface ThumbnailProps {
  type: string;
  extension: string;
  url: string;
  className?: string;
  imageClassName?: string;
}

declare interface ShareInputProps {
  file: FileDocument;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (email: string) => void;
}
