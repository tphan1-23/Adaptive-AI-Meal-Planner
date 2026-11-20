"use client";

import { createSupabaseBrowser } from "@/lib/supabase-browser";

export default function SignOutButton() {
  return (
    <button
      type="button"
      className="text-[13px] font-semibold text-brand"
      onClick={async () => {
        await createSupabaseBrowser().auth.signOut();
        window.location.assign("/login");
      }}
    >
      Sign out
    </button>
  );
}
