// Tests del parseo de plantillas de WhatsApp (api/_meta/plantillas.js).
//   npm test
//
// NINGÚN test llama a Meta: se le pasan respuestas de la Graph API armadas a
// mano. Lo que se protege es que el CRM no ofrezca como elegible una plantilla
// que Meta después va a rechazar — un rechazo masivo es lo que termina en una
// limitación del número.

import test from "node:test";
import assert from "node:assert/strict";

import { parsearPlantilla } from "../api/_meta/plantillas.js";

const tpl = (over = {}) => ({
  name: "promo_seguimiento_precio",
  language: "en_US",
  status: "APPROVED",
  category: "MARKETING",
  components: [
    {
      type: "BODY",
      text: "Hi! We updated our {{1}} pricing and our {{2}} model now starts at {{3}}.",
      example: { body_text: [["August", "2-Stall", "$19,500"]] },
    },
  ],
  ...over,
});

test("cuenta las variables que la plantilla realmente pide", () => {
  const p = parsearPlantilla(tpl());
  assert.equal(p.variables, 3);
  assert.equal(p.soportada, true);
});

test("trae los ejemplos cargados al pedir la aprobación", () => {
  assert.deepEqual(parsearPlantilla(tpl()).ejemplos, ["August", "2-Stall", "$19,500"]);
});

test("una plantilla sin variables da 0 y sigue siendo soportada", () => {
  const p = parsearPlantilla(tpl({ components: [{ type: "BODY", text: "Hola, gracias por escribirnos." }] }));
  assert.equal(p.variables, 0);
  assert.equal(p.soportada, true);
});

test("no cuenta dos veces una variable repetida", () => {
  const p = parsearPlantilla(tpl({ components: [{ type: "BODY", text: "{{1}} y de nuevo {{1}}" }] }));
  assert.equal(p.variables, 1);
});

test("tolera espacios adentro de las llaves", () => {
  const p = parsearPlantilla(tpl({ components: [{ type: "BODY", text: "hola {{ 1 }} y {{2}}" }] }));
  assert.equal(p.variables, 2);
});

test("cuenta variables DISTINTAS, no el número más alto", () => {
  // Una plantilla con {{1}} y {{3}} está mal armada. Si contáramos 3, el CRM
  // mandaría un parámetro de más y Meta rechazaría el envío entero.
  const p = parsearPlantilla(tpl({ components: [{ type: "BODY", text: "{{1}} y {{3}}" }] }));
  assert.equal(p.variables, 2);
});

// ── Las que NO se pueden mandar desde el CRM ────────────────
test("marca como no soportada la que usa variables con nombre", () => {
  const p = parsearPlantilla(tpl({ components: [{ type: "BODY", text: "Hola {{customer_name}}!" }] }));
  assert.equal(p.soportada, false);
  assert.match(p.motivos.join(" "), /nombre/i);
});

test("marca como no soportada la que tiene variables en el encabezado", () => {
  const p = parsearPlantilla(tpl({
    components: [
      { type: "HEADER", format: "TEXT", text: "Oferta de {{1}}" },
      { type: "BODY", text: "Cuerpo sin variables." },
    ],
  }));
  assert.equal(p.soportada, false);
  assert.match(p.motivos.join(" "), /encabezado/i);
});

test("marca como no soportada la que pide adjuntar una imagen", () => {
  const p = parsearPlantilla(tpl({
    components: [
      { type: "HEADER", format: "IMAGE" },
      { type: "BODY", text: "Cuerpo." },
    ],
  }));
  assert.equal(p.soportada, false);
  assert.match(p.motivos.join(" "), /image/i);
});

test("marca como no soportada la que tiene un botón con URL variable", () => {
  const p = parsearPlantilla(tpl({
    components: [
      { type: "BODY", text: "Cuerpo." },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver", url: "https://ninit.com/{{1}}" }] },
    ],
  }));
  assert.equal(p.soportada, false);
  assert.match(p.motivos.join(" "), /bot[oó]n/i);
});

test("un botón con URL fija no la invalida", () => {
  const p = parsearPlantilla(tpl({
    components: [
      { type: "BODY", text: "Cuerpo." },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver", url: "https://ninitgroup.com" }] },
    ],
  }));
  assert.equal(p.soportada, true);
});

test("un encabezado de texto SIN variables no la invalida y se conserva", () => {
  const p = parsearPlantilla(tpl({
    components: [
      { type: "HEADER", format: "TEXT", text: "NINIT Group" },
      { type: "BODY", text: "Cuerpo con {{1}}." },
    ],
  }));
  assert.equal(p.soportada, true);
  assert.equal(p.encabezado, "NINIT Group");
});

// ── Metadatos ───────────────────────────────────────────────
test("normaliza estado y categoría a mayúsculas para poder filtrar", () => {
  const p = parsearPlantilla(tpl({ status: "approved", category: "marketing" }));
  assert.equal(p.estado, "APPROVED");
  assert.equal(p.categoria, "MARKETING");
});

test("conserva el pie de página", () => {
  const p = parsearPlantilla(tpl({
    components: [{ type: "BODY", text: "Cuerpo." }, { type: "FOOTER", text: "Responde STOP para no recibir más." }],
  }));
  assert.equal(p.pie, "Responde STOP para no recibir más.");
});

test("no explota con una plantilla vacía o basura", () => {
  for (const entrada of [{}, null, { components: null }, { components: "x" }]) {
    const p = parsearPlantilla(entrada);
    assert.equal(p.variables, 0);
    assert.equal(typeof p.nombre, "string");
  }
});
