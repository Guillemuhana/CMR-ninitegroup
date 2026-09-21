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

	// Los endpoints se llaman por ruta RELATIVA, nunca con el dominio del
	// CRM. El cliente no tiene que ver ni enterarse de que existe una app
	// interna: el CRM lo usa sólo el equipo de NINI.
	//
	// En el dominio de la landing, /api/* lo reenvía Vercel al proyecto del
	// CRM (ver public/business/vercel.json). En ninit-crm.vercel.app/business
	// resuelven solos porque los endpoints viven ahí mismo.
	var ENDPOINT_CHAT = "/api/business-chat";
	var ENDPOINT_LEAD = "/api/lead";

	// El avatar sale del mismo logo que la barra. La ruta se deduce de dónde
	// está el propio script, así funciona igual en / y en /es/.
	var RUTA_LOGO = (document.currentScript && document.currentScript.src || "")
		.replace(/assistant-widget\.js.*$/, "") + "img/logo-ninit.jpg";

	/* ──────────────────────────────────────────────────────────
	   Textos del widget, por idioma.

	   La landing existe en dos idiomas (/ y /es/) y el widget es el
	   mismo archivo en las dos, así que elige el juego de textos
	   mirando el lang del documento, que el generador de la versión
	   española ya deja en "es" (scripts/landing-es.mjs).

	   Ojo: esto es sólo el marco del widget. Lo que RESPONDE la IA lo
	   decide el servidor, que detecta el idioma de lo que escribe el
	   visitante — así alguien puede abrir la página en inglés,
	   escribir en castellano y que le contesten en castellano.
	   ────────────────────────────────────────────────────────── */
	var ES = (document.documentElement.lang || "en").toLowerCase().indexOf("es") === 0;

	var T = ES ? {
		saludo: "¡Hola! Puedo ayudarlo a ver qué paquete de NTG le sirve —Starter, Business Launch o Managed— o responderle lo que necesite sobre las unidades, los precios o la financiación. ¿En qué está?",
		abrir: "Abrir el chat",
		cerrar: "Cerrar el chat",
		dialogo: "Asistente de NTG",
		escribir: "Escriba su consulta…",
		mensaje: "Mensaje",
		enviar: "Enviar",
		reformular: "Perdón, ¿me lo puede decir de otra manera?",
		errorRed: "Perdón, algo falló de nuestro lado. También puede escribirnos a ninitgroup@gmail.com o usar el formulario de acá abajo.",
		nombre: "Nombre y apellido",
		telefono: "Teléfono / WhatsApp",
		email: "Email (opcional)",
		faltanDatos: "Por favor complete su nombre y teléfono para que podamos contactarlo.",
		enviando: "Enviando…",
		enviarDatos: "Enviar mis datos",
		noSePudo: "No pudimos enviarlo",
		errorEnvio: "No pudimos enviarlo (%s). También puede escribirnos a ninitgroup@gmail.com.",
		visitante: "Visitante",
		asistente: "Asistente",
		conversacion: "Conversación del chat:",
		titulo: "Asistente NTG",
		bajada: "Paquetes de negocio y unidades",
		enLinea: "Respondemos al instante",
		bienvenidaTitulo: "👋 ¡Hola! Bienvenido a NINIT GROUP",
		bienvenidaTexto: "Estoy para ayudarlo a armar su negocio de alquiler de baños móviles. Pregúnteme por los precios, qué incluye cada paquete, la financiación o cómo arrancar en su zona.",
		cebo: "👋 ¿Pensando en arrancar su propio negocio de alquiler? Pregúnteme lo que quiera.",
		pie: "Asistente con IA. Un asesor confirma todo dato importante.",
		fichas: [
			"¿Qué paquete me conviene?",
			"¿Cuánto sale un 3 cubículos?",
			"¿Cómo funciona la financiación?",
		],
	} : {
		saludo: "Hi! I can help you figure out which NTG package fits — Starter, Business Launch or Managed — or answer anything about the trailers, pricing or financing. What are you working on?",
		abrir: "Open chat",
		cerrar: "Close chat",
		dialogo: "NTG assistant",
		escribir: "Type your question…",
		mensaje: "Message",
		enviar: "Send",
		reformular: "Sorry, could you rephrase that?",
		errorRed: "Sorry, something went wrong on our end. You can also reach us directly at ninitgroup@gmail.com or use the form below.",
		nombre: "Full name",
		telefono: "Phone / WhatsApp",
		email: "Email (optional)",
		faltanDatos: "Please add your name and phone so we can reach you.",
		enviando: "Sending…",
		enviarDatos: "Send my info",
		noSePudo: "Could not send it.",
		errorEnvio: "We couldn't send that (%s). You can also email ninitgroup@gmail.com.",
		visitante: "Visitor",
		asistente: "Assistant",
		conversacion: "Chat widget conversation:",
		titulo: "NTG Assistant",
		bajada: "Business packages &amp; trailers",
		enLinea: "Replies instantly",
		bienvenidaTitulo: "👋 Hi there — welcome to NINIT GROUP",
		bienvenidaTexto: "I'm here to help you put together your restroom trailer rental business. Ask me about pricing, what each package includes, financing, or how to get started in your area.",
		cebo: "👋 Thinking about starting your own rental business? Ask me anything.",
		pie: "AI assistant. An advisor confirms anything that matters.",
		fichas: [
			"Which package fits me?",
			"What does a 3-Stall cost?",
			"How does financing work?",
		],
	};

	var SALUDO = T.saludo;

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
		'<div class="ntgchat-cebo" id="ntgchat-cebo" hidden>' +
			'<button type="button" class="ntgchat-cebo-x" id="ntgchat-cebo-x" aria-label="' + T.cerrar + '">&times;</button>' +
			'<span>' + T.cebo + '</span>' +
		'</div>' +
		'<button type="button" class="ntgchat-bubble" id="ntgchat-toggle" aria-expanded="false" aria-controls="ntgchat-panel">' +
			'<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>' +
			'<span class="ntgchat-bubble-x" aria-hidden="true">&times;</span>' +
		'</button>' +
		'<section class="ntgchat-panel" id="ntgchat-panel" role="dialog" aria-label="' + T.dialogo + '" hidden>' +
			'<header class="ntgchat-head">' +
				'<img class="ntgchat-av" src="' + RUTA_LOGO + '" alt="" aria-hidden="true">' +
				'<div class="ntgchat-head-txt"><strong>' + T.titulo + '</strong><span>' + T.enLinea + '</span></div>' +
				'<button type="button" class="ntgchat-close" id="ntgchat-close" aria-label="' + T.cerrar + '">&times;</button>' +
			'</header>' +
			'<div class="ntgchat-body" id="ntgchat-body"></div>' +
			'<form class="ntgchat-form" id="ntgchat-form">' +
				'<textarea id="ntgchat-input" rows="1" placeholder="' + T.escribir + '" aria-label="' + T.mensaje + '"></textarea>' +
				'<button type="submit" id="ntgchat-send" aria-label="' + T.enviar + '" disabled>' +
					'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M3 20l18-8L3 4v6l12 2-12 2z"/></svg>' +
				'</button>' +
			'</form>' +
			'<p class="ntgchat-pie">' + T.pie + '</p>' +
		'</section>';
	document.body.appendChild(root);

	var elToggle = root.querySelector("#ntgchat-toggle");
	var elPanel  = root.querySelector("#ntgchat-panel");
	var elClose  = root.querySelector("#ntgchat-close");
	var elBody   = root.querySelector("#ntgchat-body");
	var elForm   = root.querySelector("#ntgchat-form");
	var elInput  = root.querySelector("#ntgchat-input");
	var elSend   = root.querySelector("#ntgchat-send");
	var elCebo   = root.querySelector("#ntgchat-cebo");
	var elCeboX  = root.querySelector("#ntgchat-cebo-x");

	/* ──────────────────────────────────────────────────────────
	   El globo de cebo.

	   Una burbuja sola en un rincón no se mira: el visitante no sabe
	   que hay alguien del otro lado. Esto la hace hablar primero.

	   Aparece a los 6 segundos, no de entrada: si salta apenas carga
	   la página tapa el titular y molesta. Y si ya hablaron antes en
	   esta pestaña, no aparece — ya sabe que el chat existe.
	   Se puede cerrar, y cerrarlo se recuerda para no insistir.
	   ────────────────────────────────────────────────────────── */
	var CEBO_KEY = "ntg_business_cebo_visto";
	var ceboDescartado = false;
	try { ceboDescartado = sessionStorage.getItem(CEBO_KEY) === "1"; } catch (e) {}

	function ocultarCebo(recordar) {
		if (!elCebo || elCebo.hidden) return;
		elCebo.hidden = true;
		if (recordar) {
			ceboDescartado = true;
			try { sessionStorage.setItem(CEBO_KEY, "1"); } catch (e) {}
		}
	}

	if (elCebo && !ceboDescartado && !historial.length) {
		setTimeout(function () {
			if (!root.classList.contains("open")) elCebo.hidden = false;
		}, 6000);
	}
	if (elCeboX) {
		elCeboX.addEventListener("click", function (ev) {
			ev.stopPropagation();
			ocultarCebo(true);
		});
	}
	if (elCebo) {
		// Tocar el globo abre el chat: es lo que la gente intenta hacer.
		elCebo.addEventListener("click", function () { ocultarCebo(true); abrir(); });
	}

	// El cuerpo se dibuja una sola vez, la primera que se abre el panel.
	var dibujado = false;

	function abrir() {
		elPanel.hidden = false;
		root.classList.add("open", "visto");
		ocultarCebo(true);
		elToggle.setAttribute("aria-expanded", "true");

		if (!dibujado) {
			dibujado = true;
			if (historial.length) {
				// BUG QUE ESTO ARREGLA: el historial se restauraba de
				// sessionStorage pero nadie lo volvía a dibujar. Al recargar la
				// página y reabrir el chat, el panel quedaba en blanco — ni el
				// saludo, porque historial.length ya no era 0.
				historial.forEach(function (m) { agregarMensaje(m.role, m.content, false); });
			} else {
				mostrarBienvenida();
				mostrarFichas();
			}
		}
		setTimeout(function () { elInput.focus(); }, 60);
	}

	/* Tarjeta de bienvenida.
	   Antes el saludo era un globo gris suelto y el panel se sentía vacío.
	   Esto es lo primero que ve el visitante, así que dice en una línea qué
	   puede pedirle al asistente en vez de un "hola" genérico. */
	function mostrarBienvenida() {
		var card = document.createElement("div");
		card.className = "ntgchat-welcome";
		card.innerHTML =
			'<div class="ntgchat-welcome-tit">' + escapar(T.bienvenidaTitulo) + '</div>' +
			'<p>' + escapar(T.bienvenidaTexto) + '</p>';
		elBody.appendChild(card);
		elBody.scrollTop = elBody.scrollHeight;
	}

	/* Fichas sugeridas: tres puertas de entrada para que el visitante no se
	   quede mirando un chat vacío. Desaparecen apenas escribe o toca una. */
	function mostrarFichas() {
		if (!T.fichas || !T.fichas.length) return;
		var cont = document.createElement("div");
		cont.className = "ntgchat-chips";
		T.fichas.forEach(function (texto) {
			var b = document.createElement("button");
			b.type = "button";
			b.className = "ntgchat-chip";
			b.textContent = texto;
			b.addEventListener("click", function () {
				quitarFichas();
				enviarMensaje(texto);
			});
			cont.appendChild(b);
		});
		elBody.appendChild(cont);
		elBody.scrollTop = elBody.scrollHeight;
	}
	function quitarFichas() {
		var c = elBody.querySelector(".ntgchat-chips");
		if (c) c.remove();
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
		// El botón sólo se enciende si hay algo que mandar: apretar "enviar"
		// con el campo vacío y que no pase nada es una respuesta muerta.
		elSend.disabled = enviando || !elInput.value.trim();
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
		if (!texto) return;
		elInput.value = "";
		autoAltura();
		enviarMensaje(texto);
	}

	/* El envío de verdad. Recibe el texto en vez de leerlo del campo, para
	   que las fichas sugeridas puedan usar exactamente el mismo camino. */
	function enviarMensaje(texto) {
		if (!texto || enviando) return;
		quitarFichas();
		agregarMensaje("user", texto);

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
				var burbuja = agregarMensaje("assistant", res.data.reply || T.reformular);
				if (res.data.mostrarFormulario && !formularioYaEnviado) {
					historial[historial.length - 1].formShown = true;
					formularioMostrado = true;
					persistir();
					mostrarMiniFormulario();
				}
			})
			.catch(function (err) {
				typing.remove();
				agregarMensaje("assistant", T.errorRed, false);
			})
			.then(function () {
				enviando = false;
				elSend.disabled = !elInput.value.trim();
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
			'<input type="text" placeholder="' + T.nombre + '" id="ntgchat-lf-name" autocomplete="name">' +
			'<input type="tel" placeholder="' + T.telefono + '" id="ntgchat-lf-phone" autocomplete="tel">' +
			'<input type="email" placeholder="' + T.email + '" id="ntgchat-lf-email" autocomplete="email">' +
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
				salida.textContent = T.faltanDatos;
				salida.className = "ntgchat-leadform-msg err";
				return;
			}

			btn.disabled = true;
			btn.textContent = T.enviando;

			var transcript = historial.map(function (m) {
				return (m.role === "user" ? T.visitante : T.asistente) + ": " + m.content;
			}).join("\n");

			fetch(ENDPOINT_LEAD, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					nombre: nombre,
					telefono: telefono,
					email: email,
					mensaje: T.conversacion + "\n" + transcript.slice(0, 1200),
					origen: "landing /business — chat widget",
					referrer: document.referrer || "",
					url: window.location.href,
				}),
			})
				.then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
				.then(function (res) {
					if (!res.ok) throw new Error((res.data && res.data.error) || T.noSePudo);
					formularioYaEnviado = true;
					persistir();
					wrap.innerHTML = '<p class="ntgchat-leadform-msg ok">Got it — thank you! Someone from our team will follow up shortly.</p>';
					elBody.scrollTop = elBody.scrollHeight;
				})
				.catch(function (err) {
					btn.disabled = false;
					btn.textContent = T.enviarDatos;
					salida.textContent = T.errorEnvio.replace("%s", err.message || "network error");
					salida.className = "ntgchat-leadform-msg err";
				});
		});
	}
})();
