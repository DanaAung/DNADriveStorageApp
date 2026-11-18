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
import { forwardRef, useEffect, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createAccount, signInUser } from "@/lib/actions/user.actions";

type FormType = "sign-in" | "sign-up";

const authFormSchema = (formType: FormType) => {
  return z
    .object({
      email: z.string().email(),
      // Supabase's default minimum password length is 6.
      password:
        formType === "sign-up"
          ? z.string().min(6, "Password must be at least 6 characters").max(72)
          : z.string().min(1, "Password is required"),
      confirmPassword:
        formType === "sign-up"
          ? z.string().min(1, "Please confirm your password")
          : z.string().optional(),
      fullName:
        formType === "sign-up"
          ? z.string().min(2).max(50)
          : z.string().optional(),
    })
    .refine(
      (values) =>
        formType !== "sign-up" || values.password === values.confirmPassword,
      { message: "Passwords do not match", path: ["confirmPassword"] },
    );
};

// Password input with a show/hide toggle. The toggle is a plain button (type="button")
// so it never submits the form.
const PasswordInput = forwardRef<
  HTMLInputElement,
  ComponentProps<typeof Input>
>(({ className, ...props }, ref) => {
  const [visible, setVisible] = useState(false);

  // Re-hide the password when the page is hidden (see AuthForm's reset effect).
  useEffect(() => () => setVisible(false), []);
  // Icon shows the current state: open eye = visible, closed eye = hidden.
  const Icon = visible ? Eye : EyeOff;

  return (
    <div className="flex items-center gap-2">
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        className={className}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="shrink-0 text-light-200 transition-colors hover:text-blue"
      >
        <Icon className="size-5" />
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

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
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(
    callbackError ? (callbackErrors[callbackError] ?? "Sign-in failed.") : "",
  );
  // Only when Supabase's "Confirm email" is on: sign-up succeeded but there is no
  // session until the emailed link is opened. When set, the form shows a notice.
  const [sentTo, setSentTo] = useState<string | null>(null);

  const formSchema = authFormSchema(type);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  // With cacheComponents, Next.js keeps a page you navigate away from mounted but
  // hidden (React <Activity>) and shows it again with its old state, so after signing
  // in and later logging out, /sign-in would come back with the password filled in and
  // the button still loading. Effects are cleaned up when the page is hidden, so start
  // fresh there.
  useEffect(() => {
    const { reset } = form;
    return () => {
      reset();
      setIsLoading(false);
      setErrorMessage("");
      setSentTo(null);
    };
  }, [form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const result =
        type === "sign-up"
          ? await createAccount({
              fullName: values.fullName || "",
              email: values.email,
              password: values.password,
            })
          : await signInUser({
              email: values.email,
              password: values.password,
            });

      if (result.error) {
        setErrorMessage(result.error);
      } else if (!result.hasSession) {
        setSentTo(result.email);
      } else {
        // Session cookies are set; go straight to the dashboard
        // (the loader keeps spinning while navigating).
        router.replace("/");
        router.refresh();
        return;
      }
    } catch {
      setErrorMessage(
        type === "sign-up"
          ? "Failed to create account. Please try again."
          : "Failed to sign in. Please try again.",
      );
    }
    setIsLoading(false);
  };

  if (sentTo) {
    return (
      <div className="auth-form">
        <h1 className="form-title">Check your email</h1>
        <p className="body-2 text-light-100">
          Check your email for a confirmation link. We sent it to{" "}
          <span className="font-medium text-blue">{sentTo}</span>. Open it in
          this browser to finish signing up.
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

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="shad-form-item">
                  <FormLabel className="shad-form-label">Password</FormLabel>

                  <FormControl>
                    <PasswordInput
                      placeholder="Enter your password"
                      autoComplete={
                        type === "sign-up" ? "new-password" : "current-password"
                      }
                      className="shad-input"
                      {...field}
                    />
                  </FormControl>
                </div>

                <FormMessage className="shad-form-message" />
              </FormItem>
            )}
          />

          {type === "sign-up" && (
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <div className="shad-form-item">
                    <FormLabel className="shad-form-label">
                      Confirm Password
                    </FormLabel>

                    <FormControl>
                      <PasswordInput
                        placeholder="Re-enter your password"
                        autoComplete="new-password"
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
