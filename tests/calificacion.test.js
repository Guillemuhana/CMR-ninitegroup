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
import { intentosIA } from "../api/_ia.js";

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
