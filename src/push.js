// Activación de notificaciones PUSH (funcionan con la app cerrada).
// El front pide permiso, se suscribe con el PushManager del service worker,
// y guarda la suscripción en Supabase (vía /api/push-subscribe) para que el
// servidor pueda avisarle cuando entra un mensaje del cliente.

import { supabase } from "./lib";

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// La applicationServerKey debe ir como Uint8Array, no como string base64url.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSoportado() {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC
  );
}

// Intenta activar el push. Debe llamarse idealmente desde un gesto del usuario
// (iOS exige gesto para pedir permiso). Devuelve true si quedó suscripto.
export async function activarPush(perfil, rol) {
  try {
    if (!pushSoportado()) return false;

    if (Notification.permission === "denied") return false;
    if (Notification.permission === "default") {
      const p = await Notification.requestPermission();
      if (p !== "granted") return false;
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
    }

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/push-subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token || ""}`,
      },
      body: JSON.stringify({
        subscription: sub,
        vendedor: perfil?.nombre || null,
        rol: rol || "vendedor",
        user_id: perfil?.id || session?.user?.id || null,
      }),
    });
    return res.ok;
  } catch (e) {
    console.warn("[push] no se pudo activar:", e?.message || e);
    return false;
  }
}
