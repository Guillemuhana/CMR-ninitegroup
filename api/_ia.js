// Quién contesta: OpenAI o Groq.
//
// Vive en un archivo con "_", así que no gasta ninguna de las 12 funciones
// del plan Hobby (ver AGENTS.md).
//
// POR QUÉ EXISTE
// Todo el CRM viene hablando con Groq, que es gratis y rapidísimo. Para
// resumir, traducir o extraer datos alcanza y sobra. Pero en la landing la
// IA no está ayudando a un vendedor: está hablando con un desconocido que
// decide si deja el teléfono o cierra la pestaña, y está decidiendo qué lee
// el vendedor antes de llamar. Ahí la calidad del modelo es plata.
//
// La API de Groq es compatible con la de OpenAI —mismo formato de pedido y
// de respuesta— así que cambiar de proveedor es cambiar la URL, la clave y
// el nombre del modelo. Nada más. Esto arma esa lista de intentos en orden.
//
// CÓMO SE PRENDE
//   OPENAI_API_KEY    si está, OpenAI pasa a ser el primero de la fila.
//                     Si no está, todo sigue exactamente como antes.
//   OPENAI_MODEL      qué modelo usar. Conviene ponerlo a mano y confirmar
//                     el id vigente en la documentación de OpenAI: los
//                     nombres cambian y un id viejo devuelve 404.
//   OPENAI_EN_CHAT    "0" deja el chat público en Groq y usa OpenAI sólo
//                     del lado privado. Ver la nota de abajo, importa.
//
// LA NOTA QUE IMPORTA
// api/_web/chat.js es un endpoint PÚBLICO y su freno de abuso vive en la
// memoria del proceso: Vercel levanta varias instancias, cada una con su
// propio contador, así que frena un bucle ingenuo y no mucho más. Con Groq
// el peor caso es quedarse sin cuota gratis. Con una clave de OpenAI, el
// peor caso es una factura. Por eso existe OPENAI_EN_CHAT: hasta que el
// límite viva en un almacenamiento compartido (Supabase o Upstash), se
// puede tener lo mejor de los dos lados —OpenAI calificando leads, que es
// una llamada por lead y nadie de afuera puede disparar, y Groq atendiendo
// el chat abierto a internet.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const MODELOS_GROQ = (process.env.GROQ_MODEL
  ? [process.env.GROQ_MODEL, "openai/gpt-oss-20b"]
  : ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]
).filter((m, i, a) => a.indexOf(m) === i);

// Default conservador: el modelo chico y barato. Si OPENAI_MODEL no está,
// igual se puede probar, pero lo correcto es fijarlo a mano.
const MODELO_OPENAI = process.env.OPENAI_MODEL || "gpt-4o-mini";

/**
 * La fila de intentos, en orden. Cada uno es {proveedor, url, apiKey, model}.
 * Quien llama los recorre y se queda con el primero que conteste — que es
 * justo lo que ya hacían chat.js y calificar.js con la cadena de modelos de
 * Groq, así que el cambio en los dos es de una línea.
 *
 * `publico`: true si esto lo puede disparar cualquiera desde internet. En
 * ese caso se respeta OPENAI_EN_CHAT.
 */
export function intentosIA({ publico = false } = {}) {
  const intentos = [];

  const keyOpenAI = process.env.OPENAI_API_KEY;
  const openaiPermitido = !publico || process.env.OPENAI_EN_CHAT !== "0";

  if (keyOpenAI && openaiPermitido) {
    intentos.push({ proveedor: "openai", url: OPENAI_URL, apiKey: keyOpenAI, model: MODELO_OPENAI });
  }

  // Groq queda SIEMPRE atrás como respaldo, aunque OpenAI sea el titular: si
  // la tarjeta falla, si la cuenta se queda sin crédito o si el id del modelo
  // quedó viejo, el asistente sigue contestando en vez de tirar un error en
  // la cara de un prospecto.
  const keyGroq = process.env.GROQ_API_KEY;
  if (keyGroq) {
    for (const model of MODELOS_GROQ) {
      intentos.push({ proveedor: "groq", url: GROQ_URL, apiKey: keyGroq, model });
    }
  }

  return intentos;
}

/** ¿Hay alguna forma de contestar? Para el chequeo de configuración. */
export function hayIA({ publico = false } = {}) {
  return intentosIA({ publico }).length > 0;
}
