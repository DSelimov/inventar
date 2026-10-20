import { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "cyrillic"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "cyrillic"] });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Инвентар", template: "%s · Инвентар" },
  description: "Универсална система за инвентар",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <Suspense>
          <Toaster />
        </Suspense>
      </body>
    </html>
  );
}
