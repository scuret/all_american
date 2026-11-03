import type { Metadata, Viewport } from "next";
import "./globals.css";

const APP_URL = process.env.APP_URL ?? "https://all-american-stephencuret.vercel.app";
const DESCRIPTION = "Leagues, schedules, tournaments, and rink operations for All American Inline Hockey in St. Louis.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: "All American Inline Hockey", template: "%s · All American Inline Hockey" },
  description: DESCRIPTION,
  applicationName: "All American Inline Hockey",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "All American Inline Hockey",
    title: "All American Inline Hockey",
    description: DESCRIPTION,
    url: APP_URL,
    images: [
      { url: "/og.png", width: 1200, height: 630, alt: "All American Inline Hockey" },
      { url: "/og-square.png", width: 1200, height: 1200, alt: "All American Inline Hockey" },
    ],
  },
  twitter: { card: "summary_large_image", title: "All American Inline Hockey", description: DESCRIPTION, images: ["/og.png"] },
  appleWebApp: { capable: true, title: "All American", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#B00000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,600;0,700;0,800;1,400;1,700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
