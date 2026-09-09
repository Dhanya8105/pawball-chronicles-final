import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { QueryProvider } from "@/lib/providers/QueryProvider";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "PawBall Chronicles",
  description: "Every Cat Has A Legend.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#14101c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
