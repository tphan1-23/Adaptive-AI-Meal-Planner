"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { Button, ErrorText, Input, Label } from "@/components/ui";

/**
 * Where the "forgot password" email lands. Supabase puts a short-lived recovery session in the link, the browser
 * client picks it up, and the user chooses a new password. Public page (no login needed to open it).
 */
export default function ResetPasswordPage() {
  const [ready, setReady] = useState<"checking" | "yes" | "no">("checking");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) setReady("yes");
    });
    // The link may already have been processed before this page mounted.
    supabase.auth.getSession().then(({ data: s }) => setReady((r) => (s.session ? "yes" : r === "checking" ? "no" : r)));
    const t = setTimeout(() => setReady((r) => (r === "checking" ? "no" : r)), 4000);
    return () => {
      data.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  const problem = password.length < 6 ? "The password needs at least 6 characters." : password !== again ? "The passwords don't match." : null;

  async function save() {
    if (problem) return;
    setBusy(true);
    setError(null);
    const { error } = await createSupabaseBrowser().auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    setDone(true);
  }

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-12">
      <h1 className="mb-2 text-[26px] font-bold leading-tight">Choose a new password</h1>
      {done ? (
        <>
          <p className="mb-6 text-[15px] leading-relaxed text-ink-muted">Your password was changed.</p>
          <Button onClick={() => window.location.assign("/today")}>Continue</Button>
        </>
      ) : ready === "checking" ? (
        <p className="text-[15px] text-ink-muted">Checking your reset link…</p>
      ) : ready === "no" ? (
        <>
          <p className="mb-6 text-[15px] leading-relaxed text-ink-muted">This reset link is missing or has expired. Ask for a new one from the sign-in page (&quot;Forgot password?&quot;).</p>
          <Button variant="outline" onClick={() => window.location.assign("/login")}>Back to sign in</Button>
        </>
      ) : (
        <>
          <p className="mb-6 text-[15px] leading-relaxed text-ink-muted">Pick something you haven&apos;t used before.</p>
          <div><Label htmlFor="np">New password</Label><Input id="np" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div className="mt-4"><Label htmlFor="np2">Repeat new password</Label><Input id="np2" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></div>
          {password && problem ? <ErrorText>{problem}</ErrorText> : null}
          <ErrorText>{error}</ErrorText>
          <div className="mt-auto pt-8"><Button loading={busy} disabled={!!problem} onClick={save}>Save new password</Button></div>
        </>
      )}
    </main>
  );
}
