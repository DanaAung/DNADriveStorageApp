import React, { Suspense } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import Sort from "@/components/Sort";
import Card from "@/components/Card";
import { getFiles } from "@/lib/actions/file.actions";
import { convertFileSize, getFileTypesParams } from "@/lib/utils";

type Params = Promise<{ type: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const firstParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

// Reads params/searchParams and Supabase data (request-time) → rendered inside <Suspense>.
const FileTypeContent = async ({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) => {
  const [{ type }, query] = await Promise.all([params, searchParams]);

  const types = getFileTypesParams(type);
  if (!types) notFound(); // only /documents, /images, /media, /others

  const searchText = firstParam(query.query);
  const sort = firstParam(query.sort);

  const files = await getFiles({ types, searchText, sort });
  const totalSize = files.documents.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="page-container">
      <section className="w-full">
        <h1 className="h1 capitalize">{type}</h1>

        <div className="total-size-section">
          <p className="body-1">
            Total: <span className="h5">{convertFileSize(totalSize)}</span>
          </p>

          <div className="sort-container">
            <p className="body-1 hidden text-light-200 sm:block">Sort by:</p>

            <Sort />
          </div>
        </div>
      </section>

      {/* Render the files */}
      {files.total > 0 ? (
        <section className="file-list">
          {files.documents.map((file) => (
            <Card key={file.id} file={file} />
          ))}
        </section>
      ) : (
        <p className="empty-list">
          {searchText ? `No files match "${searchText}"` : "No files uploaded"}
        </p>
      )}
    </div>
  );
};

const PageFallback = () => (
  <div className="page-container items-center justify-center py-20">
    <Image
      src="/assets/icons/loader-brand.svg"
      alt="Loading"
      width={40}
      height={40}
      className="animate-spin"
    />
  </div>
);

const Page = ({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) => (
  <Suspense fallback={<PageFallback />}>
    <FileTypeContent params={params} searchParams={searchParams} />
  </Suspense>
);

export default Page;
