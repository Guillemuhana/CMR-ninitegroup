// Prueba local del PDF firmado, sin mandar mails ni levantar el servidor.
//
//   node scripts/probar-pdf-cotizacion.mjs jose-gamez
//
// Escribe el PDF en la carpeta temporal del proyecto para poder abrirlo y
// revisar que las 9 secciones y las fotos salgan bien.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

import { modelos, calcular } from "../api/_cotizacion/datos.js";
import { buscarCotizacion, cotizaciones } from "../api/_cotizacion/clientes.js";
import { construirPDF } from "../api/_cotizacion/pdf.js";

const slug = process.argv[2] || cotizaciones[0].slug;
const cliente = buscarCotizacion(slug);
if (!cliente) {
  console.error(`No existe la cotización "${slug}".`);
  process.exit(1);
}

const modelo = modelos[cliente.modelo];
const d = calcular(modelo, cliente);

/**
 * Un trazo de firma real (PNG RGBA con transparencia), igual en forma al que
 * produce canvas.toDataURL() en el navegador. Sirve para comprobar que la firma
 * se estampa de verdad: un PNG inválido lo descartaría el try/catch del PDF y
 * el error pasaría desapercibido.
 */
function firmaDePrueba(w = 500, h = 130) {
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

  const bruto = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const fila = y * (1 + w * 4);
    for (let x = 0; x < w; x++) {
      const p = fila + 1 + x * 4;
      const enTrazo = Math.abs(y - (h / 2 + Math.sin(x / 40) * 30)) < 2;
      if (enTrazo) {
        bruto[p] = 22;
        bruto[p + 1] = 54;
        bruto[p + 2] = 92;
        bruto[p + 3] = 255;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", deflateSync(bruto)),
    trozo("IEND", Buffer.alloc(0)),
  ]);
  return "data:image/png;base64," + png.toString("base64");
}

const firmaFalsa = firmaDePrueba();

const inicio = Date.now();
const pdf = construirPDF({
  modelo,
  cliente,
  d,
  firma: {
    imagen: firmaFalsa,
    mensaje: "Please confirm the exterior color before production starts.",
    ip: "203.0.113.42",
    firmadoEl: "Aug 7, 2026, 5:12 PM",
  },
});

// Fuera de public/ a propósito: es un borrador de prueba, no se publica.
const destino = join(process.cwd(), `_prueba-cotizacion-${slug}.pdf`);
writeFileSync(destino, pdf);

console.log(`✓ PDF generado en ${Date.now() - inicio} ms`);
console.log(`  ${(pdf.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`  ${destino}`);
