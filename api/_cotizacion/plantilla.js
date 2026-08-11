// Render del Purchase Agreement como página HTML autónoma.
//
// Es el port de templates/quote-content.php del plugin, en su rama "CLIENT MODE":
// la cotización ya está emitida a nombre de un cliente y con el precio cerrado,
// así que no hay configurador ni campos que completar — solo leer, aceptar,
// firmar y enviar. Las clases CSS son las mismas que usa quote.css, que se copió
// tal cual del plugin: por eso el documento se ve igual que en WordPress.

import {
  empresa,
  logo,
  firmaRep,
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
export const ASSET_VERSION = "6";

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

export function render({ modelo, cliente }) {
  const d = calcular(modelo, cliente);
  const notaConfig = cliente.config_note || modelo.config_note;
  const anio = cliente.fecha.slice(0, 4);

  const li = (items) => items.map((i) => `<li>${esc(i)}</li>`).join("");

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
			<strong class="nq-name-preview">${esc(cliente.nombre)}</strong>
			${cliente.empresa ? `<p>${esc(cliente.empresa)}</p>` : ""}
			<p class="nq-loc-preview">${esc(cliente.ubicacion)}</p>
			${cliente.email ? `<p>${esc(cliente.email)}</p>` : ""}
			${cliente.telefono ? `<p>${esc(cliente.telefono)}</p>` : ""}
		</div>
	</section>

	<!-- Meta bar -->
	<section class="nq-meta">
		<div><span>Agreement No.</span><strong>${esc(d.quote_number)}</strong></div>
		<div><span>Agreement Date</span><strong>${esc(fechaLarga(d.quote_date))}</strong></div>
		<div><span>Delivery Time</span><strong>${esc(d.delivery_time)}</strong></div>
	</section>

	<!-- Model title -->
	<h2 class="nq-model-title">${esc(modelo.name)}</h2>

	<!-- Hero + floorplan -->
	<section class="nq-hero">
		<img src="${esc(modelo.hero)}" alt="${esc(modelo.short)} exterior" decoding="async">
		<img src="${esc(modelo.floorplan)}" alt="Floor plan" loading="lazy" decoding="async">
	</section>

	<section class="nq-interior">
		${modelo.interior
      .map((src) => `<img src="${esc(src)}" alt="Interior" loading="lazy" decoding="async">`)
      .join("\n\t\t")}
	</section>

	<!-- Specifications -->
	<section class="nq-block">
		<h3 class="nq-h2">Trailer Specifications</h3>
		<ul class="nq-specs">${li(modelo.specs)}</ul>
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

	<!-- Cotización emitida: nada que configurar, solo revisar y firmar -->
	<section class="nq-block nq-request" id="ninit-request">
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
	</section>

	<!-- Price table -->
	<section class="nq-block">
		<h3 class="nq-h2">Your Trailer Price</h3>
		<table class="nq-price">
			<thead><tr><th>Description</th><th class="nq-c">Qty</th><th class="nq-r">Amount</th></tr></thead>
			<tbody>
				<tr>
					<td>
						<strong>${esc(modelo.name)}</strong>
						${notaConfig ? `<span class="nq-sub">${esc(notaConfig)}</span>` : ""}
					</td>
					<td class="nq-c">${d.quantity}</td>
					<td class="nq-r">${esc(usd(d.unit_price))}</td>
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
				<tr><td colspan="2" class="nq-r"><strong>Total Amount (Unit + Shipping/Logistics${d.discount > 0 ? " − Discount" : ""})</strong></td><td class="nq-r"><strong>${esc(usd(d.total))}</strong></td></tr>
			</tfoot>
		</table>
	</section>

	<!-- Terms -->
	<section class="nq-block">
		<h3 class="nq-h2">Terms and Conditions</h3>
		<div class="nq-payment">
			<p><strong>Down Payment (Initial Payment): ${esc(usd(d.down_payment))}</strong> — Deposit to start production (customer contributes approximately ${d.down_pct}% initial payment).</p>
			<p><strong>Remaining Balance: ${esc(usd(d.balance))}</strong> — To be settled before unit dispatch.</p>
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
				<div class="nq-psum-value">${esc(modelo.name)}</div>
			</div>
			<div class="nq-psum-row">
				<div class="nq-psum-label">Total Price</div>
				<div class="nq-psum-value nq-psum-price">${esc(usd(d.total))}</div>
			</div>
			<div class="nq-psum-row">
				<div class="nq-psum-label">Payment Terms</div>
				<div class="nq-psum-value">${esc(usd(d.down_payment))} deposit (${d.down_pct}%) · ${esc(usd(d.balance))} balance before dispatch</div>
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

			<div class="nq-sign-grid">
				<div>
					<span class="nq-sign-role">Client</span>
					<div class="nq-sign-line nq-sign-live-filled">${esc(cliente.nombre)}</div>
					<div class="nq-sign-line">${cliente.empresa ? esc(cliente.empresa) : "Company"}</div>
					<div class="nq-sign-line nq-sign-live-filled">${esc(cliente.nombre)}</div>
					<div class="nq-sign-pad-wrap">
						<canvas class="nq-sign-pad" width="500" height="130"></canvas>
						<button type="button" class="nq-sign-clear">Clear</button>
						<input type="hidden" name="signature" class="nq-signature-input" form="nq-form">
					</div>
					<div class="nq-sign-line nq-sign-live-filled">${esc(fechaLarga(d.quote_date))}</div>
				</div>
				<div>
					<span class="nq-sign-role">NINIT Group Representative</span>
					<div class="nq-sign-line">${esc(empresa.rep)}</div>
					<div class="nq-sign-line" style="border-bottom:none;">Title: Sales Representative</div>
					<div class="nq-sign-line nq-rep-signed">
						<img src="${esc(firmaRep)}" alt="${esc(empresa.rep)} signature" class="nq-rep-sig-img">
					</div>
					<div class="nq-sign-line nq-sign-live nq-sign-live-filled">${esc(fechaLarga(d.quote_date))}</div>
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
<title>Purchase Agreement · ${esc(modelo.short)} · ${esc(cliente.nombre)} — NINI T-GROUP</title>
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
<script src="/cotizacion/firma.js?v=${ASSET_VERSION}" defer></script>
</body>
</html>
`;
}
