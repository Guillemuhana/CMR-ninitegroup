import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Megaphone, Send, Users, Clock, AlertTriangle, Check, X, Pause, Play,
  RotateCcw, FileText, Ban, ChevronRight, Loader2, History, Beaker,
  MessageSquare, CornerUpLeft, MailQuestion,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { SiMessenger } from "react-icons/si";
import {
  supabase, enviarPorCanal, personalizar, planDeEnvio, plantillasUsables,
  N8N_PLANTILLAS_WEBHOOK, C, FONT_DISPLAY, FONT_BODY, ESTADOS, fmtFechaLarga,
} from "./lib";
import { L } from "./theme";

// ============================================================
// PROMOCIONES — un mensaje a toda la base de una sola vez
// ============================================================
// El envío corre acá, en el navegador, y no en una función de Vercel. Dos
// razones: el proyecto ya está en el tope de 12 funciones del plan Hobby (ver
// AGENTS.md), y una función Hobby corta a los 60 s, que no alcanza para
// recorrer cientos de contactos con pausa entre uno y otro.
//
// La contra es real y hay que conocerla: si se cierra la pestaña, el envío
// frena. Por eso cada destinatario se marca en `campana_envios` apenas se
// resuelve, y la campaña se puede retomar desde donde quedó sin repetirle el
// mensaje a nadie (ver supabase_promociones.sql).

// Pausa entre mensajes. No es por un límite técnico —la API de Meta aguanta
// mucho más— sino de reputación: cientos de mensajes idénticos disparados de
// golpe es exactamente el patrón que Meta marca como spam, y lo que está en
// juego es el número de WhatsApp de la empresa.
const PAUSAS = [
  { ms: 800,  label: "Rápido (0,8 s)" },
  { ms: 1500, label: "Normal (1,5 s)" },
  { ms: 3000, label: "Prudente (3 s)" },
  { ms: 6000, label: "Muy lento (6 s)" },
];

const CANALES = [
  { key: "todos",     label: "Todos" },
  { key: "whatsapp",  label: "WhatsApp" },
  { key: "messenger", label: "Messenger" },
];

const RANGOS = [
  { dias: 7,    label: "Última semana" },
  { dias: 30,   label: "Últimos 30 días" },
  { dias: 90,   label: "Últimos 3 meses" },
  { dias: 365,  label: "Último año" },
  { dias: 0,    label: "Desde siempre" },
];

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Dónde se recuerda el número propio de prueba (por navegador, no por usuario:
// es el teléfono que tiene a mano quien está sentado en esa máquina).
const TEL_PRUEBA_KEY = "ninit_promo_tel_prueba";

export default function Promociones({ userName, isMobile, onAbrirChat }) {
  const [tab, setTab]             = useState("nueva");
  // Modo simple: elegir plantilla, completar los datos, enviar. Es el 95 % de
  // los casos y es lo que se ve al entrar.
  //
  // La idea que lo hace simple: el texto de la plantilla, con las variables ya
  // completadas, sirve TAL CUAL como mensaje libre para los que escribieron
  // hace menos de 24 h. Así no hay que redactar dos veces lo mismo — se
  // completa una sola cosa y los dos grupos reciben el mismo contenido.
  const [modoSimple, setModoSimple] = useState(true);
  const [contactos, setContactos] = useState([]);
  const [bajas, setBajas]         = useState(() => new Set());
  const [cargando, setCargando]   = useState(true);

  // ── Contenido de la campaña ───────────────────────────────
  const [nombre, setNombre]       = useState("");
  const [mensaje, setMensaje]     = useState("");
  const [usarPlantilla, setUsarPlantilla] = useState(false);
  const [plNombre, setPlNombre]   = useState("");
  const [plIdioma, setPlIdioma]   = useState("es");
  const [plValores, setPlValores] = useState([]);   // un valor por variable {{n}}

  // Plantillas aprobadas leídas de Meta + salud del número
  const [plLista, setPlLista]         = useState([]);
  const [plDisponible, setPlDisponible] = useState(false);
  const [plMotivo, setPlMotivo]       = useState("");
  const [plCargando, setPlCargando]   = useState(true);
  const [salud, setSalud]             = useState(null);

  // ── Audiencia ─────────────────────────────────────────────
  const [canal, setCanal]         = useState("todos");
  const [rango, setRango]         = useState(90);
  const [estadosOff, setEstadosOff] = useState(() => new Set(["perdido", "cerrado"]));
  const [excluidos, setExcluidos] = useState(() => new Set());

  // ── Envío ─────────────────────────────────────────────────
  const [pausaMs, setPausaMs]     = useState(1500);
  const [confirmar, setConfirmar] = useState(false);
  const [envio, setEnvio]         = useState(null); // { total, hechos, ok, fallidos, omitidos, actual, campanaId }
  const pausadoRef                = useRef(false);
  const cancelarRef               = useRef(false);
  const [pausado, setPausado]     = useState(false);

  // ── Prueba ────────────────────────────────────────────────
  // El número queda guardado en el navegador: la prueba sirve si se hace SIEMPRE,
  // y volver a tipear el número con código de país cada vez es justo la fricción
  // que hace que se saltee.
  const [tel, setTel] = useState(() => {
    try { return localStorage.getItem(TEL_PRUEBA_KEY) || ""; } catch { return ""; }
  });
  const [pruebaMsg, setPruebaMsg] = useState(null);  // { ok, texto }
  const [probando, setProbando]   = useState("");    // "plantilla" | "texto" | ""
  // Firma del contenido que se probó bien. Se compara con la actual para poder
  // avisar en la confirmación: una prueba de hace tres ediciones no prueba nada.
  const [probadoSig, setProbadoSig] = useState("");

  const [err, setErr]             = useState("");
  const [historial, setHistorial] = useState([]);

  // ── Carga inicial ─────────────────────────────────────────
  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: cs }, { data: bs }] = await Promise.all([
      supabase.from("contactos")
        .select("id, nombre, telefono, messenger_id, canal, estado, vendedor, ultimo_in_at, created_at")
        // "los que nos mandaron mensaje": sin un entrante no hay conversación
        // abierta, y a un contacto cargado a mano nunca se le puede escribir
        // primero por WhatsApp sin plantilla.
        .not("ultimo_in_at", "is", null)
        .order("ultimo_in_at", { ascending: false }),
      supabase.from("promos_baja").select("contacto_id"),
    ]);
    setContactos(cs || []);
    setBajas(new Set((bs || []).map((b) => b.contacto_id)));
    setCargando(false);
  }, []);

  const cargarHistorial = useCallback(async () => {
    const { data } = await supabase.from("campanas").select("*")
      .order("created_at", { ascending: false }).limit(30);
    setHistorial(data || []);
  }, []);

  // Las plantillas aprobadas se leen de Meta, no se tipean. Un typo o una
  // plantilla todavía en revisión son cientos de envíos rechazados seguidos,
  // que es justo lo que hace que Meta limite o suspenda el número.
  //
  // Si Meta no se puede consultar (falta el token de management, por ejemplo),
  // `disponible` viene en false y la UI cae a escribir el nombre a mano: se
  // pierde la red de seguridad, pero la sección sigue funcionando.
  const cargarPlantillas = useCallback(async () => {
    setPlCargando(true);
    try {
      const res = await fetch(N8N_PLANTILLAS_WEBHOOK);
      const d = await res.json();
      // El workflow devuelve las plantillas crudas de Meta; el filtrado y el
      // parseo se hacen acá (ver plantillasUsables en src/promos.js) para que
      // las reglas de qué se puede mandar vivan en un solo lugar y con tests.
      setPlLista(plantillasUsables(d.plantillas));
      setPlDisponible(!!d.disponible);
      setPlMotivo(d.motivo || "");
      setSalud(d.salud || null);
    } catch {
      setPlDisponible(false);
      setPlMotivo("No se pudo consultar la lista de plantillas.");
    }
    setPlCargando(false);
  }, []);

  useEffect(() => { cargar(); cargarHistorial(); cargarPlantillas(); }, [cargar, cargarHistorial, cargarPlantillas]);

  // ── Audiencia calculada ───────────────────────────────────
  // En modo simple la plantilla es el eje de la pantalla, así que no hay un
  // tilde que activarla: elegir una ya es activarla.
  const hayPlantilla = (modoSimple || usarPlantilla) && plNombre.trim() !== "";

  const audiencia = useMemo(() => {
    const ahora = Date.now();
    const corte = rango > 0 ? ahora - rango * 24 * 3600 * 1000 : 0;
    const lista = [];
    for (const c of contactos) {
      if (bajas.has(c.id)) continue;
      const ch = c.canal || "whatsapp";
      // El canal de email está desactivado en el CRM; una promo por ahí no
      // saldría, así que no se ofrece.
      if (ch !== "whatsapp" && ch !== "messenger") continue;
      if (canal !== "todos" && ch !== canal) continue;
      if (estadosOff.has(c.estado)) continue;
      if (corte && new Date(c.ultimo_in_at).getTime() < corte) continue;
      if (ch === "whatsapp" && !c.telefono) continue;
      if (ch === "messenger" && !c.messenger_id && !c.telefono) continue;
      lista.push({ ...c, plan: planDeEnvio(c, hayPlantilla, ahora) });
    }
    return lista;
  }, [contactos, bajas, canal, rango, estadosOff, hayPlantilla]);

  const destinatarios = useMemo(
    () => audiencia.filter((c) => c.plan.modo !== "omitido" && !excluidos.has(c.id)),
    [audiencia, excluidos]
  );
  const nTexto     = destinatarios.filter((c) => c.plan.modo === "texto").length;
  const nPlantilla = destinatarios.filter((c) => c.plan.modo === "plantilla").length;
  const omitidos   = audiencia.filter((c) => c.plan.modo === "omitido");

  // Cuánto va a tardar. Con 400 contactos y 3 s de pausa son 20 minutos de
  // pestaña abierta: mejor saberlo antes de apretar el botón que después.
  const duracionMin = Math.ceil((destinatarios.length * pausaMs) / 60000);

  // La plantilla elegida de la lista de Meta (null si se está escribiendo el
  // nombre a mano porque Meta no se pudo consultar).
  const plSel = plLista.find((p) => p.nombre === plNombre && p.idioma === plIdioma) || null;

  const plantillaObj = hayPlantilla
    ? { nombre: plNombre.trim(), idioma: plIdioma.trim() || "es", params: plValores.map((v) => (v || "").trim()) }
    : null;

  // Con la lista de Meta disponible se puede validar ANTES de mandar. Sin ella
  // sólo queda confiar en lo que se tipeó, y el error aparece recién cuando Meta
  // rechaza el primer envío.
  const faltanValores = !!plSel && plValores.slice(0, plSel.variables).some((v) => !(v || "").trim());
  const plantillaInvalida = !!plSel && !plSel.soportada;

  // El texto que se manda a los de menos de 24 h. En modo simple sale de la
  // plantilla ya renderizada; en avanzado, de lo que se escribió a mano.
  const mensajeEfectivo = modoSimple
    ? (plSel ? renderPlantilla(plSel.texto, plValores) : "")
    : mensaje;

  // En modo simple el nombre de la campaña no se pide: es sólo una etiqueta
  // para el historial, y pedirlo es una pregunta más entre Nicolás y el envío.
  const nombreEfectivo = nombre.trim() ||
    (plSel ? `${plSel.nombre} — ${new Date().toLocaleDateString("es-AR")}` : "");

  const listoParaEnviar =
    nombreEfectivo !== "" &&
    destinatarios.length > 0 &&
    (nTexto === 0 || mensajeEfectivo.trim() !== "") &&
    (nPlantilla === 0 || (hayPlantilla && !faltanValores && !plantillaInvalida));

  // Qué se puede probar hoy. Cada versión de la prueba necesita que esté listo
  // lo suyo: no tiene sentido ofrecer "probar la plantilla" sin plantilla
  // elegida, ni "probar el texto" con el cuadro de mensaje vacío.
  const puedeProbarPlantilla = hayPlantilla && !faltanValores && !plantillaInvalida;
  const puedeProbarTexto     = mensajeEfectivo.trim() !== "";

  const contenidoSig = JSON.stringify([mensajeEfectivo, plantillaObj]);
  const yaProbado    = probadoSig !== "" && probadoSig === contenidoSig;

  // Elegir una plantilla trae su idioma y arma tantos campos como variables
  // tenga, precargados con los ejemplos que se usaron para pedir la aprobación.
  const elegirPlantilla = (clave) => {
    const p = plLista.find((x) => `${x.nombre}|${x.idioma}` === clave);
    if (!p) { setPlNombre(""); setPlValores([]); return; }
    setPlNombre(p.nombre);
    setPlIdioma(p.idioma);
    setPlValores(Array.from({ length: p.variables }, (_, i) => p.ejemplos[i] || ""));
  };

  // ── Envío ─────────────────────────────────────────────────
  // Recorre la lista de a uno. Cada destinatario se resuelve entero (mandar →
  // registrar en el chat → marcar en campana_envios) antes de pasar al
  // siguiente: si esto se corta en el medio, lo que quedó escrito en la DB es
  // verdad, y lo que no llegó a escribirse sigue pendiente.
  //
  // `contenido` se pasa por parámetro y NO se lee del estado del componente: al
  // retomar una campaña vieja se cargan su mensaje y su plantilla con setState,
  // que todavía no se aplicaron cuando esta función arranca. Leyéndolo del
  // closure se mandaría el texto del formulario actual, no el de la campaña.
  const recorrer = async (campanaId, pendientes, contenido) => {
    const { mensaje: texto, plantilla: pl } = contenido;
    let ok = 0, fallidos = 0;
    const total = pendientes.length;

    for (let i = 0; i < total; i++) {
      if (cancelarRef.current) break;
      while (pausadoRef.current && !cancelarRef.current) await espera(400);
      if (cancelarRef.current) break;

      const c = pendientes[i];
      setEnvio((e) => ({ ...e, actual: c.nombre || c.telefono || "—", hechos: i, ok, fallidos }));

      const esPlantilla = c.plan.modo === "plantilla";
      const cuerpo = esPlantilla ? textoPlantilla(pl, c) : personalizar(texto, c, "");
      const res = await enviarPorCanal({
        contacto: c, cuerpo, agente: userName,
        plantilla: esPlantilla ? pl : null,
      });

      if (res.ok) {
        ok++;
        // Queda en el chat del cliente, igual que un mensaje escrito a mano:
        // el vendedor que abra esa conversación tiene que ver que le llegó la
        // promo, o va a responder sin saber de qué le están hablando.
        // (En WhatsApp n8n además re-guarda el eco, que el chat oculta.)
        await supabase.from("mensajes").insert({
          contacto_id: c.id, direccion: "out", origen: "agente", agente: userName,
          contenido: cuerpo,
        });
      } else {
        fallidos++;
      }

      await supabase.from("campana_envios").update({
        estado: res.ok ? "ok" : "error",
        error: res.ok ? null : String(res.error || "").slice(0, 500),
        enviado_at: new Date().toISOString(),
      }).eq("campana_id", campanaId).eq("contacto_id", c.id);

      setEnvio((e) => ({ ...e, hechos: i + 1, ok, fallidos }));
      if (i < total - 1) await espera(pausaMs);
    }

    // Los totales se cuentan en la DB y no con los contadores de esta corrida:
    // si la campaña se retomó, `ok` es solo lo de este tramo y guardar eso
    // borraría lo que ya se había enviado antes.
    const cuenta = async (estado) => {
      const { count } = await supabase.from("campana_envios")
        .select("id", { count: "exact", head: true })
        .eq("campana_id", campanaId).eq("estado", estado);
      return count || 0;
    };
    const [totalOk, totalFail, sinMandar] = await Promise.all([
      cuenta("ok"), cuenta("error"), cuenta("pendiente"),
    ]);

    const cancelado = cancelarRef.current;
    await supabase.from("campanas").update({
      enviados: totalOk, fallidos: totalFail,
      estado: cancelado ? "cancelada" : sinMandar === 0 ? "enviada" : "pausada",
      terminada_at: cancelado || sinMandar === 0 ? new Date().toISOString() : null,
    }).eq("id", campanaId);

    setEnvio((e) => ({ ...e, terminado: true, cancelado, ok, fallidos, hechos: ok + fallidos }));
    cargarHistorial();
  };

  const enviarCampana = async () => {
    setErr(""); setConfirmar(false);
    pausadoRef.current = false; cancelarRef.current = false; setPausado(false);

    const { data: camp, error: e1 } = await supabase.from("campanas").insert({
      nombre: nombreEfectivo,
      mensaje: mensajeEfectivo.trim() || null,
      plantilla_nombre: plantillaObj?.nombre || null,
      plantilla_idioma: plantillaObj?.idioma || null,
      plantilla_params: plantillaObj?.params?.length ? plantillaObj.params : null,
      filtros: { canal, rango_dias: rango, estados_excluidos: [...estadosOff], pausa_ms: pausaMs },
      estado: "enviando",
      total: destinatarios.length,
      creada_por: userName,
    }).select().single();

    if (e1) { setErr("No se pudo crear la campaña: " + e1.message); return; }

    // Se reservan los destinatarios ANTES de empezar a mandar. Así el UNIQUE de
    // la tabla ya está puesto y un segundo envío accidental de la misma campaña
    // no puede duplicar nada.
    const filas = destinatarios.map((c) => ({
      campana_id: camp.id, contacto_id: c.id,
      canal: c.canal || "whatsapp", modo: c.plan.modo, estado: "pendiente",
    }));
    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await supabase.from("campana_envios").insert(filas.slice(i, i + 500));
      if (error) { setErr("No se pudieron registrar los destinatarios: " + error.message); return; }
    }

    setEnvio({ campanaId: camp.id, total: destinatarios.length, hechos: 0, ok: 0, fallidos: 0, actual: "", terminado: false });
    await recorrer(camp.id, destinatarios, { mensaje: mensajeEfectivo, plantilla: plantillaObj });
  };

  // Retomar una campaña que quedó a medias: se vuelve a leer de la DB quiénes
  // siguen pendientes, así que nunca se le manda dos veces a la misma persona.
  const retomar = async (camp) => {
    setErr("");
    const { data: pend } = await supabase.from("campana_envios")
      .select("contacto_id, modo, canal").eq("campana_id", camp.id).eq("estado", "pendiente");
    if (!pend?.length) { setErr("Esa campaña no tiene envíos pendientes."); return; }

    // El contenido sale de la campaña guardada, no del formulario: se está
    // terminando de mandar *esa* campaña, no la que esté escrita en pantalla.
    const plGuardada = camp.plantilla_nombre
      ? { nombre: camp.plantilla_nombre, idioma: camp.plantilla_idioma || "es", params: camp.plantilla_params || [] }
      : null;

    // El plan se recalcula ahora y no se reusa el que quedó guardado: entre que
    // la campaña se pausó y se retoma pudo vencer la ventana de 24 h de varios
    // contactos, y mandarles texto libre ahora sería un rechazo seguro.
    const porId = new Map(contactos.map((c) => [c.id, c]));
    const ahora = Date.now();
    const lista = pend.map((p) => {
      const c = porId.get(p.contacto_id);
      if (!c) return null;
      const plan = planDeEnvio(c, !!plGuardada, ahora);
      return plan.modo === "omitido" ? null : { ...c, plan };
    }).filter(Boolean);

    if (!lista.length) { setErr("Ya no se le puede escribir a ninguno de los contactos pendientes (se venció la ventana de 24 h)."); return; }

    setNombre(camp.nombre);
    setMensaje(camp.mensaje || "");
    if (camp.plantilla_nombre) {
      setUsarPlantilla(true); setPlNombre(camp.plantilla_nombre);
      setPlIdioma(camp.plantilla_idioma || "es");
      setPlValores(camp.plantilla_params || []);
    }
    setTab("nueva");
    pausadoRef.current = false; cancelarRef.current = false; setPausado(false);
    await supabase.from("campanas").update({ estado: "enviando" }).eq("id", camp.id);
    setEnvio({ campanaId: camp.id, total: lista.length, hechos: 0, ok: 0, fallidos: 0, actual: "", terminado: false });
    await recorrer(camp.id, lista, { mensaje: camp.mensaje || "", plantilla: plGuardada });
  };

  // Mandarse la promo a uno mismo antes de soltarla a la base.
  //
  // Se puede probar de las dos formas porque son dos mensajes distintos y sólo
  // una prueba de cada una dice la verdad:
  //
  //  · "plantilla" es lo que recibe la mayoría (los de más de 24 h) y lo único
  //    que Meta puede rechazar por estar mal armado. Llega siempre, aunque el
  //    número de prueba no le haya escrito nunca al negocio — es justamente
  //    para lo que sirven las plantillas.
  //  · "texto" es lo que reciben los de menos de 24 h, con la firma del agente
  //    adelante. Ojo: sólo llega si desde ESE teléfono le escribiste al número
  //    del negocio en las últimas 24 h; si no, Meta lo rechaza (131047) y el
  //    error que se ve es de la prueba, no de la campaña.
  const enviarPrueba = async (modo) => {
    setPruebaMsg(null);
    const numero = tel.replace(/[^0-9]/g, "");
    // Un número sin código de país sale "bien" y no llega nunca: Meta lo acepta
    // y lo entrega a otro lado. Pedirlo completo acá evita esa prueba fantasma.
    if (numero.length < 10) {
      setPruebaMsg({ ok: false, texto: "Escribí el número completo con código de país, sin el + (ej: 17865551234)." });
      return;
    }
    try { localStorage.setItem(TEL_PRUEBA_KEY, tel.trim()); } catch { /* modo privado */ }

    const falso = { id: null, telefono: numero, canal: "whatsapp", nombre: "Prueba" };
    setProbando(modo);
    const res = await enviarPorCanal({
      contacto: falso,
      // Con plantilla el contenido real lo arma Meta; `cuerpo` es sólo la línea
      // que queda en el historial, igual que en el envío masivo.
      cuerpo: modo === "plantilla"
        ? textoPlantilla(plantillaObj, falso)
        : personalizar(mensajeEfectivo, falso, ""),
      agente: userName,
      plantilla: modo === "plantilla" ? plantillaObj : null,
    });
    setProbando("");
    if (res.ok) setProbadoSig(contenidoSig);

    setPruebaMsg(res.ok
      ? { ok: true, texto: modo === "plantilla"
          ? "Plantilla enviada. Revisá el teléfono: así la reciben los clientes de más de 24 h."
          : "Enviado. Así lo reciben los que escribieron hace menos de 24 h." }
      : { ok: false, texto: res.error });
  };

  const cerrarEnvio = () => { setEnvio(null); setConfirmar(false); cargar(); };

  // Pasar a avanzado no debe perder lo que ya se armó: el texto derivado de la
  // plantilla se vuelca al cuadro de escritura y la plantilla queda tildada, así
  // se sigue editando desde donde estaba en vez de empezar de cero.
  const irAAvanzado = () => {
    if (plSel && !mensaje.trim()) setMensaje(renderPlantilla(plSel.texto, plValores));
    if (plNombre) setUsarPlantilla(true);
    setModoSimple(false);
  };

  // ── Estilos compartidos ───────────────────────────────────
  const card = { background: L.white, border: `1px solid ${L.border}`, borderRadius: 14, padding: 16 };
  const label = { fontSize: 11.5, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, display: "block" };
  const input = { width: "100%", padding: "9px 11px", border: `1px solid ${L.border}`, borderRadius: 9, fontFamily: FONT_BODY, fontSize: 14, color: L.text, background: L.white, boxSizing: "border-box" };
  const chip = (activo) => ({ padding: "6px 12px", borderRadius: 20, border: `1px solid ${activo ? C.red : L.border}`, background: activo ? C.red : L.white, color: activo ? "#fff" : L.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT_BODY });
  const enlaceSt = { border: "none", background: "none", padding: 0, color: C.red, fontWeight: 700, cursor: "pointer", fontFamily: FONT_BODY, fontSize: "inherit", textDecoration: "underline" };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: L.soft, fontFamily: FONT_BODY }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? 14 : 24 }}>

        {/* ── Encabezado ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: C.gradAI, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Megaphone size={21} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 800, color: L.text, margin: 0 }}>Promociones</h1>
            <div style={{ fontSize: 12.5, color: L.muted }}>Un mensaje a todos los clientes que nos escribieron</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[["nueva", "Nueva campaña", Megaphone], ["respuestas", "Respuestas", MessageSquare], ["historial", "Historial", History]].map(([k, t, Icon]) => (
              <button key={k} onClick={() => { setTab(k); if (k === "historial" || k === "respuestas") cargarHistorial(); }}
                style={{ ...chip(tab === k), display: "flex", alignItems: "center", gap: 6 }}>
                <Icon size={14} /> {t}
              </button>
            ))}
          </div>
        </div>

        {err && (
          <div style={{ ...card, borderColor: "#FCA5A5", background: "#FEF2F2", color: "#B91C1C", marginBottom: 14, display: "flex", gap: 8, alignItems: "center" }}>
            <AlertTriangle size={16} /> <span style={{ fontSize: 13.5 }}>{err}</span>
          </div>
        )}

        {/* Va arriba de todo a propósito: es lo que decide si conviene mandar
            la campaña hoy, y tiene que leerse antes de escribir nada. */}
        {salud && <div style={{ marginBottom: 14 }}><SaludNumero salud={salud} /></div>}

        {tab === "respuestas" ? (
          <Respuestas historial={historial} card={card} label={label}
            onAbrirChat={onAbrirChat} isMobile={isMobile} />
        ) : tab === "historial" ? (
          <Historial historial={historial} card={card} onRetomar={retomar} />
        ) : cargando ? (
          <div style={{ ...card, textAlign: "center", color: L.muted, fontSize: 14 }}>Cargando contactos…</div>
        ) : modoSimple ? (
          /* ══════════════════════════════════════════════════════
             MODO SIMPLE — 3 pasos y listo
             ══════════════════════════════════════════════════════ */
          <div style={{ maxWidth: 620, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>

            {/* PASO 1 — Elegir la promo */}
            <div style={card}>
              <Paso n={1} titulo="Elegí la promoción" />
              {plCargando ? (
                <div style={{ fontSize: 13.5, color: L.muted }}>Cargando tus plantillas…</div>
              ) : !plDisponible ? (
                <div style={{ padding: 11, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 9, fontSize: 12.5, color: "#92400E", lineHeight: 1.5 }}>
                  No se pudo leer la lista de plantillas. {plMotivo}{" "}
                  <button onClick={irAAvanzado} style={enlaceSt}>Usar el modo avanzado</button>
                </div>
              ) : plLista.filter((p) => p.soportada).length === 0 ? (
                <div style={{ padding: 11, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 9, fontSize: 12.5, color: "#92400E", lineHeight: 1.5 }}>
                  No tenés ninguna plantilla aprobada que se pueda mandar desde acá. Creala en
                  Meta Business Manager y volvé cuando figure <strong>Aprobada</strong>.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {plLista.filter((p) => p.soportada).map((p) => {
                    const sel = plSel?.nombre === p.nombre && plSel?.idioma === p.idioma;
                    return (
                      <button key={`${p.nombre}|${p.idioma}`}
                        onClick={() => elegirPlantilla(`${p.nombre}|${p.idioma}`)}
                        style={{ textAlign: "left", padding: 12, borderRadius: 11, cursor: "pointer", fontFamily: FONT_BODY,
                          border: `2px solid ${sel ? C.red : L.border}`, background: sel ? C.goldSoft : L.white }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          {sel ? <Check size={15} color={C.red} /> : <FileText size={15} color={L.muted} />}
                          <span style={{ fontSize: 14, fontWeight: 700, color: L.text }}>{p.nombre}</span>
                          <span style={{ fontSize: 10.5, color: L.muted }}>{p.idioma}</span>
                        </div>
                        <div style={{ fontSize: 12, color: L.muted, lineHeight: 1.45,
                          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {p.texto}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* PASO 2 — Completar los datos */}
            {plSel && plSel.soportada && (
              <div style={card}>
                <Paso n={2} titulo={plSel.variables > 0 ? "Completá los datos" : "Revisá el mensaje"} />
                {plSel.variables > 0 && (
                  <div style={{ display: "grid", gap: 9, marginBottom: 14 }}>
                    {Array.from({ length: plSel.variables }, (_, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: L.muted, minWidth: 30 }}>{`{{${i + 1}}}`}</span>
                        <input value={plValores[i] || ""}
                          onChange={(e) => setPlValores((v) => { const n = [...v]; n[i] = e.target.value; return n; })}
                          style={{ ...input, flex: 1 }} placeholder={plSel.ejemplos[i] || "valor"} />
                      </div>
                    ))}
                  </div>
                )}
                <label style={label}>Así le llega al cliente</label>
                <div style={{ padding: 12, background: "#DCF8C6", borderRadius: 10, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5, color: "#111" }}>
                  {renderPlantilla(plSel.texto, plValores)}
                </div>
                {/* Sin esto, Nicolás no puede saber que a una parte de la base
                    le llega el mensaje con la firma del CRM adelante. */}
                {nTexto > 0 && (
                  <div style={{ fontSize: 11.5, color: L.muted, marginTop: 8, lineHeight: 1.5 }}>
                    A los {nTexto} que escribieron hace menos de 24 h les llega este mismo texto,
                    con <code>*{userName} · NINIT Group:*</code> arriba.
                  </div>
                )}
              </div>
            )}

            {/* PASO 3 — Enviar */}
            {plSel && plSel.soportada && (
              <div style={card}>
                <Paso n={3} titulo="Enviar" />
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontFamily: FONT_DISPLAY, fontSize: 40, fontWeight: 800, color: C.red, lineHeight: 1 }}>
                    {destinatarios.length}
                  </span>
                  <span style={{ fontSize: 14, color: L.muted, fontWeight: 600 }}>
                    {destinatarios.length === 1 ? "cliente" : "clientes"} · unos {duracionMin} min
                  </span>
                </div>

                <div style={{ fontSize: 12.5, color: L.muted, lineHeight: 1.6, marginBottom: 12 }}>
                  {nPlantilla > 0 && <>{nPlantilla} por plantilla</>}
                  {nPlantilla > 0 && nTexto > 0 && " · "}
                  {nTexto > 0 && <>{nTexto} como mensaje normal</>}
                  {omitidos.length > 0 && <> · {omitidos.length} no se pueden contactar</>}
                  {" — "}
                  <button onClick={irAAvanzado} style={enlaceSt}>cambiar a quiénes</button>
                </div>

                {/* Probar primero está al lado del botón de enviar y no
                    escondido abajo: es el paso que evita mandarle un error a
                    cientos de personas. */}
                <div style={{ marginBottom: 12 }}>
                  <PruebaEnvio
                    tel={tel} setTel={setTel} onProbar={enviarPrueba} probando={probando} msg={pruebaMsg}
                    puedePlantilla={puedeProbarPlantilla} puedeTexto={puedeProbarTexto}
                    nPlantilla={nPlantilla} nTexto={nTexto}
                    input={input} chip={chip} />
                </div>

                <button onClick={() => setConfirmar(true)} disabled={!listoParaEnviar}
                  style={{ width: "100%", padding: "15px", border: "none", borderRadius: 12,
                    background: listoParaEnviar ? C.gradBtn : L.border, color: listoParaEnviar ? "#fff" : L.muted,
                    fontFamily: FONT_BODY, fontSize: 16, fontWeight: 800, cursor: listoParaEnviar ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
                  <Send size={18} /> Enviar a {destinatarios.length} clientes
                </button>
                {!listoParaEnviar && (
                  <div style={{ fontSize: 11.5, color: L.muted, marginTop: 7, textAlign: "center" }}>
                    {destinatarios.length === 0 ? "No hay clientes para enviar." : "Completá los datos de arriba."}
                  </div>
                )}
              </div>
            )}

            <button onClick={irAAvanzado}
              style={{ ...enlaceSt, alignSelf: "center", fontSize: 12.5, padding: 8 }}>
              Opciones avanzadas (filtros, mensaje propio, ritmo de envío)
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 380px", gap: 16, alignItems: "start" }}>

            {/* ══ Columna izquierda: el mensaje ══ */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              <button onClick={() => setModoSimple(true)}
                style={{ ...card, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "left",
                  fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 700, color: C.red, padding: "11px 16px" }}>
                <ChevronRight size={15} style={{ transform: "rotate(180deg)" }} /> Volver al modo simple
              </button>

              <div style={card}>
                <label style={label}>Nombre de la campaña</label>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={input}
                  placeholder="Ej: Promo Black Friday 2026" />
                <div style={{ fontSize: 11.5, color: L.muted, marginTop: 5 }}>
                  Solo para identificarla en el historial. El cliente no lo ve.
                </div>
              </div>

              <div style={card}>
                <label style={label}>Mensaje (clientes que escribieron hace menos de 24 h)</label>
                <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={6}
                  style={{ ...input, resize: "vertical", lineHeight: 1.5 }}
                  placeholder={"Hola {nombre}! Este mes tenemos 15% off en todos los trailers…"} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 10, flexWrap: "wrap" }}>
                  <button onClick={() => setMensaje((m) => m + "{nombre}")}
                    style={{ ...chip(false), padding: "4px 10px", fontSize: 11.5 }}>+ {"{nombre}"}</button>
                  <span style={{ fontSize: 11.5, color: L.muted }}>{mensaje.length} caracteres</span>
                </div>
                <div style={{ fontSize: 11.5, color: L.muted, marginTop: 8, lineHeight: 1.5 }}>
                  Si el contacto no tiene nombre cargado, <code>{"{nombre}"}</code> queda vacío —
                  escribí el saludo de forma que igual se entienda.
                </div>
              </div>

              {/* ── Plantilla de Meta ── */}
              <div style={{ ...card, borderColor: usarPlantilla ? C.ai : L.border }}>
                <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
                  <input type="checkbox" checked={usarPlantilla} onChange={(e) => setUsarPlantilla(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: C.ai, cursor: "pointer" }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: L.text, display: "flex", alignItems: "center", gap: 7 }}>
                    <FileText size={15} color={C.ai} /> Usar plantilla para los de más de 24 h
                  </span>
                </label>
                <div style={{ fontSize: 12.5, color: L.muted, marginTop: 8, lineHeight: 1.55 }}>
                  WhatsApp <strong>no deja</strong> mandarle texto libre a alguien que escribió hace más de
                  24 h. Para llegar a esa parte de la base hace falta una plantilla ya aprobada en
                  Meta Business Manager. Sin esto, esos contactos se saltean.
                </div>
                {usarPlantilla && (
                  <div style={{ marginTop: 13, display: "grid", gap: 11 }}>
                    {plCargando ? (
                      <div style={{ fontSize: 13, color: L.muted }}>Leyendo tus plantillas de Meta…</div>
                    ) : plDisponible ? (
                      <>
                        <div>
                          <label style={label}>Plantilla aprobada ({plLista.length} disponibles)</label>
                          <select value={plSel ? `${plSel.nombre}|${plSel.idioma}` : ""}
                            onChange={(e) => elegirPlantilla(e.target.value)} style={input}>
                            <option value="">— Elegí una —</option>
                            {plLista.map((p) => (
                              <option key={`${p.nombre}|${p.idioma}`} value={`${p.nombre}|${p.idioma}`}>
                                {p.nombre} ({p.idioma}){p.soportada ? "" : " ⚠️"}
                              </option>
                            ))}
                          </select>
                        </div>

                        {plLista.length === 0 && (
                          <div style={{ padding: 10, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 9, fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>
                            No tenés ninguna plantilla aprobada de Marketing o Utility. Creala en
                            Meta Business Manager → WhatsApp Manager → Plantillas de mensajes, y
                            volvé cuando figure <strong>Aprobada</strong>.
                          </div>
                        )}

                        {plantillaInvalida && (
                          <div style={{ padding: 10, background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 9, fontSize: 12, color: "#B91C1C", lineHeight: 1.5 }}>
                            <strong>Esta plantilla no se puede mandar desde el CRM:</strong> {plSel.motivos.join("; ")}.
                            Elegí otra o simplificala en Meta.
                          </div>
                        )}

                        {plSel && plSel.soportada && (
                          <>
                            {plSel.variables > 0 ? (
                              <div style={{ display: "grid", gap: 8 }}>
                                <label style={{ ...label, marginBottom: 0 }}>
                                  Variables ({plSel.variables} — las pide esta plantilla)
                                </label>
                                {Array.from({ length: plSel.variables }, (_, i) => (
                                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: L.muted, minWidth: 34 }}>{`{{${i + 1}}}`}</span>
                                    <input value={plValores[i] || ""}
                                      onChange={(e) => setPlValores((v) => { const n = [...v]; n[i] = e.target.value; return n; })}
                                      style={{ ...input, flex: 1 }} placeholder={plSel.ejemplos[i] || "valor"} />
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ fontSize: 12, color: L.muted }}>Esta plantilla no tiene variables.</div>
                            )}

                            {/* Vista previa con los valores ya reemplazados: es lo
                                que va a leer el cliente, no una aproximación. */}
                            <div>
                              <label style={label}>Así lo recibe el cliente</label>
                              <div style={{ padding: 12, background: "#DCF8C6", borderRadius: 10, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5, color: "#111" }}>
                                {plSel.encabezado && <div style={{ fontWeight: 700, marginBottom: 6 }}>{plSel.encabezado}</div>}
                                {renderPlantilla(plSel.texto, plValores)}
                                {plSel.pie && <div style={{ marginTop: 6, fontSize: 11, color: "#667781" }}>{plSel.pie}</div>}
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      // Sin acceso a Meta: se vuelve al modo manual, pero
                      // diciendo por qué. Escribir el nombre a ciegas es
                      // exactamente lo que este selector vino a evitar.
                      <>
                        <div style={{ padding: 10, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 9, fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>
                          <strong>No se pudo leer la lista de plantillas de Meta.</strong> {plMotivo} Podés
                          escribir el nombre a mano, pero si no coincide exactamente con una plantilla
                          aprobada, Meta rechaza todos los envíos.
                        </div>
                        <div>
                          <label style={label}>Nombre exacto de la plantilla</label>
                          <input value={plNombre} onChange={(e) => setPlNombre(e.target.value)} style={input}
                            placeholder="promo_black_friday" />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 11 }}>
                          <div>
                            <label style={label}>Idioma</label>
                            <input value={plIdioma} onChange={(e) => setPlIdioma(e.target.value)} style={input} placeholder="es" />
                          </div>
                          <div>
                            <label style={label}>Variables, separadas por |</label>
                            <input value={plValores.join(" | ")}
                              onChange={(e) => setPlValores(e.target.value.split("|").map((s) => s.trim()))}
                              style={input} placeholder="15% | 30 de septiembre" />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ── Prueba ── */}
              <div style={card}>
                <label style={{ ...label, display: "flex", alignItems: "center", gap: 6 }}>
                  <Beaker size={13} /> Probar antes de mandar a todos
                </label>
                <PruebaEnvio
                  tel={tel} setTel={setTel} onProbar={enviarPrueba} probando={probando} msg={pruebaMsg}
                  puedePlantilla={puedeProbarPlantilla} puedeTexto={puedeProbarTexto}
                  nPlantilla={nPlantilla} nTexto={nTexto}
                  input={input} chip={chip} />
              </div>
            </div>

            {/* ══ Columna derecha: a quién ══ */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16, position: isMobile ? "static" : "sticky", top: 0 }}>

              <div style={card}>
                <label style={label}>Canal</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  {CANALES.map((c) => (
                    <button key={c.key} onClick={() => setCanal(c.key)} style={chip(canal === c.key)}>{c.label}</button>
                  ))}
                </div>

                <label style={label}>Escribieron en</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  {RANGOS.map((r) => (
                    <button key={r.dias} onClick={() => setRango(r.dias)} style={chip(rango === r.dias)}>{r.label}</button>
                  ))}
                </div>

                <label style={label}>Excluir estados</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["nuevo", "contactado", "interesado", "cotizacion", "negociando", "pendiente", "vendido", "perdido", "cerrado"].map((e) => (
                    <button key={e} onClick={() => setEstadosOff((s) => {
                      const n = new Set(s); n.has(e) ? n.delete(e) : n.add(e); return n;
                    })}
                      style={{ ...chip(estadosOff.has(e)), background: estadosOff.has(e) ? "#FEE2E2" : L.white, color: estadosOff.has(e) ? "#B91C1C" : L.text, borderColor: estadosOff.has(e) ? "#FCA5A5" : L.border, fontSize: 11.5, padding: "5px 10px" }}>
                      {estadosOff.has(e) ? "✕ " : ""}{ESTADOS[e]?.label || e}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Resumen de la audiencia ── */}
              <div style={card}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontFamily: FONT_DISPLAY, fontSize: 34, fontWeight: 800, color: C.red, lineHeight: 1 }}>
                    {destinatarios.length}
                  </span>
                  <span style={{ fontSize: 13.5, color: L.muted, fontWeight: 600 }}>
                    {destinatarios.length === 1 ? "destinatario" : "destinatarios"}
                  </span>
                </div>

                <Fila icon={<Clock size={14} color="#15803D" />} label="Texto libre (menos de 24 h)" n={nTexto} color="#15803D" />
                <Fila icon={<FileText size={14} color={C.ai} />} label="Por plantilla (más de 24 h)" n={nPlantilla} color={C.ai} />
                {omitidos.length > 0 && (
                  <Fila icon={<Ban size={14} color="#92400E" />} label="No se les puede escribir" n={omitidos.length} color="#92400E" />
                )}
                {bajas.size > 0 && (
                  <Fila icon={<Ban size={14} color={L.muted} />} label="Pidieron no recibir promos" n={bajas.size} color={L.muted} />
                )}

                {omitidos.length > 0 && (
                  <div style={{ marginTop: 11, padding: 10, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 9, fontSize: 11.5, color: "#92400E", lineHeight: 1.5 }}>
                    <strong>{omitidos.length} contactos quedan afuera.</strong> {omitidos[0].plan.motivo}.
                    {!hayPlantilla && omitidos.some((o) => (o.canal || "whatsapp") === "whatsapp") &&
                      " Activá una plantilla arriba para alcanzarlos."}
                  </div>
                )}

                <div style={{ marginTop: 13 }}>
                  <label style={label}>Ritmo de envío</label>
                  <select value={pausaMs} onChange={(e) => setPausaMs(Number(e.target.value))} style={input}>
                    {PAUSAS.map((p) => <option key={p.ms} value={p.ms}>{p.label}</option>)}
                  </select>
                  {destinatarios.length > 0 && (
                    <div style={{ fontSize: 11.5, color: L.muted, marginTop: 6 }}>
                      Va a tardar unos <strong>{duracionMin} min</strong>. Dejá esta pestaña abierta;
                      si se cierra, la campaña se puede retomar desde el historial.
                    </div>
                  )}
                </div>

                <button onClick={() => setConfirmar(true)} disabled={!listoParaEnviar}
                  style={{ width: "100%", marginTop: 14, padding: "12px", border: "none", borderRadius: 10,
                    background: listoParaEnviar ? C.gradBtn : L.border, color: listoParaEnviar ? "#fff" : L.muted,
                    fontFamily: FONT_BODY, fontSize: 14.5, fontWeight: 700, cursor: listoParaEnviar ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <Send size={16} /> Enviar a {destinatarios.length}
                </button>
                {!listoParaEnviar && (
                  <div style={{ fontSize: 11.5, color: L.muted, marginTop: 7, textAlign: "center" }}>
                    {!nombre.trim() ? "Falta el nombre de la campaña."
                      : destinatarios.length === 0 ? "Ningún contacto entra con estos filtros."
                      : nTexto > 0 && !mensaje.trim() ? "Falta escribir el mensaje."
                      : plantillaInvalida ? "Esa plantilla no se puede mandar desde el CRM."
                      : faltanValores ? "Faltan valores de las variables de la plantilla."
                      : "Falta elegir la plantilla."}
                  </div>
                )}
              </div>

              {/* Lista de destinatarios, para poder sacar a alguien puntual */}
              <ListaDestinatarios lista={audiencia} excluidos={excluidos} setExcluidos={setExcluidos} card={card} label={label} />
            </div>
          </div>
        )}
      </div>

      {/* ── Confirmación ── */}
      {confirmar && (
        <Modal onClose={() => setConfirmar(false)}>
          <div style={{ display: "flex", gap: 11, alignItems: "flex-start", marginBottom: 14 }}>
            <AlertTriangle size={22} color="#D97706" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 800, color: L.text }}>
                Confirmá el envío masivo
              </div>
              <div style={{ fontSize: 13.5, color: L.muted, marginTop: 4, lineHeight: 1.55 }}>
                Vas a mandarle un mensaje a <strong style={{ color: L.text }}>{destinatarios.length} clientes reales</strong>.
                Esto no se puede deshacer: una vez que sale, sale.
              </div>
            </div>
          </div>
          <div style={{ background: L.soft, borderRadius: 10, padding: 12, fontSize: 12.5, color: L.text, lineHeight: 1.7 }}>
            <div><strong>Campaña:</strong> {nombreEfectivo}</div>
            <div><strong>Texto libre:</strong> {nTexto} · <strong>Plantilla:</strong> {nPlantilla}</div>
            <div><strong>Duración estimada:</strong> ~{duracionMin} min</div>
          </div>
          {/* No bloquea el envío —a veces se prueba desde otra máquina—, pero
              tiene que estar dicho: es la última pantalla antes de que salga. */}
          {!yaProbado && (
            <div style={{ marginTop: 12, padding: 11, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 9, fontSize: 12.5, color: "#92400E", lineHeight: 1.5 }}>
              <strong>Todavía no probaste este mensaje en tu teléfono.</strong> Cancelá, mandate
              una prueba y fijate cómo llega antes de soltarlo a {destinatarios.length} clientes.
            </div>
          )}
          {mensajeEfectivo.trim() && (
            <div style={{ marginTop: 12, padding: 12, background: "#DCF8C6", borderRadius: 10, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5, color: "#111" }}>
              {personalizar(mensajeEfectivo, { nombre: destinatarios[0]?.nombre || "Juan" }, "Juan")}
            </div>
          )}
          <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
            <button onClick={() => setConfirmar(false)}
              style={{ flex: 1, padding: 11, border: `1px solid ${L.border}`, borderRadius: 10, background: L.white, color: L.text, fontFamily: FONT_BODY, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Cancelar
            </button>
            <button onClick={enviarCampana}
              style={{ flex: 1, padding: 11, border: "none", borderRadius: 10, background: C.gradBtn, color: "#fff", fontFamily: FONT_BODY, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Sí, enviar
            </button>
          </div>
        </Modal>
      )}

      {/* ── Progreso ── */}
      {envio && (
        <Modal onClose={envio.terminado ? cerrarEnvio : undefined}>
          <ProgresoEnvio envio={envio} pausado={pausado} card={card}
            onPausar={() => { pausadoRef.current = !pausadoRef.current; setPausado(pausadoRef.current); }}
            onCancelar={() => { cancelarRef.current = true; pausadoRef.current = false; setPausado(false); }}
            onCerrar={cerrarEnvio} />
        </Modal>
      )}
    </div>
  );
}

// Texto legible de una plantilla, para guardar en el chat y para la prueba.
// El contenido real lo arma Meta con la plantilla aprobada; esto es lo que ve
// el vendedor en el CRM, así sabe qué se le mandó al cliente.
function textoPlantilla(pl, contacto) {
  if (!pl) return "";
  const params = pl.params?.length ? ` (${pl.params.join(", ")})` : "";
  return `📣 Plantilla "${pl.nombre}"${params} enviada a ${contacto?.nombre || contacto?.telefono || "el cliente"}.`;
}

// Reemplaza {{1}}, {{2}}… por los valores cargados, para la vista previa.
// Lo que no se completó se deja visible como {{n}} en vez de vaciarlo: así se
// nota que falta, en lugar de mostrar un mensaje con un hueco.
function renderPlantilla(texto, valores) {
  return String(texto || "").replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => {
    const v = (valores[Number(n) - 1] || "").trim();
    return v || m;
  });
}

// Semáforo de salud del número de WhatsApp. Es el dato que decide si conviene
// mandar la campaña hoy: con la calidad en rojo, sumar cientos de mensajes
// promocionales es la forma más rápida de que Meta limite o suspenda el número.
const CALIDAD = {
  GREEN:  { label: "Calidad alta",  color: "#15803D", bg: "#DCFCE7" },
  YELLOW: { label: "Calidad media", color: "#92400E", bg: "#FEF3C7" },
  RED:    { label: "Calidad BAJA",  color: "#B91C1C", bg: "#FEE2E2" },
};

function SaludNumero({ salud }) {
  if (!salud) return null;
  const q = CALIDAD[String(salud.calidad).toUpperCase()];
  const restringido = ["FLAGGED", "RESTRICTED"].includes(String(salud.estado).toUpperCase());
  const tope = String(salud.tope || "").replace("TIER_", "").replace("_", " ");
  if (!q && !restringido) return null;

  const c = restringido ? CALIDAD.RED : q;
  return (
    <div style={{ padding: 11, background: c.bg, border: `1px solid ${c.color}33`, borderRadius: 10, fontSize: 12.5, color: c.color, lineHeight: 1.5 }}>
      <strong>Tu número: {c.label}</strong>
      {salud.numero ? ` · ${salud.numero}` : ""}
      {tope ? ` · tope ${tope} conversaciones/día` : ""}
      {restringido && <div style={{ marginTop: 4 }}><strong>Meta marcó el número como {salud.estado.toLowerCase()}.</strong> No mandes una campaña masiva hasta resolverlo.</div>}
      {!restringido && String(salud.calidad).toUpperCase() === "RED" && (
        <div style={{ marginTop: 4 }}>Con la calidad en rojo, un envío masivo puede terminar en una limitación. Esperá a que se recupere.</div>
      )}
      {!restringido && String(salud.calidad).toUpperCase() === "YELLOW" && (
        <div style={{ marginTop: 4 }}>Mandá al grupo más chico primero y usá un ritmo lento.</div>
      )}
    </div>
  );
}

// Numerito de paso del modo simple. Que estén numerados es lo que convierte
// una pantalla llena de campos en algo que se recorre de arriba a abajo.
function Paso({ n, titulo }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
      <span style={{ width: 24, height: 24, borderRadius: "50%", background: C.red, color: "#fff", display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{n}</span>
      <span style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 800, color: L.text }}>{titulo}</span>
    </div>
  );
}

// Prueba al teléfono propio, la misma en el modo simple y en el avanzado.
//
// Son dos botones y no uno porque la campaña manda dos mensajes distintos: la
// plantilla a los de más de 24 h y el texto libre a los de menos. Un solo botón
// obligaría a elegir cuál de los dos se prueba, y el que quedara afuera es el
// que después sale mal a cientos de personas.
function PruebaEnvio({ tel, setTel, onProbar, probando, msg, puedePlantilla, puedeTexto, nPlantilla, nTexto, input, chip }) {
  const ocupado = probando !== "";
  const btn = (activo) => ({
    ...chip(false),
    display: "flex", alignItems: "center", gap: 6,
    opacity: activo && !ocupado ? 1 : 0.5,
    cursor: activo && !ocupado ? "pointer" : "not-allowed",
  });

  return (
    <>
      <input value={tel} onChange={(e) => setTel(e.target.value)}
        style={{ ...input, marginBottom: 8 }}
        placeholder="Tu WhatsApp con código de país (ej: 17865551234)" />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => onProbar("plantilla")} disabled={!puedePlantilla || ocupado} style={btn(puedePlantilla)}>
          <Beaker size={13} />
          {probando === "plantilla" ? "Enviando…" : `Probar plantilla${nPlantilla > 0 ? ` (${nPlantilla})` : ""}`}
        </button>
        <button onClick={() => onProbar("texto")} disabled={!puedeTexto || ocupado} style={btn(puedeTexto)}>
          <Send size={13} />
          {probando === "texto" ? "Enviando…" : `Probar mensaje normal${nTexto > 0 ? ` (${nTexto})` : ""}`}
        </button>
      </div>

      <div style={{ fontSize: 11.5, color: L.muted, marginTop: 7, lineHeight: 1.5 }}>
        La <strong>plantilla</strong> es la que recibe la mayoría y llega siempre. El{" "}
        <strong>mensaje normal</strong> sólo te llega si desde ese teléfono le escribiste al
        número del negocio en las últimas 24 h.
      </div>

      {msg && (
        <div style={{ marginTop: 9, padding: 10, borderRadius: 9, fontSize: 12.5, lineHeight: 1.5,
          background: msg.ok ? "#DCFCE7" : "#FEF2F2",
          border: `1px solid ${msg.ok ? "#86EFAC" : "#FCA5A5"}`,
          color: msg.ok ? "#15803D" : "#B91C1C" }}>
          {msg.texto}
        </div>
      )}
    </>
  );
}

function Fila({ icon, label, n, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 13 }}>
      {icon}
      <span style={{ flex: 1, color: L.muted }}>{label}</span>
      <strong style={{ color, fontVariantNumeric: "tabular-nums" }}>{n}</strong>
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: L.white, borderRadius: 16, padding: 20, maxWidth: 460, width: "100%", maxHeight: "88vh", overflowY: "auto", fontFamily: FONT_BODY }}>
        {children}
      </div>
    </div>
  );
}

function ProgresoEnvio({ envio, pausado, onPausar, onCancelar, onCerrar }) {
  const pct = envio.total ? Math.round((envio.hechos / envio.total) * 100) : 0;
  return (
    <>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 800, color: L.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        {envio.terminado
          ? (envio.cancelado ? <><X size={19} color="#B91C1C" /> Envío cancelado</> : <><Check size={19} color="#15803D" /> Campaña enviada</>)
          : <><Loader2 size={18} color={C.red} className="promo-spin" /> Enviando…</>}
      </div>
      <style>{`.promo-spin{animation:promoSpin 1s linear infinite}@keyframes promoSpin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.promo-spin{animation:none}}`}</style>

      {!envio.terminado && envio.actual && (
        <div style={{ fontSize: 12.5, color: L.muted, marginBottom: 12 }}>{pausado ? "En pausa · " : ""}Último: {envio.actual}</div>
      )}

      <div style={{ height: 9, borderRadius: 5, background: L.border, overflow: "hidden", margin: "12px 0 10px" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: C.gradBtn, transition: "width .25s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: L.text, marginBottom: 14 }}>
        <span>{envio.hechos} / {envio.total}</span>
        <span>
          <strong style={{ color: "#15803D" }}>{envio.ok} ok</strong>
          {envio.fallidos > 0 && <> · <strong style={{ color: "#B91C1C" }}>{envio.fallidos} fallaron</strong></>}
        </span>
      </div>

      {envio.terminado && envio.fallidos > 0 && (
        <div style={{ padding: 11, background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 9, fontSize: 12.5, color: "#B91C1C", lineHeight: 1.5, marginBottom: 12 }}>
          {envio.fallidos} mensajes no salieron. El motivo de cada uno quedó guardado en la
          campaña — miralo en el historial antes de reintentar.
        </div>
      )}

      {envio.terminado ? (
        <button onClick={onCerrar}
          style={{ width: "100%", padding: 11, border: "none", borderRadius: 10, background: C.gradBtn, color: "#fff", fontFamily: FONT_BODY, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Cerrar
        </button>
      ) : (
        <div style={{ display: "flex", gap: 9 }}>
          <button onClick={onPausar}
            style={{ flex: 1, padding: 11, border: `1px solid ${L.border}`, borderRadius: 10, background: L.white, color: L.text, fontFamily: FONT_BODY, fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {pausado ? <><Play size={14} /> Seguir</> : <><Pause size={14} /> Pausar</>}
          </button>
          <button onClick={onCancelar}
            style={{ flex: 1, padding: 11, border: "1px solid #FCA5A5", borderRadius: 10, background: "#FEF2F2", color: "#B91C1C", fontFamily: FONT_BODY, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Frenar
          </button>
        </div>
      )}
    </>
  );
}

function ListaDestinatarios({ lista, excluidos, setExcluidos, card, label }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div style={card}>
      <button onClick={() => setAbierto((a) => !a)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: FONT_BODY }}>
        <Users size={14} color={L.muted} />
        <span style={{ ...label, marginBottom: 0, flex: 1, textAlign: "left" }}>Ver la lista ({lista.length})</span>
        <ChevronRight size={15} color={L.muted} style={{ transform: abierto ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
      </button>
      {abierto && (
        <div style={{ maxHeight: 320, overflowY: "auto", marginTop: 11, borderTop: `1px solid ${L.border}`, paddingTop: 9 }}>
          {lista.map((c) => {
            const fuera = c.plan.modo === "omitido";
            const off = fuera || excluidos.has(c.id);
            return (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", opacity: off ? 0.45 : 1 }}>
                <input type="checkbox" checked={!off} disabled={fuera}
                  onChange={() => setExcluidos((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                  style={{ width: 14, height: 14, accentColor: C.red, cursor: fuera ? "not-allowed" : "pointer" }} />
                {(c.canal || "whatsapp") === "messenger"
                  ? <SiMessenger size={12} color="#0099FF" />
                  : <FaWhatsapp size={12} color="#25D366" />}
                <span style={{ flex: 1, fontSize: 12.5, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.nombre || c.telefono || c.messenger_id}
                </span>
                <span style={{ fontSize: 10.5, color: L.muted, flexShrink: 0 }}>
                  {c.plan.modo === "texto" ? "24 h" : c.plan.modo === "plantilla" ? "plantilla" : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// RESPUESTAS — quién contestó la campaña, separado por qué falta hacer
// ============================================================
// La lista de chats del CRM no se toca: sigue mostrando todo como siempre. El
// trabajo posterior a una campaña se hace acá, donde el eje no es la
// conversación sino la promo: de los cientos que la recibieron, quiénes
// contestaron, a quiénes ya les respondimos y quiénes quedaron en silencio.
//
// Los grupos están ordenados por lo que falta hacer, no por fecha: "Para
// responder" primero porque es lo único que tiene a alguien esperando del otro
// lado, y es lo que se pierde si esta pantalla se ordena como una bandeja más.
const GRUPOS = [
  { key: "pendiente", label: "Para responder", color: "#B45309", bg: "#FEF3C7", icon: CornerUpLeft,
    ayuda: "Contestaron la promo y todavía nadie les respondió." },
  { key: "atendido",  label: "Ya respondidos", color: "#15803D", bg: "#DCFCE7", icon: Check,
    ayuda: "Contestaron y ya les respondimos." },
  { key: "sin",       label: "Sin respuesta",  color: "#64748B", bg: "#F1F5F9", icon: MailQuestion,
    ayuda: "Les llegó la promo y no dijeron nada." },
  { key: "error",     label: "No les llegó",   color: "#B91C1C", bg: "#FEE2E2", icon: Ban,
    ayuda: "Meta rechazó el envío. El motivo está en el historial." },
];

function Respuestas({ historial, card, label, onAbrirChat, isMobile }) {
  const [campId, setCampId]     = useState("");
  const [filas, setFilas]       = useState([]);
  const [grupo, setGrupo]       = useState("pendiente");
  const [cargando, setCargando] = useState(false);

  // Al entrar se abre la campaña más reciente: es la que largamos y la que tiene
  // gente contestando ahora. Elegir a mano es para mirar una vieja.
  const campanas = historial.filter((c) => c.estado !== "borrador");
  const campSel  = campanas.find((c) => c.id === campId) || campanas[0] || null;

  useEffect(() => {
    if (!campSel) { setFilas([]); return; }
    let cancelado = false;
    (async () => {
      setCargando(true);
      // El contacto entero viaja en el join porque al clickear la fila hay que
      // abrir su chat, y el panel de chat espera la fila completa de `contactos`.
      const { data } = await supabase.from("campana_envios")
        .select("contacto_id, enviado_at, estado, contactos(*)")
        .eq("campana_id", campSel.id);
      if (cancelado) return;
      setFilas((data || []).map((f) => ({ ...f, contacto: f.contactos })));
      setCargando(false);
    })();
    return () => { cancelado = true; };
  }, [campSel?.id]);

  // En qué está cada destinatario. Se calcula acá y no se guarda en la DB: el
  // estado real es "¿el cliente escribió después de la promo, y le contestamos
  // después de eso?", y eso ya vive en los timestamps del contacto. Un campo
  // aparte sería una copia que se desincroniza en cuanto alguien responde por
  // el chat.
  const clasificar = (f) => {
    const c = f.contacto;
    if (f.estado === "error") return "error";
    if (!c) return "sin";
    const env = new Date(f.enviado_at || 0).getTime();
    const inn = c.ultimo_in_at ? new Date(c.ultimo_in_at).getTime() : 0;
    if (!inn || inn <= env) return "sin";
    const out = c.ultimo_out_at ? new Date(c.ultimo_out_at).getTime() : 0;
    return out >= inn ? "atendido" : "pendiente";
  };

  const porGrupo = { pendiente: [], atendido: [], sin: [], error: [] };
  for (const f of filas) porGrupo[clasificar(f)].push(f);

  // Dentro de cada grupo, lo último que pasó arriba: en los que contestaron eso
  // es el mensaje del cliente; en los demás, cuándo les salió la promo.
  const lista = [...(porGrupo[grupo] || [])].sort((a, b) => {
    const ta = new Date(a.contacto?.ultimo_in_at || a.enviado_at || 0);
    const tb = new Date(b.contacto?.ultimo_in_at || b.enviado_at || 0);
    return tb - ta;
  });

  if (!campSel)
    return <div style={{ ...card, textAlign: "center", color: L.muted, fontSize: 14 }}>
      Todavía no mandaste ninguna campaña. Cuando salga la primera, acá vas a ver quién contesta.
    </div>;

  const contestaron = porGrupo.pendiente.length + porGrupo.atendido.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Qué campaña se está mirando */}
      <div style={card}>
        <label style={label}>Campaña</label>
        <select value={campSel.id} onChange={(e) => setCampId(e.target.value)}
          style={{ width: "100%", padding: "9px 11px", border: `1px solid ${L.border}`, borderRadius: 9,
            fontFamily: FONT_BODY, fontSize: 14, color: L.text, background: L.white, boxSizing: "border-box" }}>
          {campanas.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre} — {fmtFechaLarga(c.created_at)}</option>
          ))}
        </select>

        {/* El número que importa no es cuántos recibieron: es cuántos
            contestaron. Eso es lo que dice si la promo funcionó. */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 14 }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 34, fontWeight: 800, color: C.red, lineHeight: 1 }}>
            {contestaron}
          </span>
          <span style={{ fontSize: 13.5, color: L.muted, fontWeight: 600 }}>
            {contestaron === 1 ? "contestó" : "contestaron"} de {filas.length} que la recibieron
            {filas.length > 0 && <> · {Math.round((contestaron / filas.length) * 100)}%</>}
          </span>
        </div>
      </div>

      {/* Los cuatro grupos. Son el filtro y el resumen a la vez: el número de
          "Para responder" es la cola de trabajo del día. */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 9 }}>
        {GRUPOS.map((g) => {
          const on = grupo === g.key;
          const n = porGrupo[g.key].length;
          const Icono = g.icon;
          return (
            <button key={g.key} onClick={() => setGrupo(g.key)} title={g.ayuda} aria-pressed={on}
              style={{ textAlign: "left", padding: "11px 12px", borderRadius: 12, cursor: "pointer", fontFamily: FONT_BODY,
                border: `2px solid ${on ? g.color : L.border}`, background: on ? g.bg : L.white }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <Icono size={13} color={g.color} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: on ? g.color : L.muted }}>{g.label}</span>
              </div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 800, color: on ? g.color : L.text, lineHeight: 1 }}>{n}</div>
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 12, color: L.muted, marginTop: -6 }}>
        {GRUPOS.find((g) => g.key === grupo)?.ayuda}
      </div>

      {/* La lista del grupo elegido */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {cargando ? (
          <div style={{ padding: 28, textAlign: "center", color: L.muted, fontSize: 13.5 }}>Cargando…</div>
        ) : lista.length === 0 ? (
          <div style={{ padding: 28, textAlign: "center", color: L.muted, fontSize: 13.5 }}>
            {grupo === "pendiente" ? "No hay nadie esperando respuesta. 👌" : "No hay nadie en este grupo."}
          </div>
        ) : lista.map((f) => {
          const c = f.contacto;
          const respondio = grupo === "pendiente" || grupo === "atendido";
          return (
            <button key={f.contacto_id} onClick={() => c && onAbrirChat?.(c)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                padding: "11px 14px", border: "none", borderBottom: `1px solid ${L.border}`, background: "transparent",
                cursor: c ? "pointer" : "default", fontFamily: FONT_BODY }}
              onMouseEnter={(e) => { e.currentTarget.style.background = L.soft; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              {(c?.canal || "whatsapp") === "messenger"
                ? <SiMessenger size={14} color="#0099FF" style={{ flexShrink: 0 }} />
                : <FaWhatsapp size={14} color="#25D366" style={{ flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c?.nombre || c?.telefono || "Sin nombre"}
                </div>
                {/* Lo que dijo el cliente, no lo que le mandamos: es lo que
                    decide si hay que contestarle ya o puede esperar. */}
                <div style={{ fontSize: 12, color: L.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                  {respondio ? (c?.ultimo_msg || "—") : (ESTADOS[c?.estado]?.label || "—")}
                </div>
              </div>
              <span style={{ fontSize: 11, color: L.light, flexShrink: 0 }}>
                {haceCuanto(respondio ? c?.ultimo_in_at : f.enviado_at)}
              </span>
              <ChevronRight size={14} color={L.light} style={{ flexShrink: 0 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// "hace 3 h" / "hace 2 d". Corto a propósito: en una lista de cien filas, una
// fecha completa ocupa lugar y no dice lo único que importa, que es si esto
// pasó recién o hace días.
function haceCuanto(ts) {
  if (!ts) return "";
  const ms = Date.now() - new Date(ts).getTime();
  if (Number.isNaN(ms)) return "";
  const min = Math.round(ms / 60000);
  if (min < 60) return `hace ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

function Historial({ historial, card, onRetomar }) {
  const [detalle, setDetalle] = useState(null);
  const [errores, setErrores] = useState([]);

  const verErrores = async (camp) => {
    setDetalle(camp);
    const { data } = await supabase.from("campana_envios")
      .select("estado, error, contacto_id, contactos(nombre, telefono)")
      .eq("campana_id", camp.id).eq("estado", "error").limit(100);
    setErrores(data || []);
  };

  if (!historial.length)
    return <div style={{ ...card, textAlign: "center", color: L.muted, fontSize: 14 }}>Todavía no mandaste ninguna campaña.</div>;

  const badge = { enviada: ["#DCFCE7", "#15803D"], enviando: ["#DBEAFE", "#1D4ED8"], pausada: ["#FEF3C7", "#92400E"], cancelada: ["#f5dcdc", "#9b2c2c"], borrador: ["#F1F5F9", "#64748B"] };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {historial.map((c) => {
          const [bg, col] = badge[c.estado] || badge.borrador;
          return (
            <div key={c.id} style={{ ...card, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: L.text }}>{c.nombre}</div>
                <div style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>
                  {fmtFechaLarga(c.created_at)} · {c.creada_por || "—"}
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: L.muted, textAlign: "right" }}>
                <strong style={{ color: "#15803D" }}>{c.enviados}</strong> enviados
                {c.fallidos > 0 && <> · <button onClick={() => verErrores(c)} style={{ border: "none", background: "none", padding: 0, color: "#B91C1C", fontWeight: 700, cursor: "pointer", fontFamily: FONT_BODY, fontSize: 12.5, textDecoration: "underline" }}>{c.fallidos} fallaron</button></>}
                <div style={{ fontSize: 11 }}>de {c.total}</div>
              </div>
              <span style={{ padding: "3px 10px", borderRadius: 20, background: bg, color: col, fontSize: 11, fontWeight: 700 }}>
                {c.estado}
              </span>
              {(c.estado === "pausada" || (c.estado === "enviando" && c.enviados + c.fallidos < c.total)) && (
                <button onClick={() => onRetomar(c)}
                  style={{ padding: "7px 12px", border: `1px solid ${C.red}`, borderRadius: 9, background: L.white, color: C.red, fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <RotateCcw size={13} /> Retomar
                </button>
              )}
            </div>
          );
        })}
      </div>

      {detalle && (
        <Modal onClose={() => setDetalle(null)}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 800, color: L.text, marginBottom: 12 }}>
            Errores de "{detalle.nombre}"
          </div>
          {errores.map((e, i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${L.border}`, fontSize: 12.5 }}>
              <div style={{ fontWeight: 700, color: L.text }}>{e.contactos?.nombre || e.contactos?.telefono || "—"}</div>
              <div style={{ color: "#B91C1C", marginTop: 2, lineHeight: 1.45 }}>{e.error || "Sin detalle"}</div>
            </div>
          ))}
          <button onClick={() => setDetalle(null)}
            style={{ width: "100%", marginTop: 14, padding: 11, border: "none", borderRadius: 10, background: C.gradBtn, color: "#fff", fontFamily: FONT_BODY, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Cerrar
          </button>
        </Modal>
      )}
    </>
  );
}
