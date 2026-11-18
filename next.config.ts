import type { NextConfig } from "next";

// Uploads go through the uploadFile Server Action (and proxy.ts), so both body limits
// must exceed MAX_FILE_SIZE (50MB) plus multipart overhead.
const UPLOAD_BODY_LIMIT = "52mb";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : null;

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    serverActions: {
      bodySizeLimit: UPLOAD_BODY_LIMIT,
    },
    proxyClientMaxBodySize: UPLOAD_BODY_LIMIT,
  },
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: [
      // Thumbnails: signed URLs from the private Supabase Storage bucket.
      ...(supabaseUrl
        ? [
            {
              protocol: supabaseUrl.protocol.replace(":", "") as "https" | "http",
              hostname: supabaseUrl.hostname,
              pathname: "/storage/v1/object/sign/files/**",
            },
          ]
        : []),
      // avatarPlaceholderUrl in constants/index.ts
      { protocol: "https", hostname: "img.freepik.com" },
    ],
  },
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
