import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Service worker propio (src/sw.js) para poder recibir PUSH del servidor
      // y mostrar notificaciones con la app cerrada. Vite inyecta el manifiesto
      // de precache dentro de ese archivo.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      // Se actualiza sola: cada deploy nuevo reemplaza la versión cacheada
      // sin que el vendedor tenga que reinstalar nada.
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["logo.png", "apple-touch-icon-v2.png"],
      injectManifest: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Las cotizaciones no son parte del CRM: son páginas sueltas que se le
        // mandan a un cliente. Sin esto, el service worker las precacheaba en
        // el dispositivo de cada vendedor.
        globIgnores: ["**/cotizacion/**"],
      },
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
    }),
  ],
});
