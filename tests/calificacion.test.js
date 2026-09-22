// Tests de la calificación de leads y de la elección de proveedor de IA.
//   npm test        (runner nativo de Node, sin dependencias nuevas)
//
// Se prueba sólo lo que es pura lógica: normalizar lo que devuelve el modelo
// y armar el bloque que lee el vendedor. La llamada a la IA en sí no se
// prueba acá — necesitaría red y una clave.
//
// Lo que estos tests cuidan de verdad: que un modelo que devuelve cualquier
// cosa NO termine mostrándole al vendedor un dato inventado o contradictorio.

import test from "node:test";
import assert from "node:assert/strict";

import { bloqueCRM, _test } from "../api/_web/calificar.js";
import { intentosIA, adaptarCuerpo } from "../api/_ia.js";
import { extraerFotos } from "../api/_web/chat.js";
import { MEDIA, mediaDe, tiposDe, modelosDisponibles } from "../api/_fotos.js";

const { normalizar, entrada } = _test;

test("normalizar: el score se recorta a 0-100 y nunca queda NaN", () => {
  assert.equal(normalizar({ score: 140 }).score, 100);
  assert.equal(normalizar({ score: -20 }).score, 0);
  assert.equal(normalizar({ score: "ochenta" }).score, 0);
  assert.equal(normalizar({}).score, 0);
  assert.equal(normalizar({ score: 72.6 }).score, 73);
});

test("normalizar: una temperatura inventada se deduce del score", () => {
  // Que el mail diga "87/100" y al lado "frío" es peor que perder el matiz.
  assert.equal(normalizar({ score: 87, temperatura: "hirviendo" }).temperatura, "caliente");
  assert.equal(normalizar({ score: 50, temperatura: "" }).temperatura, "tibio");
  assert.equal(normalizar({ score: 10 }).temperatura, "frio");
});

test("normalizar: 'frío' con tilde es la misma temperatura que 'frio'", () => {
  assert.equal(normalizar({ score: 90, temperatura: "frío" }).temperatura, "frio");
});

test("normalizar: los campos de texto se limpian y se recortan", () => {
  const cal = normalizar({ score: 60, resumen: "  quiere   un\n3-Stall  " });
  assert.equal(cal.resumen, "quiere un 3-Stall");
  assert.equal(normalizar({ zona: null }).zona, "");
  assert.ok(normalizar({ resumen: "x".repeat(500) }).resumen.length <= 200);
});

test("bloqueCRM: sin calificación no agrega ni una línea", () => {
  assert.deepEqual(bloqueCRM(null), []);
  assert.deepEqual(bloqueCRM(undefined), []);
});

test("bloqueCRM: la primera línea es la que se ve en el push y en la lista", () => {
  const lineas = bloqueCRM(normalizar({
    score: 87, temperatura: "caliente",
    resumen: "Arranca en Orlando con un 3-Stall, financiando.",
  }));
  assert.match(lineas[0], /^🔥 Lead caliente · 87\/100$/);
  assert.equal(lineas[1], "Arranca en Orlando con un 3-Stall, financiando.");
  assert.equal(lineas[lineas.length - 1], "— — —");
});

test("bloqueCRM: los campos vacíos no dejan separadores colgando", () => {
  const lineas = bloqueCRM(normalizar({
    score: 40, resumen: "Pregunta suelta.", zona: "Miami, FL", unidad: "", paquete: "",
  }));
  const fila = lineas.find((l) => l.includes("📍"));
  assert.equal(fila, "📍 Miami, FL");
  assert.ok(!lineas.some((l) => l.includes("⚠️")), "sin objeción no va la línea de objeción");
});

test("bloqueCRM: la alerta se muestra cuando la hay", () => {
  const lineas = bloqueCRM(normalizar({
    score: 5, resumen: "Ofrece servicios de marketing.", alerta: "Parece proveedor, no comprador.",
  }));
  assert.ok(lineas.some((l) => l === "🚩 Parece proveedor, no comprador."));
});

test("entrada: no inventa etiquetas para los datos que no vinieron", () => {
  const txt = entrada({ datos: { nombre: "Ana" }, transcript: "", contexto: "" });
  assert.ok(txt.includes("Nombre: Ana"));
  assert.ok(!txt.includes("Email:"));
  assert.ok(!txt.includes("Teléfono:"));
});

test("entrada: la conversación y la calculadora entran etiquetadas", () => {
  const txt = entrada({
    datos: { nombre: "Ana", escenario: "Unit: 3-Stall | Rentals/mo: 6" },
    transcript: "Visitante: ¿cuánto sale?",
    contexto: "Sections viewed: packages, calculator",
  });
  assert.ok(txt.includes("Números que armó en la calculadora"));
  assert.ok(txt.includes("Unit: 3-Stall"));
  assert.ok(txt.includes("señales de navegación"));
  assert.ok(txt.includes("¿cuánto sale?"));
});

/* ── Elección de proveedor ─────────────────────────────────────────────── */

function conEnv(vars, fn) {
  const previo = {};
  for (const k of Object.keys(vars)) {
    previo[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try { return fn(); }
  finally {
    for (const k of Object.keys(previo)) {
      if (previo[k] === undefined) delete process.env[k];
      else process.env[k] = previo[k];
    }
  }
}

test("intentosIA: sin OPENAI_API_KEY todo sigue yendo a Groq", () => {
  conEnv({ OPENAI_API_KEY: undefined, GROQ_API_KEY: "g" }, () => {
    const fila = intentosIA();
    assert.ok(fila.length > 0);
    assert.ok(fila.every((i) => i.proveedor === "groq"));
  });
});

test("intentosIA: con OPENAI_API_KEY, OpenAI va primero y Groq queda de respaldo", () => {
  conEnv({ OPENAI_API_KEY: "sk-x", GROQ_API_KEY: "g" }, () => {
    const fila = intentosIA();
    assert.equal(fila[0].proveedor, "openai");
    assert.ok(fila.some((i) => i.proveedor === "groq"), "Groq tiene que quedar atrás como red");
  });
});

test("intentosIA: OPENAI_EN_CHAT=0 saca a OpenAI SÓLO del endpoint público", () => {
  conEnv({ OPENAI_API_KEY: "sk-x", GROQ_API_KEY: "g", OPENAI_EN_CHAT: "0" }, () => {
    assert.ok(intentosIA({ publico: true }).every((i) => i.proveedor === "groq"));
    assert.equal(intentosIA()[0]?.proveedor, "openai");
  });
});

test("intentosIA: sin ninguna clave la fila queda vacía y quien llama lo nota", () => {
  conEnv({ OPENAI_API_KEY: undefined, GROQ_API_KEY: undefined }, () => {
    assert.deepEqual(intentosIA(), []);
  });
});

/* ── Adaptación del cuerpo a cada API ──────────────────────────────────────
   El bug que esto evita es silencioso y caro: los modelos GPT-5 rechazan
   `max_tokens` con un 400, la fila caía a Groq sin decir nada, y quedabas
   pagando OpenAI para que conteste Groq. */

test("adaptarCuerpo: a OpenAI nunca le llega max_tokens", () => {
  const cuerpo = adaptarCuerpo("openai", { model: "gpt-5.4-mini", temperature: 0.6, max_tokens: 500 });
  assert.equal(cuerpo.max_tokens, undefined);
  assert.equal(cuerpo.max_completion_tokens, 500);
  assert.equal(cuerpo.temperature, 0.6, "la temperatura sí la acepta y no hay que tocarla");
  assert.equal(cuerpo.model, "gpt-5.4-mini");
});

test("adaptarCuerpo: sin max_tokens no se inventa el campo", () => {
  const cuerpo = adaptarCuerpo("openai", { model: "gpt-5.4-mini", messages: [] });
  assert.ok(!("max_completion_tokens" in cuerpo));
  assert.ok(!("max_tokens" in cuerpo));
});

test("adaptarCuerpo: el resto del cuerpo pasa intacto", () => {
  const rf = { type: "json_object" };
  const cuerpo = adaptarCuerpo("openai", { model: "m", max_tokens: 700, response_format: rf, messages: [{ role: "user", content: "x" }] });
  assert.deepEqual(cuerpo.response_format, rf);
  assert.equal(cuerpo.messages.length, 1);
});

/* ── Fotos y videos de las unidades ────────────────────────────────────────
   Lo que más importa acá: que NINGUNA marca llegue nunca al visitante. Un
   "[FOTO:3-stall]" colgando en una burbuja de chat delata la maquinaria y
   hace que el asistente parezca roto. */

test("extraerFotos: saca la marca y resuelve el material", () => {
  const r = extraerFotos("Este es el 3-Stall, el que más se alquila. [FOTO:3-stall]");
  assert.equal(r.fotos.length, 1);
  assert.equal(r.fotos[0].slug, "3-stall");
  assert.equal(r.fotos[0].tipo, "exterior");
  assert.ok(r.fotos[0].urls.length > 0);
  assert.equal(r.texto, "Este es el 3-Stall, el que más se alquila.");
  assert.ok(!r.texto.includes("FOTO"));
});

test("extraerFotos: el tipo pedido se respeta", () => {
  conEnv({ MEDIA_REMOTA: "1" }, () => {
    assert.equal(extraerFotos("[FOTO:3-stall:interior]").fotos[0].tipo, "interior");
    assert.equal(extraerFotos("[FOTO:2-stall:video]").fotos[0].tipo, "video");
    assert.equal(extraerFotos("[FOTO:3-stall:plano]").fotos[0].tipo, "plano");
  });
});

test("extraerFotos: sinónimos del tipo, que es lo que el modelo escribe de verdad", () => {
  conEnv({ MEDIA_REMOTA: "1" }, () => {
    assert.equal(extraerFotos("[FOTO:3-stall:inside]").fotos[0].tipo, "interior");
    assert.equal(extraerFotos("[FOTO:3-stall:adentro]").fotos[0].tipo, "interior");
    assert.equal(extraerFotos("[FOTO:3-stall:colores]").fotos[0].tipo, "paleta");
  });
});

test("extraerFotos: un tipo que ese modelo no tiene cae a exterior, no a nada", () => {
  // El 4-Stall no tiene video. Mostrar la unidad y que el texto lo aclare es
  // mucho mejor que contestar con las manos vacías.
  const r = extraerFotos("[FOTO:4-stall:video]");
  assert.equal(r.fotos[0].tipo, "exterior");
  assert.ok(r.fotos[0].urls.length > 0);
});

test("extraerFotos: una marca mal escrita igual se entiende", () => {
  assert.equal(extraerFotos("mirá [FOTO: 3 stall]").fotos[0].slug, "3-stall");
  assert.equal(extraerFotos("[foto:ADA]").fotos[0].slug, "ada-2");
  assert.equal(extraerFotos("[FOTO:4stall]").fotos[0].slug, "4-stall");
});

test("extraerFotos: un modelo que no existe no rompe NI deja la marca a la vista", () => {
  const r = extraerFotos("Tenemos varias opciones. [FOTO:9-stall]");
  assert.deepEqual(r.fotos, []);
  assert.equal(r.texto, "Tenemos varias opciones.");
});

test("extraerFotos: no repite modelo+tipo y corta en dos bloques", () => {
  const r = extraerFotos("a [FOTO:2-stall] b [FOTO:2-stall] c [FOTO:3-stall] d [FOTO:4-stall]");
  assert.equal(r.fotos.length, 2);
  assert.deepEqual(r.fotos.map((f) => f.slug), ["2-stall", "3-stall"]);
});

test("extraerFotos: el mismo modelo con dos tipos distintos SÍ puede ir junto", () => {
  conEnv({ MEDIA_REMOTA: "1" }, () => {
    const r = extraerFotos("[FOTO:3-stall:exterior] [FOTO:3-stall:interior]");
    assert.deepEqual(r.fotos.map((f) => f.tipo), ["exterior", "interior"]);
  });
});

test("extraerFotos: sin marcas devuelve el texto igual", () => {
  const r = extraerFotos("El financiamiento lo resuelve Acorn Finance.");
  assert.deepEqual(r.fotos, []);
  assert.equal(r.texto, "El financiamiento lo resuelve Acorn Finance.");
  assert.deepEqual(extraerFotos("").fotos, []);
  assert.equal(extraerFotos(null).texto, "");
});

test("mediaDe: nunca devuelve más de lo que entra en un chat", () => {
  // El 4-Stall tiene seis fotos de interior. Seis seguidas no es respuesta.
  assert.ok(mediaDe("4-stall", "interior").urls.length <= 3);
  assert.equal(mediaDe("no-existe", "exterior"), null);
});

test("el catálogo no tiene URLs inventadas", () => {
  conEnv({ MEDIA_REMOTA: "1" }, () => {
    for (const slug of Object.keys(MEDIA)) {
      assert.ok(tiposDe(slug).includes("exterior"), slug + " tiene que tener exterior");
      for (const tipo of tiposDe(slug)) {
        for (const url of MEDIA[slug][tipo]) {
          // O es un archivo de la propia landing, o es un link oficial.
          assert.match(url, /^(img\/|https:\/\/ninitgroup\.com\/wp-content\/uploads\/)/, slug + "/" + tipo);
        }
      }
    }
  });
});

/* ── El interruptor del material remoto ────────────────────────────────────
   ninitgroup.com se queda sin cuota de transferencia y devuelve 509: el
   22/09/2026 los 37 archivos estaban caídos. Una landing pública no puede
   mostrarle un recuadro roto a un prospecto, así que por defecto sólo se
   sirve lo que está en el mismo hosting que la página. */

test("con el material remoto apagado, sólo se sirven archivos de la landing", () => {
  conEnv({ MEDIA_REMOTA: undefined }, () => {
    const r = extraerFotos("[FOTO:3-stall]");
    assert.equal(r.fotos.length, 1);
    assert.ok(r.fotos[0].urls.every((u) => u.startsWith("img/")),
      "nada que dependa de WordPress");
  });
});

test("apagado, pedir un video devuelve el exterior y NUNCA una lista vacía", () => {
  conEnv({ MEDIA_REMOTA: undefined }, () => {
    const r = extraerFotos("[FOTO:3-stall:video]");
    assert.equal(r.fotos[0].tipo, "exterior");
    assert.ok(r.fotos[0].urls.length > 0);
  });
});

test("apagado, la IA no ve modelos que no puede mostrar", () => {
  conEnv({ MEDIA_REMOTA: undefined }, () => {
    // El 6-Stall sólo tiene exterior en WordPress. Interior y equipamiento
    // son casi iguales en toda la línea, así que con eso solo no se puede
    // mostrar de verdad: se exige exterior para ofrecerlo.
    assert.ok(!modelosDisponibles().includes("6-stall"));
    // Lo que SÍ se puede sin WordPress: exterior, interior y equipamiento,
    // todo servido por la propia landing.
    assert.deepEqual(tiposDe("3-stall"), ["exterior", "interior", "detalle"]);
    assert.ok(!tiposDe("3-stall").includes("video"), "el video vive en WordPress");
  });
  conEnv({ MEDIA_REMOTA: "1" }, () => {
    assert.ok(modelosDisponibles().includes("6-stall"));
    assert.ok(tiposDe("3-stall").includes("video"));
  });
});

test("el interior genérico se marca como tal, y el propio no", () => {
  conEnv({ MEDIA_REMOTA: undefined }, () => {
    // Mostrar una foto cualquiera bajo el título "3-Stall · Interior" es
    // decirle al cliente que está viendo SU unidad. El pie tiene que aclararlo.
    assert.equal(mediaDe("3-stall", "interior").generico, true);
    // Del 2-Stall sí tenemos una toma propia (img/int/5.jpg).
    const dos = mediaDe("2-stall", "interior");
    assert.equal(dos.generico, false);
    assert.equal(dos.urls[0], "img/int/5.jpg");
    // El equipamiento es el mismo en toda la línea, siempre genérico.
    assert.equal(mediaDe("2-stall", "detalle").generico, true);
  });
});

test("adaptarCuerpo: a Groq se le sigue mandando max_tokens y el freno de razonamiento", () => {
  const cuerpo = adaptarCuerpo("groq", { model: "openai/gpt-oss-120b", max_tokens: 500 });
  assert.equal(cuerpo.max_tokens, 500, "Groq sí entiende max_tokens");
  assert.ok(!("max_completion_tokens" in cuerpo));
  // Sin esto, los gpt-oss se gastan el presupuesto pensando y vuelven vacíos.
  assert.equal(cuerpo.reasoning_effort, "low");
});
