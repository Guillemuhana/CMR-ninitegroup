// Calificación automática del lead que entra desde la landing pública.
//
// Vive en una carpeta con "_", así que no gasta ninguna de las 12 funciones
// del plan Hobby (ver AGENTS.md). Lo llama api/_web/lead.js.
//
// QUÉ RESUELVE
// El asistente de la landing conversa cinco o diez turnos antes de que el
// visitante deje sus datos. Hasta ahora esa conversación entraba al CRM como
// un volcado de texto: el vendedor abría el chat en el celular y tenía que
// leerla entera para saber si convenía llamar ya o podía esperar al lunes.
// Esto la lee por él y le deja arriba de todo una línea: qué tan caliente
// está, de dónde es, qué unidad mira, para cuándo y qué lo frena.
//
// REGLA QUE NO SE NEGOCIA
// Esto NUNCA puede hacer fallar la carga del lead. Si Groq está caído, sin
// cuota o simplemente tarda, se devuelve null y el lead entra exactamente
// como entraba antes. Un lead sin calificar es una molestia; un lead perdido
// no se recupera. Por eso hay tope de tiempo propio y de acá no sale ningún
// throw — el mismo criterio que ya tiene el aviso por mail.

import { vaOtroModelo } from "../_groq.js";
import { intentosIA, adaptarCuerpo } from "../_ia.js";
import { FICHA_BUSINESS } from "../_ntg.js";

// Tope de tiempo total. Del otro lado hay una persona mirando el spinner del
// formulario: si la calificación no llegó en esto, se abandona y listo.
const LIMITE_MS = 7000;

const TEMPERATURAS = ["caliente", "tibio", "frio"];
const ICONO = { caliente: "🔥", tibio: "🌤️", frio: "❄️" };

const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

function prompt() {
  return `Sos el analista comercial de NINI T-GROUP (NTG). Te paso una consulta que acaba de entrar por la landing pública de paquetes de negocio, con la conversación que el visitante tuvo con el asistente de la página. Tu trabajo es calificarla para el vendedor que la va a atender.

${FICHA_BUSINESS}

CÓMO PUNTUAR (score de 0 a 100)
Suman:
· Pide precio, cotización, números concretos o "cómo empiezo" — es lo que más suma.
· Dice para cuándo: ya, este mes, esta temporada.
· Nombra su zona, ciudad o estado, o habla de SU mercado (bodas, obras, festivales de su área).
· Tiene resuelto o encarado el dinero: efectivo, financiación, ya habló con un banco.
· Sabe qué unidad quiere, o compara dos.
· Ya tiene un negocio andando al que esto se le suma (eventos, catering, obra, alquiler de equipos).
Restan:
· Pregunta suelta y vaga, curiosidad, "solo estaba mirando".
· Quiere UNA unidad para uso propio y no para alquilar: se atiende igual, pero no es este negocio.
· Busca trabajo, quiere vendernos algo, es de la competencia, o es claramente un estudiante o un chiste.
· No dejó nada más que el nombre y el teléfono, sin una sola señal de intención.

Referencia: 80-100 llama hoy mismo · 55-79 llama esta semana · 30-54 mandale material y seguí · 0-29 casi seguro no es negocio.

REGLAS
· Escribí TODO en castellano rioplatense, corto y directo: lo lee un vendedor apurado desde el celular.
· No inventes NADA. Si el visitante no dijo la zona, el campo va vacío. Un dato inventado hace que el vendedor abra la llamada con un error.
· El "resumen" es UNA línea de 140 caracteres como mucho, la que el vendedor lee antes de decidir si llama. Nada de "el cliente manifiesta interés en": decí qué quiere.
· "siguiente_paso" es una acción concreta para el vendedor, no un consejo genérico.
· "alerta" sólo si hay algo raro que convenga avisar (parece competencia, parece spam, busca trabajo, el teléfono no cierra con la zona que dijo). Si no hay nada raro, va vacío.

Devolvé SOLO un objeto JSON con EXACTAMENTE estas claves, sin markdown y sin texto alrededor:
{
  "score": 0,
  "temperatura": "caliente" | "tibio" | "frio",
  "resumen": "",
  "zona": "",
  "unidad": "",
  "paquete": "",
  "plazo": "",
  "presupuesto": "",
  "objecion": "",
  "siguiente_paso": "",
  "alerta": ""
}`;
}

function normalizar(p) {
  const txt = (v, max = 160) => String(v == null ? "" : v).trim().replace(/\s+/g, " ").slice(0, max);

  let score = Math.round(Number(p?.score));
  if (!isFinite(score)) score = 0;
  score = Math.max(0, Math.min(100, score));

  // Si el modelo se inventa una temperatura, la deducimos del score: que las
  // dos cosas se contradigan en la cara del vendedor es peor que perder el
  // matiz que quiso poner el modelo.
  let temperatura = sinTildes(txt(p?.temperatura, 20)).toLowerCase();
  if (!TEMPERATURAS.includes(temperatura)) {
    temperatura = score >= 70 ? "caliente" : score >= 40 ? "tibio" : "frio";
  }

  return {
    score,
    temperatura,
    resumen: txt(p?.resumen, 200),
    zona: txt(p?.zona, 80),
    unidad: txt(p?.unidad, 60),
    paquete: txt(p?.paquete, 60),
    plazo: txt(p?.plazo, 60),
    presupuesto: txt(p?.presupuesto, 80),
    objecion: txt(p?.objecion, 160),
    siguiente_paso: txt(p?.siguiente_paso, 200),
    alerta: txt(p?.alerta, 160),
  };
}

/** Lo que se le manda al modelo: los datos del formulario y la conversación. */
function entrada({ datos, transcript, contexto }) {
  const partes = [];
  const dato = (k, v) => {
    const s = String(v || "").trim();
    if (s) partes.push(`${k}: ${s.slice(0, 300)}`);
  };
  dato("Nombre", datos?.nombre);
  dato("Teléfono", datos?.telefono);
  dato("Email", datos?.email);
  dato("Código postal que dejó", datos?.zip);
  dato("Paquete que eligió en el formulario", datos?.paquete);
  dato("Perfil que eligió en el formulario", datos?.perfil);
  dato("Por dónde entró", datos?.origen);

  if (String(contexto || "").trim()) {
    partes.push("", "Qué estuvo mirando en la página (señales de navegación, no se lo dijo a nadie):", String(contexto).slice(0, 700));
  }
  if (String(datos?.escenario || "").trim()) {
    partes.push("", "Números que armó en la calculadora de la página:", String(datos.escenario).slice(0, 900));
  }
  if (String(transcript || "").trim()) {
    partes.push("", "Lo que escribió / la conversación con el asistente:", String(transcript).slice(0, 6000));
  }
  return partes.join("\n");
}

/**
 * Califica el lead. Devuelve el objeto normalizado o null si no se pudo.
 * NUNCA lanza: quien llama no tiene que envolverlo en try/catch para estar
 * seguro de que el lead se guarda igual.
 */
export async function calificarLead({ datos, transcript, contexto }) {
  // No es público: esto sólo corre cuando alguien deja sus datos de verdad,
  // así que acá OpenAI entra sin el reparo de OPENAI_EN_CHAT.
  const intentos = intentosIA();
  if (!intentos.length) return null;

  // Sin conversación, sin mensaje escrito y sin calculadora no hay nada que
  // leer: el modelo sólo podría repetir los campos del formulario, y eso el
  // vendedor ya lo ve. Nos ahorramos la llamada y la plata.
  const hayMaterial = String(transcript || "").trim() || String(datos?.escenario || "").trim();
  if (!hayMaterial) return null;

  const contenido = entrada({ datos, transcript, contexto });
  const vence = Date.now() + LIMITE_MS;

  // Un error que no se arregla reintentando —clave mal, cuenta sin crédito,
  // modelo dado de baja— quema a ESE proveedor, no a la fila entera: si
  // OpenAI rebota, Groq todavía tiene que poder contestar.
  const quemados = new Set();

  for (const { proveedor, url, apiKey, model } of intentos) {
    if (quemados.has(proveedor)) continue;
    const queda = vence - Date.now();
    if (queda < 1200) break;   // no alcanza ni para el ida y vuelta

    const abortar = new AbortController();
    const reloj = setTimeout(() => abortar.abort(), queda);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: abortar.signal,
        body: JSON.stringify(adaptarCuerpo(proveedor, {
          model,
          temperature: 0.3,
          max_tokens: 700,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: prompt() },
            { role: "user", content: contenido },
          ],
        })),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        let parsed = {};
        try { parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}"); }
        catch { parsed = {}; }
        const cal = normalizar(parsed);
        // Un JSON vacío o roto da score 0 y resumen vacío: eso no le sirve a
        // nadie y ensucia el mensaje. Preferimos no calificar.
        return cal.resumen ? cal : null;
      }
      const msg = data?.error?.message || `${proveedor} devolvió ${r.status}`;
      if (!vaOtroModelo(r.status, msg)) quemados.add(proveedor);
    } catch (e) {
      // Se acabó el tiempo: el lead sigue su camino sin calificación.
      if (e?.name === "AbortError") break;
      // Cualquier otra falla de red la paga ese proveedor, no la fila.
      quemados.add(proveedor);
    } finally {
      clearTimeout(reloj);
    }
  }
  return null;
}

/**
 * Las líneas que ve el vendedor arriba del mensaje en el CRM.
 * Va primero a propósito: es lo único que se lee en la previsualización de la
 * lista de chats y en la notificación push.
 */
export function bloqueCRM(cal) {
  if (!cal) return [];
  const etiqueta = cal.temperatura === "caliente" ? "Lead caliente"
    : cal.temperatura === "tibio" ? "Lead tibio" : "Lead frío";

  const lineas = [`${ICONO[cal.temperatura]} ${etiqueta} · ${cal.score}/100`];
  if (cal.resumen) lineas.push(cal.resumen);

  const fila = [
    cal.zona && `📍 ${cal.zona}`,
    cal.unidad && `🚚 ${cal.unidad}`,
    cal.paquete && `📦 ${cal.paquete}`,
    cal.plazo && `🗓️ ${cal.plazo}`,
    cal.presupuesto && `💵 ${cal.presupuesto}`,
  ].filter(Boolean);
  if (fila.length) lineas.push(fila.join("  ·  "));

  if (cal.objecion) lineas.push(`⚠️ Lo frena: ${cal.objecion}`);
  if (cal.siguiente_paso) lineas.push(`👉 Siguiente paso: ${cal.siguiente_paso}`);
  if (cal.alerta) lineas.push(`🚩 ${cal.alerta}`);

  lineas.push("— — —");
  return lineas;
}

export const _test = { normalizar, entrada, ICONO };
