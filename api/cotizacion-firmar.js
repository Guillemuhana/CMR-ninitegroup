// Recibe la firma electrónica de una cotización, arma el Purchase Agreement
// firmado en PDF y lo manda por mail a NINIT y al cliente.
//
// Es el reemplazo de includes/form.php + includes/signing.php del plugin de
// WordPress. Diferencia importante de seguridad: el precio, el modelo y los
// datos del cliente NO se leen de lo que manda el navegador — se leen de
// api/_cotizacion/clientes.js. Del cliente solo se acepta el trazo de la firma
// y una nota opcional, así que nadie puede firmar una cotización con otro
// precio manipulando el formulario.
//
// Variables de entorno (las mismas del reporte diario, ya configuradas):
//   GMAIL_USER           cuenta que envía
//   GMAIL_APP_PASSWORD   contraseña de aplicación de Google
//   COTIZACION_EMAIL_TO  opcional, destinatario. Default: sales@ninitgroup.com

import nodemailer from "nodemailer";

import { modelos, calcular, usd, fechaLarga } from "./_cotizacion/datos.js";
import { buscarCotizacion } from "./_cotizacion/clientes.js";
import { construirPDF } from "./_cotizacion/pdf.js";

const DESTINO_DEFAULT = "sales@ninitgroup.com";
const MAX_FIRMA = 400_000; // el dataURL de un trazo ronda los 10-40 KB
const MAX_NOTA = 1500;

const ERROR_GENERICO =
  "Something went wrong. Please try again or call us at +1 (786) 385-9402.";

/** IP real del firmante detrás del proxy de Vercel — va al PDF como auditoría. */
function ipDe(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim()) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "";
}

function cuerpoMail({ cliente, modelo, d, mensaje, firmadoEl, ip }) {
  const fila = (k, v) => `
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid #EEF0F4;font:400 13px Arial,sans-serif;color:#6B7383">${k}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #EEF0F4;font:700 13px Arial,sans-serif;color:#171B26;text-align:right">${v}</td>
    </tr>`;

  return `<div style="background:#F7F8FA;padding:24px 0;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E6E9EF">
    <div style="background:#16365C;padding:22px 24px">
      <div style="font:700 19px Arial,sans-serif;color:#fff;letter-spacing:.5px">NINI T-GROUP</div>
      <div style="font:400 12px Arial,sans-serif;color:#AFC3DC;margin-top:2px">Purchase Agreement firmado</div>
    </div>
    <div style="height:3px;background:#B58D42"></div>
    <div style="padding:22px 24px">
      <p style="font:400 14px/1.6 Arial,sans-serif;color:#171B26;margin:0 0 16px">
        <strong>${cliente.nombre}</strong> firmó electrónicamente el acuerdo
        <strong>${d.quote_number}</strong>. El PDF firmado va adjunto.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #E6E9EF;border-radius:10px">
        ${fila("Cliente", cliente.nombre)}
        ${fila("Email", cliente.email || "—")}
        ${cliente.telefono ? fila("Teléfono", cliente.telefono) : ""}
        ${fila("Entrega", cliente.ubicacion)}
        ${fila("Unidad", modelo.name)}
        ${fila("Cantidad", d.quantity)}
        ${fila("Total", usd(d.total))}
        ${fila("Anticipo", `${usd(d.down_payment)} (${d.down_pct}%)`)}
        ${fila("Saldo", usd(d.balance))}
        ${fila("Firmado", firmadoEl)}
        ${ip ? fila("IP", ip) : ""}
      </table>
      ${
        mensaje
          ? `<div style="margin-top:16px;padding:14px 16px;background:#F7F8FA;border-radius:10px">
               <div style="font:700 11px Arial,sans-serif;color:#6B7383;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Nota del cliente</div>
               <div style="font:400 13px/1.6 Arial,sans-serif;color:#171B26;white-space:pre-wrap">${mensaje}</div>
             </div>`
          : ""
      }
      <div style="margin-top:18px;padding:14px 16px;background:#FFF8E9;border-radius:10px;font:400 13px/1.5 Arial,sans-serif;color:#7A5B18">
        Siguiente paso: emitir la factura del anticipo por <strong>${usd(d.down_payment)}</strong>.
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

    const cliente = buscarCotizacion(String(quote || ""));
    if (!cliente) {
      return res.status(404).json({ ok: false, error: "This quote is no longer available." });
    }

    const modelo = modelos[cliente.modelo];
    if (!modelo) {
      console.error(`cotizacion-firmar: modelo "${cliente.modelo}" inexistente`);
      return res.status(500).json({ ok: false, error: ERROR_GENERICO });
    }

    if (!accepted) {
      return res
        .status(400)
        .json({ ok: false, error: "Please tick the acceptance box before signing." });
    }

    const firmaDataUrl = String(signature || "");
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(firmaDataUrl)) {
      return res
        .status(400)
        .json({ ok: false, error: "Please sign in the signature box before submitting." });
    }
    if (firmaDataUrl.length > MAX_FIRMA) {
      return res.status(413).json({ ok: false, error: "The signature image is too large." });
    }

    const nota = String(message || "").trim().slice(0, MAX_NOTA);
    const ip = ipDe(req);
    const d = calcular(modelo, cliente);
    const firmadoEl = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const pdf = construirPDF({
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

    const destino = (process.env.COTIZACION_EMAIL_TO || DESTINO_DEFAULT)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: usuario, pass: clave },
    });

    const nombreArchivo = `Purchase-Agreement-${d.quote_number}-signed.pdf`;
    const adjunto = [{ filename: nombreArchivo, content: pdf, contentType: "application/pdf" }];

    // El acuerdo firmado va ÚNICAMENTE a NINIT. Deliberado: el cliente no
    // recibe copia por mail (lo pidió así el equipo comercial), se le entrega
    // desde acá cuando corresponda, junto con la factura del anticipo.
    await transporter.sendMail({
      from: `"NINI T-GROUP" <${usuario}>`,
      to: destino,
      replyTo: cliente.email || undefined,
      subject: `FIRMADO · ${d.quote_number} · ${cliente.nombre} · ${usd(d.total)}`,
      text:
        `${cliente.nombre} firmó el acuerdo ${d.quote_number} (${modelo.name}).\n` +
        `Total ${usd(d.total)} · anticipo ${usd(d.down_payment)} · saldo ${usd(d.balance)}.\n` +
        `Firmado: ${firmadoEl}${ip ? " · IP " + ip : ""}.\n` +
        (nota ? `\nNota del cliente:\n${nota}\n` : "") +
        `\nEl PDF firmado va adjunto.`,
      html: cuerpoMail({ cliente, modelo, d, mensaje: nota, firmadoEl, ip }),
      attachments: adjunto,
    });

    console.log(
      `cotizacion-firmar: ${cliente.slug} firmada por ${cliente.nombre} (${fechaLarga(d.quote_date)}), PDF ${(pdf.length / 1024).toFixed(0)} KB`
    );

    // El PDF no se le manda por mail al cliente ni viaja en la respuesta: la
    // única copia sale a NINIT. Solo se confirma que quedó firmado.
    return res.status(200).json({ ok: true, filename: nombreArchivo });
  } catch (e) {
    console.error("cotizacion-firmar:", e);
    return res.status(500).json({ ok: false, error: ERROR_GENERICO });
  }
}
