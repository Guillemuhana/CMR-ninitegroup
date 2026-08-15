// Tests de las reglas de envío masivo (src/promos.js).
//   npm test        (runner nativo de Node, sin dependencias nuevas)
//
// NINGÚN test manda un mensaje: acá solo se prueban funciones puras. Lo que se
// está protegiendo es la regla de la ventana de 24 h de Meta — equivocarse ahí
// no da un error visible, da una campaña que se rechaza en silencio o, peor,
// mensajes a gente que no corresponde.

import test from "node:test";
import assert from "node:assert/strict";

import {
  VENTANA_MS, dentroDeVentana, planDeEnvio, firmaWhatsApp, personalizar,
  traducirErrorMeta,
} from "../src/promos.js";

const AHORA = Date.parse("2026-08-15T12:00:00.000Z");
const haceHoras = (h) => new Date(AHORA - h * 3600 * 1000).toISOString();

// ── Ventana de 24 h ─────────────────────────────────────────
test("dentroDeVentana: un cliente que escribió recién está dentro", () => {
  assert.equal(dentroDeVentana({ ultimo_in_at: haceHoras(1) }, AHORA), true);
});

test("dentroDeVentana: a las 23 h todavía está dentro", () => {
  assert.equal(dentroDeVentana({ ultimo_in_at: haceHoras(23) }, AHORA), true);
});

test("dentroDeVentana: a las 25 h ya está afuera", () => {
  assert.equal(dentroDeVentana({ ultimo_in_at: haceHoras(25) }, AHORA), false);
});

test("dentroDeVentana: el borde exacto de 24 h cuenta como AFUERA", () => {
  // Se elige el lado conservador a propósito: si el CRM cree que está dentro y
  // Meta cree que no, el mensaje se rechaza. Al revés no se pierde nada, solo
  // se manda por plantilla.
  const justo = new Date(AHORA - VENTANA_MS).toISOString();
  assert.equal(dentroDeVentana({ ultimo_in_at: justo }, AHORA), false);
});

test("dentroDeVentana: sin ultimo_in_at nunca está dentro", () => {
  assert.equal(dentroDeVentana({ ultimo_in_at: null }, AHORA), false);
  assert.equal(dentroDeVentana({}, AHORA), false);
  assert.equal(dentroDeVentana(null, AHORA), false);
});

test("dentroDeVentana: una fecha basura no se toma como válida", () => {
  assert.equal(dentroDeVentana({ ultimo_in_at: "no-es-fecha" }, AHORA), false);
});

// ── Plan de envío ───────────────────────────────────────────
test("planDeEnvio: dentro de la ventana va texto libre, aunque haya plantilla", () => {
  const c = { canal: "whatsapp", ultimo_in_at: haceHoras(2) };
  assert.equal(planDeEnvio(c, true, AHORA).modo, "texto");
  assert.equal(planDeEnvio(c, false, AHORA).modo, "texto");
});

test("planDeEnvio: WhatsApp fuera de ventana usa plantilla si hay", () => {
  const c = { canal: "whatsapp", ultimo_in_at: haceHoras(48) };
  assert.equal(planDeEnvio(c, true, AHORA).modo, "plantilla");
});

test("planDeEnvio: WhatsApp fuera de ventana sin plantilla se omite", () => {
  const c = { canal: "whatsapp", ultimo_in_at: haceHoras(48) };
  const plan = planDeEnvio(c, false, AHORA);
  assert.equal(plan.modo, "omitido");
  assert.match(plan.motivo, /plantilla/i);
});

test("planDeEnvio: Messenger fuera de ventana se omite SIEMPRE, haya plantilla o no", () => {
  // Las plantillas son de WhatsApp. En Messenger no existe ninguna etiqueta que
  // habilite promociones fuera de las 24 h, así que ofrecerlo sería mentirle al
  // usuario y quemar la página de Facebook.
  const c = { canal: "messenger", ultimo_in_at: haceHoras(48) };
  assert.equal(planDeEnvio(c, true, AHORA).modo, "omitido");
  assert.equal(planDeEnvio(c, false, AHORA).modo, "omitido");
});

test("planDeEnvio: sin canal se asume WhatsApp", () => {
  const c = { ultimo_in_at: haceHoras(48) };
  assert.equal(planDeEnvio(c, true, AHORA).modo, "plantilla");
});

test("planDeEnvio: un contacto que nunca escribió no recibe texto libre", () => {
  const c = { canal: "whatsapp", ultimo_in_at: null };
  assert.equal(planDeEnvio(c, false, AHORA).modo, "omitido");
  assert.equal(planDeEnvio(c, true, AHORA).modo, "plantilla");
});

// ── Personalización ─────────────────────────────────────────
test("personalizar: reemplaza {nombre}", () => {
  assert.equal(personalizar("Hola {nombre}!", { nombre: "Ana" }), "Hola Ana!");
});

test("personalizar: reemplaza todas las apariciones y no distingue mayúsculas", () => {
  assert.equal(personalizar("{nombre} y {NOMBRE}", { nombre: "Ana" }), "Ana y Ana");
});

test("personalizar: sin nombre usa el fallback, no deja el marcador crudo", () => {
  assert.equal(personalizar("Hola {nombre}", { nombre: "" }, "amigo"), "Hola amigo");
  assert.equal(personalizar("Hola {nombre}", {}, "amigo"), "Hola amigo");
  assert.equal(personalizar("Hola {nombre}", null, "amigo"), "Hola amigo");
});

test("personalizar: un nombre con solo espacios cuenta como vacío", () => {
  assert.equal(personalizar("Hola {nombre}", { nombre: "   " }, "amigo"), "Hola amigo");
});

test("personalizar: sin fallback el marcador queda vacío, nunca literal", () => {
  assert.equal(personalizar("Hola {nombre}, ¿cómo va?", {}), "Hola , ¿cómo va?");
});

// ── Firma ───────────────────────────────────────────────────
test("firmaWhatsApp: mantiene el prefijo exacto que el chat usa para ocultar el eco", () => {
  // El regex del chat es /^\*.*NINIT Group:\*/ (ECHO_PREFIX_RE en App.jsx).
  // Si esta firma cambia, los mensajes salen duplicados en la conversación.
  const firmado = firmaWhatsApp("Nicolas", "Hola");
  assert.match(firmado, /^\*.*NINIT Group:\*/);
  assert.equal(firmado, "*Nicolas · NINIT Group:*\nHola");
});

// ── Traducción de errores de Meta ───────────────────────────
test("traducirErrorMeta: el 131047 explica que hace falta plantilla", () => {
  const t = traducirErrorMeta("(#131047) Re-engagement message [131047]");
  assert.match(t, /24 h/);
  assert.match(t, /plantilla/i);
});

test("traducirErrorMeta: el 132001 apunta a la plantilla", () => {
  // Este es el error real que devolvió el webhook al probar el contrato.
  const t = traducirErrorMeta("(#132001) Template name does not exist in the translation [132001]");
  assert.match(t, /plantilla/i);
});

test("traducirErrorMeta: un error desconocido se muestra tal cual", () => {
  assert.equal(traducirErrorMeta("Algo raro pasó"), "Algo raro pasó");
});

test("traducirErrorMeta: sin error igual devuelve algo legible", () => {
  assert.match(traducirErrorMeta(""), /Meta/);
  assert.match(traducirErrorMeta(null), /Meta/);
});

test("traducirErrorMeta: un error larguísimo se recorta", () => {
  const largo = "x".repeat(1000);
  assert.ok(traducirErrorMeta(largo).length <= 300);
});
