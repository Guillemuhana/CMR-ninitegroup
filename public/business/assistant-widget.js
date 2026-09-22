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
	var RUTA_BASE = (document.currentScript && document.currentScript.src || "")
		.replace(/assistant-widget\.js.*$/, "");
	var RUTA_LOGO = RUTA_BASE + "img/logo-ninit.jpg";

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
		// Avisos según lo que la persona está haciendo en la página. Ver el
		// bloque "CEBO INTELIGENTE" más abajo: se elige uno solo y se dice en
		// el momento en que viene al caso, no siempre el mismo a los 6 segundos.
		cebos: {
			calculadora: "¿Quiere que revisemos esos números con usted? Dígame su zona y le digo qué es realista.",
			paquetes: "¿Dudando entre Starter, Business Launch y Managed? Le ayudo a elegir en 30 segundos.",
			dudas: "¿Le quedó alguna duda? Pregúnteme sin compromiso.",
			formulario: "¿Alguna duda antes de dejarnos sus datos? Estoy acá.",
			vuelve: "👋 ¡Qué bueno verlo de nuevo! ¿Retomamos donde quedó?",
			salida: "¿Se va? Déjenos su consulta y un asesor le responde hoy mismo.",
		},
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
		cebos: {
			calculadora: "Want us to go over those numbers with you? Tell me your area and I'll tell you what's realistic.",
			paquetes: "Torn between Starter, Business Launch and Managed? I can help you pick in 30 seconds.",
			dudas: "Anything still unclear? Ask me — no commitment.",
			formulario: "Any questions before you leave your info? I'm right here.",
			vuelve: "👋 Good to see you again! Want to pick up where you left off?",
			salida: "Heading out? Leave us your question and an advisor gets back to you today.",
		},
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
			'<span id="ntgchat-cebo-txt">' + T.cebo + '</span>' +
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
	var elCeboTx = root.querySelector("#ntgchat-cebo-txt");

	/* ──────────────────────────────────────────────────────────
	   Señales de la landing.

	   Las publica business.js en window.NTG (qué secciones miró, si
	   tocó la calculadora y con qué números, cuánto hace que está, si
	   ya había entrado otro día). Se leen SIEMPRE a través de estos
	   dos ayudantes: si business.js no cargó o cambió, el widget sigue
	   funcionando con el contexto vacío, que es exactamente como
	   funcionaba antes de que esto existiera.
	   ────────────────────────────────────────────────────────── */
	function contextoActual() {
		try { return (window.NTG && window.NTG.contexto) ? String(window.NTG.contexto() || "") : ""; }
		catch (e) { return ""; }
	}
	function señalesActuales() {
		try { return (window.NTG && window.NTG.señales) ? window.NTG.señales() : null; }
		catch (e) { return null; }
	}
	function escenarioActual() {
		try { return (window.NTG && window.NTG.escenario) ? String(window.NTG.escenario() || "") : ""; }
		catch (e) { return ""; }
	}
	function paqueteActual() {
		try { return (window.NTG && window.NTG.paquete) ? String(window.NTG.paquete() || "") : ""; }
		catch (e) { return ""; }
	}

	/* ──────────────────────────────────────────────────────────
	   CEBO INTELIGENTE

	   Una burbuja sola en un rincón no se mira: el visitante no sabe
	   que hay alguien del otro lado. Esto la hace hablar primero —
	   pero hablando de lo que la persona está haciendo justo ahora,
	   no siempre la misma frase a los 6 segundos.

	   Qué dispara cuál:
	     · tocó la calculadora   → le ofrecemos revisar SUS números
	     · miró los paquetes     → le ofrecemos ayudarlo a elegir
	     · llegó al formulario   → le preguntamos si le quedó una duda
	     · ya había entrado antes→ lo saludamos como a alguien que vuelve
	     · se va de la página    → última oferta antes de perderlo
	     · nada de lo anterior   → el saludo genérico de siempre, a los 14 s

	   Las reglas de cortesía importan tanto como los disparadores. Un
	   widget que insiste espanta más de lo que capta:
	     · nunca mientras el panel está abierto,
	     · como mucho DOS en toda la visita, separados por 40 segundos,
	     · nunca dos veces el mismo texto,
	     · si lo cierra una vez, no vuelve a aparecer en toda la sesión,
	     · si ya dejó sus datos, no se lo molesta más.
	   ────────────────────────────────────────────────────────── */
	var CEBO_KEY = "ntg_business_cebo_visto";
	var CEBO_MAX = 2;
	var CEBO_ESPERA = 40000;
	var ceboDescartado = false;
	try { ceboDescartado = sessionStorage.getItem(CEBO_KEY) === "1"; } catch (e) {}

	var cebosMostrados = 0;
	var ceboUltimo = 0;
	var cebosDichos = {};
	var relojGenerico = null;
	var relojRetiro = null;

	function ocultarCebo(recordar) {
		// "Recordar" se procesa ANTES de mirar si el globo está visible. Si
		// no, abrir el chat sin que hubiera aparecido ninguno no cancelaba
		// nada, y al cerrar el panel saltaba un cebo tarde y sin sentido.
		if (recordar) {
			ceboDescartado = true;
			clearTimeout(relojGenerico);
			clearTimeout(relojRetiro);
			try { sessionStorage.setItem(CEBO_KEY, "1"); } catch (e) {}
		}
		if (!elCebo || elCebo.hidden) return;
		elCebo.hidden = true;
	}

	function mostrarCebo(clave) {
		if (!elCebo || !elCeboTx) return;
		if (ceboDescartado || formularioYaEnviado) return;
		if (root.classList.contains("open")) return;
		if (cebosMostrados >= CEBO_MAX) return;
		if (ceboUltimo && Date.now() - ceboUltimo < CEBO_ESPERA) return;

		var texto = (T.cebos && T.cebos[clave]) || T.cebo;
		if (cebosDichos[texto]) return;
		cebosDichos[texto] = true;

		// Si ya había uno en pantalla, se esconde y se vuelve a mostrar en el
		// cuadro siguiente: así el segundo ENTRA con su animación en vez de
		// cambiar de texto en silencio, que se lee como un error.
		var relanzar = !elCebo.hidden;
		elCebo.hidden = true;
		elCeboTx.textContent = texto;

		var mostrar = function () {
			if (ceboDescartado || root.classList.contains("open")) return;
			elCebo.hidden = false;
		};
		if (relanzar) setTimeout(mostrar, 260); else mostrar();

		cebosMostrados++;
		ceboUltimo = Date.now();
		clearTimeout(relojGenerico);

		// Se retira solo. Un globo que se queda pegado en la esquina toda la
		// visita deja de ser una invitación y pasa a ser un cartel. Ojo: NO
		// cuenta como descartado — el visitante no lo cerró, así que el
		// siguiente disparador todavía tiene derecho a hablar.
		clearTimeout(relojRetiro);
		relojRetiro = setTimeout(function () { ocultarCebo(false); }, 22000);
	}

	/* Un cebo que sale de una señal espera un poco antes de aparecer: si
	   salta en el mismo instante en que la persona movió un deslizador,
	   se siente como que alguien le está mirando la pantalla. */
	function ceboDemorado(clave, ms) {
		setTimeout(function () { mostrarCebo(clave); }, ms);
	}

	if (elCebo && !ceboDescartado && !historial.length) {
		var señalesInicio = señalesActuales();

		if (señalesInicio && señalesInicio.visitas > 1) {
			// Alguien que vuelve ya sabe que el chat existe: no hace falta
			// esperar a que lo descubra.
			setTimeout(function () { mostrarCebo("vuelve"); }, 4000);
		} else {
			// El genérico se corrió de 6 a 14 segundos para darle lugar a los
			// contextuales, que valen mucho más. Si en esos 14 segundos la
			// persona hizo algo, gana lo que hizo y el genérico se cancela.
			relojGenerico = setTimeout(function () { mostrarCebo("generico"); }, 14000);
		}

		document.addEventListener("ntg:senal", function (ev) {
			var tipo = (ev && ev.detail && ev.detail.tipo) || "";
			if (tipo === "calculadora")            ceboDemorado("calculadora", 12000);
			else if (tipo === "paquete")           ceboDemorado("paquetes", 6000);
			else if (tipo === "seccion:packages")  ceboDemorado("paquetes", 9000);
			else if (tipo === "seccion:faq")       ceboDemorado("dudas", 8000);
			else if (tipo === "seccion:talk")      ceboDemorado("formulario", 9000);
		});

		/* Intención de salida: el puntero se va por arriba de la ventana,
		   camino a la pestaña o a la barra de direcciones. Es el último
		   momento útil para ofrecer algo.

		   Sólo en escritorio, y a propósito: en el celular no existe el
		   equivalente honesto. Los disparadores táctiles que se usan para
		   esto (un scroll rápido hacia arriba, el evento de ocultar la
		   página) o molestan a quien no se estaba yendo, o llegan cuando la
		   pestaña ya se cerró y no se ve nada. */
		var yaHuboSalida = false;
		document.addEventListener("mouseout", function (ev) {
			if (yaHuboSalida || ev.relatedTarget || ev.clientY > 4) return;
			var s = señalesActuales();
			// Alguien que llegó, no miró nada y se va en diez segundos no es
			// un lead: es un rebote. Insistirle no lo convierte.
			if (s && s.segundos < 20) return;
			yaHuboSalida = true;
			mostrarCebo("salida");
		});
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
				historial.forEach(function (m) { agregarMensaje(m.role, m.content, false); agregarFotos(m.fotos); });
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

	/* ──────────────────────────────────────────────────────────
	   FOTOS DE LAS UNIDADES

	   Cuando el visitante pregunta por una unidad, el servidor
	   devuelve qué modelo mostrar (ver el tag [FOTO:...] en
	   api/_web/chat.js). El archivo lo resuelve ACÁ, no allá: las
	   imágenes son de la landing y viven al lado de este script, y
	   la página existe en / y en /es/, así que la ruta correcta sólo
	   la sabe el navegador. Se arma con la misma base que el logo.

	   Si el servidor manda un modelo que no está en esta tabla, no
	   se dibuja nada: mejor una respuesta sin foto que un recuadro
	   roto en la cara del prospecto.
	   ────────────────────────────────────────────────────────── */
	var TIPO_TXT = ES ? {
		exterior: "Exterior", interior: "Interior", plano: "Plano",
		video: "Video", paleta: "Paleta de colores",
	} : {
		exterior: "Exterior", interior: "Inside", plano: "Floor plan",
		video: "Video walkthrough", paleta: "Colour palette",
	};

	var PIE_FOTO = ES
		? "Unidad de fábrica. La terminación final puede variar."
		: "Factory-built unit. Final finish may vary.";

	var esVideo = function (u) { return /\.(mp4|webm|mov)(\?.*)?$/i.test(String(u || "")); };

	/* El catálogo mezcla links absolutos (ninitgroup.com) con archivos de la
	   propia landing ("img/3-stall.jpg"). Los relativos NO se pueden dejar
	   tal cual: el navegador los resolvería contra la página, y en /es/
	   buscaría /es/img/3-stall.jpg, que no existe. Se resuelven contra la
	   ubicación del script, igual que el logo. */
	var urlMedia = function (u) {
		var s = String(u || "");
		return /^(https?:)?\/\//i.test(s) ? s : RUTA_BASE + s.replace(/^\.?\//, "");
	};

	function agregarFotos(medios) {
		if (!medios || !medios.length) return;

		medios.forEach(function (media) {
			if (!media || !media.urls || !media.urls.length) return;

			var card = document.createElement("figure");
			card.className = "ntgchat-foto";

			var galeria = document.createElement("div");
			galeria.className = "ntgchat-foto-set" + (media.urls.length > 1 ? " multi" : "");

			var vivos = 0;
			media.urls.forEach(function (url) {
				var el;
				if (esVideo(url)) {
					el = document.createElement("video");
					el.src = urlMedia(url);
					el.controls = true;
					el.preload = "metadata";
					el.playsInline = true;
				} else {
					el = document.createElement("img");
					el.src = urlMedia(url);
					el.alt = media.nombre || "";
					el.loading = "lazy";
				}
				vivos++;
				// Si un archivo no carga se saca ESE, no la tarjeta entera: un
				// recuadro roto en un chat de ventas es peor que una foto
				// menos. Cuando no queda ninguno, se va la tarjeta completa.
				el.addEventListener("error", function () {
					el.remove();
					if (--vivos <= 0) card.remove();
				});
				galeria.appendChild(el);
			});

			var pie = document.createElement("figcaption");
			var titulo = document.createElement("strong");
			titulo.textContent = (media.nombre || "") +
				(TIPO_TXT[media.tipo] ? " · " + TIPO_TXT[media.tipo] : "");
			var nota = document.createElement("span");
			nota.textContent = PIE_FOTO;
			pie.appendChild(titulo);
			pie.appendChild(nota);

			card.appendChild(galeria);
			card.appendChild(pie);
			elBody.appendChild(card);
		});
		elBody.scrollTop = elBody.scrollHeight;
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
	(historial || []).forEach(function (m) { agregarMensaje(m.role, m.content, false); agregarFotos(m.fotos); });
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
					return { role: m.role, content: m.content, formShown: !!m.formShown, fotos: m.fotos || [] };
				}),
				// Lo que la persona estuvo haciendo en la página. El servidor
				// lo usa para elegir de qué hablar, NO para mencionarlo: ver
				// contextoPrompt() en api/_web/chat.js.
				contexto: contextoActual(),
			}),
		})
			.then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
			.then(function (res) {
				typing.remove();
				if (!res.ok) throw new Error((res.data && res.data.error) || "No pudimos responder.");
				var burbuja = agregarMensaje("assistant", res.data.reply || T.reformular);

				// Las fotos quedan guardadas en el mensaje, no sueltas: así se
				// vuelven a dibujar si la persona recarga, y el servidor sabe
				// cuáles ya mostró para no repetirlas.
				var fotos = Array.isArray(res.data.fotos) ? res.data.fotos : [];
				if (fotos.length) {
					historial[historial.length - 1].fotos = fotos;
					persistir();
					agregarFotos(fotos);
				}

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
	/* Lo que la persona YA escribió en el chat no se le vuelve a pedir: si
	   dejó el teléfono o el mail en un mensaje, el mini-formulario aparece
	   con ese campo lleno. Cada campo que hay que tipear de nuevo es gente
	   que abandona.

	   Conservador a propósito: se toma el primer candidato claro y nada más.
	   Un teléfono mal adivinado es peor que un campo vacío — el vendedor
	   llama a un número que no existe y el lead se pierde igual. */
	function datosDelChat() {
		var texto = historial
			.filter(function (m) { return m.role === "user"; })
			.map(function (m) { return m.content; })
			.join("\n");

		var email = (texto.match(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i) || [""])[0];

		var telefono = "";
		var m = texto.match(/\+?\d[\d\s().\-]{8,17}\d/);
		if (m) {
			var digitos = m[0].replace(/\D/g, "");
			// Entre 10 y 15 dígitos: así un precio, un código postal o un año
			// no se cuelan como número de teléfono.
			if (digitos.length >= 10 && digitos.length <= 15) telefono = m[0].trim();
		}
		return { email: email, telefono: telefono };
	}

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

		var yaDicho = datosDelChat();
		if (yaDicho.telefono) wrap.querySelector("#ntgchat-lf-phone").value = yaDicho.telefono;
		if (yaDicho.email) wrap.querySelector("#ntgchat-lf-email").value = yaDicho.email;

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
					// El transcript entero: es lo que lee la calificación con
					// IA del lado del servidor (api/_web/calificar.js) para
					// decirle al vendedor si conviene llamar ya. Recortarlo a
					// 1.200 caracteres se comía justo el final, que es donde
					// la persona dice para cuándo y de dónde es.
					mensaje: T.conversacion + "\n" + transcript.slice(0, 5000),
					paquete: paqueteActual(),
					escenario: escenarioActual(),
					contexto: contextoActual(),
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
