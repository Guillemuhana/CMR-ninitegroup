// Tests de la cotización ABIERTA: la que se manda sin nombre para que la
// complete quien la recibe (api/cotizacion-firmar.js).
//   npm test
//
// No se manda ningún mail: se reemplaza nodemailer.createTransport antes de
// importar el endpoint y se mira el mail que HABRÍA salido. Lo que se protege
// es lo caro de equivocarse:
//   - que el acuerdo firmado llegue a las dos casillas de NINIT y NUNCA al cliente;
//   - que el precio sea el de lista aunque el navegador mande otro;
//   - que una cotización emitida siga ignorando lo que venga del navegador.

import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";

import nodemailer from "nodemailer";

const enviados = [];
nodemailer.createTransport = () => ({
  sendMail: async (mail) => {
    enviados.push(mail);
    return { messageId: "test" };
  },
});

process.env.GMAIL_USER = "envia@ninitgroup.com";
process.env.GMAIL_APP_PASSWORD = "clave de prueba";
delete process.env.COTIZACION_EMAIL_TO;
delete process.env.COTIZACION_ABIERTA_EMAIL_TO;

const { default: handler } = await import("../api/cotizacion-firmar.js");
const { modelosElegibles, esAPedido } = await import("../api/_cotizacion/datos.js");

/** PNG mínimo (1x1 transparente), con la misma forma que canvas.toDataURL(). */
function firmaPNG() {
  const tabla = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c;
  }
  const crc = (buf) => {
    let c = -1;
    for (const b of buf) c = tabla[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const trozo = (tipo, datos) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
    const suma = Buffer.alloc(4);
    suma.writeUInt32BE(crc(cuerpo));
    return Buffer.concat([largo, cuerpo, suma]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", deflateSync(Buffer.alloc(5))),
    trozo("IEND", Buffer.alloc(0)),
  ]);
  return "data:image/png;base64," + png.toString("base64");
}

const FIRMA = firmaPNG();

const datosCliente = (over = {}) => ({
  modelo: "3-stall",
  nombre: "Maria Fernandez",
  empresa: "Sunshine Events LLC",
  email: "maria@sunshine-events.com",
  telefono: "+1 (305) 555-0134",
  ubicacion: "Orlando, FL",
  cantidad: "1",
  entrega: "Pickup at NINI T-GROUP Hub — Long Beach, CA (Free)",
  exterior: "Onyx Black",
  interior: "Armani Gray (Matte)",
  ...over,
});

/** Corre el endpoint y devuelve { status, json, mail }. */
async function firmar(body) {
  const antes = enviados.length;
  let status = 200;
  let json = null;
  const res = {
    status(c) {
      status = c;
      return this;
    },
    json(j) {
      json = j;
      return this;
    },
    setHeader() {},
  };

  await handler(
    { method: "POST", headers: { "x-forwarded-for": "203.0.113.9" }, socket: {}, body },
    res
  );

  return { status, json, mail: enviados.length > antes ? enviados[enviados.length - 1] : null };
}

const firmaAbierta = (over = {}, cliente = {}) =>
  firmar({
    quote: "ntg-quote",
    signature: FIRMA,
    accepted: true,
    message: "",
    company_url: "",
    cliente: datosCliente(cliente),
    ...over,
  });

test("el acuerdo firmado llega a las dos casillas de NINIT y a nadie más", async () => {
  const { status, json, mail } = await firmaAbierta();

  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.deepEqual(mail.to, ["sales@ninitgroup.com", "ninitgroup@gmail.com"]);
  // El cliente NO recibe copia: su mail solo sirve para contestarle.
  assert.equal(mail.cc, undefined);
  assert.equal(mail.bcc, undefined);
  assert.equal(mail.replyTo, "maria@sunshine-events.com");
  assert.equal(mail.attachments.length, 1);
  assert.match(mail.attachments[0].filename, /^Purchase-Agreement-.*-signed\.pdf$/);
});

test("el acuerdo sale a nombre de quien lo completó, con lo que eligió", async () => {
  const { mail } = await firmaAbierta();

  assert.match(mail.subject, /Maria Fernandez/);
  assert.match(mail.html, /Maria Fernandez/);
  assert.match(mail.html, /Onyx Black/);
  assert.match(mail.html, /Armani Gray \(Matte\)/);
  assert.match(mail.text, /Orlando, FL/);
});

test("la cantidad elegida manda el precio y el anticipo es el 50%", async () => {
  const { mail } = await firmaAbierta({}, { cantidad: "3" });

  // 3 x US$23,500 de lista = US$70,500, con la mitad de anticipo.
  assert.match(mail.text, /Total US\$70,500\.00/);
  assert.match(mail.text, /anticipo US\$35,250\.00/);
  assert.match(mail.text, /saldo US\$35,250\.00/);
});

test("el precio no se toma del navegador por más que lo mande", async () => {
  const { mail } = await firmaAbierta(
    { precio: { unit_price: 1 }, unit_price: 1, total: 1 },
    { cantidad: "1", unit_price: 1, precio: { unit_price: 1 } }
  );

  assert.match(mail.text, /Total US\$23,500\.00/);
});

test("una cantidad fuera de rango se recorta al máximo permitido", async () => {
  const { mail } = await firmaAbierta({}, { cantidad: "99" });

  // El tope son 5 unidades: más que eso lo cotiza el equipo a mano.
  assert.match(mail.text, /Total US\$117,500\.00/);
});

test("una opción inventada cae en la primera del catálogo", async () => {
  const { mail } = await firmaAbierta({}, { exterior: "Neon Pink", interior: "Marble XYZ" });

  assert.match(mail.html, /Pure White/);
  assert.doesNotMatch(mail.html, /Neon Pink/);
});

test("sin nombre, sin email válido o sin lugar de entrega no se firma", async () => {
  for (const roto of [{ nombre: "" }, { email: "no-es-un-mail" }, { ubicacion: "" }]) {
    const { status, json, mail } = await firmaAbierta({}, roto);
    assert.equal(status, 400, JSON.stringify(roto));
    assert.equal(json.ok, false);
    assert.equal(mail, null);
  }
});

test("el honeypot corta el envío sin mandar nada", async () => {
  const { status, json, mail } = await firmaAbierta({ company_url: "http://spam.example" });

  assert.equal(status, 200);
  assert.equal(json.filename, null);
  assert.equal(mail, null);
});

test("una cotización emitida sigue yendo a NINIT y con SUS datos", async () => {
  const { status, mail } = await firmar({
    quote: "prueba-interna",
    signature: FIRMA,
    accepted: true,
    message: "",
    company_url: "",
    // Aunque el navegador mande otro cliente, la emitida lo ignora.
    cliente: datosCliente(),
  });

  assert.equal(status, 200);
  assert.deepEqual(mail.to, ["sales@ninitgroup.com", "ninitgroup@gmail.com"]);
  assert.match(mail.subject, /Prueba Interna NTG/);
  assert.doesNotMatch(mail.subject, /Maria Fernandez/);
});

test("el cliente elige el modelo y manda el precio de ese modelo", async () => {
  const { mail } = await firmaAbierta({}, { modelo: "4-stall" });

  // 4-Stall = US$28,500 de lista.
  assert.match(mail.text, /Total US\$28,500\.00/);
  assert.match(mail.text, /4-Station Luxury/);
  assert.match(mail.html, /Model/);
});

test("un modelo inventado cae en el que trae la cotización", async () => {
  const { status, mail } = await firmaAbierta({}, { modelo: "9-stall" });

  assert.equal(status, 200);
  assert.match(mail.text, /Total US\$23,500\.00/); // el 3-Stall por defecto
});

test("el ADA+2 se firma como cualquier otro", async () => {
  const { status, mail } = await firmaAbierta({}, { modelo: "ada-2" });

  assert.equal(status, 200);
  assert.match(mail.text, /Total US\$29,500\.00/);
  assert.equal(mail.attachments.length, 1);
});

test("el 5-Stall y el 6-Stall ya tienen precio: se firman como el resto", async () => {
  // Antes iban "a pedido" y no se podían firmar. El precio lo cerró Nico el
  // 23-ago-2026, así que ahora salen con total y anticipo del 50%.
  const cinco = await firmaAbierta({}, { modelo: "5-stall" });
  assert.equal(cinco.status, 200);
  assert.match(cinco.mail.text, /Total US\$41,500\.00/);
  assert.match(cinco.mail.text, /anticipo US\$20,750\.00/);

  const seis = await firmaAbierta({}, { modelo: "6-stall", cantidad: "2" });
  assert.equal(seis.status, 200);
  assert.match(seis.mail.text, /Total US\$93,000\.00/);
  assert.match(seis.mail.text, /anticipo US\$46,500\.00/);
  assert.equal(seis.mail.attachments.length, 1);
});

test("ningún modelo del catálogo quedó sin precio", async () => {
  // Si alguno vuelve a quedar en "On request", el cliente lo puede elegir y
  // después no hay acuerdo que firmar: mejor que salte acá.
  for (const m of modelosElegibles()) {
    assert.equal(esAPedido(m), false, m.etiqueta);
    assert.ok(Number(m.quote.unit_price) > 0, m.etiqueta);
  }
});

test("la forma de entrega elegida viaja al acuerdo, y una inventada no", async () => {
  const { mail } = await firmaAbierta({}, { modelo: "2-stall" });
  assert.match(mail.html, /Long Beach, CA/);

  const inventada = await firmaAbierta({}, { entrega: "Free helicopter drop" });
  assert.doesNotMatch(inventada.mail.html, /helicopter/i);
  // Cae en la primera de la lista: el retiro por Miami.
  assert.match(inventada.mail.html, /Miami, FL/);
});

test("un modelo con precio SÍ exige firma aunque digan que es un pedido", async () => {
  const { status, json, mail } = await firmaAbierta(
    { modo: "pedido", signature: "", accepted: true },
    { modelo: "2-stall" }
  );

  assert.equal(status, 400);
  assert.equal(json.ok, false);
  assert.equal(mail, null);
});
