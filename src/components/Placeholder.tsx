import SignOutButton from "./SignOutButton";
import { BottomNav } from "./ui";

/** Temporary page body until the real page is built. */
export default function Placeholder({ title, tabs = true }: { title: string; tabs?: boolean }) {
  return (
    <>
      <main className="flex-1 px-5 pt-10">
        <h1 className="mb-2 text-[28px] font-bold">{title}</h1>
        <p className="text-[15px] text-ink-muted">You’re signed in. This page is coming next.</p>
        <div className="mt-6"><SignOutButton /></div>
      </main>
      {tabs ? <BottomNav /> : null}
    </>
  );
}
