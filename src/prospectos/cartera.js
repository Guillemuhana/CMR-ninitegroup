// Cartera de clientes potenciales guardados (tabla prospectos_guardados).
// (Se llama cartera.js y no guardados.js porque en Windows chocaría con
// Guardados.jsx: el disco no distingue mayúsculas.)
//
// La crea supabase_prospectos_migration.sql. Mientras no se haya corrido en
// producción, todas las funciones devuelven `faltaTabla: true` y la pantalla
// avisa qué hacer, en vez de romperse.

import { supabase } from "../lib";

const TABLA = "prospectos_guardados";

export const ESTADOS = [
  { id: "nuevo",      etiqueta: "Nuevo",       color: "#475569", fondo: "#f1f5f9" },
  { id: "contactado", etiqueta: "Contactado",  color: "#1d4ed8", fondo: "#eff6ff" },
  { id: "respondio",  etiqueta: "Respondió",   color: "#7c3aed", fondo: "#f5f3ff" },
  { id: "interesado", etiqueta: "Interesado",  color: "#047857", fondo: "#ecfdf5" },
  { id: "descartado", etiqueta: "Descartado",  color: "#9f1239", fondo: "#fff1f2" },
];
export const estadoDe = (id) => ESTADOS.find((e) => e.id === id) || ESTADOS[0];

/** ¿El error es porque la tabla todavía no existe en Supabase? */
export function faltaTabla(error) {
  const msg = `${error?.code || ""} ${error?.message || ""}`;
  return /42P01|PGRST205|does not exist|Could not find the table/i.test(msg);
}

const resultado = (error, extra = {}) =>
  error ? { error: faltaTabla(error) ? null : error.message, faltaTabla: faltaTabla(error), ...extra } : { error: null, faltaTabla: false, ...extra };

const txt = (v, max = 4000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);

/** Fila de la tabla a partir de un resultado del buscador. */
export function filaDesde(r, { busqueda, zona, fuente, guardadoPor }) {
  const email = Array.isArray(r.email) ? r.email.filter(Boolean).join(", ") : r.email;
  return {
    place_id: r.place_id,
    nombre: txt(r.nombre, 200) || "Sin nombre",
    direccion: txt(r.direccion), ciudad: txt(r.ciudad), telefono: txt(r.telefono, 40), email: txt(email, 300),
    sitio_web: txt(r.sitio_web, 300), tipo_negocio: txt(r.tipo_negocio, 80), rubro: txt(r.rubro, 80), perfil: txt(r.perfil, 80),
    lead_score: Math.round(Math.max(0, Math.min(100, Number(r.lead_score) || 0))),
    prioridad: ["ALTA", "MEDIA", "BAJA"].includes(r.prioridad) ? r.prioridad : "MEDIA",
    productos_sugeridos: txt(r.productos_sugeridos), enfoque_venta: txt(r.enfoque_venta), motivo: txt(r.motivo),
    latitud: num(r.latitud), longitud: num(r.longitud), maps_url: txt(r.maps_url, 300),
    calificacion: num(r.calificacion), num_resenas: num(r.num_resenas),
    busqueda: txt(busqueda, 160), zona: txt(zona, 160), fuente: txt(fuente, 20), guardado_por: txt(guardadoPor, 200),
  };
}

export async function cargarGuardados() {
  const { data, error } = await supabase.from(TABLA).select("*").order("created_at", { ascending: false }).limit(2000);
  return resultado(error, { lista: data || [] });
}

/**
 * Guarda los negocios. Los que ya estaban guardados NO se pisan: conservan
 * su estado, nota y vendedor. Devuelve cuántos entraron nuevos.
 */
export async function guardarProspectos(lista, contexto) {
  const { data: { session } } = await supabase.auth.getSession();
  const filas = lista.filter((r) => r?.place_id).map((r) => filaDesde(r, { ...contexto, guardadoPor: session?.user?.email }));
  if (!filas.length) return resultado(null, { nuevos: [] });
  const { data, error } = await supabase.from(TABLA)
    .upsert(filas, { onConflict: "place_id", ignoreDuplicates: true })
    .select("*");
  return resultado(error, { nuevos: data || [] });
}

export async function actualizarGuardado(id, cambios) {
  const { data, error } = await supabase.from(TABLA).update(cambios).eq("id", id).select("*").single();
  return resultado(error, { fila: data });
}

export async function borrarGuardado(id) {
  const { error } = await supabase.from(TABLA).delete().eq("id", id);
  return resultado(error);
}

/** Anota un contacto: suma uno, guarda canal y fecha, y lo pasa a "contactado" si era nuevo. */
export function cambiosPorContacto(fila, canal) {
  return {
    contactos: (fila.contactos || 0) + 1,
    ultimo_canal: canal,
    ultimo_contacto_at: new Date().toISOString(),
    ...(fila.estado === "nuevo" ? { estado: "contactado" } : {}),
  };
}
