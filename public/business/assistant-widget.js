/* ============================================================
   NINI T-GROUP — asistente de la landing /business/

   Burbuja de chat autocontenida: no toca business.js ni el
   formulario principal. Habla con /api/business-chat (Groq,
   server-side) y, cuando el visitante quiere dejar sus datos,
   reusa el MISMO endpoint de leads que ya usa el formulario
   grande (/api/lead) — cero lógica nueva del lado del CRM.

   Sin frameworks y sin build, igual que business.js: se sirve
   tal cual desde public/, tiene que correr sin transpilar.
   ============================================================ */
(function () {
	"use strict";

	// La landing se sirve desde varios dominios (ntg-business.vercel.app,
	// ninit-crm.vercel.app/business, y algún día ninitgroup.com/business).
	// Los dos endpoints viven siempre en el proyecto del CRM, con
	// Access-Control-Allow-Origin: * — mismo criterio que ENDPOINT_LEAD
	// en business.js.
	var ENDPOINT_CHAT = "https://ninit-crm.vercel.app/api/business-chat";
	var ENDPOINT_LEAD = "https://ninit-crm.vercel.app/api/lead";

	var SALUDO = "Hi! I can help you figure out which NTG package fits — Starter, Business Launch or Managed — or answer anything about the trailers, pricing or financing. What are you working on?";

	/* ──────────────────────────────────────────────────────────
	   Estado en memoria de esta pestaña. sessionStorage nada más
	   para sobrevivir un refresh accidental, no para persistir
	   para siempre: es un widget de landing, no el CRM.
	   ────────────────────────────────────────────────────────── */
	var STORAGE_KEY = "ntg_business_chat_v1";
	var historial = [];
	var formularioMostrado = false;
	var formularioYaEnviado = false;

	try {
		var guardado = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
		if (guardado && Array.isArray(guardado.historial)) {
			historial = guardado.historial;
			formularioMostrado = !!guardado.formularioMostrado;
			formularioYaEnviado = !!guardado.formularioEnviado;
		}
	} catch (e) { /* Safari privado, cuotas, etc. — arranca en blanco. */ }

	function persistir() {
		try {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
				historial: historial,
				formularioMostrado: formularioMostrado,
				formularioEnviado: formularioYaEnviado,
			}));
		} catch (e) { /* no pasa nada si no se puede guardar */ }
	}

	/* ──────────────────────────────────────────────────────────
	   Markup + estilos. Se inyectan por JS para que este archivo
	   sea el único que hay que agregar a index.html.
	   ────────────────────────────────────────────────────────── */
	var root = document.createElement("div");
	root.className = "ntgchat";
	root.innerHTML =
		'<button type="button" class="ntgchat-bubble" id="ntgchat-toggle" aria-expanded="false" aria-controls="ntgchat-panel">' +
			'<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>' +
			'<span class="ntgchat-bubble-x" aria-hidden="true">&times;</span>' +
		'</button>' +
		'<section class="ntgchat-panel" id="ntgchat-panel" role="dialog" aria-label="NTG assistant" hidden>' +
			'<header class="ntgchat-head">' +
				'<div><strong>NTG Assistant</strong><span>Business packages &amp; trailers</span></div>' +
				'<button type="button" class="ntgchat-close" id="ntgchat-close" aria-label="Close chat">&times;</button>' +
			'</header>' +
			'<div class="ntgchat-body" id="ntgchat-body"></div>' +
			'<form class="ntgchat-form" id="ntgchat-form">' +
				'<textarea id="ntgchat-input" rows="1" placeholder="Type your question…" aria-label="Message"></textarea>' +
				'<button type="submit" id="ntgchat-send" aria-label="Send">' +
					'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M3 20l18-8L3 4v6l12 2-12 2z"/></svg>' +
				'</button>' +
			'</form>' +
		'</section>';
	document.body.appendChild(root);

	var elToggle = root.querySelector("#ntgchat-toggle");
	var elPanel  = root.querySelector("#ntgchat-panel");
	var elClose  = root.querySelector("#ntgchat-close");
	var elBody   = root.querySelector("#ntgchat-body");
	var elForm   = root.querySelector("#ntgchat-form");
	var elInput  = root.querySelector("#ntgchat-input");
	var elSend   = root.querySelector("#ntgchat-send");

	function abrir() {
		elPanel.hidden = false;
		root.classList.add("open");
		elToggle.setAttribute("aria-expanded", "true");
		if (!historial.length) {
			agregarMensaje("assistant", SALUDO, false);
		}
		setTimeout(function () { elInput.focus(); }, 50);
	}
	function cerrar() {
		elPanel.hidden = true;
		root.classList.remove("open");
		elToggle.setAttribute("aria-expanded", "false");
	}
	elToggle.addEventListener("click", function () {
		if (elPanel.hidden) abrir(); else cerrar();
	});
	elClose.addEventListener("click", cerrar);

	/* ──────────────────────────────────────────────────────────
	   Render de mensajes
	   ────────────────────────────────────────────────────────── */
	function escapar(s) {
		return String(s || "").replace(/[&<>]/g, function (c) {
			return c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;";
		});
	}

	function agregarMensaje(role, content, guardar) {
		var burbuja = document.createElement("div");
		burbuja.className = "ntgchat-msg " + (role === "user" ? "u" : "a");
		burbuja.textContent = content;
		elBody.appendChild(burbuja);
		elBody.scrollTop = elBody.scrollHeight;
		if (guardar !== false) {
			historial.push({ role: role, content: content });
			persistir();
		}
		return burbuja;
	}

	function mostrarTyping() {
		var t = document.createElement("div");
		t.className = "ntgchat-msg a ntgchat-typing";
		t.innerHTML = "<i></i><i></i><i></i>";
		elBody.appendChild(t);
		elBody.scrollTop = elBody.scrollHeight;
		return t;
	}

	// Redibuja lo que ya había en sessionStorage al cargar la página.
	(historial || []).forEach(function (m) { agregarMensaje(m.role, m.content, false); });
	if (formularioMostrado && !formularioYaEnviado) {
		// El visitante recargó justo cuando le estábamos por pedir el
		// contacto: se lo mostramos de nuevo en vez de perderlo.
		setTimeout(function () { mostrarMiniFormulario(); }, 0);
	}

	/* ──────────────────────────────────────────────────────────
	   Envío de mensajes al asistente
	   ────────────────────────────────────────────────────────── */
	function autoAltura() {
		elInput.style.height = "auto";
		elInput.style.height = Math.min(elInput.scrollHeight, 110) + "px";
	}
	elInput.addEventListener("input", autoAltura);
	elInput.addEventListener("keydown", function (ev) {
		if (ev.key === "Enter" && !ev.shiftKey) {
			ev.preventDefault();
			elForm.requestSubmit ? elForm.requestSubmit() : enviar();
		}
	});

	var enviando = false;

	elForm.addEventListener("submit", function (ev) {
		ev.preventDefault();
		enviar();
	});

	function enviar() {
		var texto = elInput.value.trim();
		if (!texto || enviando) return;

		agregarMensaje("user", texto);
		elInput.value = "";
		autoAltura();

		enviando = true;
		elSend.disabled = true;
		var typing = mostrarTyping();

		fetch(ENDPOINT_CHAT, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				mensajes: historial.map(function (m) {
					return { role: m.role, content: m.content, formShown: !!m.formShown };
				}),
			}),
		})
			.then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
			.then(function (res) {
				typing.remove();
				if (!res.ok) throw new Error((res.data && res.data.error) || "No pudimos responder.");
				var burbuja = agregarMensaje("assistant", res.data.reply || "Sorry, could you rephrase that?");
				if (res.data.mostrarFormulario && !formularioYaEnviado) {
					historial[historial.length - 1].formShown = true;
					formularioMostrado = true;
					persistir();
					mostrarMiniFormulario();
				}
			})
			.catch(function (err) {
				typing.remove();
				agregarMensaje("assistant", "Sorry, something went wrong on our end. You can also reach us directly at info@ninitgroup.com or use the form below.", false);
			})
			.then(function () {
				enviando = false;
				elSend.disabled = false;
			});
	}

	/* ──────────────────────────────────────────────────────────
	   Mini-formulario de contacto, inline en el chat.

	   A propósito NO inventa un endpoint nuevo: manda exactamente
	   al mismo /api/lead que usa el formulario grande de la
	   landing, con el mismo contrato de campos. El endpoint hace
	   upsert por teléfono, dispara el push a los vendedores y
	   aparece en el CRM como cualquier consulta — igual que hoy.
	   ────────────────────────────────────────────────────────── */
	function mostrarMiniFormulario() {
		if (elBody.querySelector(".ntgchat-leadform")) return;

		var wrap = document.createElement("div");
		wrap.className = "ntgchat-leadform";
		wrap.innerHTML =
			'<p class="ntgchat-leadform-hint">Want the full written quote? Leave your info and a real person will follow up, usually the same day.</p>' +
			'<input type="text" placeholder="Full name" id="ntgchat-lf-name" autocomplete="name">' +
			'<input type="tel" placeholder="Phone / WhatsApp" id="ntgchat-lf-phone" autocomplete="tel">' +
			'<input type="email" placeholder="Email (optional)" id="ntgchat-lf-email" autocomplete="email">' +
			'<button type="button" id="ntgchat-lf-submit">Send my info</button>' +
			'<p class="ntgchat-leadform-msg" id="ntgchat-lf-msg" role="status" aria-live="polite"></p>';
		elBody.appendChild(wrap);
		elBody.scrollTop = elBody.scrollHeight;

		var btn = wrap.querySelector("#ntgchat-lf-submit");
		var salida = wrap.querySelector("#ntgchat-lf-msg");

		btn.addEventListener("click", function () {
			var nombre = wrap.querySelector("#ntgchat-lf-name").value.trim();
			var telefono = wrap.querySelector("#ntgchat-lf-phone").value.trim();
			var email = wrap.querySelector("#ntgchat-lf-email").value.trim();

			if (!nombre || !telefono) {
				salida.textContent = "Please add your name and phone so we can reach you.";
				salida.className = "ntgchat-leadform-msg err";
				return;
			}

			btn.disabled = true;
			btn.textContent = "Sending…";

			var transcript = historial.map(function (m) {
				return (m.role === "user" ? "Visitor" : "Assistant") + ": " + m.content;
			}).join("\n");

			fetch(ENDPOINT_LEAD, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					nombre: nombre,
					telefono: telefono,
					email: email,
					mensaje: "Chat widget conversation:\n" + transcript.slice(0, 1200),
					origen: "landing /business — chat widget",
					referrer: document.referrer || "",
					url: window.location.href,
				}),
			})
				.then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
				.then(function (res) {
					if (!res.ok) throw new Error((res.data && res.data.error) || "Could not send it.");
					formularioYaEnviado = true;
					persistir();
					wrap.innerHTML = '<p class="ntgchat-leadform-msg ok">Got it — thank you! Someone from our team will follow up shortly.</p>';
					elBody.scrollTop = elBody.scrollHeight;
				})
				.catch(function (err) {
					btn.disabled = false;
					btn.textContent = "Send my info";
					salida.textContent = "We couldn't send that (" + (err.message || "network error") + "). You can also email info@ninitgroup.com.";
					salida.className = "ntgchat-leadform-msg err";
				});
		});
	}
})();
