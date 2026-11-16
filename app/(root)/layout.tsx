import React, { Suspense } from "react";
import Image from "next/image";
import Sidebar from "@/components/Sidebar";
import MobileNavigation from "@/components/MobileNavigation";
import Header from "@/components/Header";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { redirect } from "next/navigation";
import { Toaster } from "@/components/ui/toaster";

// Reads the Supabase session (cookies), so it must render inside <Suspense> with
// cacheComponents enabled. Everything in the (root) group requires a signed-in user,
// so the pages render inside this gate.
const AuthenticatedShell = async ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect("/sign-in");

  return (
    <>
      <Sidebar {...currentUser} />

      <section className="flex h-full flex-1 flex-col">
        <MobileNavigation {...currentUser} />
        <Header userId={currentUser.id} accountId={currentUser.accountId} />
        <div className="main-content">{children}</div>
      </section>
    </>
  );
};

const ShellFallback = () => (
  <div className="flex flex-1 items-center justify-center">
    <Image
      src="/assets/icons/loader-brand.svg"
      alt="Loading"
      width={48}
      height={48}
      className="animate-spin"
    />
  </div>
);

const Layout = ({ children }: { children: React.ReactNode }) => (
  <main className="flex h-screen">
    <Suspense fallback={<ShellFallback />}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>

    <Toaster />
  </main>
);

export default Layout;
