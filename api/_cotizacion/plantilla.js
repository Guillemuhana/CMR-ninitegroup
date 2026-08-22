// Render del Purchase Agreement como página HTML autónoma.
//
// Es el port de templates/quote-content.php del plugin. Rinde dos variantes del
// MISMO documento (mismas fotos, mismas specs, mismo contrato):
//
//   - EMITIDA: va a nombre de un cliente y con el precio cerrado con él. No hay
//     nada que completar: leer, aceptar, firmar y enviar.
//   - ABIERTA (cliente.abierta): se manda sin nombre, a cualquiera. El que la
//     recibe escribe sus datos, elige cantidad, color, terminación y entrega —
//     y los totales se recalculan solos mientras elige. Precio de lista.
//
// Las clases CSS son las mismas que usa quote.css, que se copió tal cual del
// plugin: por eso el documento se ve igual que en WordPress.

import {
  empresa,
  logo,
  firmaRep,
  opcionesCliente,
  opcionesInterior,
  modelosElegibles,
  esAPedido,
  terminos,
  personalizacion,
  terminaciones,
  contrato,
  calcular,
  usd,
  fechaLarga,
} from "./datos.js";

// Subir esto cuando cambien quote.css o firma.js, para que el navegador del
// cliente no siga mostrando la versión vieja en caché.
export const ASSET_VERSION = "9";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

/**
 * Los términos vienen como "Título: cuerpo" y el plugin pone el título en
 * negrita. Mismo criterio acá (equivalente al preg_match de la plantilla).
 */
function terminoConTitulo(t) {
  const m = /^([A-Z][A-Za-z0-9 ()/'&-]{2,60}):\s([\s\S]+)$/.exec(t);
  return m
    ? `<strong>${esc(m[1])}:</strong> ${esc(m[2])}`
    : esc(t);
}

/** Hoy en Miami, como "YYYY-MM-DD". */
function hoyISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

const opcion = (v) => `<option value="${esc(v)}">${esc(v)}</option>`;

export function render({ modelo, cliente: emitida }) {
  // Cotización ABIERTA: la que se manda sin nombre para que la complete quien
  // la reciba. Mismo documento y mismo precio de lista; lo único distinto es
  // que los datos del cliente, en vez de venir impresos, los escribe él.
  const abierta = !!emitida.abierta;
  // Una cotización abierta no tiene fecha de emisión: vale el día en que se
  // abre. Se imprime la de hoy y firma.js la refresca en el navegador, para
  // que el documento nunca se vea vencido por más que la página sea fija.
  const cliente = emitida.fecha ? emitida : { ...emitida, fecha: hoyISO() };

  const d = calcular(modelo, cliente);
  const notaConfig = cliente.config_note || modelo.config_note;
  const anio = cliente.fecha.slice(0, 4);

  // En la abierta, todo lo que dependa de la cantidad se recalcula en vivo:
  // firma.js busca estos data-nq y les cambia el texto. Sin cantidad elegida
  // el documento ya muestra el precio de una unidad.
  const vivo = (campo) => (abierta ? ` data-nq="${campo}"` : "");

  // La cotización abierta lleva TODOS los modelos adentro: el cliente elige y
  // firma.js le cambia fotos, ficha, nombre y precios sin recargar la página.
  const catalogo = modelosElegibles().map((m) => ({
    clave: m.clave,
    etiqueta: m.etiqueta,
    nota: m.nota || "",
    nombre: m.name,
    numero: m.quote.quote_number || "",
    precio: esAPedido(m) ? null : Number(m.quote.unit_price) || 0,
    entrega: m.quote.delivery_time || "",
    notaConfig: m.config_note || "",
    hero: m.hero || "",
    floorplan: m.floorplan || "",
    interior: m.interior || [],
    specs: m.specs || [],
  }));
  const claseHoy = abierta ? " nq-hoy" : "";
  const li = (items) => items.map((i) => `<li>${esc(i)}</li>`).join("");

  // Bloque "Your Quote". En la cotización emitida es un resumen cerrado; en la
  // abierta es el formulario donde el cliente se identifica y arma su unidad.
  const seccionPedido = abierta
    ? `	<section class="nq-block nq-request" id="ninit-request">
		<h3 class="nq-h2">Build Your Quote</h3>
		<p class="nq-agree-intro">Fill in your details and choose the configuration you want. Every option below is included in the price — none of them costs extra. The totals update as you choose.</p>

		<form class="nq-form" id="nq-form" data-quote="${esc(cliente.slug)}" data-abierta="1" data-modelo="${esc(cliente.modelo)}">
			<div class="nq-fdivider nq-fdivider-top">Your details <span class="nq-optional">— unit: <span data-nq="modelo-etiqueta">${esc(
        modelo.etiqueta || modelo.short
      )}</span>, chosen at the top of the page</span></div>
			<div class="nq-form-grid">
				<div class="nq-ffield"><label>Full Name <span class="nq-req">*</span></label><input type="text" name="nombre" maxlength="80" autocomplete="name" placeholder="First and last name" required></div>
				<div class="nq-ffield"><label>Company <span class="nq-optional">(optional)</span></label><input type="text" name="empresa" maxlength="80" autocomplete="organization"></div>
				<div class="nq-ffield"><label>Email <span class="nq-req">*</span></label><input type="email" name="email" maxlength="120" autocomplete="email" placeholder="you@company.com" required></div>
				<div class="nq-ffield"><label>Phone <span class="nq-optional">(optional)</span></label><input type="tel" name="telefono" maxlength="40" autocomplete="tel" placeholder="+1 (___) ___-____"></div>
				<div class="nq-ffield nq-full"><label>Delivery / Pickup Location <span class="nq-req">*</span></label><input type="text" name="ubicacion" maxlength="80" placeholder="City, State" required></div>

				<div class="nq-fdivider nq-full">Your configuration — all options below are included at no extra cost</div>

				<div class="nq-ffield"><label>Units</label><select name="cantidad">${Array.from(
					{ length: opcionesCliente.cantidadMaxima },
					(_, i) => `<option value="${i + 1}">${i + 1}</option>`
				).join("")}</select></div>
				<div class="nq-ffield"><label>Delivery Method</label><select name="entrega">${opcionesCliente.entrega.map(opcion).join("")}</select></div>
				<div class="nq-ffield"><label>Exterior Color</label><select name="exterior">${opcionesCliente.exterior.map(opcion).join("")}</select></div>
				<div class="nq-ffield"><label>Interior Finish</label><select name="interior">${opcionesInterior().map(opcion).join("")}</select></div>

				<div class="nq-ffield nq-full"><label>Additional Notes <span class="nq-optional">(optional)</span></label><textarea name="message" rows="3" maxlength="1500" placeholder="Anything you'd like us to know before we start production…"></textarea></div>
			</div>
			<div class="nq-hp" aria-hidden="true"><input type="text" name="company_url" tabindex="-1" autocomplete="off"></div>
		</form>

		<div class="nq-client-card">
			<div class="nq-client-row"><span>Prepared for</span><strong data-nq="name" data-vacio="—">—</strong></div>
			<div class="nq-client-row"><span>Email</span><strong data-nq="email" data-vacio="—">—</strong></div>
			<div class="nq-client-row"><span>Delivery</span><strong data-nq="loc" data-vacio="—">—</strong></div>
			<div class="nq-client-row"><span>Unit</span><strong data-nq="modelo-nombre">${esc(modelo.name)}</strong></div>
			<div class="nq-client-row"><span>Quantity</span><strong data-nq="qty">${d.quantity}</strong></div>
			<div class="nq-client-row"><span>Exterior color</span><strong data-nq="exterior">${esc(opcionesCliente.exterior[0])}</strong></div>
			<div class="nq-client-row"><span>Interior finish</span><strong data-nq="interior-fin">${esc(opcionesInterior()[0])}</strong></div>
			<div class="nq-client-row"><span>Delivery method</span><strong data-nq="entrega">${esc(opcionesCliente.entrega[0])}</strong></div>
			<div class="nq-client-row nq-client-total"><span>Total price</span><strong data-nq="total">${esc(usd(d.total))}</strong></div>
		</div>
		<p class="nq-scroll-hint">Scroll down to review the full proposal, accept it, and sign.</p>
	</section>`
    : `	<section class="nq-block nq-request" id="ninit-request">
		<h3 class="nq-h2">Your Quote</h3>
		<p class="nq-agree-intro">This agreement has been issued specifically for you, with the price and configuration already confirmed by our team. There is nothing to fill in — review the proposal below, sign, and send.</p>

		<div class="nq-client-card">
			<div class="nq-client-row"><span>Prepared for</span><strong>${esc(cliente.nombre)}</strong></div>
			${cliente.email ? `<div class="nq-client-row"><span>Email</span><strong>${esc(cliente.email)}</strong></div>` : ""}
			${cliente.telefono ? `<div class="nq-client-row"><span>Phone</span><strong>${esc(cliente.telefono)}</strong></div>` : ""}
			<div class="nq-client-row"><span>Delivery</span><strong>${esc(cliente.ubicacion)}</strong></div>
			<div class="nq-client-row"><span>Unit</span><strong>${esc(modelo.name)}</strong></div>
			<div class="nq-client-row"><span>Quantity</span><strong>${d.quantity}</strong></div>
			${d.discount > 0 ? `<div class="nq-client-row"><span>Discount</span><strong>−${esc(usd(d.discount))}</strong></div>` : ""}
			<div class="nq-client-row nq-client-total"><span>Total price</span><strong>${esc(usd(d.total))}</strong></div>
		</div>

		<form class="nq-form" id="nq-form" data-quote="${esc(cliente.slug)}">
			<div class="nq-form-grid">
				<div class="nq-ffield nq-full"><label>Additional Notes <span class="nq-optional">(optional)</span></label><textarea name="message" rows="3" maxlength="1500" placeholder="Anything you'd like us to know before we start production…"></textarea></div>
			</div>
			<div class="nq-hp" aria-hidden="true"><input type="text" name="company_url" tabindex="-1" autocomplete="off"></div>
		</form>
		<p class="nq-scroll-hint">Scroll down to review the full proposal, accept it, and sign.</p>
	</section>`;

  // El selector de unidad va arriba de todo: es lo primero que elige el
  // cliente y manda sobre el resto del documento (fotos, ficha y precios).
  // Los radios viven fuera del <form> pero se le asocian con form="nq-form",
  // así el envío los sigue viendo.
  const selectorModelos = !abierta
    ? ""
    : `	<section class="nq-block nq-pick" id="nq-elegir">
		<h3 class="nq-h2">Choose Your Unit</h3>
		<p class="nq-pick-intro">Pick the trailer you want: the photos, specifications and pricing below change with it.</p>
		<div class="nq-modelos" role="radiogroup" aria-label="Choose your unit">
			${catalogo
        .map(
          (m) => `<label class="nq-modelo">
				<input type="radio" name="modelo" form="nq-form" value="${esc(m.clave)}"${
            m.clave === cliente.modelo ? " checked" : ""
          }>
				<span class="nq-modelo-foto">${
          m.hero
            ? `<img src="${esc(m.hero)}" alt="${esc(m.etiqueta)}" loading="lazy" decoding="async">`
            : `<span class="nq-modelo-sinfoto">${esc(m.etiqueta)}</span>`
        }</span>
				<span class="nq-modelo-txt">
					<strong>${esc(m.etiqueta)}</strong>
					<em>${esc(m.nota)}</em>
					<b>${m.precio ? esc(usd(m.precio)) : "Price on request"}</b>
				</span>
			</label>`
        )
        .join("")}
		</div>
	</section>

`;

  const cuerpo = `
<div class="nq-doc">
<div class="nq-sheet">

	<!-- Header -->
	<header class="nq-head">
		<div class="nq-head-brand">
			<img src="${esc(logo)}" alt="NINI T-GROUP" class="nq-logo">
		</div>
		<div class="nq-head-title">PURCHASE AGREEMENT</div>
	</header>

	<!-- Parties -->
	<section class="nq-parties">
		<div class="nq-from">
			<span class="nq-eyebrow">From</span>
			<strong>${esc(empresa.name)}</strong>
			<p>${esc(empresa.address)}</p>
			<p>Phone: ${esc(empresa.phone)}</p>
			<p>Email: ${esc(empresa.email)}</p>
			<p>${esc(empresa.website)}</p>
		</div>
		<div class="nq-billto">
			<span class="nq-eyebrow">Prepared For</span>
			${
        abierta
          ? `<strong class="nq-name-preview nq-sign-live" data-nq="name" data-vacio="Your name">Your name</strong>
			<p class="nq-sign-live" data-nq="empresa" data-vacio="Company (optional)">Company (optional)</p>
			<p class="nq-loc-preview nq-sign-live" data-nq="loc" data-vacio="Delivery location">Delivery location</p>
			<p class="nq-sign-live" data-nq="email" data-vacio="Email">Email</p>
			<p class="nq-sign-live" data-nq="tel" data-vacio="Phone (optional)">Phone (optional)</p>`
          : `<strong class="nq-name-preview">${esc(cliente.nombre)}</strong>
			${cliente.empresa ? `<p>${esc(cliente.empresa)}</p>` : ""}
			<p class="nq-loc-preview">${esc(cliente.ubicacion)}</p>
			${cliente.email ? `<p>${esc(cliente.email)}</p>` : ""}
			${cliente.telefono ? `<p>${esc(cliente.telefono)}</p>` : ""}`
      }
		</div>
	</section>

	<!-- Meta bar -->
	<section class="nq-meta">
		<div><span>Agreement No.</span><strong${vivo("quote-number")}>${esc(d.quote_number)}</strong></div>
		<div><span>Agreement Date</span><strong class="nq-fecha${claseHoy}">${esc(fechaLarga(d.quote_date))}</strong></div>
		<div><span>Delivery Time</span><strong>${esc(d.delivery_time)}</strong></div>
	</section>

	${selectorModelos}
	<!-- Model title -->
	<h2 class="nq-model-title"${vivo("modelo-nombre")}>${esc(modelo.name)}</h2>

	<!-- Hero + floorplan -->
	<section class="nq-hero${modelo.floorplan ? "" : " nq-hero-solo"}">
		<img src="${esc(modelo.hero)}" alt="${esc(modelo.short)} exterior" decoding="async"${vivo("hero")}>
		<img src="${esc(modelo.floorplan)}" alt="Floor plan" loading="lazy" decoding="async"${vivo("floorplan")}>
	</section>

	<section class="nq-interior"${vivo("interior")}>
		${modelo.interior
      .map((src) => `<img src="${esc(src)}" alt="Interior" loading="lazy" decoding="async">`)
      .join("\n\t\t")}
	</section>

	<!-- Specifications -->
	<section class="nq-block">
		<h3 class="nq-h2">Trailer Specifications</h3>
		<ul class="nq-specs"${vivo("specs")}>${li(modelo.specs)}</ul>
	</section>

	<!-- Feature gallery -->
	<section class="nq-block">
		<h3 class="nq-h2">Features &amp; Equipment</h3>
		<div class="nq-features">
			${modelo.features
        .map(
          (f) => `<div class="nq-feature">
				<div class="nq-feature-img"><img src="${esc(f.img)}" alt="${esc(f.title)}" loading="lazy"></div>
				<div class="nq-feature-txt"><h4>${esc(f.title)}</h4><p>${esc(f.desc)}</p></div>
			</div>`
        )
        .join("\n\t\t\t")}
		</div>
	</section>

	<!-- Customization -->
	<section class="nq-block">
		<h3 class="nq-h2">Customization Options <span class="nq-incl">(Included in Price)</span></h3>
		<ul class="nq-terms">${li(personalizacion)}</ul>

		<p class="nq-finishes-intro">NTG Surface Catalog — premium finishes available at no extra cost:</p>
		<div class="nq-finishes">
			${terminaciones
        .map(
          (fin, i) => `<div class="nq-finish">
				<div class="nq-finish-swatch"><img src="${esc(fin.img)}" alt="${esc(fin.name)}" loading="lazy"></div>
				<p class="nq-finish-num">${String(i + 1).padStart(2, "0")}</p>
				<p class="nq-finish-name">${esc(fin.name)}</p>
				<p class="nq-finish-type">${esc(fin.finish)}</p>
			</div>`
        )
        .join("\n\t\t\t")}
		</div>
	</section>

	<!-- Validity -->
	<section class="nq-validity">
		<p>For inquiries, modifications, or to place an order, contact us:</p>
		<p><strong>${esc(empresa.website)} | ${esc(empresa.email)} | ${esc(empresa.phone)}</strong></p>
		<p class="nq-small">This quotation is valid for 15 days from the date of issue. Prices subject to change without prior notice. Bank details will be provided upon request.</p>
	</section>

	${seccionPedido}

	<!-- Price table -->
	<section class="nq-block">
		<h3 class="nq-h2">Your Trailer Price</h3>
		<table class="nq-price">
			<thead><tr><th>Description</th><th class="nq-c">Qty</th><th class="nq-r">Amount</th></tr></thead>
			<tbody>
				<tr>
					<td>
						<strong${vivo("modelo-nombre")}>${esc(modelo.name)}</strong>
						${
              abierta
                ? `<span class="nq-sub" data-nq="nota-config">${esc(notaConfig || "")}</span>`
                : notaConfig
                  ? `<span class="nq-sub">${esc(notaConfig)}</span>`
                  : ""
            }
					</td>
					<td class="nq-c"${vivo("qty")}>${d.quantity}</td>
					<td class="nq-r"${vivo("linea")}>${esc(usd(d.unit_price * d.quantity))}</td>
				</tr>
				${d.discount > 0 ? `<tr class="nq-discount">
					<td>
						<strong>Discount</strong>
						<span class="nq-sub">${esc(d.discount_note || "Special discount applied to this quotation.")}</span>
					</td>
					<td class="nq-c">1</td>
					<td class="nq-r">−${esc(usd(d.discount))}</td>
				</tr>` : ""}
				<tr>
					<td>Shipping &amp; Logistics<span class="nq-sub">Delivery is complimentary — fully assembled, inspected, and ready to operate, no extra charge.</span></td>
					<td class="nq-c">1</td>
					<td class="nq-r">${d.shipping_cost === 0 ? "Delivery Included (No Charge)" : esc(usd(d.shipping_cost))}</td>
				</tr>
			</tbody>
			<tfoot>
				<tr><td colspan="2" class="nq-r"><strong>Total Amount (Unit + Shipping/Logistics${d.discount > 0 ? " − Discount" : ""})</strong></td><td class="nq-r"><strong${vivo("total")}>${esc(usd(d.total))}</strong></td></tr>
			</tfoot>
		</table>
	</section>

	<!-- Terms -->
	<section class="nq-block">
		<h3 class="nq-h2">Terms and Conditions</h3>
		<div class="nq-payment">
			<p><strong>Down Payment (Initial Payment): <span${vivo("deposit")}>${esc(usd(d.down_payment))}</span></strong> — Deposit to start production (customer contributes approximately <span${vivo("pct")}>${d.down_pct}</span>% initial payment).</p>
			<p><strong>Remaining Balance: <span${vivo("balance")}>${esc(usd(d.balance))}</span></strong> — To be settled before unit dispatch.</p>
		</div>
		<ul class="nq-terms">${li(terminos)}</ul>
	</section>

	<!-- Proposal Acceptance -->
	<section class="nq-block nq-proposal">
		<div class="nq-proposal-kicker">Ready to move forward</div>
		<h2 class="nq-proposal-title">${esc(contrato.section_title)}</h2>
		<div class="nq-proposal-rule"></div>

		<div class="nq-proposal-summary">
			<div class="nq-psum-row">
				<div class="nq-psum-label">Project</div>
				<div class="nq-psum-value"><span${vivo("modelo-nombre")}>${esc(modelo.name)}</span><span class="nq-psum-qty"${vivo("qtynota")}>${d.quantity > 1 ? ` · ${d.quantity} units` : ""}</span></div>
			</div>
			<div class="nq-psum-row">
				<div class="nq-psum-label">Total Price</div>
				<div class="nq-psum-value nq-psum-price"${vivo("total")}>${esc(usd(d.total))}</div>
			</div>
			<div class="nq-psum-row">
				<div class="nq-psum-label">Payment Terms</div>
				<div class="nq-psum-value"><span${vivo("deposit")}>${esc(usd(d.down_payment))}</span> deposit (<span${vivo("pct")}>${d.down_pct}</span>%) · <span${vivo("balance")}>${esc(usd(d.balance))}</span> balance before dispatch</div>
			</div>
			<div class="nq-psum-row">
				<div class="nq-psum-label">Estimated Delivery</div>
				<div class="nq-psum-value">${esc(d.delivery_time)}</div>
			</div>
		</div>

		<p class="nq-proposal-scope">${esc(contrato.scope_of_work)}</p>

		<div class="nq-proposal-cols">
			<div>
				<h4 class="nq-proposal-h4">What's Included</h4>
				<ul class="nq-check-list nq-check-yes">${li(contrato.included)}</ul>
			</div>
			<div>
				<h4 class="nq-proposal-h4">What's Not Included</h4>
				<ul class="nq-check-list nq-check-no">${li(contrato.excluded)}</ul>
			</div>
		</div>

		<h4 class="nq-proposal-h4">Warranty</h4>
		<p class="nq-proposal-text">${esc(contrato.warranty)}</p>

		<h4 class="nq-proposal-h4">Included Documentation</h4>
		<ul class="nq-check-list nq-check-yes">${li(contrato.included_documentation)}</ul>

		<h4 class="nq-proposal-h4">Payment Schedule</h4>
		<p class="nq-proposal-text nq-pre">${esc(contrato.payment_schedule)}</p>

		<div class="nq-proposal-cols">
			<div>
				<h4 class="nq-proposal-h4">Client Responsibilities</h4>
				<ul class="nq-plain-list">${li(contrato.client_resp)}</ul>
			</div>
			<div>
				<h4 class="nq-proposal-h4">NINIT Group Responsibilities</h4>
				<ul class="nq-plain-list">${li(contrato.company_resp)}</ul>
			</div>
		</div>

		<h4 class="nq-proposal-h4">Procedure After Acceptance</h4>
		<p class="nq-proposal-text nq-pre">${esc(contrato.procedure)}</p>

		<h4 class="nq-proposal-h4">Terms &amp; Conditions</h4>
		<ul class="nq-terms">${contrato.terms.map((t) => `<li>${terminoConTitulo(t)}</li>`).join("")}</ul>

		<h4 class="nq-proposal-h4">Contact</h4>
		<p class="nq-proposal-text">${esc(empresa.name)} · ${esc(empresa.phone)} · ${esc(empresa.email)} · ${esc(empresa.website)}</p>

		<div class="nq-sign-block">
			<label class="nq-agree-intro nq-accept-row">
				<input type="checkbox" name="accepted" form="nq-form" class="nq-accept-checkbox nq-sign-agree" required>
				<span>${esc(contrato.acceptance_text)}</span>
			</label>

			${
        abierta
          ? `<p class="nq-pedido-aviso">This model is quoted on request. Fill in your details above and send them: our team comes back with your price and the agreement ready to sign — there is nothing to sign right now.</p>`
          : ""
      }

			<div class="nq-sign-grid">
				<div>
					<span class="nq-sign-role">Client</span>
					${
        abierta
          ? `<div class="nq-sign-line nq-sign-live" data-nq="name" data-vacio="Client name">Client name</div>
					<div class="nq-sign-line nq-sign-live" data-nq="empresa" data-vacio="Company">Company</div>
					<div class="nq-sign-line nq-sign-live" data-nq="name" data-vacio="Printed name">Printed name</div>`
          : `<div class="nq-sign-line nq-sign-live-filled">${esc(cliente.nombre)}</div>
					<div class="nq-sign-line">${cliente.empresa ? esc(cliente.empresa) : "Company"}</div>
					<div class="nq-sign-line nq-sign-live-filled">${esc(cliente.nombre)}</div>`
      }
					<div class="nq-sign-pad-wrap">
						<canvas class="nq-sign-pad" width="500" height="130"></canvas>
						<button type="button" class="nq-sign-clear">Clear</button>
						<input type="hidden" name="signature" class="nq-signature-input" form="nq-form">
					</div>
					<div class="nq-sign-line nq-sign-live-filled nq-fecha${claseHoy}">${esc(fechaLarga(d.quote_date))}</div>
				</div>
				<div>
					<span class="nq-sign-role">NINIT Group Representative</span>
					<div class="nq-sign-line">${esc(empresa.rep)}</div>
					<div class="nq-sign-line" style="border-bottom:none;">Title: Sales Representative</div>
					<div class="nq-sign-line nq-rep-signed">
						<img src="${esc(firmaRep)}" alt="${esc(empresa.rep)} signature" class="nq-rep-sig-img">
					</div>
					<div class="nq-sign-line nq-sign-live nq-sign-live-filled nq-fecha${claseHoy}">${esc(fechaLarga(d.quote_date))}</div>
				</div>
			</div>
			<p class="nq-return">Sign above with your mouse or finger, then submit. Our team will confirm receipt and follow up with your deposit invoice.</p>
			<p class="nq-stamp">Electronic signatures have the same legal validity and binding effect as a handwritten signature.</p>

			<div class="nq-form-actions">
				<button type="submit" form="nq-form" class="nq-btn nq-btn-submit">Sign &amp; Send Agreement →</button>
				<p class="nq-privacy">We'll only use your details to prepare your quote. No payment is taken online.</p>
			</div>
			<div class="nq-form-feedback" role="alert" aria-live="polite"></div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="nq-foot">
		<span>© ${anio} NINI T-GROUP LLC · Miami, Florida</span>
		<span>${esc(empresa.email)}</span>
	</footer>

</div><!-- /.nq-sheet -->
</div><!-- /.nq-doc -->`;

  // La página vive fuera de WordPress, así que el <head> y el fondo (que antes
  // ponía el tema) se definen acá. quote.css se usa sin tocar.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Purchase Agreement · ${esc(modelo.short)}${abierta ? "" : ` · ${esc(cliente.nombre)}`} — NINI T-GROUP</title>
<link rel="icon" href="/cotizacion/img/logo.png">
<link rel="stylesheet" href="/cotizacion/quote.css?v=${ASSET_VERSION}">
<link rel="stylesheet" href="/cotizacion/ajustes.css?v=${ASSET_VERSION}">
<style>
	html { -webkit-text-size-adjust: 100%; }
	body { margin: 0; background: #eef1f5; }
	@media print { body { background: #fff; } }
</style>
</head>
<body>
${cuerpo}
${
  abierta
    ? `<script type="application/json" id="nq-catalogo">${JSON.stringify(catalogo).replace(
        /</g,
        "\u003c"
      )}</script>`
    : ""
}
<script src="/cotizacion/firma.js?v=${ASSET_VERSION}" defer></script>
</body>
</html>
`;
}
