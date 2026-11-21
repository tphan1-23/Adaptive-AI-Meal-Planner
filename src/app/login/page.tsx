"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { APP_NAME } from "@/lib/brand";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { safeNextPath } from "@/server/auth/routes";
import { Button, ErrorText, Input, Label, Segmented } from "@/components/ui";

type Mode = "signin" | "signup";
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

// useSearchParams needs a Suspense boundary in Next 14.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const next = useSearchParams().get("next");
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canSubmit = isEmail(email) && password.length >= (mode === "signup" ? 6 : 1);

  /** After a session exists: new users go to onboarding, others to where they were going. */
  async function goOn() {
    let hasProfile = false;
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      hasProfile = res.ok && Boolean((await res.json())?.profile);
    } catch {
      // If the check fails, fall through to onboarding; it's safe to redo.
    }
    // Full page load so the middleware and server see the new login cookies.
    window.location.assign(hasProfile ? safeNextPath(next) : "/onboarding");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createSupabaseBrowser();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        await goOn();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/login` },
        });
        if (error) throw error;
        if (data.session) {
          await goOn();
        } else {
          // Supabase project requires email confirmation.
          setInfo(`Check ${email.trim()} for a confirmation link, then sign in here.`);
          setMode("signin");
          setLoading(false);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Try again.";
      setError(msg === "Invalid login credentials" ? "Wrong email or password." : msg);
      setLoading(false);
    }
  }

  async function forgot() {
    setError(null);
    setInfo(null);
    if (!isEmail(email)) return setError("Type your email above first.");
    // The email links to the set-new-password page. This address must be an allowed redirect URL in Supabase.
    const { error } = await createSupabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setError(error.message);
    else setInfo(`If ${email.trim()} has an account, a reset link is on its way.`);
  }

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-12">
      <form onSubmit={submit} className="flex flex-1 flex-col" noValidate>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt={APP_NAME} width={64} height={64} className="mb-5 h-16 w-16 rounded-[18px]" />
        <h1 className="mb-2 text-[26px] font-bold leading-tight">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mb-6 text-[15px] leading-relaxed text-ink-muted">
          {mode === "signin"
            ? "Sign in to see today’s plan."
            : "A plan that fits your calories, your rules and your kitchen."}
        </p>

        <Segmented<Mode>
          options={[
            { value: "signin", label: "Sign in" },
            { value: "signup", label: "Sign up" },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
            setInfo(null);
          }}
        />

        <div className="mt-6">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="mt-4">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type={showPw ? "text" : "password"}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            suffix={
              <button type="button" onClick={() => setShowPw((v) => !v)} className="font-semibold text-brand">
                {showPw ? "Hide" : "Show"}
              </button>
            }
          />
          {mode === "signin" ? (
            <div className="mt-2 text-right">
              <button type="button" onClick={forgot} className="text-[13px] font-semibold text-brand">
                Forgot password?
              </button>
            </div>
          ) : null}
        </div>

        <ErrorText>{error}</ErrorText>
        {info ? <p className="mt-3 text-[13px] text-green-700">{info}</p> : null}

        <div className="mt-auto pt-8">
          <Button type="submit" loading={loading} disabled={!canSubmit}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          <p className="mt-4 text-center text-[13px] text-ink-muted">
            {mode === "signin" ? "New here? " : "Already have an account? "}
            <button
              type="button"
              className="font-semibold text-brand"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </form>
    </main>
  );
}
