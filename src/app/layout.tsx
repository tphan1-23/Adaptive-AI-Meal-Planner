import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Adaptive AI Meal Planner",
  description: "Weekly meal plans sized to your calories, your rules and your kitchen.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {/* Phone-width column, centered on desktop, like the mockup. */}
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-white sm:border-x sm:border-line">
          {children}
        </div>
      </body>
    </html>
  );
}
