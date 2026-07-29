// Reporte diario del CRM para el CEO.
//
// Todos los días a las 21:00 (hora de Miami) Vercel Cron llama a este endpoint:
// se calculan las métricas del día, el asistente de IA escribe el resumen
// ejecutivo, se arma un PDF y se envía por email a ninitgroup@gmail.com.
//
// Formas de invocarlo:
//   GET  /api/reporte-diario                  → cron de Vercel (Bearer CRON_SECRET)
//   POST /api/reporte-diario                  → manual desde el CRM (sesión del CEO)
//   GET  /api/reporte-diario?preview=1        → devuelve el PDF sin enviar mail
//   ...&fecha=2026-07-27                      → reporte de otro día
//   ...&forzar=1                              → ignora la hora y el "ya enviado"
//
// Variables de entorno (Vercel):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   lectura de datos sin RLS
//   GMAIL_USER, GMAIL_APP_PASSWORD            envío del mail (ver _reporte/mail.js)
//   REPORTE_EMAIL_TO                          destinatario (default ninitgroup@gmail.com)
//   GROQ_API_KEY                              resumen ejecutivo con IA (opcional)
//   CRON_SECRET                               protege el disparo automático
//   REPORTE_TZ                                zona horaria (default America/New_York)
//   REPORTE_HORA                              hora local de envío (default 21)

import { createClient } from "@supabase/supabase-js";
import { calcularMetricas } from "./_reporte/metricas.js";
import { resumenEjecutivo } from "./_reporte/ia.js";
import { generarPDF } from "./_reporte/pdf.js";
import { enviarReporte } from "./_reporte/mail.js";
import { fechaLocal, horaLocal, TZ } from "./_reporte/dia.js";

export const config = { maxDuration: 60 };

const CEO_EMAIL = "ninitgroup@gmail.com";
const HORA_ENVIO = Number(process.env.REPORTE_HORA ?? 21);

const bool = (v) => v === "1" || v === "true" || v === true;

/** El llamado viene del cron de Vercel (o de alguien con el CRON_SECRET). */
function esCron(req) {
  const secret = process.env.CRON_SECRET;
  const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (secret && auth === secret) return true;
  // Vercel marca sus invocaciones con este header; si no hay secreto configurado
  // alcanza para no dejar el endpoint abierto a cualquiera.
  return !secret && !!req.headers["x-vercel-cron"];
}

/** El llamado viene del CRM con la sesión de un CEO. */
async function esCeo(req, db) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return false;
  const email = (data.user.email || "").toLowerCase();
  if (email === CEO_EMAIL) return true;
  const { data: perfil } = await db.from("vendedores").select("role").eq("email", email).limit(1);
  return perfil?.[0]?.role === "ceo";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY." });
  }
  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Autorización ──────────────────────────────────────────────────────
  const desdeCron = esCron(req);
  if (!desdeCron && !(await esCeo(req, db))) {
    return res.status(401).json({ error: "No autorizado." });
  }

  const q = req.query || {};
  const forzar = bool(q.forzar);
  const preview = bool(q.preview);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(q.fecha || "") ? q.fecha : fechaLocal(new Date(), TZ);

  // ── Compuerta horaria del cron ────────────────────────────────────────
  // El cron corre en UTC y no ajusta por horario de verano, así que se
  // programa a las dos horas UTC posibles y acá se descarta la que no
  // corresponde a las 21:00 de Miami.
  if (desdeCron && !forzar) {
    const hora = horaLocal(new Date(), TZ);
    if (hora !== HORA_ENVIO) {
      return res.status(200).json({ ok: true, omitido: `Son las ${hora}h en ${TZ}, el reporte sale a las ${HORA_ENVIO}h.` });
    }
  }

  try {
    // ── Anti-duplicado: una sola entrega por día ────────────────────────
    // Si la tabla de log no existe todavía, el reporte se manda igual.
    let yaEnviado = false;
    if (!preview) {
      const { data: previo, error: errLog } = await db
        .from("reportes_diarios").select("id,enviado_at,estado").eq("fecha", fecha).limit(1);
      if (!errLog && previo?.[0]?.estado === "enviado") yaEnviado = true;
      if (yaEnviado && !forzar) {
        return res.status(200).json({
          ok: true, omitido: `El reporte del ${fecha} ya se envió (${previo[0].enviado_at}).`,
        });
      }
    }

    const metricas = await calcularMetricas(db, fecha, TZ);
    const resumenIA = await resumenEjecutivo(metricas);
    const pdf = generarPDF(metricas, resumenIA);

    if (preview) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="NINIT-reporte-diario-${fecha}.pdf"`);
      return res.status(200).send(pdf);
    }

    const envio = await enviarReporte({ metricas, resumenIA, pdf });

    // Log (best-effort: si falla no invalida un envío que ya salió).
    await db.from("reportes_diarios").upsert({
      fecha,
      estado: "enviado",
      enviado_at: new Date().toISOString(),
      destinatarios: envio.destinatarios.join(", "),
      resumen: resumenIA.resumen,
      metricas: metricas.kpis,
      generado_por_ia: resumenIA.generadoPorIA,
      error: null,
    }, { onConflict: "fecha" });

    return res.status(200).json({
      ok: true, fecha, destinatarios: envio.destinatarios,
      generadoPorIA: resumenIA.generadoPorIA, kpis: metricas.kpis,
    });
  } catch (e) {
    const msg = e?.message || "Error generando el reporte.";
    try {
      await db.from("reportes_diarios").upsert(
        { fecha, estado: "error", error: msg, enviado_at: new Date().toISOString() },
        { onConflict: "fecha" }
      );
    } catch { /* el log es best-effort: no tapa el error real */ }
    console.error("[reporte-diario]", msg);
    return res.status(500).json({ error: msg });
  }
}
