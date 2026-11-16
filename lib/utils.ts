export { cn } from "cn"

export const parseStringify = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value));

export const getFileType = (fileName: string) => {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (!extension) return { type: "other" as FileType, extension: "" };

  const documentExtensions = [
    "pdf", "doc", "docx", "txt", "xls", "xlsx", "csv", "rtf", "ods", "ppt",
    "odp", "md", "html", "htm", "epub", "pages", "fig", "psd", "ai", "indd",
    "xd", "sketch", "afdesign", "afphoto",
  ];
  const imageExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"];
  const videoExtensions = ["mp4", "avi", "mov", "mkv", "webm"];
  const audioExtensions = ["mp3", "wav", "ogg", "flac"];

  if (documentExtensions.includes(extension))
    return { type: "document" as FileType, extension };
  if (imageExtensions.includes(extension))
    return { type: "image" as FileType, extension };
  if (videoExtensions.includes(extension))
    return { type: "video" as FileType, extension };
  if (audioExtensions.includes(extension))
    return { type: "audio" as FileType, extension };

  return { type: "other" as FileType, extension };
};

// Supabase Storage download URL (replaces the Appwrite /download endpoint).
export const constructDownloadUrl = (bucketFileId: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/files/${bucketFileId
    .split("/")
    .map(encodeURIComponent)
    .join("/")}?download=`;

// Total storage quota shown on the dashboard (matches getTotalSpaceUsed's `all`).
export const TOTAL_STORAGE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

// Local preview URL for a File that hasn't been uploaded yet.
export const convertFileToUrl = (file: File) => URL.createObjectURL(file);

export const convertFileSize = (sizeInBytes: number, digits = 1) => {
  if (!sizeInBytes) return "0 KB";
  if (sizeInBytes < 1024) return `${sizeInBytes} Bytes`;
  if (sizeInBytes < 1024 ** 2) return `${(sizeInBytes / 1024).toFixed(digits)} KB`;
  if (sizeInBytes < 1024 ** 3)
    return `${(sizeInBytes / 1024 ** 2).toFixed(digits)} MB`;
  return `${(sizeInBytes / 1024 ** 3).toFixed(digits)} GB`;
};

// Percentage of the 2GB quota used, 0–100 with 2 decimals.
export const calculatePercentage = (sizeInBytes: number) =>
  Number(Math.min((sizeInBytes / TOTAL_STORAGE_BYTES) * 100, 100).toFixed(2));

// e.g. "9:47am, 16 Nov" in the runtime's local time (no Intl locale differences).
export const formatDateTime = (isoString: string | null | undefined) => {
  if (!isoString) return "—";

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "—";

  let hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  return `${hours}:${minutes.toString().padStart(2, "0")}${period}, ${date.getDate()} ${months[date.getMonth()]}`;
};

export const getFileIcon = (
  extension: string | undefined,
  type: FileType | string,
) => {
  switch (extension) {
    // Document
    case "pdf":
      return "/assets/icons/file-pdf.svg";
    case "doc":
      return "/assets/icons/file-doc.svg";
    case "docx":
      return "/assets/icons/file-docx.svg";
    case "csv":
      return "/assets/icons/file-csv.svg";
    case "txt":
      return "/assets/icons/file-txt.svg";
    case "xls":
    case "xlsx":
      return "/assets/icons/file-document.svg";
    // Image
    case "svg":
      return "/assets/icons/file-image.svg";
    // Video
    case "mkv":
    case "mov":
    case "avi":
    case "wmv":
    case "mp4":
    case "flv":
    case "webm":
    case "m4v":
    case "3gp":
      return "/assets/icons/file-video.svg";
    // Audio
    case "mp3":
    case "mpeg":
    case "wav":
    case "aac":
    case "flac":
    case "ogg":
    case "wma":
    case "m4a":
    case "aiff":
    case "alac":
      return "/assets/icons/file-audio.svg";

    default:
      switch (type) {
        case "image":
          return "/assets/icons/file-image.svg";
        case "document":
          return "/assets/icons/file-document.svg";
        case "video":
          return "/assets/icons/file-video.svg";
        case "audio":
          return "/assets/icons/file-audio.svg";
        default:
          return "/assets/icons/file-other.svg";
      }
  }
};

// ============================== DASHBOARD

type TotalSpace = {
  [K in FileType]: { size: number; latestDate: string };
} & { used: number; all: number };

const latestOf = (...dates: string[]) =>
  dates.filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? "";

// The four category cards on the dashboard (Media combines video + audio).
export const getUsageSummary = (totalSpace: TotalSpace) => [
  {
    title: "Documents",
    size: totalSpace.document.size,
    latestDate: totalSpace.document.latestDate,
    icon: "/assets/icons/file-document-light.svg",
    url: "/documents",
  },
  {
    title: "Images",
    size: totalSpace.image.size,
    latestDate: totalSpace.image.latestDate,
    icon: "/assets/icons/file-image-light.svg",
    url: "/images",
  },
  {
    title: "Media",
    size: totalSpace.video.size + totalSpace.audio.size,
    latestDate: latestOf(totalSpace.video.latestDate, totalSpace.audio.latestDate),
    icon: "/assets/icons/file-video-light.svg",
    url: "/media",
  },
  {
    title: "Others",
    size: totalSpace.other.size,
    latestDate: totalSpace.other.latestDate,
    icon: "/assets/icons/file-other-light.svg",
    url: "/others",
  },
];

// Route segment (/documents, /images, /media, /others) → file types; null if unknown.
export const getFileTypesParams = (type: string): FileType[] | null => {
  switch (type) {
    case "documents":
      return ["document"];
    case "images":
      return ["image"];
    case "media":
      return ["video", "audio"];
    case "others":
      return ["other"];
    default:
      return null;
  }
};
