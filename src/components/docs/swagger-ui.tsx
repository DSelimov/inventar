"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    SwaggerUIBundle?: ((config: Record<string, unknown>) => unknown) & { presets: { apis: unknown }; SwaggerUIStandalonePreset?: unknown };
  }
}

const VERSION = "5.17.14";
const JS = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${VERSION}/swagger-ui-bundle.js`;
const CSS = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${VERSION}/swagger-ui.css`;

export function SwaggerUi({ specUrl }: { specUrl: string }) {
  const started = useRef(false);

  const init = () => {
    if (started.current || !window.SwaggerUIBundle) return;
    started.current = true;
    window.SwaggerUIBundle({
      url: specUrl,
      dom_id: "#swagger-ui",
      presets: [window.SwaggerUIBundle.presets.apis],
      layout: "BaseLayout",
      docExpansion: "list",
      defaultModelsExpandDepth: 1,
      displayRequestDuration: true,
      persistAuthorization: true,
      tryItOutEnabled: true,
      filter: true,
    });
  };

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <link rel="stylesheet" href={CSS} />
      <style>{`
        #swagger-ui .topbar { display: none; }
        #swagger-ui .swagger-ui .info { margin: 24px 0; }
        #swagger-ui .swagger-ui, #swagger-ui .swagger-ui .opblock .opblock-summary-description { font-family: var(--font-sans); }
        #swagger-ui .swagger-ui .scheme-container { box-shadow: none; background: transparent; padding: 0 0 12px; }
      `}</style>
      <div id="swagger-ui" className="min-h-[70vh]" />
      <Script src={JS} strategy="afterInteractive" onLoad={init} onReady={init} />
    </>
  );
}
