// Service Worker propio del CRM (estrategia injectManifest de vite-plugin-pwa).
// Hace 2 cosas:
//   1) Precachea la "cáscara" del build para que la PWA abra rápido/offline
//      (igual que antes). Los datos SIEMPRE se piden en vivo a Supabase.
//   2) Recibe PUSH del servidor y muestra la notificación aunque la app esté
//      CERRADA. En móvil las notificaciones DEBEN mostrarse desde el SW con
//      registration.showNotification() — por eso vive acá y no en React.

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

// Activarse enseguida en cada deploy (equivale al viejo registerType:autoUpdate)
self.skipWaiting();
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// Fallback de navegación al index cacheado (SPA offline)
try {
  registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));
} catch { /* sin index precacheado en dev */ }

// ── PUSH: llega un mensaje nuevo del cliente ──────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }

  const title = data.title || "💬 Nuevo mensaje";
  const body  = data.body  || "Tenés un mensaje nuevo de un cliente.";
  const tag   = data.tag   || "ninit-msg";
  const contactoId = data.contacto_id || null;

  event.waitUntil((async () => {
    // Si el vendedor está mirando la app en este momento (ventana enfocada),
    // no hace falta molestarlo: el CRM ya muestra el mensaje en vivo.
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (clients.some((c) => c.focused)) return;

    await self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      icon: "/pwa-192-v2.png",
      badge: "/pwa-192-v2.png",
      data: { contacto_id: contactoId, url: data.url || "/" },
      vibrate: [120, 60, 120],
    });
  })());
});

// ── Click en la notificación: abrir/enfocar el CRM en ese chat ────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const contactoId = event.notification.data?.contacto_id;
  const target = contactoId ? `/?chat=${contactoId}` : "/";

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Si ya hay una ventana del CRM abierta, enfocarla y mandarle el chat.
    for (const client of all) {
      if ("focus" in client) {
        await client.focus();
        client.postMessage({ type: "abrir-chat", contacto_id: contactoId });
        return;
      }
    }
    // Si no hay ninguna, abrir una nueva.
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
