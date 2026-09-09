import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "PawBall Chronicles",
  description: "Every Cat Has A Legend.",
  manifest: "/manifest.json",
  applicationName: "PawBall Chronicles",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "PawBall" },
};

export const viewport: Viewport = {
  themeColor: "#0d0a1a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
