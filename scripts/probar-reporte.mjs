// Prueba local del reporte diario: calcula las métricas contra la base real y
// escribe el PDF en disco. No manda mail.
//
//   node scripts/probar-reporte.mjs            → reporte de hoy
//   node scripts/probar-reporte.mjs 2026-07-27 → reporte de otro día
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { calcularMetricas } from "../api/_reporte/metricas.js";
import { resumenEjecutivo } from "../api/_reporte/ia.js";
import { generarPDF } from "../api/_reporte/pdf.js";
import { fechaLocal, TZ } from "../api/_reporte/dia.js";

for (const archivo of [".env", ".env.local"]) {
  if (!fs.existsSync(archivo)) continue;
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const db = createClient(url, key, { auth: { persistSession: false } });

const fecha = process.argv[2] || fechaLocal(new Date(), TZ);
console.log("Zona:", TZ, "| Fecha del reporte:", fecha);

const t0 = Date.now();
const metricas = await calcularMetricas(db, fecha, TZ);
console.log("Métricas OK en", Date.now() - t0, "ms");
console.log(JSON.stringify(metricas.kpis, null, 2));
console.log("Vendedores:", metricas.porVendedor.map((v) => `${v.vendedor}(ef ${v.efectividad}, ${v.mensajes} msj)`).join(", ") || "ninguno");
console.log("Conversaciones:", metricas.conversaciones.length, "| Sin responder:", metricas.pendientes.sinResponder.length);

const resumen = await resumenEjecutivo(metricas);
console.log("IA:", resumen.generadoPorIA ? "sí" : "fallback");
console.log("Resumen:", resumen.resumen);

const pdf = generarPDF(metricas, resumen);
const salida = path.join(process.env.TEMP || ".", `NINIT-reporte-${fecha}.pdf`);
fs.writeFileSync(salida, pdf);
console.log("PDF:", salida, `(${Math.round(pdf.length / 1024)} KB)`);
