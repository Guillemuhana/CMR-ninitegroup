/* ============================================================
   NINI T-GROUP — landing /business/
   Tres cosas y nada más: la calculadora, el formulario que entra
   al CRM, y la aparición de las secciones al scrollear.

   Sin frameworks y sin build: este archivo se sirve tal cual desde
   public/, así que tiene que correr en el navegador sin transpilar.
   ============================================================ */
(function () {
	"use strict";

	var $ = function (id) { return document.getElementById(id); };

	/* ──────────────────────────────────────────────────────────
	   Año del pie
	   ────────────────────────────────────────────────────────── */
	var yr = $("yr");
	if (yr) yr.textContent = String(new Date().getFullYear());

	/* ──────────────────────────────────────────────────────────
	   MOVIMIENTO

	   Dos caminos, y el orden importa:

	     · Si GSAP y ScrollTrigger cargaron, se usan ellos: scroll suave con
	       Lenis, el hilo de la cadena que se llena, los pasos que se
	       encienden y las tarjetas que entran de los costados.
	     · Si el CDN no respondió, lo bloquea una extensión o el visitante
	       pidió menos movimiento, se cae al IntersectionObserver de
	       siempre. La página se ve igual, sólo que sin animación.

	   La regla que no se negocia: NADA del contenido puede depender de que
	   una librería externa cargue. Por eso el respaldo existe y por eso el
	   estado inicial "invisible" siempre lo puede deshacer el respaldo.
	   ────────────────────────────────────────────────────────── */
	var menosMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	var hayGsap = !menosMovimiento && typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";

	// Respaldo: mostrar las secciones al entrar en pantalla.
	function revelarSimple() {
		var reveals = document.querySelectorAll(".reveal");
		if (!("IntersectionObserver" in window)) {
			Array.prototype.forEach.call(reveals, function (el) { el.classList.add("in"); });
			return;
		}
		var io = new IntersectionObserver(function (entries) {
			entries.forEach(function (e) {
				if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
			});
		}, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
		Array.prototype.forEach.call(reveals, function (el) { io.observe(el); });
	}

	if (!hayGsap) {
		revelarSimple();
	} else {
		gsap.registerPlugin(ScrollTrigger);

		// ── Scroll suave (Lenis) ──────────────────────────────────────────
		// Lenis toma el control del scroll, así que hay que avisarle a
		// ScrollTrigger en cada cuadro o las animaciones se desincronizan.
		var lenis = null;
		if (typeof window.Lenis !== "undefined") {
			lenis = new Lenis({ duration: 1.05, smoothWheel: true, touchMultiplier: 1.6 });
			lenis.on("scroll", ScrollTrigger.update);
			gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
			gsap.ticker.lagSmoothing(0);

			// Con Lenis manejando el scroll, los enlaces internos dejan de
			// funcionar solos: hay que pasárselos.
			document.querySelectorAll('a[href^="#"]').forEach(function (a) {
				a.addEventListener("click", function (ev) {
					var destino = document.querySelector(a.getAttribute("href"));
					if (!destino) return;
					ev.preventDefault();
					// El desplazamiento es el alto de la barra fija (76px) más
					// un poco de aire, para que el título de la sección no
					// quede pegado abajo de ella.
					lenis.scrollTo(destino, { offset: -92 });
				});
			});
		}

		// ── Aparición de las secciones ────────────────────────────────────
		document.querySelectorAll(".reveal").forEach(function (el) {
			gsap.fromTo(el,
				{ opacity: 0, y: 26 },
				{
					opacity: 1, y: 0, duration: .8, ease: "power2.out",
					scrollTrigger: { trigger: el, start: "top 88%", once: true },
					onStart: function () { el.classList.add("in"); }
				}
			);
		});

		// ── Parallax de la foto del hero ──────────────────────────────────
		var heroBg = document.querySelector(".hero-bg");
		if (heroBg) {
			gsap.to(heroBg, {
				yPercent: 14, ease: "none",
				scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true }
			});
		}

		// ── La cadena: el hilo se llena y va encendiendo cada paso ────────
		var cadena = document.getElementById("chain");
		if (cadena) {
			var pasos = cadena.querySelectorAll(".chain-step");
			var hilo = cadena.querySelector(".chain-fill");

			// Entrada escalonada de las tarjetas.
			gsap.from(pasos, {
				opacity: 0, y: 24, scale: .96,
				duration: .5, ease: "power2.out", stagger: .07,
				scrollTrigger: { trigger: cadena, start: "top 85%", once: true }
			});

			// El hilo avanza con el scroll y cada paso se prende al ser
			// alcanzado. Se apaga al volver hacia arriba, así el efecto
			// funciona en los dos sentidos.
			if (hilo) {
				ScrollTrigger.create({
					trigger: cadena,
					start: "top 72%",
					end: "bottom 45%",
					scrub: .5,
					onUpdate: function (self) {
						var p = self.progress;
						hilo.style.width = (p * 100).toFixed(2) + "%";
						var hasta = Math.round(p * pasos.length);
						pasos.forEach(function (paso, i) {
							paso.classList.toggle("on", i < hasta);
						});
					}
				});
			}
		}

		// ── Las dos tarjetas entran desde los costados ────────────────────
		var them = document.querySelector(".vs-them");
		var us = document.querySelector(".vs-us");
		if (them && us) {
			var tl = gsap.timeline({
				scrollTrigger: { trigger: ".versus", start: "top 80%", once: true }
			});
			tl.from(them, { opacity: 0, x: -38, duration: .7, ease: "power3.out" })
			  .from(us,   { opacity: 0, x: 38,  duration: .7, ease: "power3.out" }, "-=.55")
			  .from(us.querySelectorAll(".vs-list li"), {
			  	opacity: 0, x: 16, duration: .4, ease: "power2.out", stagger: .06
			  }, "-=.35");
		}
	}

	/* ──────────────────────────────────────────────────────────
	   Reflejo que sigue al mouse en la tarjeta de NTG.
	   Va fuera del bloque de GSAP: es CSS y dos variables, no necesita
	   librería. En touch no se dispara nunca.
	   ────────────────────────────────────────────────────────── */
	var tarjetaNtg = document.getElementById("vs-us");
	if (tarjetaNtg && !menosMovimiento) {
		tarjetaNtg.addEventListener("pointermove", function (ev) {
			if (ev.pointerType === "touch") return;
			var r = tarjetaNtg.getBoundingClientRect();
			tarjetaNtg.style.setProperty("--mx", (ev.clientX - r.left) + "px");
			tarjetaNtg.style.setProperty("--my", (ev.clientY - r.top) + "px");
		});
	}

	/* ──────────────────────────────────────────────────────────
	   CALCULADORA

	   Los valores por defecto de renta salen de la ficha comercial
	   autorizada (api/_ntg.js): 2-Stall ~1.100/día, 3-Stall
	   ~1.400-1.500/día, 4-Stall ~1.800/día. Son REFERENCIAS DE
	   MERCADO — el texto del panel lo dice explícitamente y no se
	   debe suavizar.
	   ────────────────────────────────────────────────────────── */
	var elModel    = $("c-model");
	var elRentals  = $("c-rentals");
	var elDays     = $("c-days");
	var elRate     = $("c-rate");
	var elDelivery = $("c-delivery");
	var elClean    = $("c-clean");
	var elPump     = $("c-pump");
	var elFuel     = $("c-fuel");
	var elMkt      = $("c-marketing");
	var elStorage  = $("c-storage");
	var elOther    = $("c-other");
	var elFin      = $("c-fin");
	var elFinBox   = $("c-fin-box");
	var elDown     = $("c-down");
	var elApr      = $("c-apr");
	var elTerm     = $("c-term");

	var hayCalc = !!(elModel && elRentals && elRate);

	var money = function (n) {
		if (!isFinite(n)) n = 0;
		var s = Math.round(Math.abs(n)).toLocaleString("en-US");
		return (n < 0 ? "-$" : "$") + s;
	};

	var num = function (el, fallback) {
		if (!el) return fallback || 0;
		var v = parseFloat(el.value);
		return isFinite(v) && v >= 0 ? v : (fallback || 0);
	};

	// Cuota francesa. Con APR 0 es simplemente capital / plazo.
	function cuota(capital, aprPct, meses) {
		if (capital <= 0 || meses <= 0) return 0;
		var i = (aprPct / 100) / 12;
		if (i <= 0) return capital / meses;
		var f = Math.pow(1 + i, meses);
		return capital * i * f / (f - 1);
	}

	function recalcular() {
		if (!hayCalc) return;

		var rentals = num(elRentals, 0);
		var days    = num(elDays, 1);
		var rate    = num(elRate, 0);
		var deliv   = num(elDelivery, 0);

		var ingresoRenta   = rentals * days * rate;
		var ingresoEntrega = rentals * deliv;

		var variable = rentals * (num(elClean, 0) + num(elPump, 0) + num(elFuel, 0));
		var fijo     = num(elMkt, 0) + num(elStorage, 0) + num(elOther, 0);

		var prestamo = 0;
		if (elFin && elFin.checked) {
			var opcion  = elModel.options[elModel.selectedIndex];
			var precio  = parseFloat(opcion.getAttribute("data-price")) || 0;
			var entrada = Math.min(num(elDown, 0), precio);
			prestamo = cuota(precio - entrada, num(elApr, 0), parseInt(elTerm.value, 10) || 48);
		}

		var neto = ingresoRenta + ingresoEntrega - variable - fijo - prestamo;

		$("o-rent").textContent = money(ingresoRenta);
		$("o-del").textContent  = money(ingresoEntrega);
		$("o-var").textContent  = "-" + money(variable);
		$("o-fix").textContent  = "-" + money(fijo);

		var filaPrestamo = $("o-loan-row");
		if (prestamo > 0) {
			filaPrestamo.hidden = false;
			$("o-loan").textContent = "-" + money(prestamo);
		} else {
			filaPrestamo.hidden = true;
		}

		$("o-net").textContent = money(neto);

		// Una línea de contexto, sin prometer nada.
		var sub = $("o-sub");
		if (rentals === 0) {
			sub.textContent = "Set a number of rentals per month to see a scenario.";
		} else {
			var dias = rentals * days;
			sub.textContent = dias + (dias === 1 ? " booked day" : " booked days") +
				" a month · " + money(neto / Math.max(dias, 1)) + " per booked day, before taxes.";
		}
	}

	// Al cambiar de modelo se carga la referencia de renta de ESE modelo,
	// pero solo si el visitante todavía no tocó el campo a mano: si ya puso
	// su propio precio, pisárselo sería grosero.
	var tarifaTocadaAMano = false;
	if (elRate) {
		elRate.addEventListener("input", function () { tarifaTocadaAMano = true; });
	}
	if (elModel) {
		elModel.addEventListener("change", function () {
			if (!tarifaTocadaAMano) {
				var ref = elModel.options[elModel.selectedIndex].getAttribute("data-rate");
				if (ref) elRate.value = ref;
			}
			recalcular();
		});
	}

	if (elFin) {
		elFin.addEventListener("change", function () {
			elFinBox.hidden = !elFin.checked;
			recalcular();
		});
	}

	// Los dos sliders muestran su valor al lado.
	[[elRentals, "c-rentals-v"], [elDays, "c-days-v"]].forEach(function (par) {
		var input = par[0], salida = $(par[1]);
		if (!input || !salida) return;
		input.addEventListener("input", function () {
			salida.textContent = input.value;
			recalcular();
		});
	});

	[elRate, elDelivery, elClean, elPump, elFuel, elMkt, elStorage, elOther, elDown, elApr, elTerm]
		.forEach(function (el) {
			if (!el) return;
			el.addEventListener("input", recalcular);
			el.addEventListener("change", recalcular);
		});

	recalcular();

	/* ──────────────────────────────────────────────────────────
	   Resumen del escenario para adjuntar al lead

	   Si el visitante jugó con la calculadora y después pide que se
	   la revisemos, el vendedor tiene que ver con qué números la
	   armó. Se manda como texto plano dentro de la nota del lead.
	   ────────────────────────────────────────────────────────── */
	var pidioRevision = false;
	var ctaCalc = $("o-cta");
	if (ctaCalc) ctaCalc.addEventListener("click", function () { pidioRevision = true; });

	function resumenEscenario() {
		if (!hayCalc) return "";
		var opcion = elModel.options[elModel.selectedIndex];
		var partes = [
			"Unit: " + opcion.text,
			"Rentals/mo: " + elRentals.value,
			"Days/rental: " + elDays.value,
			"Day rate: $" + elRate.value,
			"Delivery fee: $" + elDelivery.value,
			"Cleaning: $" + elClean.value,
			"Pump-out: $" + elPump.value,
			"Fuel: $" + elFuel.value,
			"Marketing/mo: $" + elMkt.value,
			"Storage+ins/mo: $" + elStorage.value,
			"Other/mo: $" + elOther.value
		];
		if (elFin && elFin.checked) {
			partes.push("Financing: down $" + elDown.value + ", " + elApr.value + "% APR, " + elTerm.value + " mo");
		}
		partes.push("Estimated monthly net: " + $("o-net").textContent);
		return partes.join(" | ");
	}

	/* ──────────────────────────────────────────────────────────
	   Los botones de cada paquete preseleccionan el paquete en el
	   formulario antes de bajar hasta él.
	   ────────────────────────────────────────────────────────── */
	var selPaquete = $("f-pack");
	var paqueteElegido = "";
	Array.prototype.forEach.call(document.querySelectorAll("[data-pack]"), function (btn) {
		btn.addEventListener("click", function () {
			paqueteElegido = btn.getAttribute("data-pack") || "";
			if (selPaquete) selPaquete.value = paqueteElegido;
			avisarSeñal("paquete");
		});
	});

	/* ──────────────────────────────────────────────────────────
	   SEÑALES DE NAVEGACIÓN

	   Qué secciones miró, si tocó la calculadora y con qué números,
	   cuánto hace que está, si ya había entrado antes. Tres usos:

	     1. El asistente (assistant-widget.js) habla de lo que la
	        persona está mirando en vez de arrancar de cero, y elige
	        CUÁNDO ofrecerse en vez de saltar siempre a los 6 segundos.
	     2. Viajan con el lead: el vendedor ve "estuvo 6 minutos en la
	        calculadora con un 3-Stall" antes de levantar el teléfono.
	     3. Alimentan la calificación con IA (api/_web/calificar.js).

	   Vive acá y no en el widget a propósito: el widget se tiene que
	   poder borrar de index.html sin romper nada, y esto es de la
	   landing. Si el widget no está, las señales simplemente no las
	   lee nadie.

	   Qué NO hace: no manda nada a ningún lado por su cuenta, no pone
	   cookies de terceros y no identifica a nadie. Es un objeto en
	   memoria que se adjunta al lead SI el visitante decide dejarlo.
	   ────────────────────────────────────────────────────────── */
	var señales = {
		inicio: Date.now(),
		secciones: [],
		calculadora: false,
		visitas: 1
	};

	function avisarSeñal(tipo) {
		try {
			document.dispatchEvent(new CustomEvent("ntg:senal", { detail: { tipo: tipo } }));
		} catch (e) { /* navegadores viejos: el widget igual puede preguntar */ }
	}

	// Visitas anteriores. localStorage y no sessionStorage: la gracia es
	// justamente saber que alguien VUELVE otro día. Si está bloqueado
	// (Safari privado, cuotas), queda en 1 y no pasa nada.
	try {
		var previas = parseInt(localStorage.getItem("ntg_visitas") || "0", 10);
		señales.visitas = (isFinite(previas) ? previas : 0) + 1;
		localStorage.setItem("ntg_visitas", String(señales.visitas));
	} catch (e) {}

	// Secciones que entraron en pantalla de verdad (un 35%, no un roce).
	if ("IntersectionObserver" in window) {
		var ioSec = new IntersectionObserver(function (entries) {
			entries.forEach(function (e) {
				if (!e.isIntersecting) return;
				var id = e.target.id;
				if (id && señales.secciones.indexOf(id) === -1) {
					señales.secciones.push(id);
					avisarSeñal("seccion:" + id);
				}
				ioSec.unobserve(e.target);
			});
		}, { threshold: 0.35 });
		Array.prototype.forEach.call(document.querySelectorAll("section[id]"), function (s) {
			ioSec.observe(s);
		});
	}

	// Un solo oyente delegado sobre el panel de la calculadora, en vez de
	// meter mano en los listeners de cada campo que ya existen.
	var panelCalc = $("calculator");
	if (panelCalc) {
		var marcarCalc = function () {
			if (señales.calculadora) return;
			señales.calculadora = true;
			avisarSeñal("calculadora");
		};
		panelCalc.addEventListener("input", marcarCalc, true);
		panelCalc.addEventListener("change", marcarCalc, true);
	}

	// Parámetros de campaña, para saber de qué aviso vino el lead.
	var campaña = "";
	try {
		var qs = new URLSearchParams(window.location.search);
		campaña = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid", "gclid"]
			.map(function (k) { return qs.get(k) ? k + "=" + qs.get(k) : ""; })
			.filter(Boolean).join(" · ").slice(0, 200);
	} catch (e) {}

	/** Resumen en una línea de todo lo anterior. En inglés, como el resto
	 *  del mensaje que le llega al vendedor. Vacío si no hay nada que decir. */
	function contextoNavegacion() {
		var minutos = Math.round((Date.now() - señales.inicio) / 60000);
		var partes = [];

		if (señales.secciones.length) {
			partes.push("Sections viewed: " + señales.secciones.slice(0, 12).join(", "));
		}
		if (señales.calculadora) {
			var opcion = hayCalc ? elModel.options[elModel.selectedIndex] : null;
			partes.push("Played with the calculator" + (opcion
				? " (" + opcion.text + ", " + elRentals.value + " rentals/mo, est. net " + $("o-net").textContent + "/mo)"
				: ""));
		}
		if (pidioRevision) partes.push("Clicked \"have us review these numbers\"");
		if (paqueteElegido) partes.push("Clicked the " + paqueteElegido + " package button");
		partes.push(minutos < 1 ? "Less than a minute on the page" : minutos + " min on the page");
		if (señales.visitas > 1) partes.push("Visit #" + señales.visitas + " (has been here before)");
		if (campaña) partes.push("Campaign: " + campaña);

		return partes.join(" · ").slice(0, 700);
	}

	/* Puente para el asistente. Es lo único que el widget conoce de este
	   archivo, y todo lo que lee es de sólo lectura. */
	window.NTG = window.NTG || {};
	window.NTG.contexto = contextoNavegacion;
	window.NTG.escenario = function () { return señales.calculadora ? resumenEscenario() : ""; };
	window.NTG.paquete = function () { return paqueteElegido; };
	window.NTG.señales = function () {
		return {
			secciones: señales.secciones.slice(),
			calculadora: señales.calculadora,
			paquete: paqueteElegido,
			visitas: señales.visitas,
			segundos: Math.round((Date.now() - señales.inicio) / 1000)
		};
	};

	/* ──────────────────────────────────────────────────────────
	   FORMULARIO -> CRM

	   POST a /api/lead (rewrite a /api/push?accion=lead). El endpoint
	   inserta en la tabla contactos con el service role: la landing
	   nunca ve una clave de Supabase.

	   La ruta va RELATIVA, nunca con el dominio del CRM. El cliente no
	   tiene que ver ni enterarse de que existe una app interna: el CRM
	   lo usa sólo el equipo de NINI.

	   En el dominio de la landing, /api/* lo reenvía Vercel al proyecto
	   del CRM (ver public/business/vercel.json). En
	   ninit-crm.vercel.app/business resuelve solo, porque el endpoint
	   vive ahí mismo.
	   ────────────────────────────────────────────────────────── */
	var ENDPOINT_LEAD = "/api/lead";

	var form = $("lead-form");
	if (!form) return;

	var boton  = $("f-submit");
	var salida = $("f-msg-out");

	function avisar(texto, clase) {
		salida.textContent = texto;
		salida.className = "form-msg show " + clase;
	}

	form.addEventListener("submit", function (ev) {
		ev.preventDefault();

		var nombre   = $("f-name").value.trim();
		var telefono = $("f-phone").value.trim();
		var email    = $("f-email").value.trim();
		var consent  = $("f-consent").checked;

		if (!nombre || !telefono) {
			avisar("Please add your name and a phone number so we can reach you.", "err");
			return;
		}
		// Meta mínima: hace falta algo que pueda ser un teléfono real.
		if (telefono.replace(/\D/g, "").length < 7) {
			avisar("That phone number looks incomplete. Please check it.", "err");
			return;
		}
		if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
			avisar("That email address doesn't look right.", "err");
			return;
		}
		if (!consent) {
			avisar("Please tick the box so we're allowed to contact you.", "err");
			return;
		}

		boton.disabled = true;
		var textoOriginal = boton.textContent;
		boton.textContent = "Sending…";
		salida.className = "form-msg";

		var cuerpo = {
			nombre: nombre,
			telefono: telefono,
			email: email,
			zip: $("f-zip").value.trim(),
			paquete: $("f-pack").value,
			perfil: $("f-profile").value,
			mensaje: $("f-msg").value.trim(),
			// Trampa anti-bot: si viene con algo, es un bot.
			company: $("f-company").value,
			escenario: pidioRevision ? resumenEscenario() : "",
			// Lo que estuvo haciendo en la página. Va con el lead para que el
			// vendedor sepa con quién habla antes de marcar, y para que la
			// calificación con IA tenga de dónde agarrarse.
			contexto: contextoNavegacion(),
			origen: "landing /business",
			referrer: document.referrer || "",
			url: window.location.href
		};

		fetch(ENDPOINT_LEAD, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(cuerpo)
		})
			.then(function (r) {
				return r.json().then(function (data) { return { ok: r.ok, data: data }; });
			})
			.then(function (res) {
				if (!res.ok) throw new Error((res.data && res.data.error) || "No pudimos enviarlo.");
				form.reset();
				if (elFinBox) elFinBox.hidden = true;
				avisar("Got it — thank you. Someone from our team will get back to you shortly, usually the same day.", "ok");
				boton.textContent = "Request sent";
			})
			.catch(function (err) {
				boton.disabled = false;
				boton.textContent = textoOriginal;
				avisar(
					"We couldn't send that. Please try again, or write to us directly at ninitgroup@gmail.com. (" +
					(err.message || "network error") + ")",
					"err"
				);
			});
	});
})();
