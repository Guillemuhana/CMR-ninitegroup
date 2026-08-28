// Tests de datosDelLead(): lo que el cliente YA aportó no se le vuelve a pedir.
//   npm test        (runner nativo de Node, sin dependencias nuevas)
//
// El caso que motiva todo esto: los leads de Facebook/Messenger llegan con el
// formulario completo en el primer mensaje, y la IA arrancaba preguntando el
// modelo o el ZIP que el cliente acababa de mandar.

import test from "node:test";
import assert from "node:assert/strict";

import { datosDelLead } from "../api/_transcript.js";

const cliente = (contenido) => ({ direccion: "in", contenido });
const vendedor = (contenido) => ({ direccion: "out", contenido, agente: "Nicolas" });

const FORMULARIO_MESSENGER = `Hello! I filled out your form and would like to know more about your business.
Which trailer size fits your needs best?: 2-Stall Luxury Trailer ($19,500 Promo)
Full name: El Compa Chuy II
Phone number: (714) 914-3720
Email: chuyvelazquez1980@gmail.com
Zip code: 92505`;

test("datosDelLead: extrae el formulario de Messenger completo", () => {
  const datos = datosDelLead([cliente(FORMULARIO_MESSENGER)]);
  assert.deepEqual(datos, [
    "Nombre: El Compa Chuy II",
    "Teléfono: (714) 914-3720",
    "Email: chuyvelazquez1980@gmail.com",
    "Código postal (ZIP): 92505",
    "Modelo que le interesa: 2-Stall Luxury Trailer ($19,500 Promo)",
  ]);
});

test("datosDelLead: el modelo elegido conserva el precio de promoción", () => {
  const datos = datosDelLead([cliente(FORMULARIO_MESSENGER)]);
  assert.ok(datos.some((d) => d.includes("2-Stall") && d.includes("$19,500")));
});

test("datosDelLead: el formulario en español también entra", () => {
  const datos = datosDelLead([cliente(
    "Hola, llené el formulario.\nNombre completo: María Pérez\nTeléfono: 305-555-0199\nCódigo postal: 33132\nModelo: 3-Stall"
  )]);
  assert.ok(datos.includes("Nombre: María Pérez"));
  assert.ok(datos.includes("Teléfono: 305-555-0199"));
  assert.ok(datos.includes("Código postal (ZIP): 33132"));
  assert.ok(datos.includes("Modelo que le interesa: 3-Stall"));
});

test("datosDelLead: sin etiqueta, igual pesca el email y el modelo sueltos", () => {
  const datos = datosDelLead([
    cliente("Hi, I'm looking at the 4-Stall, write me at john.doe@example.com"),
  ]);
  assert.ok(datos.includes("Email: john.doe@example.com"));
  assert.ok(datos.some((d) => d.startsWith("Modelo que le interesa: 4-Stall")));
});

test("datosDelLead: NO toma como dato del cliente lo que escribió el vendedor", () => {
  const datos = datosDelLead([
    vendedor("Hola, soy Nicolas. Email: ventas@ninitgroup.com"),
    cliente("ok gracias"),
  ]);
  assert.deepEqual(datos, []);
});

test("datosDelLead: descarta rellenos vacíos del formulario", () => {
  const datos = datosDelLead([cliente("Full name: Ana Ruiz\nZip code: N/A\nEmail: -")]);
  assert.deepEqual(datos, ["Nombre: Ana Ruiz"]);
});

test("datosDelLead: una conversación sin datos no inventa ninguno", () => {
  assert.deepEqual(datosDelLead([cliente("hola, info?")]), []);
  assert.deepEqual(datosDelLead([]), []);
  assert.deepEqual(datosDelLead(null), []);
});
