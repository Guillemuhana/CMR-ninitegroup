/* NINIT — firma electrónica de la cotización.
 *
 * Port de assets/js/request.js del plugin de WordPress. Cubre las dos
 * variantes que rinde la plantilla:
 *
 *   - COTIZACIÓN EMITIDA: no hay nada que completar. Solo el pad de firma y el
 *     envío; los datos y el precio ya vienen impresos en el documento.
 *   - COTIZACIÓN ABIERTA (form[data-abierta]): el que la recibe escribe sus
 *     datos y elige la configuración. Acá además hay que validar los campos,
 *     escribir lo que va tipeando en el propio acuerdo ("Prepared For", líneas
 *     de firma) y recalcular los totales cuando cambia la cantidad.
 *
 * El precio que se muestre acá es informativo: el que vale es el que recalcula
 * el servidor con el precio de lista al recibir la firma.
 */
(function () {
  "use strict";

  var ENDPOINT = "/api/cotizacion-firmar";

  function usd(n) {
    return (
      "US$" +
      Number(n || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  function init() {
    var form = document.getElementById("nq-form");
    if (!form) return;

    var scope = form.closest(".nq-sheet") || document;
    var abierta = form.dataset.abierta === "1";
    var feedback = scope.querySelector(".nq-form-feedback");
    var btn = scope.querySelector(".nq-btn-submit");
    var padWrap = scope.querySelector(".nq-sign-pad-wrap");
    var canvas = scope.querySelector(".nq-sign-pad");
    var sigInput = scope.querySelector(".nq-signature-input");
    var acepta = scope.querySelector(".nq-accept-checkbox");
    var enviado = false;

    // ---- Pad de firma: mouse o dedo -------------------------------------
    var ctx = canvas.getContext("2d");
    var hayFirma = false;
    var dibujando = false;

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#16365c";

    function pos(e) {
      var r = canvas.getBoundingClientRect();
      var t = e.touches && e.touches[0];
      var x = (t ? t.clientX : e.clientX) - r.left;
      var y = (t ? t.clientY : e.clientY) - r.top;
      return { x: x * (canvas.width / r.width), y: y * (canvas.height / r.height) };
    }
    function start(e) {
      dibujando = true;
      hayFirma = true;
      var p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      padWrap.classList.remove("nq-invalid");
      e.preventDefault();
    }
    function move(e) {
      if (!dibujando) return;
      var p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      e.preventDefault();
    }
    function end() {
      dibujando = false;
    }

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    // passive:false — en celular hay que poder cancelar el scroll para dibujar.
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);

    var limpiar = scope.querySelector(".nq-sign-clear");
    if (limpiar) {
      limpiar.addEventListener("click", function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hayFirma = false;
      });
    }

    // ---- Cotización abierta: el documento se completa mientras escribe ----
    // La idea es que el cliente vea SU acuerdo, no un formulario: elige modelo
    // y lo que tipea aparece en "Prepared For" y en las líneas de firma. Al
    // cambiar de modelo se le cambian fotos, ficha técnica y precios; al
    // cambiar la cantidad se recalculan los importes.
    var catalogo = [];
    try {
      var crudo = document.getElementById("nq-catalogo");
      if (crudo) catalogo = JSON.parse(crudo.textContent) || [];
    } catch (e) {
      catalogo = [];
    }

    var hoja = scope;
    var modelo = null; // el elegido; null hasta que se aplica el primero

    function valorDe(nombre) {
      var el = form.elements[nombre];
      if (!el) return "";
      // Los radios del selector de modelo vienen como RadioNodeList.
      return (el.value || "").trim();
    }

    function modeloDe(clave) {
      for (var i = 0; i < catalogo.length; i++) {
        if (catalogo[i].clave === clave) return catalogo[i];
      }
      return catalogo[0] || null;
    }

    /** Escribe un dato en todos los lugares del acuerdo que lo muestran. */
    function pintar(campo, valor) {
      var nodos = scope.querySelectorAll('[data-nq="' + campo + '"]');
      for (var i = 0; i < nodos.length; i++) {
        var n = nodos[i];
        if (valor) {
          n.textContent = valor;
          n.classList.add("nq-sign-live-filled");
        } else {
          n.textContent = n.dataset.vacio || "";
          n.classList.remove("nq-sign-live-filled");
        }
      }
    }

    /** Cambia una foto; si el modelo no tiene esa foto, se esconde el hueco. */
    function foto(campo, src, alt) {
      var img = scope.querySelector('img[data-nq="' + campo + '"]');
      if (!img) return;
      if (src) {
        img.src = src;
        if (alt) img.alt = alt;
        img.hidden = false;
      } else {
        img.removeAttribute("src");
        img.hidden = true;
      }
    }

    /** Aplica el modelo elegido a todo el documento. */
    function aplicarModelo(m) {
      if (!m) return;
      modelo = m;

      pintar("modelo-nombre", m.nombre);
      pintar("quote-number", m.numero);
      pintar("nota-config", m.notaConfig || "");

      foto("hero", m.hero, m.etiqueta + " exterior");
      foto("floorplan", m.floorplan, "Floor plan");

      var galeria = scope.querySelector('[data-nq="interior"]');
      if (galeria) {
        galeria.innerHTML = "";
        for (var i = 0; i < (m.interior || []).length; i++) {
          var img = document.createElement("img");
          img.src = m.interior[i];
          img.alt = "Interior";
          img.loading = "lazy";
          galeria.appendChild(img);
        }
        galeria.hidden = !(m.interior || []).length;
      }

      var ficha = scope.querySelector('[data-nq="specs"]');
      if (ficha) {
        ficha.innerHTML = "";
        for (var j = 0; j < (m.specs || []).length; j++) {
          var it = document.createElement("li");
          it.textContent = m.specs[j];
          ficha.appendChild(it);
        }
      }

      // Marcar la tarjeta elegida a mano además del :has(input:checked) del
      // CSS, para los navegadores viejos que no soportan :has().
      var tarjetas = form.querySelectorAll(".nq-modelo");
      for (var t = 0; t < tarjetas.length; t++) {
        var radio = tarjetas[t].querySelector("input");
        tarjetas[t].classList.toggle("is-elegida", !!radio && radio.checked);
      }

      // Un modelo sin precio de lista no se firma: se pide cotización.
      hoja.classList.toggle("nq-a-pedido", m.precio == null);
      // La casilla de aceptación queda escondida en ese caso, así que hay que
      // sacarle el required: un campo obligatorio invisible traba el envío.
      if (acepta) acepta.required = m.precio != null;
      if (btn) {
        btn.textContent = m.precio == null ? "Request My Quote →" : "Sign & Send Agreement →";
      }

      recalcular();
    }

    function recalcular() {
      var cant = Math.max(1, parseInt(valorDe("cantidad"), 10) || 1);
      pintar("qty", String(cant));
      pintar("qtynota", cant > 1 ? " · " + cant + " units" : "");

      if (!modelo || modelo.precio == null) {
        pintar("linea", "On request");
        pintar("total", "Price on request");
        pintar("deposit", "—");
        pintar("balance", "—");
        pintar("pct", "50");
        return;
      }

      var total = modelo.precio * cant;
      // Mismo criterio que el servidor: 50% para arrancar producción.
      var anticipo = Math.round(total * 0.5 * 100) / 100;

      pintar("linea", usd(modelo.precio * cant));
      pintar("total", usd(total));
      pintar("deposit", usd(anticipo));
      pintar("balance", usd(total - anticipo));
      pintar("pct", "50");
    }

    function refrescar() {
      pintar("name", valorDe("nombre"));
      pintar("empresa", valorDe("empresa"));
      pintar("email", valorDe("email"));
      pintar("tel", valorDe("telefono"));
      pintar("loc", valorDe("ubicacion"));
      pintar("exterior", valorDe("exterior"));
      pintar("interior-fin", valorDe("interior"));
      pintar("entrega", valorDe("entrega"));

      var elegido = modeloDe(valorDe("modelo"));
      if (elegido && (!modelo || elegido.clave !== modelo.clave)) aplicarModelo(elegido);
      else recalcular();
    }

    /** Marca el campo en rojo y devuelve false, para cortar el envío. */
    function invalido(nombre, msg) {
      var el = form.elements[nombre];
      var caja = el && el.closest && el.closest(".nq-ffield");
      if (caja) caja.classList.add("nq-invalid");
      decir("error", msg);
      if (el && el.scrollIntoView) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        if (el.focus) el.focus({ preventScroll: true });
      }
      return false;
    }

    function validarDatos() {
      var cajas = form.querySelectorAll(".nq-ffield.nq-invalid");
      for (var i = 0; i < cajas.length; i++) cajas[i].classList.remove("nq-invalid");

      if (valorDe("nombre").length < 2) {
        return invalido("nombre", "Please enter your full name.");
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valorDe("email"))) {
        return invalido("email", "Please enter a valid email address.");
      }
      if (valorDe("ubicacion").length < 2) {
        return invalido("ubicacion", "Please enter the city and state for delivery or pickup.");
      }
      return true;
    }

    /** ¿El modelo elegido se cotiza a pedido? Entonces no se firma nada. */
    function aPedido() {
      return !!(abierta && modelo && modelo.precio == null);
    }

    if (abierta) {
      form.addEventListener("input", refrescar);
      form.addEventListener("change", refrescar);
      aplicarModelo(modeloDe(valorDe("modelo") || form.dataset.modelo));
      refrescar();
    }

    // La fecha del acuerdo abierto es la del día en que se abre, no la del día
    // en que se generó el archivo.
    var fechaHoy = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    var fechas = scope.querySelectorAll(".nq-fecha.nq-hoy");
    for (var f = 0; f < fechas.length; f++) fechas[f].textContent = fechaHoy;

    // ---- Envío ------------------------------------------------------------
    function decir(tipo, msg, html) {
      feedback.className = "nq-form-feedback" + (tipo ? " is-" + tipo : "");
      if (html) feedback.innerHTML = msg;
      else feedback.textContent = msg || "";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      enviar();
    });

    function enviar() {
      if (enviado) return;
      decir("", "");

      if (abierta && !validarDatos()) return;

      // Modelo sin precio de lista: no hay nada que aceptar ni que firmar. Se
      // manda el pedido y el equipo vuelve con el precio.
      if (!aPedido()) {
        if (acepta && !acepta.checked) {
          decir("error", "Please tick the acceptance box before signing.");
          acepta.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }

        if (!hayFirma) {
          padWrap.classList.add("nq-invalid");
          decir("error", "Please sign in the signature box before submitting.");
          canvas.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }

        sigInput.value = canvas.toDataURL("image/png");
      } else {
        sigInput.value = "";
      }

      btn.disabled = true;
      var original = btn.textContent;
      btn.textContent = aPedido() ? "Sending…" : "Signing…";

      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote: form.dataset.quote,
          signature: sigInput.value,
          accepted: true,
          // Sin precio de lista no se firma un acuerdo: es un pedido.
          modo: aPedido() ? "pedido" : "firma",
          message: (form.elements.message.value || "").trim(),
          company_url: form.elements.company_url.value || "", // honeypot
          // Solo la cotización abierta manda datos: en la emitida el servidor
          // ignora cualquier cosa que venga de acá.
          cliente: abierta
            ? {
                modelo: valorDe("modelo"),
                nombre: valorDe("nombre"),
                empresa: valorDe("empresa"),
                email: valorDe("email"),
                telefono: valorDe("telefono"),
                ubicacion: valorDe("ubicacion"),
                cantidad: valorDe("cantidad"),
                entrega: valorDe("entrega"),
                exterior: valorDe("exterior"),
                interior: valorDe("interior"),
              }
            : undefined,
        }),
      })
        .then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, j: j };
          });
        })
        .then(function (res) {
          if (!res.ok || !res.j || !res.j.ok) {
            throw new Error((res.j && res.j.error) || "");
          }

          enviado = true;
          // El acuerdo firmado sale únicamente a NINIT: acá no se ofrece copia
          // ni descarga. El equipo se la hace llegar junto con la factura.
          decir(
            "success",
            res.j.pedido
              ? "✓ Sent! We have your request. Our team will come back to you shortly with your price and the agreement ready to sign."
              : "✓ Signed! Your Purchase Agreement has been sent to NINI T-GROUP. Our team will follow up with the deposit invoice."
          );

          btn.textContent = res.j.pedido ? "Sent ✓" : "Signed ✓";
          var editables = form.querySelectorAll("input, select, textarea");
          for (var i = 0; i < editables.length; i++) editables[i].disabled = true;
          if (acepta) acepta.disabled = true;
          if (limpiar) limpiar.disabled = true;
          feedback.scrollIntoView({ behavior: "smooth", block: "center" });
        })
        .catch(function (err) {
          decir(
            "error",
            (err && err.message) ||
              "Something went wrong. Please try again or call us at +1 (786) 385-9402."
          );
          btn.disabled = false;
          btn.textContent = original;
        });
    }
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
