// Recibe la firma electrónica de una cotización, arma el Purchase Agreement
// firmado en PDF y lo manda por mail a NINIT. El cliente NUNCA recibe copia.
//
// Es el reemplazo de includes/form.php + includes/signing.php del plugin de
// WordPress. Atiende las dos variantes:
//
//   - COTIZACIÓN EMITIDA: el precio, el modelo y los datos del cliente NO se
//     leen de lo que manda el navegador — se leen de api/_cotizacion/clientes.js.
//     Del cliente solo se acepta el trazo de la firma y una nota opcional.
//   - COTIZACIÓN ABIERTA: se manda sin nombre y la completa quien la recibe, así
//     que sus datos de contacto sí vienen del navegador (sanitizados). El precio
//     sigue sin venir de ahí: es el precio de lista del modelo, y las opciones
//     se validan contra las listas de datos.js. Nadie puede firmar con otro
//     precio manipulando el formulario.
//
// Variables de entorno (las mismas del reporte diario, ya configuradas):
//   GMAIL_USER                    cuenta que envía
//   GMAIL_APP_PASSWORD            contraseña de aplicación de Google
//   COTIZACION_EMAIL_TO           opcional. Default: sales@ninitgroup.com + ninitgroup@gmail.com
//   COTIZACION_ABIERTA_EMAIL_TO   opcional, para la abierta. Mismo default

import nodemailer from "nodemailer";

import {
  modelos,
  esAPedido,
  opcionesCliente,
  opcionesInterior,
  calcular,
  usd,
  fechaLarga,
} from "./_cotizacion/datos.js";
import { buscarCotizacion } from "./_cotizacion/clientes.js";
import { construirPDF } from "./_cotizacion/pdf.js";

// El acuerdo firmado lo miran las DOS casillas del equipo: sales@ (la
// comercial, que es la que firma los acuerdos) y ninitgroup@ (la que se mira
// todos los días). Al cliente no se le manda copia nunca: se la manda el
// equipo a mano cuando corresponde.
const DESTINO_NINIT = "sales@ninitgroup.com, ninitgroup@gmail.com";
const DESTINO_DEFAULT = DESTINO_NINIT;
// La cotización abierta la puede firmar cualquiera que reciba el link, pero el
// aviso va a las mismas dos casillas.
const DESTINO_ABIERTA = DESTINO_NINIT;
const MAX_FIRMA = 400_000; // el dataURL de un trazo ronda los 10-40 KB
const MAX_NOTA = 1500;

const ERROR_GENERICO =
  "Something went wrong. Please try again or call us at +1 (786) 385-9402.";

/** Hoy en Miami, como "YYYY-MM-DD". */
function hoyISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

const limpio = (v, max) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Completa la cotización abierta con lo que escribió el cliente.
 *
 * Se acepta del navegador SOLO lo que el cliente puede decidir: sus datos de
 * contacto, la cantidad y las opciones — y las opciones tienen que estar en las
 * listas de datos.js, si no se cae a la primera. El precio sale del precio de
 * lista del modelo y el anticipo se recalcula al 50% del total, porque el del
 * modelo es el de una sola unidad.
 */
function completarAbierta(base, datos) {
  const d = datos && typeof datos === "object" ? datos : {};

  // El modelo lo elige el cliente, pero tiene que ser uno del catálogo.
  const clave = modelos[limpio(d.modelo, 40)] ? limpio(d.modelo, 40) : base.modelo;
  const modelo = modelos[clave];

  const nombre = limpio(d.nombre, 80);
  const email = limpio(d.email, 120);
  const ubicacion = limpio(d.ubicacion, 80);

  if (nombre.length < 2) return { error: "Please enter your full name." };
  if (!EMAIL_RE.test(email)) return { error: "Please enter a valid email address." };
  if (ubicacion.length < 2) {
    return { error: "Please enter the city and state for delivery or pickup." };
  }

  const cantidad = Math.min(
    Math.max(parseInt(d.cantidad, 10) || 1, 1),
    opcionesCliente.cantidadMaxima
  );
  const elegida = (valor, lista) => {
    const v = limpio(valor, 120);
    return lista.includes(v) ? v : lista[0];
  };
  const exterior = elegida(d.exterior, opcionesCliente.exterior);
  const interior = elegida(d.interior, opcionesInterior());
  const entrega = elegida(d.entrega, opcionesCliente.entrega);

  // Referencia corta para poder encontrar después este acuerdo concreto: la
  // cotización abierta la firma cualquiera, no hay un número por cliente.
  const ref = Math.random().toString(36).slice(2, 6).toUpperCase();

  return {
    modelo,
    cliente: {
      ...base,
      modelo: clave,
      fecha: hoyISO(),
      nombre,
      email,
      empresa: limpio(d.empresa, 80),
      telefono: limpio(d.telefono, 40),
      ubicacion,
      config_note: `${exterior} exterior · ${interior} interior · ${entrega}`,
      opciones: [
        ["Model", modelo.etiqueta || modelo.name],
        ["Exterior Color", exterior],
        ["Interior Finish", interior],
        ["Delivery Method", entrega],
      ],
      precio: {
        quote_number: `${String(modelo.quote.quote_number).replace(/\s+/g, "-")}-${ref}`,
        quantity: cantidad,
        down_payment: "", // vacío = 50% del total, lo calcula calcular()
        discount: 0,
      },
    },
  };
}

/** IP real del firmante detrás del proxy de Vercel — va al PDF como auditoría. */
function ipDe(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim()) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "";
}

// En la cotización abierta el nombre, el mail y la nota los escribe un
// desconocido: se escapan antes de meterlos en el HTML del aviso.
const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function cuerpoMail({ cliente, modelo, d, mensaje, firmadoEl, ip, pedido }) {
  const fila = (k, v) => `
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid #EEF0F4;font:400 13px Arial,sans-serif;color:#6B7383">${k}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #EEF0F4;font:700 13px Arial,sans-serif;color:#171B26;text-align:right">${esc(v)}</td>
    </tr>`;

  return `<div style="background:#F7F8FA;padding:24px 0;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E6E9EF">
    <div style="background:#16365C;padding:22px 24px">
      <div style="font:700 19px Arial,sans-serif;color:#fff;letter-spacing:.5px">NINI T-GROUP</div>
      <div style="font:400 12px Arial,sans-serif;color:#AFC3DC;margin-top:2px">${
        pedido ? "Pedido de cotización" : "Purchase Agreement firmado"
      }${cliente.abierta ? " · cotización abierta (link público)" : ""}</div>
    </div>
    <div style="height:3px;background:#B58D42"></div>
    <div style="padding:22px 24px">
      <p style="font:400 14px/1.6 Arial,sans-serif;color:#171B26;margin:0 0 16px">
        ${
          pedido
            ? `<strong>${esc(cliente.nombre)}</strong> pidió cotización del
               <strong>${esc(modelo.name)}</strong>, que no tiene precio de lista.
               Hay que pasarle precio y emitirle el acuerdo.`
            : `<strong>${esc(cliente.nombre)}</strong> firmó electrónicamente el acuerdo
               <strong>${d.quote_number}</strong>. El PDF firmado va adjunto.`
        }
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #E6E9EF;border-radius:10px">
        ${fila("Cliente", cliente.nombre)}
        ${fila("Email", cliente.email || "—")}
        ${cliente.telefono ? fila("Teléfono", cliente.telefono) : ""}
        ${fila("Entrega", cliente.ubicacion)}
        ${fila("Unidad", modelo.name)}
        ${fila("Cantidad", d.quantity)}
        ${(cliente.opciones || []).map(([k, v]) => fila(k, v)).join("")}
        ${pedido ? fila("Precio", "A cotizar — sin precio de lista") : fila("Total", usd(d.total))}
        ${pedido ? "" : fila("Anticipo", `${usd(d.down_payment)} (${d.down_pct}%)`)}
        ${pedido ? "" : fila("Saldo", usd(d.balance))}
        ${fila(pedido ? "Recibido" : "Firmado", firmadoEl)}
        ${ip ? fila("IP", ip) : ""}
      </table>
      ${
        mensaje
          ? `<div style="margin-top:16px;padding:14px 16px;background:#F7F8FA;border-radius:10px">
               <div style="font:700 11px Arial,sans-serif;color:#6B7383;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Nota del cliente</div>
               <div style="font:400 13px/1.6 Arial,sans-serif;color:#171B26;white-space:pre-wrap">${esc(mensaje)}</div>
             </div>`
          : ""
      }
      <div style="margin-top:18px;padding:14px 16px;background:#FFF8E9;border-radius:10px;font:400 13px/1.5 Arial,sans-serif;color:#7A5B18">
        ${
          pedido
            ? `Siguiente paso: pasarle precio del <strong>${esc(
                modelo.etiqueta || modelo.short
              )}</strong> a <strong>${esc(cliente.email)}</strong>${
                cliente.telefono ? ` / <strong>${esc(cliente.telefono)}</strong>` : ""
              } y emitirle el acuerdo para firmar.`
            : cliente.abierta
              ? `Cliente nuevo, llegó por el link público: contactarlo a <strong>${esc(cliente.email)}</strong>${
                  cliente.telefono ? ` / <strong>${esc(cliente.telefono)}</strong>` : ""
                } y emitir la factura del anticipo por <strong>${usd(d.down_payment)}</strong>.`
              : `Siguiente paso: emitir la factura del anticipo por <strong>${usd(d.down_payment)}</strong>.`
        }
      </div>
    </div>
  </div>
</div>`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { quote, signature, accepted, message, company_url } = body;

    // Honeypot: un bot completa el campo oculto; una persona nunca lo ve.
    if (company_url) {
      return res.status(200).json({ ok: true, filename: null });
    }

    const base = buscarCotizacion(String(quote || ""));
    if (!base) {
      return res.status(404).json({ ok: false, error: "This quote is no longer available." });
    }

    // En la abierta, el modelo y los datos del cliente llegan del formulario y
    // hay que validarlos; en la emitida ya vienen cerrados y se ignora lo que
    // mande el navegador.
    let cliente = base;
    let modelo = modelos[base.modelo];
    if (base.abierta) {
      const completada = completarAbierta(base, body.cliente);
      if (completada.error) {
        return res.status(400).json({ ok: false, error: completada.error });
      }
      cliente = completada.cliente;
      modelo = completada.modelo;
    }

    if (!modelo) {
      console.error(`cotizacion-firmar: modelo "${base.modelo}" inexistente`);
      return res.status(500).json({ ok: false, error: ERROR_GENERICO });
    }

    // Un modelo sin precio de lista no se puede firmar: lo que llega es un
    // pedido de cotización, sin acuerdo ni firma.
    const pedido = !!cliente.abierta && esAPedido(modelo);

    const firmaDataUrl = String(signature || "");
    if (!pedido) {
      if (!accepted) {
        return res
          .status(400)
          .json({ ok: false, error: "Please tick the acceptance box before signing." });
      }
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(firmaDataUrl)) {
        return res
          .status(400)
          .json({ ok: false, error: "Please sign in the signature box before submitting." });
      }
      if (firmaDataUrl.length > MAX_FIRMA) {
        return res.status(413).json({ ok: false, error: "The signature image is too large." });
      }
    }

    const nota = String(message || "").trim().slice(0, MAX_NOTA);
    const ip = ipDe(req);
    const d = calcular(modelo, cliente);
    const firmadoEl = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const pdf = pedido
      ? null
      : construirPDF({
          modelo,
          cliente,
          d,
          firma: { imagen: firmaDataUrl, mensaje: nota, ip, firmadoEl },
        });

    const usuario = process.env.GMAIL_USER;
    const clave = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
    if (!usuario || !clave) {
      console.error("cotizacion-firmar: faltan GMAIL_USER / GMAIL_APP_PASSWORD");
      return res.status(500).json({ ok: false, error: ERROR_GENERICO });
    }

    const destino = (
      cliente.abierta
        ? process.env.COTIZACION_ABIERTA_EMAIL_TO || DESTINO_ABIERTA
        : process.env.COTIZACION_EMAIL_TO || DESTINO_DEFAULT
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: usuario, pass: clave },
    });

    const nombreArchivo = pedido ? null : `Purchase-Agreement-${d.quote_number}-signed.pdf`;
    const adjunto = pedido
      ? []
      : [{ filename: nombreArchivo, content: pdf, contentType: "application/pdf" }];

    // El acuerdo firmado va ÚNICAMENTE a NINIT. Deliberado: el cliente no
    // recibe copia por mail (lo pidió así el equipo comercial), se le entrega
    // desde acá cuando corresponda, junto con la factura del anticipo.
    await transporter.sendMail({
      from: `"NINI T-GROUP" <${usuario}>`,
      to: destino,
      replyTo: cliente.email || undefined,
      subject: pedido
        ? `PEDIDO DE COTIZACIÓN · ${modelo.etiqueta || modelo.short} · ${cliente.nombre} · ${d.quantity} u.`
        : `${cliente.abierta ? "NUEVO CLIENTE · FIRMADO" : "FIRMADO"} · ${
            d.quote_number
          } · ${cliente.nombre} · ${usd(d.total)}`,
      text:
        (pedido
          ? `${cliente.nombre} pidió cotización del ${modelo.name} (${d.quantity} u.).\n` +
            `Ese modelo no tiene precio de lista: hay que pasarle precio y emitirle el acuerdo.\n`
          : `${cliente.nombre} firmó el acuerdo ${d.quote_number} (${modelo.name}).\n`) +
        (cliente.abierta ? `Llegó por el link público de la cotización abierta.\n` : "") +
        `Contacto: ${cliente.email}${cliente.telefono ? " · " + cliente.telefono : ""} · ${cliente.ubicacion}.\n` +
        (pedido
          ? ""
          : `Total ${usd(d.total)} · anticipo ${usd(d.down_payment)} · saldo ${usd(d.balance)}.\n`) +
        (cliente.opciones || []).map(([k, v]) => `${k}: ${v}\n`).join("") +
        (pedido ? `Recibido: ${firmadoEl}` : `Firmado: ${firmadoEl}`) +
        `${ip ? " · IP " + ip : ""}.\n` +
        (nota ? `\nNota del cliente:\n${nota}\n` : "") +
        (pedido ? "" : `\nEl PDF firmado va adjunto.`),
      html: cuerpoMail({ cliente, modelo, d, mensaje: nota, firmadoEl, ip, pedido }),
      attachments: adjunto,
    });

    console.log(
      `cotizacion-firmar: ${cliente.slug}${cliente.abierta ? " (abierta)" : ""} ${
        pedido ? "PEDIDO" : "firmada"
      } por ${cliente.nombre} · ${modelo.etiqueta || modelo.short} (${fechaLarga(
        d.quote_date
      )}) -> ${destino.join(", ")}${pdf ? `, PDF ${(pdf.length / 1024).toFixed(0)} KB` : ""}`
    );

    // El PDF no se le manda por mail al cliente ni viaja en la respuesta: la
    // única copia sale a NINIT. Solo se confirma que quedó firmado.
    return res.status(200).json({ ok: true, pedido, filename: nombreArchivo });
  } catch (e) {
    console.error("cotizacion-firmar:", e);
    return res.status(500).json({ ok: false, error: ERROR_GENERICO });
  }
}
