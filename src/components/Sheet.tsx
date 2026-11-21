"use client";

import { useEffect, type ReactNode } from "react";

/** Bottom sheet over a dimmed page (swap, log a meal). Closes on Escape or a tap outside. */
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex justify-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/45" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute bottom-0 w-full max-w-md rounded-t-[28px] bg-white px-5 pb-9 pt-2.5"
      >
        <div aria-hidden className="mx-auto mb-4 h-[5px] w-10 rounded-full bg-line" />
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[24px] font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface"
          >
            <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
