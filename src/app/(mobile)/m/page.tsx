import type { Metadata, Viewport } from "next";
import { MobileScanLoader } from "@/components/mobile/mobile-scan-loader";
import { requireContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Сканиране", manifest: "/manifest.webmanifest", appleWebApp: { capable: true, title: "Инвентар", statusBarStyle: "default" } };
export const viewport: Viewport = { themeColor: "#4f46e5", width: "device-width", initialScale: 1, maximumScale: 1 };

/** Мобилен режим за склада (инсталира се като приложение): приход, разход и броене със скенер, и без връзка. */
export default async function MobilePage() {
  const ctx = await requireContext("write");
  return <MobileScanLoader orgName={ctx.org.name} />;
}
