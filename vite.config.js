import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Se actualiza sola: cada deploy nuevo reemplaza la versión cacheada
      // sin que el vendedor tenga que reinstalar nada.
      registerType: "autoUpdate",
      includeAssets: ["logo.png", "apple-touch-icon-v2.png"],
      manifest: {
        name: "NINIT Group · CRM",
        short_name: "NINIT",
        description: "CRM de NINIT Group",
        lang: "es",
        start_url: "/",
        scope: "/",
        display: "standalone",     // pantalla completa, sin barra del navegador
        background_color: "#F5F6F8",
        theme_color: "#3a8dc2",
        icons: [
          { src: "/pwa-192-v2.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512-v2.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-maskable-512-v2.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Solo se cachea la "cáscara" (JS/CSS/HTML del build) para que abra
        // rápido y offline. Los datos SIEMPRE se piden en vivo a Supabase:
        // no agregamos runtimeCaching de la API, así el CRM nunca muestra datos viejos.
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
});
