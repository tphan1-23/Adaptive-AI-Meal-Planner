"use client";

// Shared building blocks styled after the mockup (red primary, black selected states, pill buttons).
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Button({
  variant = "primary",
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost"; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cx(
        "flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[15px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-brand text-white hover:bg-brand-dark",
        variant === "outline" && "border-[1.5px] border-ink bg-white text-ink hover:bg-surface",
        variant === "ghost" && "text-brand hover:underline",
        className,
      )}
    >
      {loading ? <Spinner light={variant === "primary"} /> : children}
    </button>
  );
}

export function Spinner({ light }: { light?: boolean }) {
  return (
    <span
      aria-label="Loading"
      className={cx(
        "inline-block h-5 w-5 animate-spin rounded-full border-2",
        light ? "border-white/40 border-t-white" : "border-line border-t-brand",
      )}
    />
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-[13px] font-semibold text-ink">
      {children}
    </label>
  );
}

export function Input({ suffix, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { suffix?: ReactNode }) {
  return (
    <div
      className={cx(
        "flex h-12 items-center rounded-lg border border-line px-3 focus-within:border-ink",
        className,
      )}
    >
      <input {...props} className="h-full w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-ink-muted" />
      {suffix ? <span className="ml-2 shrink-0 text-[13px] text-ink-muted">{suffix}</span> : null}
    </div>
  );
}

/** Black-selected segmented control: Male/Female, Gentle/Steady/Faster, kg/lb. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-line" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex-1 font-medium transition",
            size === "sm" ? "px-3 py-1.5 text-[12px]" : "py-3 text-[14px]",
            o.value === value ? "bg-ink text-white" : "bg-white text-ink hover:bg-surface",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Toggleable pill. "dark" = black when on (choices), "danger" = red outline when on (allergies). */
export function Chip({
  label,
  selected,
  onClick,
  variant = "dark",
}: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  variant?: "dark" | "danger";
}) {
  return (
    <button
      type="button"
      aria-pressed={!!selected}
      onClick={onClick}
      className={cx(
        "rounded-full border px-3.5 py-2 text-[13px] transition",
        !selected && "border-line bg-white text-ink hover:border-ink",
        selected && variant === "dark" && "border-ink bg-ink text-white",
        selected && variant === "danger" && "border-brand bg-brand-soft text-brand",
      )}
    >
      {label}
    </button>
  );
}

/** Back arrow + red step bars at the top of onboarding. */
export function StepBar({ step, total, onBack }: { step: number; total: number; onBack?: () => void }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className={cx("-ml-1 px-1 text-3xl leading-none", !onBack && "invisible")}
      >
        ‹
      </button>
      <div className="flex flex-1 gap-2">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className={cx("h-[3px] flex-1 rounded", i < step ? "bg-brand" : "bg-line")} />
        ))}
      </div>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-3 text-[13px] text-brand">
      {children}
    </p>
  );
}

/** Bottom tab bar for the signed-in app (Today / Shopping / Progress). */
export function BottomNav() {
  const path = usePathname();
  const tabs = [
    { href: "/today", label: "Today", icon: <TodayIcon /> },
    { href: "/shopping-list", label: "Shopping", icon: <BagIcon /> },
    { href: "/dashboard", label: "Progress", icon: <TrendIcon /> },
  ];
  return (
    <nav className="sticky bottom-0 z-10 mt-auto grid grid-cols-3 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
      {tabs.map((t) => {
        const active = path === t.href || path.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cx("flex flex-col items-center gap-0.5 py-2.5 text-[11px]", active ? "text-brand" : "text-ink-muted")}
          >
            {t.icon}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

// Outline icons for the tab bar. They use currentColor, so they turn red when the tab is active.
const iconProps = {
  width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
};
function TodayIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}
function BagIcon() {
  return (
    <svg {...iconProps}>
      {/* bag body, slightly wider at the bottom */}
      <path d="M6 8h12l2 13H4L6 8z" />
      {/* handle with a dot where each end meets the bag */}
      <path d="M9 10.5V6a3 3 0 0 1 6 0v4.5" />
      <circle cx="9" cy="10.5" r="0.7" fill="currentColor" />
      <circle cx="15" cy="10.5" r="0.7" fill="currentColor" />
    </svg>
  );
}
function TrendIcon() {
  return (
    <svg {...iconProps}>
      {/* zig-zag line rising to the top-right corner */}
      <path d="M3 18l6.5-6.5 3 3L21 6" />
      {/* arrow head: a right angle in the corner */}
      <path d="M14 6h7v7" />
    </svg>
  );
}

export { cx };
