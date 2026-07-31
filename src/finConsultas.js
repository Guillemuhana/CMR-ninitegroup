// ============================================================
// CLIENTES QUE CONSULTARON POR FINANCIAMIENTO
// ============================================================
// Devuelve el conjunto de contacto_id que en algún momento tocaron el tema del
// financiamiento. Une dos fuentes, porque ninguna sola alcanza:
//
//   1. La tabla `financiamiento` — hay ficha cargada (interés, link enviado,
//      estado…). Es lo que el equipo registró a mano o detectó la IA.
//   2. Los `mensajes` — el cliente preguntó por financiación/crédito/cuotas en
//      el chat y nadie llegó a cargarle la ficha. Estos son justamente los que
//      se estaban perdiendo.
//
// Se carga una vez al abrir la lista de conversaciones y queda en memoria: el
// filtro después es instantáneo (mismo criterio que los filtros IA, que también
// corren client-side sobre los contactos ya cargados).

import { supabase } from "./lib";

// Patrones ILIKE sobre el texto del mensaje. `_` es comodín de un carácter:
// "cr_dito" agarra "credito" y "crédito" sin pelear con los acentos.
// A propósito NO están "lease" ni "rent": acá se alquilan trailers y matcharían
// media base de datos.
const PATRONES = [
  "%financ%",          // financiación, financiamiento, financing, finance, financed
  "%credit%",          // credit, credito
  "%cr_dito%",         // crédito
  "%cuota%",           // cuotas
  "%loan%",
  "%ascentium%",       // el socio financiero
  "%monthly payment%",
  "%pago mensual%",
  "%payment plan%",
  "%plan de pago%",
];

// Tope de mensajes a mirar. Es holgado para el volumen real del CRM y evita
// traerse la tabla entera si algún día explota.
const TOPE = 20000;

/**
 * @returns {Promise<Set<string>>} contacto_id de todos los que consultaron.
 */
export async function cargarConsultaronFin() {
  const filtro = PATRONES.map((p) => `contenido.ilike."${p}"`).join(",");

  const [fichas, msgs] = await Promise.all([
    supabase.from("financiamiento").select("contacto_id"),
    // Solo mensajes ENTRANTES: el bot y los vendedores ofrecen financiamiento en
    // medio chat, así que mirar los salientes marcaría a casi todo el mundo. Acá
    // interesa quién PREGUNTÓ.
    supabase.from("mensajes").select("contacto_id").eq("direccion", "in").or(filtro).limit(TOPE),
  ]);

  if (msgs.error) console.warn("[financiamiento] no se pudo escanear mensajes:", msgs.error.message);
  if (fichas.error) console.warn("[financiamiento] no se pudo leer la tabla:", fichas.error.message);

  const ids = new Set();
  for (const r of fichas.data || []) if (r.contacto_id) ids.add(r.contacto_id);
  for (const r of msgs.data || []) if (r.contacto_id) ids.add(r.contacto_id);
  return ids;
}
