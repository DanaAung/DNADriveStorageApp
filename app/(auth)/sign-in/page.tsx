import React, { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// Reads request-time data (searchParams), so it must render inside <Suspense>
// when cacheComponents is enabled; the page shell itself stays prerenderable.
const SignInForm = async ({ searchParams }: { searchParams: SearchParams }) => {
  const { error } = await searchParams;

  return (
    <AuthForm
      type="sign-in"
      callbackError={typeof error === "string" ? error : undefined}
    />
  );
};

const SignIn = ({ searchParams }: { searchParams: SearchParams }) => (
  <Suspense fallback={null}>
    <SignInForm searchParams={searchParams} />
  </Suspense>
);

export default SignIn;
