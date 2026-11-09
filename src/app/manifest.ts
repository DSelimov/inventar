import type { MetadataRoute } from "next";

/** PWA: мобилният режим /m се инсталира на телефона като приложение. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Складио",
    short_name: "Складио",
    description: "Приход, разход и инвентаризация със скенер, и без връзка.",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#2f6fab",
    lang: "bg",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
