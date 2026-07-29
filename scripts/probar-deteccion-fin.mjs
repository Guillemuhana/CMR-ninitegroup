// Prueba el clasificador que detecta "el cliente presentó la solicitud de
// financiamiento" (api/_fin/detectar.js) contra frases reales, sin tocar la
// base de datos ni mandar notificaciones.
//
// Uso (PowerShell):
//   $env:GROQ_API_KEY = "gsk_..."   # la misma que está en Vercel
//   node scripts/probar-deteccion-fin.mjs
//
// Cada caso dice qué se espera. Si alguno falla, hay que ajustar el PROMPT
// de api/_fin/detectar.js y volver a correr esto.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODELO = "llama-3.1-8b-instant";

const PROMPT = `Sos un clasificador. Te paso UN mensaje que un cliente le mandó a una empresa que vende trailers de baños y que le ofreció financiamiento con Ascentium Capital.

Respondé SOLO con un JSON: {"aplico": true|false, "confianza": 0-100}

"aplico" es true SOLO si el cliente dice que YA completó, envió o presentó la solicitud de financiamiento (ej: "I submitted the application", "ya apliqué", "just finished the credit application", "sent it in").

"aplico" es false si solo pregunta por el financiamiento, dice que lo va a hacer más tarde, pide el link, está en duda, o habla de otra cosa. Ante la duda, false.`;

// true  = tiene que detectarlo
// false = NO tiene que detectarlo (los falsos positivos son lo más caro:
//         le llega un aviso al CEO por algo que no pasó)
const CASOS = [
  ["I just submitted the application", true],
  ["ya apliqué al financiamiento", true],
  ["Just finished the credit application, sent it in", true],
  ["Ok, I filled out the form and sent it", true],
  ["I completed the Ascentium application this morning", true],
  ["Listo, mandé la solicitud", true],

  ["Can you send me the financing link again?", false],
  ["How does the financing work?", false],
  ["I'll apply tomorrow", false],
  ["Voy a aplicar la semana que viene", false],
  ["I'm still thinking about it", false],
  ["What's the interest rate?", false],
  ["Do you have the 3-stall available?", false],
  ["I applied for a loan at my bank last year", false],
  ["Thanks!", false],
];

async function clasificar(texto) {
  const r = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: MODELO,
      temperature: 0,
      max_tokens: 60,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: texto.slice(0, 1500) },
      ],
    }),
  });
  if (!r.ok) throw new Error(`Groq devolvió ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const out = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
  return {
    detecta: out.aplico === true && Number(out.confianza ?? 0) >= 70,
    crudo: out,
  };
}

if (!process.env.GROQ_API_KEY) {
  console.error("Falta GROQ_API_KEY. En PowerShell:  $env:GROQ_API_KEY = \"gsk_...\"");
  process.exit(1);
}

let ok = 0, fallos = [];
for (const [texto, esperado] of CASOS) {
  let res;
  try { res = await clasificar(texto); }
  catch (e) { console.error(`ERROR con "${texto}": ${e.message}`); process.exit(1); }

  const bien = res.detecta === esperado;
  if (bien) ok++; else fallos.push({ texto, esperado, obtuvo: res.detecta, crudo: res.crudo });
  const icono = bien ? "OK  " : "FALLA";
  console.log(`${icono} ${res.detecta ? "detecta " : "ignora  "} | ${texto}`);
}

console.log(`\n${ok}/${CASOS.length} correctos.`);
if (fallos.length) {
  console.log("\nFallaron:");
  for (const f of fallos) {
    console.log(`  "${f.texto}"\n    esperaba ${f.esperado ? "detectar" : "ignorar"}, obtuvo ${f.obtuvo ? "detectar" : "ignorar"} — ${JSON.stringify(f.crudo)}`);
  }
  process.exit(1);
}
