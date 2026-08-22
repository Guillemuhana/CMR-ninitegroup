// Genera la página de una cotización emitida a un cliente.
//
//   node scripts/generar-cotizacion.mjs            -> genera todas
//   node scripts/generar-cotizacion.mjs jose-gamez -> genera solo esa
//   node scripts/generar-cotizacion.mjs ntg-3stall -> la cotización ABIERTA,
//        la que se manda sin nombre para que la complete quien la recibe
//
// Sale un archivo suelto en public/cotizacion/<slug>.html que Vercel sirve tal
// cual, sin pasar por React. Los datos del cliente y del modelo viven en
// api/_cotizacion/ para que la función que recibe la firma use exactamente los
// mismos números que se le mostraron al cliente.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { modelos } from "../api/_cotizacion/datos.js";
import { todasLasCotizaciones, archivoDe } from "../api/_cotizacion/clientes.js";
import { render, ASSET_VERSION } from "../api/_cotizacion/plantilla.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = join(RAIZ, "public", "cotizacion");

function generar(cliente) {
  const modelo = modelos[cliente.modelo];
  if (!modelo) {
    throw new Error(
      `La cotización "${cliente.slug}" apunta al modelo "${cliente.modelo}", que no existe en api/_cotizacion/datos.js.`
    );
  }

  const html = render({ modelo, cliente });
  const archivo = `${archivoDe(cliente)}.html`;
  const destino = join(SALIDA, archivo);

  mkdirSync(SALIDA, { recursive: true });
  writeFileSync(destino, html, "utf8");

  return { destino, archivo, bytes: Buffer.byteLength(html) };
}

const todas = todasLasCotizaciones();
const pedido = process.argv[2];
const objetivo = pedido ? todas.filter((c) => c.slug === pedido) : todas;

if (pedido && !objetivo.length) {
  console.error(`No hay ninguna cotización con el slug "${pedido}".`);
  console.error(`Disponibles: ${todas.map((c) => c.slug).join(", ")}`);
  process.exit(1);
}

console.log(`Assets v${ASSET_VERSION}`);
for (const cliente of objetivo) {
  const { destino, archivo, bytes } = generar(cliente);
  const quien = cliente.abierta ? "COTIZACIÓN ABIERTA (sin nombre)" : cliente.nombre;
  console.log(`✓ ${quien} → ${(bytes / 1024).toFixed(1)} KB`);
  console.log(`  ${destino}`);
  console.log(`  /cotizacion/${archivo}`);
}
