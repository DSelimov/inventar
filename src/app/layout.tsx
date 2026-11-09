import { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "cyrillic"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "cyrillic"] });
/** Шрифтът на името „Складио“ в логото. */
const brand = Manrope({ variable: "--font-manrope", weight: ["800"], subsets: ["latin", "cyrillic"] });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Складио", template: "%s · Складио" },
  description: "Универсална система за инвентар",
  applicationName: "Складио",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg" className={`${geistSans.variable} ${geistMono.variable} ${brand.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <Suspense>
          <Toaster />
        </Suspense>
      </body>
    </html>
  );
}
