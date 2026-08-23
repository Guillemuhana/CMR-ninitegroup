/* NINIT — realce visual de la cotización.
 *
 * Todo lo que es EXPERIENCIA de la página vive acá, separado a propósito de
 * firma.js: firma.js maneja la firma y el envío del acuerdo (lo que tiene
 * consecuencias legales) y no conviene mezclarle animaciones. Si este archivo
 * no carga o falla, el documento se sigue leyendo y firmando igual.
 *
 * Hace seis cosas:
 *   1. Carrusel de las fotos de la unidad: pasan solas, se arrastran con el
 *      dedo, tienen flechas y puntitos.
 *   2. Lightbox: tocar una foto la abre grande.
 *   3. Barra de arriba: número de acuerdo, total en vivo y botón a la firma,
 *      más una barrita de progreso de lectura.
 *   4. Barra de abajo en el celular: el total y el botón siempre a mano.
 *   5. Las secciones aparecen suavemente al llegar scrolleando.
 *   6. Los tres pasos de arriba se van marcando según dónde está el cliente.
 *
 * El total y el número de acuerdo se ESPEJAN desde el documento: firma.js los
 * escribe adentro de .nq-sheet y acá se copian a las barras. Así no hay dos
 * lugares calculando el mismo precio.
 */
(function () {
  "use strict";

  var raiz = document.documentElement;
  var quieto = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Marca que el JS arrancó: sin esto el CSS no esconde nada para animarlo,
  // así que una página sin JS se ve completa en vez de en blanco.
  raiz.classList.add("ntg-js");

  function listo(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  /* ============================================================
     1. CARRUSEL DE FOTOS
     ============================================================ */
  function carrusel(caja) {
    var pista = caja.querySelector(".ntg-car-track");
    if (!pista) return;

    var puntos = caja.querySelector(".ntg-car-dots");
    var cuenta = caja.querySelector(".ntg-car-count");
    var anterior = caja.querySelector(".ntg-car-prev");
    var siguiente = caja.querySelector(".ntg-car-next");
    var timer = null;
    var quietoUnRato = 0; // hasta cuándo no auto-avanzar (ms epoch)

    function fotos() {
      return pista.querySelectorAll("img");
    }

    function actual() {
      var f = fotos();
      if (!f.length) return 0;
      // La foto "actual" es la que está más cerca del borde izquierdo visible.
      var x = pista.scrollLeft;
      var mejor = 0;
      var dist = Infinity;
      for (var i = 0; i < f.length; i++) {
        var d = Math.abs(f[i].offsetLeft - pista.offsetLeft - x);
        if (d < dist) { dist = d; mejor = i; }
      }
      return mejor;
    }

    function irA(i, suave) {
      var f = fotos();
      if (!f.length) return;
      var n = ((i % f.length) + f.length) % f.length;
      pista.scrollTo({
        left: f[n].offsetLeft - pista.offsetLeft,
        behavior: suave === false || quieto ? "auto" : "smooth",
      });
    }

    function pintarEstado() {
      var f = fotos();
      var i = actual();
      if (cuenta) cuenta.textContent = f.length ? i + 1 + " / " + f.length : "";
      if (puntos) {
        var bolitas = puntos.children;
        for (var k = 0; k < bolitas.length; k++) {
          bolitas[k].classList.toggle("is-on", k === i);
          bolitas[k].setAttribute("aria-current", k === i ? "true" : "false");
        }
      }
      caja.hidden = !f.length;
    }

    function armarPuntos() {
      if (!puntos) return;
      var f = fotos();
      puntos.innerHTML = "";
      if (f.length < 2) return;
      for (var i = 0; i < f.length; i++) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "ntg-car-dot";
        b.setAttribute("aria-label", "Photo " + (i + 1));
        b.dataset.i = String(i);
        b.addEventListener("click", function () {
          pausar(6000);
          irA(parseInt(this.dataset.i, 10));
        });
        puntos.appendChild(b);
      }
    }

    /** Mientras el cliente mira una foto, el carrusel no se la saca de golpe. */
    function pausar(ms) {
      quietoUnRato = Date.now() + (ms || 8000);
    }

    function auto() {
      // Sin autoplay si el cliente pidió menos movimiento, o si hay una sola
      // foto, o si la sección no está a la vista.
      if (quieto) return;
      if (fotos().length < 2) return;
      if (Date.now() < quietoUnRato) return;
      if (document.hidden) return;
      var caja_r = caja.getBoundingClientRect();
      if (caja_r.bottom < 0 || caja_r.top > window.innerHeight) return;
      irA(actual() + 1);
    }

    if (anterior) {
      anterior.addEventListener("click", function () { pausar(8000); irA(actual() - 1); });
    }
    if (siguiente) {
      siguiente.addEventListener("click", function () { pausar(8000); irA(actual() + 1); });
    }

    // Arrastrar con el dedo o el mouse ya lo hace el scroll nativo; lo único
    // que hace falta es enterarse para pausar y repintar.
    pista.addEventListener("scroll", function () {
      if (pista._t) clearTimeout(pista._t);
      pista._t = setTimeout(pintarEstado, 90);
    }, { passive: true });
    pista.addEventListener("pointerdown", function () { pausar(9000); });
    caja.addEventListener("mouseenter", function () { pausar(3000); });
    caja.addEventListener("mouseleave", function () { quietoUnRato = 0; });
    caja.addEventListener("focusin", function () { pausar(12000); });

    // Flechas del teclado, para quien lo usa sin mouse.
    caja.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { pausar(9000); irA(actual() - 1); e.preventDefault(); }
      if (e.key === "ArrowRight") { pausar(9000); irA(actual() + 1); e.preventDefault(); }
    });

    function refrescar() {
      armarPuntos();
      pintarEstado();
      caja.classList.toggle("ntg-car-una", fotos().length < 2);
    }

    // firma.js reemplaza las fotos enteras al cambiar de modelo: hay que
    // rearmar los puntitos y volver al principio.
    new MutationObserver(function () {
      pista.scrollLeft = 0;
      refrescar();
      quietoUnRato = 0;
    }).observe(pista, { childList: true });

    window.addEventListener("resize", pintarEstado);
    refrescar();

    if (timer) clearInterval(timer);
    timer = setInterval(auto, 5200);
  }

  /* ============================================================
     2. LIGHTBOX
     ============================================================ */
  function lightbox() {
    var caja = document.createElement("div");
    caja.className = "ntg-lb";
    caja.setAttribute("role", "dialog");
    caja.setAttribute("aria-modal", "true");
    caja.setAttribute("aria-label", "Photo");
    caja.innerHTML =
      '<button type="button" class="ntg-lb-close" aria-label="Close">&times;</button><img alt="">';
    document.body.appendChild(caja);

    var img = caja.querySelector("img");

    function abrir(src, alt) {
      img.src = src;
      img.alt = alt || "";
      caja.classList.add("is-open");
      // Un tick para que la transición de opacidad tenga de dónde salir.
      requestAnimationFrame(function () { caja.classList.add("is-shown"); });
      document.body.style.overflow = "hidden";
    }

    function cerrar() {
      caja.classList.remove("is-shown");
      document.body.style.overflow = "";
      setTimeout(function () {
        caja.classList.remove("is-open");
        img.removeAttribute("src");
      }, 200);
    }

    caja.addEventListener("click", cerrar);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && caja.classList.contains("is-open")) cerrar();
    });

    // Delegado: sirve también para las fotos que firma.js crea después.
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || t.tagName !== "IMG") return;
      if (!t.closest(".nq-hero, .nq-interior, .nq-feature-img, .nq-finish-swatch")) return;
      if (!t.currentSrc && !t.src) return;
      abrir(t.currentSrc || t.src, t.alt);
    });

    // Que se note que se pueden tocar.
    function marcar() {
      var fotos = document.querySelectorAll(
        ".nq-hero img, .nq-interior img, .nq-feature-img img, .nq-finish-swatch img"
      );
      for (var i = 0; i < fotos.length; i++) fotos[i].classList.add("ntg-zoom");
    }
    marcar();
    new MutationObserver(marcar).observe(document.body, { childList: true, subtree: true });
  }

  /* ============================================================
     3 y 4. BARRAS: espejo del total, progreso, aparición
     ============================================================ */
  function barras() {
    var barra = document.querySelector(".ntg-bar");
    var movil = document.querySelector(".ntg-mb");
    var progreso = document.querySelector(".ntg-bar-progress i");
    var hoja = document.querySelector(".nq-sheet");
    var firmar = document.getElementById("nq-firmar");

    /* El total y el número de acuerdo se copian de adentro del documento: la
     * fuente de verdad sigue siendo lo que escribe firma.js. */
    function espejar() {
      var destinos = document.querySelectorAll("[data-ntg-mirror]");
      for (var i = 0; i < destinos.length; i++) {
        var campo = destinos[i].dataset.ntgMirror;
        var origen = hoja && hoja.querySelector('[data-nq="' + campo + '"]');
        if (!origen) continue;
        var texto = (origen.textContent || "").trim();
        if (texto && destinos[i].textContent !== texto) {
          destinos[i].textContent = texto;
          // Un latido para que se note que el precio cambió.
          destinos[i].classList.remove("ntg-tick");
          void destinos[i].offsetWidth;
          if (!quieto) destinos[i].classList.add("ntg-tick");
        }
      }
    }
    if (hoja) {
      espejar();
      new MutationObserver(espejar).observe(hoja, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    }

    var ultimo = window.pageYOffset;
    function alScrollear() {
      var y = window.pageYOffset;
      var alto = document.documentElement.scrollHeight - window.innerHeight;

      if (barra) barra.classList.toggle("is-stuck", y > 8);
      if (progreso) {
        progreso.style.width = (alto > 0 ? Math.min(100, (y / alto) * 100) : 0) + "%";
      }

      if (movil) {
        // Aparece una vez que arrancó a leer y se esconde cuando ya está
        // parado sobre la firma: ahí el botón grande está a la vista.
        var enLaFirma = false;
        if (firmar) {
          var r = firmar.getBoundingClientRect();
          enLaFirma = r.top < window.innerHeight * 0.75 && r.bottom > 0;
        }
        movil.classList.toggle("is-on", y > 280 && !enLaFirma);
      }
      ultimo = y;
    }

    var pidiendo = false;
    window.addEventListener(
      "scroll",
      function () {
        if (pidiendo) return;
        pidiendo = true;
        requestAnimationFrame(function () {
          alScrollear();
          pidiendo = false;
        });
      },
      { passive: true }
    );
    alScrollear();
  }

  /* ============================================================
     5. APARICIÓN AL SCROLLEAR
     ============================================================ */
  function aparecer() {
    var partes = document.querySelectorAll(".ntg-reveal");
    if (!partes.length) return;

    if (quieto || !("IntersectionObserver" in window)) {
      for (var i = 0; i < partes.length; i++) partes[i].classList.add("is-in");
      return;
    }

    var obs = new IntersectionObserver(
      function (entradas) {
        for (var j = 0; j < entradas.length; j++) {
          if (entradas[j].isIntersecting) {
            entradas[j].target.classList.add("is-in");
            obs.unobserve(entradas[j].target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.04 }
    );
    for (var k = 0; k < partes.length; k++) obs.observe(partes[k]);
  }

  /* ============================================================
     6. LOS TRES PASOS
     ============================================================ */
  function pasos() {
    var chips = document.querySelectorAll(".ntg-step");
    if (!chips.length || !("IntersectionObserver" in window)) return;

    var mapa = [];
    for (var i = 0; i < chips.length; i++) {
      var id = (chips[i].getAttribute("href") || "").slice(1);
      var seccion = id && document.getElementById(id);
      if (seccion) mapa.push({ chip: chips[i], seccion: seccion });
    }

    function marcar() {
      var mejor = null;
      for (var j = 0; j < mapa.length; j++) {
        var top = mapa[j].seccion.getBoundingClientRect().top;
        if (top <= window.innerHeight * 0.4) mejor = mapa[j];
      }
      for (var k = 0; k < mapa.length; k++) {
        mapa[k].chip.classList.toggle("is-active", mejor === mapa[k]);
      }
    }

    window.addEventListener("scroll", marcar, { passive: true });
    marcar();
  }

  /* ============================================================
     7. DETALLE DEL PAD DE FIRMA
     Se pinta el recuadro mientras se está firmando: da la señal de que
     el dedo está dejando marca, que en un celular no siempre se ve.
     ============================================================ */
  function pad() {
    var lienzo = document.querySelector(".nq-sign-pad");
    if (!lienzo) return;
    var prender = function () { lienzo.classList.add("is-drawing"); };
    lienzo.addEventListener("pointerdown", prender);
    lienzo.addEventListener("touchstart", prender, { passive: true });
    var limpiar = document.querySelector(".nq-sign-clear");
    if (limpiar) {
      limpiar.addEventListener("click", function () { lienzo.classList.remove("is-drawing"); });
    }
  }

  listo(function () {
    var cajas = document.querySelectorAll("[data-ntg-car]");
    for (var i = 0; i < cajas.length; i++) carrusel(cajas[i]);
    lightbox();
    barras();
    aparecer();
    pasos();
    pad();
  });
})();
