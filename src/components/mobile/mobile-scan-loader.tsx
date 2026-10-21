"use client";

import dynamic from "next/dynamic";

/** Мобилният режим чете localStorage и navigator още при създаване — само в браузъра, без SSR. */
export const MobileScanLoader = dynamic(() => import("./mobile-scan").then((m) => m.MobileScan), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-sm text-muted">Зарежда се…</p>,
});
