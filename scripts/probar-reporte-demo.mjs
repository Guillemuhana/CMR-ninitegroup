// Reporte diario con datos DE PRUEBA (no toca la base).
// Sirve para revisar el diseño del PDF sin depender de Supabase.
//
//   node scripts/probar-reporte-demo.mjs
import fs from "node:fs";
import path from "node:path";
import { calcularMetricas } from "../api/_reporte/metricas.js";
import { resumenFallback, resumenEjecutivo } from "../api/_reporte/ia.js";
import { generarPDF } from "../api/_reporte/pdf.js";
import { armarMensaje } from "../api/_reporte/mail.js";
import { fechaLocal, inicioDelDia, sumarDias, TZ } from "../api/_reporte/dia.js";

const fecha = process.argv[2] || fechaLocal(new Date(), TZ);
const base = inicioDelDia(fecha, TZ).getTime();
const en = (dia, hora, min = 0) =>
  new Date(inicioDelDia(sumarDias(fecha, dia), TZ).getTime() + hora * 3600e3 + min * 60e3).toISOString();

const VEND = ["Nicolas", "Carla", "Martin", "Sofia"];
const NOMBRES = ["Jessica Turner", "Mike Ramos", "Wedding Palms LLC", "Carlos Peralta", "Ana Wolf",
  "Sunset Events", "Brian Cole", "Laura Giménez", "Miami Prod Co", "Dave Kim", "Nora Aguirre", "Tom Sanders"];
const ESTADOS = ["nuevo", "contactado", "interesado", "cotizacion", "negociando", "vendido", "perdido"];

let idc = 0;
const contactos = NOMBRES.map((nombre, i) => ({
  id: `c${++idc}`,
  nombre,
  telefono: `+1305555${1000 + i}`,
  vendedor: VEND[i % VEND.length],
  estado: ESTADOS[i % ESTADOS.length],
  created_at: i < 4 ? en(0, 8 + i, 12) : en(-3 - i, 10),
  updated_at: i % 5 === 0 ? en(0, 17, 30) : en(-2, 12),
  bot_activo: i % 3 === 0,
  seguimiento_at: i % 4 === 0 ? en(-1, 15) : null,
  nota_seguimiento: i % 4 === 0 ? "Pasar cotización del trailer de 4 estaciones" : null,
  ultimo_in_at: en(0, 18), ultimo_out_at: en(0, 18, 20),
}));
contactos[2].vendedor = null; // lead sin asignar
contactos[7].vendedor = null;

const mensajes = [];
let idm = 0;
const push = (c, dia, hora, min, direccion, origen, agente, contenido) => mensajes.push({
  id: `m${++idm}`, contacto_id: c.id, direccion, origen, agente,
  contenido, created_at: en(dia, hora, min),
});

// Días previos (para la comparativa de 7 días)
for (let d = -7; d <= -1; d++) {
  const cant = 40 + Math.round(Math.sin(d) * 18) + (d % 3) * 7;
  for (let i = 0; i < cant; i++) {
    const c = contactos[i % contactos.length];
    const h = 8 + (i % 11);
    push(c, d, h, (i * 7) % 60, i % 2 ? "in" : "out", i % 3 ? "agente" : "bot", i % 3 ? VEND[i % VEND.length] : null, "mensaje previo");
  }
}

// Día del reporte
const guiones = [
  ["Hola! Necesito un trailer de baños para un casamiento el 15 de agosto en Coral Gables", "Hola Jessica! Gracias por escribir. Para 200 invitados te recomiendo el modelo Elite de 4 estaciones."],
  ["What's the price for a weekend rental?", "Hi Mike! The Elite trailer for the weekend is $1,850 including delivery and setup."],
  ["Me pasan fotos del interior?", "Te mando ahora las fotos del interior del Luxury 8."],
  ["Necesitamos 3 unidades para un evento corporativo", "Perfecto, con 3 unidades te puedo hacer un precio especial. Te paso la cotización hoy."],
];
let mm = 0;
contactos.forEach((c, i) => {
  const g = guiones[i % guiones.length];
  const h = 8 + (i % 12);
  push(c, 0, h, 5, "in", "cliente", null, g[0]);
  // Algunos quedan sin responder (para la sección de pendientes)
  if (i % 5 !== 3) {
    const esBot = i % 3 === 0;
    push(c, 0, h, esBot ? 5 : 5 + ((i * 9) % 55), "out", esBot ? "bot" : "agente", esBot ? null : (c.vendedor || VEND[0]), g[1]);
    if (i % 2 === 0) {
      push(c, 0, h + 1, 10, "in", "cliente", null, "Buenísimo, lo consulto y te confirmo");
      push(c, 0, h + 1, 10 + (i % 40), "out", "agente", c.vendedor || VEND[1], "Perfecto, quedo atento. Cualquier cosa me escribís.");
    }
  }
  mm++;
});

mensajes.sort((a, b) => a.created_at.localeCompare(b.created_at));

const pedidos = [
  { id: "p1", contacto_id: "c6", vendedor: "Nicolas", total: 2400, estado: "confirmado", created_at: en(0, 16, 5) },
  { id: "p2", contacto_id: "c1", vendedor: "Carla", total: 1850, estado: "pendiente", created_at: en(0, 17, 40) },
  { id: "p3", contacto_id: "c9", vendedor: "Nicolas", total: 5200, estado: "confirmado", created_at: en(-2, 12) },
];

const vendedores = VEND.map((n, i) => ({ id: `v${i}`, nombre: n, email: `${n.toLowerCase()}@ninitgroup.com`, role: i === 0 ? "vendedor" : "vendedor", activo: true }));
const sesiones = VEND.slice(0, 3).map((n, i) => ({ vendedor_id: `v${i}`, vendedor_nombre: n, duracion_seg: (5 - i) * 3600, inicio_sesion: en(0, 9) }));

// ── Cliente Supabase falso: devuelve las fixtures según la tabla ────────
const TABLAS = { mensajes, contactos, pedidos, vendedores, sesiones_vendedor: sesiones };
function fakeDb() {
  const mk = (tabla) => {
    const q = {
      select: () => q, gte: () => q, lt: () => q, lte: () => q, eq: () => q, limit: () => q,
      order: () => q, range: () => q,
      then: (res) => res({ data: TABLAS[tabla] || [], error: null }),
    };
    return q;
  };
  return { from: mk };
}

const metricas = await calcularMetricas(fakeDb(), fecha, TZ);
console.log(JSON.stringify(metricas.kpis, null, 2));
console.log("Vendedores:", metricas.porVendedor.map((v) => `${v.vendedor}: ef ${v.efectividad}, ${v.mensajes} msj, ${v.chats} chats, resp ${v.respuestaMedianaMin?.toFixed(0)}min, cob ${v.cobertura}`).join("\n  "));
console.log("Pendientes sin responder:", metricas.pendientes.sinResponder.length, "| seguimientos:", metricas.pendientes.seguimientos.length, "| leads:", metricas.pendientes.leadsSinAsignar.length);

const resumen = process.env.GROQ_API_KEY ? await resumenEjecutivo(metricas) : {
  ...resumenFallback(metricas),
  // Texto de muestra para ver cómo cae el bloque de IA en el PDF
  destacados: [
    "Carla respondió en 12 minutos promedio, el mejor tiempo del equipo.",
    "Entraron 4 clientes nuevos, 60% más que el promedio de la semana.",
    "Se cerraron 2 pedidos por US$ 4.250 en el día.",
  ],
  riesgos: [
    "3 conversaciones quedaron sin respuesta al cierre, dos de ellas de más de 4 horas.",
    "2 leads nuevos siguen sin vendedor asignado.",
  ],
  recomendaciones: [
    "Asignar los 2 leads sin vendedor antes de las 10 de la mañana.",
    "Responder los chats pendientes de Wedding Palms LLC y Dave Kim.",
    "Revisar los seguimientos vencidos de la semana con el equipo.",
  ],
};

const pdf = generarPDF(metricas, resumen);
const salida = path.join(process.env.TEMP || ".", `NINIT-reporte-demo-${fecha}.pdf`);
fs.writeFileSync(salida, pdf);
console.log("PDF:", salida, `(${Math.round(pdf.length / 1024)} KB)`);

// El cuerpo del mail, para revisarlo en el navegador sin mandar nada.
const mensaje = armarMensaje({ metricas, resumenIA: resumen, pdf, from: "ninitgroup@gmail.com" });
const salidaHtml = salida.replace(/\.pdf$/, ".html");
fs.writeFileSync(salidaHtml, mensaje.html, "utf8");
console.log("Asunto:", mensaje.subject);
console.log("Mail HTML:", salidaHtml);
