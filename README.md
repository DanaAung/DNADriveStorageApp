Markdown
# DNADrive — Cloud Storage & File Management App

A modern, full-stack cloud storage and file management platform inspired by Google Drive. Built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, and **Supabase** for authentication, PostgreSQL database storage, and object file storage.

## Features

- **Passwordless Authentication:** Secure sign-up and sign-in powered by Supabase Auth email verification.
- **Storage Analytics Dashboard:** Visual storage usage breakdown across Documents, Images, Media (Video/Audio), and Others, alongside recent uploads.
- **File Uploads:** Drag-and-drop or multi-file upload directly to Supabase Storage with automatic file type detection and size tracking.
- **File Management:** Rename, download, view file metadata, and delete files with real-time UI updates.
- **File Sharing:** Share uploaded files with other registered users by email and manage access permissions.
- **Search, Filter & Sort:** Instant global file search, dedicated category views (`/documents`, `/images`, `/media`, `/others`), and sorting by date or file size.
- **Responsive UI:** Clean, adaptive interface for both desktop and mobile screens.

## Tech Stack

- **Framework:** Next.js (App Router) & React
- **Language:** TypeScript
- **Styling:** Tailwind CSS & shadcn/ui
- **Backend & Storage:** Supabase (Auth, PostgreSQL Database, Storage Buckets)
- **Charts & Icons:** Recharts & Lucide React

## Getting Started

### 1. Clone the Repository
```bash
git clone [https://github.com/DanaAung/DNADriveStorageApp.git](https://github.com/DanaAung/DNADriveStorageApp.git)
cd DNADriveStorageApp

2. Install Dependencies
Bash
npm install

3. Configure Environment Variables
Create a .env.local file in the project root and add your Supabase credentials:

Code snippet
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SECRET_KEY=your_supabase_service_role_or_secret_key

4. Set Up the Supabase Database & Storage
Run the SQL statements in supabase/schema.sql inside your Supabase SQL Editor to create the users and files tables and Row Level Security policies.

Create a storage bucket named files in Supabase Storage.

5. Run the Development Server
Bash
npm run dev

Open http://localhost:3000 in your browser to view the application.
