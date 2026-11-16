"use client";

import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createAccount, signInUser } from "@/lib/actions/user.actions";

type FormType = "sign-in" | "sign-up";

const authFormSchema = (formType: FormType) => {
  return z.object({
    email: z.string().email(),
    fullName:
      formType === "sign-up"
        ? z.string().min(2).max(50)
        : z.string().optional(),
  });
};

// Messages for the ?error= codes set by app/auth/callback/route.ts.
const callbackErrors: Record<string, string> = {
  missing_code: "That link is invalid. Please request a new one.",
  auth_callback_failed:
    "That link has expired or was opened in a different browser. Please request a new one.",
  profile_creation_failed: "We couldn't set up your account. Please try again.",
};

const AuthForm = ({
  type,
  callbackError,
}: {
  type: FormType;
  callbackError?: string;
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(
    callbackError ? (callbackErrors[callbackError] ?? "Sign-in failed.") : "",
  );
  // Email the confirmation link was sent to; when set, the form is replaced by a notice.
  const [sentTo, setSentTo] = useState<string | null>(null);

  const formSchema = authFormSchema(type);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      email: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const user =
        type === "sign-up"
          ? await createAccount({
              fullName: values.fullName || "",
              email: values.email,
            })
          : await signInUser({ email: values.email });

      if (user.error) {
        setErrorMessage(user.error);
        return;
      }

      // Supabase has emailed a confirmation link that lands on /auth/callback.
      setSentTo(user.email);
    } catch {
      setErrorMessage(
        type === "sign-up"
          ? "Failed to create account. Please try again."
          : "Failed to sign in. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (sentTo) {
    return (
      <div className="auth-form">
        <h1 className="form-title">Check your email</h1>
        <p className="body-2 text-light-100">
          Check your email for a confirmation link. We sent it to{" "}
          <span className="font-medium text-blue">{sentTo}</span>. Open it in
          this browser to {type === "sign-up" ? "finish signing up" : "sign in"}.
        </p>
        <button
          type="button"
          className="body-2 font-medium text-blue"
          onClick={() => setSentTo(null)}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="auth-form">
          <h1 className="form-title">
            {type === "sign-in" ? "Sign In" : "Sign Up"}
          </h1>
          {type === "sign-up" && (
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <div className="shad-form-item">
                    <FormLabel className="shad-form-label">Full Name</FormLabel>

                    <FormControl>
                      <Input
                        placeholder="Enter your full name"
                        className="shad-input"
                        {...field}
                      />
                    </FormControl>
                  </div>

                  <FormMessage className="shad-form-message" />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <div className="shad-form-item">
                  <FormLabel className="shad-form-label">Email</FormLabel>

                  <FormControl>
                    <Input
                      placeholder="Enter your email"
                      className="shad-input"
                      {...field}
                    />
                  </FormControl>
                </div>

                <FormMessage className="shad-form-message" />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="form-submit-button"
            disabled={isLoading}
          >
            {type === "sign-in" ? "Sign In" : "Sign Up"}

            {isLoading && (
              <Image
                src="/assets/icons/loader.svg"
                alt="loader"
                width={24}
                height={24}
                className="ml-2 animate-spin"
              />
            )}
          </Button>

          {errorMessage && <p className="error-message">*{errorMessage}</p>}

          <div className="body-2 flex justify-center">
            <p className="text-light-100">
              {type === "sign-in"
                ? "Don't have an account?"
                : "Already have an account?"}
            </p>
            <Link
              href={type === "sign-in" ? "/sign-up" : "/sign-in"}
              className="ml-1 font-medium text-blue"
            >
              {" "}
              {type === "sign-in" ? "Sign Up" : "Sign In"}
            </Link>
          </div>
        </form>
      </Form>
    </>
  );
};

export default AuthForm;
