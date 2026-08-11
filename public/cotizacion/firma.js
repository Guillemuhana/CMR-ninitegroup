/* NINIT — firma electrónica de la cotización.
 *
 * Port de assets/js/request.js del plugin de WordPress, quedándose solo con lo
 * que aplica a una cotización ya emitida: el pad de firma y el envío. No hay
 * configurador ni datos de contacto que validar (vienen cerrados en el
 * documento), ni switcher de modelos: la página publica una sola cotización.
 */
(function () {
  "use strict";

  var ENDPOINT = "/api/cotizacion-firmar";

  function init() {
    var form = document.getElementById("nq-form");
    if (!form) return;

    var scope = form.closest(".nq-sheet") || document;
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

      btn.disabled = true;
      var original = btn.textContent;
      btn.textContent = "Signing…";

      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote: form.dataset.quote,
          signature: sigInput.value,
          accepted: true,
          message: (form.elements.message.value || "").trim(),
          company_url: form.elements.company_url.value || "", // honeypot
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
            "✓ Signed! Your Purchase Agreement has been sent to NINI T-GROUP. Our team will follow up with the deposit invoice."
          );

          btn.textContent = "Signed ✓";
          form.querySelector("textarea").disabled = true;
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
