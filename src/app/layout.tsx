import type { Metadata, Viewport } from "next";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Weekly meal plans sized to your calories, your rules and your kitchen.",
  applicationName: APP_NAME,
  // "Add to Home Screen" on iPhone: opens without Safari's address bar and toolbar.
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  other: { "mobile-web-app-capable": "yes", "apple-mobile-web-app-tagline": APP_TAGLINE },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Stops the page zooming when a field is tapped or the screen is double-tapped, like an app.
  maximumScale: 1,
  // Lets the page use the whole screen; the bottom bar adds the home-indicator space itself.
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-[100dvh]">
        {/* Phone-width column, centered on desktop, like the mockup. */}
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bg-white sm:border-x sm:border-line">
          {children}
        </div>
      </body>
    </html>
  );
}
