import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, BookOpen, Building2, CheckCircle2, Copy, Download, ExternalLink, FileSpreadsheet, Gauge, Globe,
  ChevronDown, Loader2, Mail, MapPin, MessageCircle, MessageSquareQuote, Navigation, Phone, Printer, Radar, Route, Search,
  Send, Share2, ShoppingBag, Sparkles, Star, Target, TrendingUp, UserCheck, X,
} from "lucide-react";
import { docHojaRutaProspectos } from "./documentos";
import { supabase, VENDEDORES as EQUIPO_COMERCIAL } from "../lib";
import { descargarDoc, enviarDoc, imprimirDoc } from "./imprimir";
import { RUBROS } from "../../api/_prospectos/rubros.js";
import { ZONAS, ZONA_INICIAL } from "./zonas";

// ── Preferencias de este navegador ───────────────────────────
// Quién ya fue contactado y la firma de los emails. Es una ayuda para el
// vendedor en su equipo, no un registro: si se borra, no se pierde nada.
const CLAVE_CONTACTADOS = "ntg-prospectos-contactados";
const CLAVE_FIRMA = "ntg-prospectos-firma";
const leer = (clave, defecto) => {
  try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) : defecto; } catch { return defecto; }
};
const guardar = (clave, valor) => { try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ } };

const FIRMA_INICIAL = `${EQUIPO_COMERCIAL[0] || "Nini T Group"}\nNini T Group · sales@ninitgroup.com · https://ninitgroup.com`;

/** Número para wa.me: sólo dígitos y con el 1 de USA adelante. */
function numeroWhatsApp(tel) {
  const d = String(tel || "").replace(/\D/g, "");
  if (d.length === 10) return `1${d}`;
  if (d.length === 11 && d.startsWith("1")) return d;
  return "";
}

const emailsDe = (r) => (Array.isArray(r.email) ? r.email : r.email ? [r.email] : []).filter((e) => e && e !== "No disponible");
const telefonoDe = (r) => (r.telefono && r.telefono !== "No disponible" ? r.telefono : "");
const celdaCSV = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// Google Maps acepta origen + 9 puntos más en un link de indicaciones.
// Si la búsqueda trae más clientes, la ruta se parte en tramos encadenados.
const MAX_PARADAS_TRAMO = 10;

const PRIORIDAD = {
  ALTA:  { bg: "#fef2f2", text: "#b91c1c", borde: "#fecaca", barra: "linear-gradient(180deg,#ef4444,#b91c1c)", punto: "#ef4444" },
  MEDIA: { bg: "#fffbeb", text: "#b45309", borde: "#fde68a", barra: "linear-gradient(180deg,#f59e0b,#b45309)", punto: "#f59e0b" },
  BAJA:  { bg: "#f0fdf4", text: "#15803d", borde: "#bbf7d0", barra: "linear-gradient(180deg,#22c55e,#15803d)", punto: "#22c55e" },
};
const colorPrioridad = (p) => PRIORIDAD[p] || PRIORIDAD.BAJA;



// ── Armado del recorrido ─────────────────────────────────────
// El webhook de n8n devuelve latitud/longitud de cada negocio, así que la
// ruta se puede ordenar de verdad por cercanía en vez de dejar los clientes
// en el orden en que los trajo la búsqueda.

/** Coordenadas del prospecto, o null si Google Maps no las devolvió. */
function coord(p) {
  const lat = Number(p?.latitud ?? p?.lat);
  const lng = Number(p?.longitud ?? p?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/** Distancia aproximada en km entre dos puntos (fórmula del semiverseno). */
function distancia(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Ordena las paradas por cercanía: arranca por la más al norte y sigue
 * siempre con la más cercana que quede pendiente. No da el recorrido
 * matemáticamente óptimo, pero saca los zigzags de cruzar la ciudad de
 * punta a punta que salen de recorrer la lista ordenada por score.
 * Los negocios sin coordenadas van al final, para visitarlos a criterio.
 */
function ordenarPorCercania(lista) {
  const conCoords = lista.filter((p) => coord(p));
  const sinCoords = lista.filter((p) => !coord(p));
  if (conCoords.length < 2) return [...conCoords, ...sinCoords];

  const pendientes = [...conCoords];
  let actual = pendientes.reduce((mejor, p) => (coord(p).lat > coord(mejor).lat ? p : mejor), pendientes[0]);
  const ruta = [];

  while (pendientes.length) {
    pendientes.splice(pendientes.indexOf(actual), 1);
    ruta.push(actual);
    if (!pendientes.length) break;
    const desde = coord(actual);
    actual = pendientes.reduce(
      (mejor, p) => (distancia(desde, coord(p)) < distancia(desde, coord(mejor)) ? p : mejor),
      pendientes[0]
    );
  }
  return [...ruta, ...sinCoords];
}

/** Parte la ruta en tramos que Google Maps pueda abrir, encadenados. */
function tramosDeRuta(paradas) {
  if (paradas.length <= MAX_PARADAS_TRAMO) return paradas.length ? [paradas] : [];
  const grupos = [];
  // El paso es MAX-1 para que la última parada de un tramo sea la primera
  // del siguiente: así el recorrido no se corta a la mitad.
  for (let i = 0; i < paradas.length - 1; i += MAX_PARADAS_TRAMO - 1) {
    grupos.push(paradas.slice(i, i + MAX_PARADAS_TRAMO));
  }
  return grupos;
}

/** Cómo nombrar una parada en el link: coordenadas o, si no hay, la dirección. */
function puntoMapa(p) {
  const c = coord(p);
  return c ? `${c.lat},${c.lng}` : [p.nombre, p.direccion].filter(Boolean).join(" ");
}

/** Link de Google Maps con las paradas del tramo, en orden y manejando. */
function urlMapa(grupo) {
  if (!grupo.length) return "";
  if (grupo.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(puntoMapa(grupo[0]))}`;
  }
  const origen = encodeURIComponent(puntoMapa(grupo[0]));
  const destino = encodeURIComponent(puntoMapa(grupo[grupo.length - 1]));
  const intermedias = grupo.slice(1, -1).map((p) => encodeURIComponent(puntoMapa(p))).join("%7C");
  return `https://www.google.com/maps/dir/?api=1&origin=${origen}&destination=${destino}` +
    (intermedias ? `&waypoints=${intermedias}` : "") + "&travelmode=driving";
}

/** Kilómetros aproximados del recorrido, en línea recta entre paradas. */
function kilometrosRuta(paradas) {
  let total = 0;
  for (let i = 1; i < paradas.length; i++) {
    const a = coord(paradas[i - 1]), b = coord(paradas[i]);
    if (a && b) total += distancia(a, b);
  }
  return total;
}

/** Link a una parada suelta en Google Maps. */
const urlParada = (p) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(puntoMapa(p))}`;

/**
 * Croquis del recorrido dibujado con las coordenadas reales, para ver de un
 * vistazo cómo se reparten las paradas antes de abrir Google Maps. Es un SVG
 * propio: no depende de ninguna clave de Google ni de que haya internet.
 */
function CroquisRuta({ paradas }) {
  const puntos = paradas.map((p, i) => ({ c: coord(p), n: i + 1 })).filter((p) => p.c);
  if (puntos.length < 2) return null;

  const ANCHO = 660, ALTO = 300, MARGEN = 28;
  const latMedia = puntos.reduce((s, p) => s + p.c.lat, 0) / puntos.length;
  // La longitud se achica según la latitud, si no el croquis sale estirado.
  const crudos = puntos.map((p) => ({ n: p.n, x: p.c.lng * Math.cos((latMedia * Math.PI) / 180), y: -p.c.lat }));
  const xs = crudos.map((p) => p.x), ys = crudos.map((p) => p.y);
  const anchoDato = Math.max(...xs) - Math.min(...xs) || 1e-6;
  const altoDato = Math.max(...ys) - Math.min(...ys) || 1e-6;
  const escala = Math.min((ANCHO - MARGEN * 2) / anchoDato, (ALTO - MARGEN * 2) / altoDato);
  const centrarX = (ANCHO - anchoDato * escala) / 2 - Math.min(...xs) * escala;
  const centrarY = (ALTO - altoDato * escala) / 2 - Math.min(...ys) * escala;
  const ubicados = crudos.map((p) => ({ n: p.n, x: p.x * escala + centrarX, y: p.y * escala + centrarY }));
  const trazo = ubicados.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <div className="croquis-caja">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label="Croquis del recorrido" style={{ width: "100%", height: "auto", display: "block" }}>
        <defs>
          <linearGradient id="ruta-linea" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
          <radialGradient id="ruta-halo">
            <stop offset="0%" stopColor="#dc2626" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
          </radialGradient>
          <pattern id="ruta-grilla" width="34" height="34" patternUnits="userSpaceOnUse">
            <path d="M34 0H0V34" fill="none" stroke="rgba(148,163,184,.22)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={ANCHO} height={ALTO} fill="url(#ruta-grilla)" />
        <polyline points={trazo} fill="none" stroke="url(#ruta-linea)" strokeWidth="14" opacity="0.12" strokeLinejoin="round" strokeLinecap="round" />
        <polyline className="croquis-trazo" points={trazo} fill="none" stroke="url(#ruta-linea)" strokeWidth="2.6" strokeDasharray="8 6" strokeLinejoin="round" strokeLinecap="round" />
        {ubicados.map((p, i) => (
          <g key={p.n} className="croquis-punto" style={{ animationDelay: `${i * 45}ms` }}>
            <circle cx={p.x} cy={p.y} r="26" fill="url(#ruta-halo)" />
            <circle cx={p.x} cy={p.y} r="13.5" fill={i === 0 ? "#0f172a" : "#b91c1c"} stroke="#fff" strokeWidth="2.5" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11.5" fontWeight="800" fill="#fff">{p.n}</text>
          </g>
        ))}
      </svg>
      <div className="croquis-pie"><Navigation size={12} /> Salida en la parada 1 · recorrido optimizado por cercanía</div>
    </div>
  );
}

/** Anillo de score al estilo de un medidor, en vez del texto suelto. */
function AnilloScore({ valor = 0, color }) {
  const pct = Math.max(0, Math.min(100, Number(valor) || 0));
  return (
    <div className="anillo" style={{ background: `conic-gradient(${color} ${pct}%, #e9edf3 0)` }}>
      <div className="anillo-centro">
        <span style={{ color }}>{valor || 0}</span>
        <small>/100</small>
      </div>
    </div>
  );
}

// ── Instructivo ──────────────────────────────────────────────
// Lo que necesita saber quien abre la sección por primera vez. Si cambia
// cómo funciona algo de acá, se actualiza también CLIENTES-POTENCIALES.md.
const PASOS = [
  { icono: Search, titulo: "1. Elegí qué buscar",
    texto: "Tocá uno de los rubros (Hoteles y resorts, Venues de bodas, Alquiler para eventos, Baños portátiles…) o escribí cualquier otro, en español o inglés." },
  { icono: MapPin, titulo: "2. Elegí la zona",
    texto: "Arranca en Miami, FL. Tocá el campo para ver otras localidades de Florida, Texas, California y el resto de USA, o escribí cualquier ciudad, condado, estado o ZIP. Después tocá Buscar." },
  { icono: Target, titulo: "3. Leé el puntaje",
    texto: "Cada negocio trae un puntaje de 0 a 100 y una prioridad (ALTA, MEDIA, BAJA): indica qué tanto encaja con Nini T Group, no que ya quiera comprar. Abajo aparecen la unidad y el paquete sugeridos, y el enfoque para la primera llamada." },
  { icono: Mail, titulo: "4. Filtrá",
    texto: "Tocá las tarjetas de arriba o los botones ALTA / MEDIA / BAJA para ver sólo esa prioridad. \"Con email\" y \"Con teléfono\" dejan sólo los que se pueden contactar por ese medio." },
  { icono: Sparkles, titulo: "5. Contactá",
    texto: "El botón Contactar le pide a la IA un email y un WhatsApp de presentación para ese negocio, en inglés. Revisalo, cambiá lo que quieras y tocá \"Abrir en mi correo\" o \"Abrir WhatsApp\": se manda desde tu cuenta, de a uno. También está Llamar." },
  { icono: UserCheck, titulo: "6. Seguí quién ya fue contactado",
    texto: "Al llamar, abrir el correo o el WhatsApp, el negocio queda marcado \"Contactado\" con la fecha. La marca queda en este navegador: en otra computadora o celular no se ve." },
  { icono: Route, titulo: "7. Armá la hoja de ruta para visitarlos",
    texto: "Tildá los negocios que querés visitar (o ninguno para usar todos los que están a la vista) y tocá Crear hoja de ruta: quedan ordenados por cercanía, con el recorrido en Google Maps. Se puede asignar un vendedor a cada uno, compartir, descargar el PDF, imprimir o bajar la planilla CSV." },
];

// Con qué funciona. Tiene que decir la verdad de cómo está armado: si se
// cambia la fuente o la IA (api/_prospectos/buscar.js, api/_ia.js), se
// actualiza acá.
const MOTOR = [
  { icono: Globe, titulo: "Google Maps (Google Places)",
    texto: "Los negocios salen de la misma base que Google Maps: reales, abiertos hoy, con dirección, teléfono, web, reseñas y ubicación exacta. Nada de listas viejas compradas ni datos inventados. Si algún día se quita la clave de Google, busca en OpenStreetMap, gratis pero con menos datos." },
  { icono: Sparkles, titulo: "Inteligencia artificial con la ficha de NTG",
    texto: "OpenAI (con Groq de respaldo) lee cada negocio junto con la ficha comercial de Nini T Group: qué vendemos, las unidades, los paquetes Starter / Business Launch / Managed y lo que nunca se puede prometer. Con eso puntúa, sugiere la unidad y escribe el enfoque y los mensajes." },
  { icono: Target, titulo: "Rubros pensados para vender trailers",
    texto: "Cada rubro tiene su puntaje base según qué tan buen comprador es: primero los que ya alquilan para eventos (le suman una línea de más valor), después los que hoy pagan alquiler de baños cada fin de semana (bodas, hoteles, campings, ferias). La IA ajusta ese puntaje negocio por negocio." },
  { icono: Route, titulo: "Recorrido ordenado por cercanía",
    texto: "Con las coordenadas reales de cada negocio arma la ruta sin zigzags y la abre en Google Maps, partida en tramos si son muchas paradas." },
];

const VENTAJAS = [
  "En unos segundos te trae hasta 40 negocios de cualquier zona de USA, ya puntuados y con teléfono en casi todos.",
  "No es una lista: te dice a quién llamar primero y con qué frase abrir la conversación.",
  "El email y el WhatsApp salen personalizados para cada negocio, en inglés, respetando la ficha de NTG.",
  "Si la IA falla, la búsqueda sale igual con el puntaje por rubro: nunca te quedás sin resultados.",
  "Lo que antes era una tarde buscando en Google Maps y copiando teléfonos, ahora son unos minutos.",
];

const CUIDADOS = [
  "No mandes el mismo mensaje en masa: son negocios que todavía no nos conocen. WhatsApp bloquea el número si muchos lo reportan, y en USA los SMS de publicidad sin permiso tienen multas.",
  "La firma de los emails tiene que llevar la dirección postal de NTG (lo pide la ley de email comercial de USA). Se edita en Contactar → Firma de los emails. La línea para darse de baja se agrega sola.",
  "Si alguien contesta que no le escribamos más, no se le vuelve a escribir.",
  "Google casi nunca trae el email del negocio. Si no hay, copiá el mensaje y usá el formulario de su web, o mandá WhatsApp o llamá. Muchos teléfonos de negocios son fijos y no tienen WhatsApp.",
  "Los resultados no se guardan en el CRM: si cerrás la sección, se pierden. Si te sirven, bajá la planilla CSV antes de salir.",
];

function Instructivo({ onCerrar }) {
  return (
    <div className="capa" role="dialog" aria-modal="true" aria-label="Cómo usar Clientes potenciales" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-cabecera">
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(255,255,255,.14)" }}>
              <BookOpen size={19} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16.5, fontWeight: 800 }}>Cómo usar Clientes potenciales</div>
              <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 2 }}>De la búsqueda al primer contacto, en 7 pasos</div>
            </div>
          </div>
          <button className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div style={{ padding: "18px 20px 22px" }}>
          <ol className="pasos">
            {PASOS.map(({ icono: Icono, titulo, texto }) => (
              <li key={titulo} className="paso">
                <div className="paso-icono"><Icono size={17} /></div>
                <div>
                  <div className="paso-titulo">{titulo}</div>
                  <p>{texto}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="motor">
            <div className="canal-titulo"><Radar size={15} /> Con qué funciona</div>
            <div className="motor-grilla">
              {MOTOR.map(({ icono: Icono, titulo, texto }) => (
                <div key={titulo} className="motor-item">
                  <div className="motor-titulo"><Icono size={15} /> {titulo}</div>
                  <p>{texto}</p>
                </div>
              ))}
            </div>
            <div className="canal-titulo" style={{ marginTop: 14 }}><Star size={15} /> Por qué es tan bueno</div>
            <ul className="ventajas">
              {VENTAJAS.map((v) => <li key={v}><CheckCircle2 size={14} /> {v}</li>)}
            </ul>
          </div>

          <div className="cuidados">
            <div className="canal-titulo" style={{ color: "#9a3412" }}><AlertTriangle size={15} /> Importante</div>
            <ul>{CUIDADOS.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>

          <div className="barra-acciones" style={{ marginTop: 16, justifyContent: "flex-end" }}>
            <button className="btn btn-principal" onClick={onCerrar}><CheckCircle2 size={15} /> Entendido</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Campo de zona: se escribe libre (ciudad, condado, estado o ZIP) y al
 * enfocarlo despliega las zonas sugeridas agrupadas, filtradas por lo que
 * se va tipeando. Miami queda primero porque es la base de NTG.
 */
function ZonaSelector({ valor, onCambiar, onEnter }) {
  const [abierto, setAbierto] = useState(false);
  const [filtroZona, setFiltroZona] = useState("");
  const t = filtroZona.trim().toLowerCase();
  const grupos = ZONAS
    .map((g) => ({ ...g, lista: g.lista.filter((z) => !t || z.toLowerCase().includes(t)) }))
    .filter((g) => g.lista.length);
  const elegir = (z) => { onCambiar(z); setFiltroZona(""); setAbierto(false); };

  return (
    <div className="campo campo-zona">
      <MapPin size={16} />
      <input value={valor} role="combobox" aria-expanded={abierto} aria-label="Ciudad, estado o ZIP"
        placeholder="Ciudad, estado o ZIP de Estados Unidos"
        onFocus={(e) => { setFiltroZona(""); setAbierto(true); e.target.select(); }}
        onChange={(e) => { onCambiar(e.target.value); setFiltroZona(e.target.value); setAbierto(true); }}
        onBlur={() => setTimeout(() => setAbierto(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { setAbierto(false); onEnter(); }
          if (e.key === "Escape") setAbierto(false);
        }} />
      <ChevronDown size={16} className="campo-flecha" />
      {abierto && (
        <div className="zonas-lista" role="listbox">
          {grupos.map((g) => (
            <div key={g.grupo}>
              <div className="zonas-grupo">{g.grupo}</div>
              {g.lista.map((z) => (
                <button key={z} type="button" role="option" aria-selected={z === valor} className="zona-op" data-activa={z === valor ? 1 : 0}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(z)}>
                  <MapPin size={13} /> {z}
                </button>
              ))}
            </div>
          ))}
          {!grupos.length && (
            <div className="zonas-vacio">No está en la lista, pero se puede buscar igual: tocá Buscar para “{valor}”.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Prospectos() {
  const [busqueda, setBusqueda] = useState("");
  const [zona, setZona] = useState(ZONA_INICIAL);
  const [cargando, setCargando] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [error, setError] = useState(null);
  const [busquedaHecha, setBusquedaHecha] = useState(false);
  const [filtro, setFiltro] = useState("TODOS");
  const [vendedorAsignado, setVendedorAsignado] = useState({});
  const [seleccionados, setSeleccionados] = useState([]);
  const [mensajeAccion, setMensajeAccion] = useState("");
  const [rutaAbierta, setRutaAbierta] = useState(false);
  const [info, setInfo] = useState(null);             // fuente e IA de la última búsqueda
  const [soloCon, setSoloCon] = useState("");         // "", "email" o "telefono"
  const [contactados, setContactados] = useState(() => leer(CLAVE_CONTACTADOS, {}));
  const [mensaje, setMensaje] = useState(null);       // { negocio, cargando, asunto, email, whatsapp, error }
  const [ayuda, setAyuda] = useState(false);
  const [firma, setFirma] = useState(() => leer(CLAVE_FIRMA, FIRMA_INICIAL));

  const VENDEDORES = ["Sin asignar", ...EQUIPO_COMERCIAL];

  const marcarContactado = (r, canal) => {
    setContactados((prev) => {
      const nuevo = { ...prev, [r.place_id]: { canal, fecha: new Date().toISOString() } };
      guardar(CLAVE_CONTACTADOS, nuevo);
      return nuevo;
    });
  };

  /** Pide al servidor el mensaje de presentación para ese negocio. */
  const redactarPara = async (r) => {
    setMensaje({ negocio: r, cargando: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Iniciá sesión para redactar el mensaje.");
      const res = await fetch("/api/prospectos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ accion: "redactar", firma, negocio: r }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo redactar el mensaje.");
      setMensaje({ negocio: r, asunto: data.asunto, email: data.email, whatsapp: data.whatsapp, ia: data.ia });
    } catch (err) {
      setMensaje({ negocio: r, error: err instanceof SyntaxError || err instanceof TypeError ? "No se pudo conectar. Probá de nuevo." : err.message });
    }
  };

  const copiar = async (textoCopiar, aviso) => {
    try { await navigator.clipboard.writeText(textoCopiar); setMensajeAccion(aviso); } catch { setMensajeAccion("No se pudo copiar."); }
  };

  const buscar = async () => {
    if (!busqueda.trim() || !zona.trim() || cargando) return;
    setCargando(true); setError(null); setResultados([]); setBusquedaHecha(false); setRutaAbierta(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Iniciá sesión para buscar clientes.");
      const res = await fetch("/api/prospectos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ busqueda: busqueda.trim(), zona: zona.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo completar la búsqueda.");
      const lista = Array.isArray(data.resultados) ? data.resultados : [];
      setInfo({ fuente: data.fuente, ia: data.ia });
      setResultados(lista); setSoloCon(""); setSeleccionados([]); setVendedorAsignado({}); setFiltro("TODOS"); setMensajeAccion(""); setBusquedaHecha(true);
    } catch (err) {
      setError(err instanceof SyntaxError || err instanceof TypeError ? "No se pudo conectar con el buscador. Intentá nuevamente en unos minutos." : err.message);
    } finally { setCargando(false); }
  };

  const filtrados = useMemo(
    () => resultados.filter((r) =>
      (filtro === "TODOS" || r.prioridad === filtro) &&
      (soloCon !== "email" || emailsDe(r).length > 0) &&
      (soloCon !== "telefono" || !!telefonoDe(r))),
    [resultados, filtro, soloCon]
  );
  const conteo = {
    TODOS: resultados.length,
    ALTA: resultados.filter((r) => r.prioridad === "ALTA").length,
    MEDIA: resultados.filter((r) => r.prioridad === "MEDIA").length,
    BAJA: resultados.filter((r) => r.prioridad === "BAJA").length,
  };
  const clavesFiltradas = filtrados.map((r, i) => r.place_id || `resultado-${i}`);

  // La hoja de ruta se arma con los clientes que están a la vista, o solo
  // con los tildados si eligieron algunos, siempre ordenados por cercanía.
  const paradas = useMemo(() => {
    const elegidos = filtrados.filter((r, i) => seleccionados.includes(r.place_id || `resultado-${i}`));
    return ordenarPorCercania(elegidos.length ? elegidos : filtrados);
  }, [filtrados, seleccionados]);
  const tramos = useMemo(() => tramosDeRuta(paradas), [paradas]);
  const enlaces = useMemo(() => tramos.map(urlMapa), [tramos]);
  const kilometros = useMemo(() => kilometrosRuta(paradas), [paradas]);
  const hayRuta = paradas.length > 0;

  const alternarSeleccion = (clave) =>
    setSeleccionados((prev) => (prev.includes(clave) ? prev.filter((i) => i !== clave) : [...prev, clave]));
  const seleccionarTodos = () =>
    setSeleccionados((prev) => (prev.length === clavesFiltradas.length ? [] : clavesFiltradas));

  const nombreArchivo = () =>
    `hoja-de-ruta-${(busqueda || "clientes").toLowerCase().replace(/\s+/g, "-")}-${new Date().toLocaleDateString("es-AR").replace(/\//g, "-")}.pdf`;

  const documentoRuta = () =>
    docHojaRutaProspectos(paradas, { zona, busqueda, enlaces, vendedores: vendedorAsignado });

  /** Resumen en texto: es lo que llega por WhatsApp junto con el PDF. */
  const textoRuta = () => {
    const cabeza = `Hoja de ruta · ${busqueda || "Clientes potenciales"} · ${zona} · ${new Date().toLocaleDateString("es-AR")}`;
    const cuerpo = paradas.map((p, i) => [
      `${i + 1}. ${p.nombre || "Sin nombre"}`,
      p.direccion || "Sin dirección",
      p.telefono && p.telefono !== "No disponible" ? `Tel: ${p.telefono}` : null,
      `Vendedor: ${vendedorAsignado[p.place_id] || "Sin asignar"}`,
    ].filter(Boolean).join("\n")).join("\n\n");
    const mapas = enlaces.map((u, i) => `${enlaces.length > 1 ? `Tramo ${i + 1}: ` : "Ruta en Google Maps: "}${u}`).join("\n");
    return `${cabeza}\n\n${cuerpo}\n\n${mapas}`;
  };

  const abrirMapa = (indice = 0) => {
    if (!enlaces[indice]) return;
    window.open(enlaces[indice], "_blank", "noopener,noreferrer");
  };

  const crearHojaRuta = () => { if (hayRuta) setRutaAbierta(true); };
  const descargarRuta = () => { if (hayRuta) descargarDoc(documentoRuta(), nombreArchivo()); };
  const imprimirRuta = () => { if (hayRuta) imprimirDoc(documentoRuta(), nombreArchivo()); };

  const compartirRuta = async () => {
    if (!hayRuta) return;
    try {
      const resultado = await enviarDoc(documentoRuta(), nombreArchivo(), textoRuta());
      if (resultado === "descargado") setMensajeAccion("Se descargó el PDF y se abrió WhatsApp para mandárselo al vendedor.");
      else if (resultado === "nativo") setMensajeAccion("Hoja de ruta compartida.");
    } catch {
      setMensajeAccion("No se pudo compartir la hoja de ruta. Probá descargarla.");
    }
  };

  const enviarAVendedor = async () => {
    const elegidos = filtrados.filter((r, i) => seleccionados.includes(r.place_id || `resultado-${i}`));
    if (!elegidos.length) return;
    const texto = `Clientes potenciales - ${zona}\n\n${elegidos.map((r, i) => `${i + 1}. ${r.nombre || "Sin nombre"}\n${r.direccion || "Sin dirección"}\nTel: ${r.telefono || "Sin teléfono"}\nVendedor: ${vendedorAsignado[r.place_id] || "Sin asignar"}`).join("\n\n")}`;
    try {
      if (navigator.share) await navigator.share({ title: "Clientes potenciales", text: texto });
      else { await navigator.clipboard.writeText(texto); setMensajeAccion("Información copiada para enviarla al vendedor"); }
    } catch (e) {
      if (e?.name !== "AbortError") setMensajeAccion("No se pudo compartir. Probá nuevamente.");
    }
  };

  const exportarCSV = () => {
    if (!paradas.length) return;
    const headers = ["Orden", "Prioridad", "Score", "Nombre", "Rubro", "Dirección", "Teléfono", "Email", "Web", "Sugerido", "Enfoque de venta", "Vendedor", "Contactado"];
    const rows = paradas.map((r, i) => {
      const c = contactados[r.place_id];
      return [i + 1, r.prioridad, r.lead_score, r.nombre, r.rubro, r.direccion, telefonoDe(r), emailsDe(r).join(" | "), r.sitio_web,
        r.productos_sugeridos, r.enfoque_venta, vendedorAsignado[r.place_id] || "Sin asignar",
        c ? `${c.canal} ${new Date(c.fecha).toLocaleDateString("es-AR")}` : ""].map(celdaCSV);
    });
    const csv = [headers.map(celdaCSV).join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `clientes-potenciales_${busqueda}_${new Date().toLocaleDateString("es-AR").replace(/\//g, "-")}.csv`; a.click();
  };

  const TARJETAS = [
    { clave: "TODOS", titulo: "Encontrados", valor: conteo.TODOS, color: "#0f172a", icono: Building2 },
    { clave: "ALTA",  titulo: "Prioridad alta", valor: conteo.ALTA, color: "#dc2626", icono: Target },
    { clave: "MEDIA", titulo: "Prioridad media", valor: conteo.MEDIA, color: "#d97706", icono: TrendingUp },
    { clave: "BAJA",  titulo: "Prioridad baja", valor: conteo.BAJA, color: "#16a34a", icono: Gauge },
  ];

  return (
    <div className="prospectos">
      <style>{`
        .prospectos { padding: 24px; max-width: 1140px; margin: 0 auto; font-family: Inter, system-ui, sans-serif; color: #0f172a; }
        .prospectos *, .prospectos *::before, .prospectos *::after { box-sizing: border-box; }

        /* ── Cabecera con el aire de un buscador con IA ── */
        .hero { position: relative; z-index: 5; border-radius: 24px; padding: 30px 28px 26px;
                background: radial-gradient(120% 140% at 12% 0%, #3b0d0d 0%, #171b2c 45%, #0b1020 100%);
                color: #fff; box-shadow: 0 24px 50px -28px rgba(15,23,42,.75); }
        .hero::after { content: ""; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
                background: radial-gradient(60% 90% at 88% 8%, rgba(248,113,113,.30), transparent 60%),
                            radial-gradient(50% 80% at 4% 96%, rgba(56,189,248,.20), transparent 60%); }
        .hero > * { position: relative; z-index: 1; }
        .hero > .panel-busqueda { z-index: 3; }
        .hero-chip { display: inline-flex; align-items: center; gap: 7px; padding: 6px 13px; border-radius: 999px;
                     background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.20);
                     font-size: 11.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
                     color: #fde68a; backdrop-filter: blur(6px); }
        .hero h1 { margin: 14px 0 6px; font-size: 30px; line-height: 1.15; font-weight: 800; letter-spacing: -.02em; }
        .hero h1 em { font-style: normal; background: linear-gradient(92deg,#fca5a5,#fbbf24 60%,#fde68a);
                      -webkit-background-clip: text; background-clip: text; color: transparent; }
        .hero p { margin: 0; max-width: 620px; font-size: 14px; line-height: 1.55; color: #cbd5e1; }

        .panel-busqueda { margin-top: 22px; display: flex; gap: 10px; flex-wrap: wrap; padding: 12px;
                          border-radius: 16px; background: rgba(255,255,255,.07);
                          border: 1px solid rgba(255,255,255,.14); backdrop-filter: blur(10px); }
        .campo { position: relative; flex: 1 1 240px; min-width: 0; }
        .campo > svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; }
        .campo input, .campo select { width: 100%; padding: 13px 14px 13px 40px; border-radius: 12px; font-size: 14.5px;
                     color: #f8fafc; background: rgba(15,23,42,.55); border: 1px solid rgba(255,255,255,.16);
                     outline: none; transition: border-color .18s, box-shadow .18s, background .18s; appearance: none; }
        .campo select { cursor: pointer; padding-right: 38px; }
        .campo-flecha { left: auto; right: 14px; }
        .campo select option, .campo select optgroup { color: #0f172a; background: #fff; }
        .campo input::placeholder { color: #7f8ea8; }
        .campo input:focus, .campo select:focus { border-color: #f87171; background: rgba(15,23,42,.8);
                     box-shadow: 0 0 0 4px rgba(248,113,113,.18); }
        .campo-zona { flex: 0 1 260px; }

        .btn-buscar { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: 9px;
                      padding: 13px 26px; border: 0; border-radius: 12px; cursor: pointer;
                      font-size: 14.5px; font-weight: 800; color: #fff;
                      background: linear-gradient(135deg,#ef4444,#9b1c1c);
                      box-shadow: 0 10px 24px -10px rgba(239,68,68,.9); transition: transform .16s, box-shadow .16s, filter .16s; }
        .btn-buscar:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.06); box-shadow: 0 14px 28px -10px rgba(239,68,68,1); }
        .btn-buscar:disabled { background: rgba(255,255,255,.14); color: #94a3b8; box-shadow: none; cursor: not-allowed; }

        .btn-ayuda { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: 999px; cursor: pointer;
                     font-size: 13px; font-weight: 700; color: #fff; background: rgba(255,255,255,.10);
                     border: 1px solid rgba(255,255,255,.22); transition: background .15s; }
        .btn-ayuda:hover { background: rgba(255,255,255,.20); }
        .pasos { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
        .paso { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 14px; border: 1px solid #e6eaf1; background: #fbfcfe; }
        .paso-icono { width: 34px; height: 34px; flex-shrink: 0; border-radius: 10px; display: grid; place-items: center;
                      color: #fff; background: linear-gradient(140deg,#ef4444,#7f1d1d); }
        .paso-titulo { font-size: 14px; font-weight: 800; color: #0f172a; }
        .paso p { margin: 3px 0 0; font-size: 13px; line-height: 1.55; color: #475569; }
        .motor { margin-top: 16px; padding: 14px 16px; border-radius: 14px; background: #f0f9ff; border: 1px solid #bae6fd; }
        .motor-grilla { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .motor-item { padding: 11px 13px; border-radius: 12px; background: #fff; border: 1px solid #e0f2fe; }
        .motor-titulo { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 800; color: #0c4a6e; }
        .motor-titulo svg { color: #0284c7; flex-shrink: 0; }
        .motor-item p { margin: 5px 0 0; font-size: 12.5px; line-height: 1.5; color: #334155; }
        .ventajas { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 7px; }
        .ventajas li { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; line-height: 1.5; color: #0f172a; }
        .ventajas svg { color: #16a34a; flex-shrink: 0; margin-top: 3px; }
        @media (max-width: 767px) { .motor-grilla { grid-template-columns: 1fr; } }
        .cuidados { margin-top: 16px; padding: 14px 16px; border-radius: 14px; background: #fff7ed; border: 1px solid #fed7aa; }
        .cuidados ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
        .cuidados li { font-size: 13px; line-height: 1.5; color: #7c2d12; }
        .hero-nota { margin-top: 14px !important; font-size: 12px !important; color: #94a3b8 !important; }

        /* ── Selector de zona ── */
        .campo-zona input { padding-right: 38px; }
        .zonas-lista { position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 30; max-height: 340px; overflow-y: auto;
                       padding: 6px; border-radius: 14px; background: #fff; color: #0f172a;
                       box-shadow: 0 24px 50px -18px rgba(2,6,23,.6); border: 1px solid #e2e8f0; animation: aparecer .15s ease both; }
        .zonas-grupo { padding: 9px 10px 4px; font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #94a3b8; }
        .zona-op { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 0; border-radius: 9px;
                   background: none; color: #334155; font-size: 13.5px; text-align: left; cursor: pointer; }
        .zona-op svg { color: #cbd5e1; flex-shrink: 0; }
        .zona-op:hover, .zona-op[data-activa="1"] { background: #fef2f2; color: #b91c1c; }
        .zona-op:hover svg, .zona-op[data-activa="1"] svg { color: #ef4444; }
        .zonas-vacio { padding: 12px 10px; font-size: 13px; color: #64748b; line-height: 1.45; }

        /* ── Contacto ── */
        .contactar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 13px; }
        .contactar .btn { text-decoration: none; }
        .pastilla-ok { background: #ecfdf5; color: #047857; }
        .fuente { margin-top: 12px; padding: 10px 14px; border-radius: 12px; font-size: 12.5px; line-height: 1.5;
                  color: #475569; background: #f8fafc; border: 1px solid #e6eaf1; }
        .canal { margin-top: 16px; padding: 14px; border-radius: 16px; border: 1px solid #e6eaf1; background: #fbfcfe; }
        .canal:first-of-type { margin-top: 0; }
        .canal-titulo { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 10px; }
        .canal-campo { width: 100%; display: block; margin-bottom: 10px; padding: 10px 12px; border-radius: 11px; border: 1px solid #e2e8f0;
                       font: inherit; font-size: 13.5px; line-height: 1.5; color: #0f172a; background: #fff; resize: vertical; }
        .canal-campo:focus { outline: none; border-color: #f87171; box-shadow: 0 0 0 3px rgba(248,113,113,.16); }
        .canal-nota { margin: 10px 0 0; font-size: 12px; color: #64748b; line-height: 1.5; }
        .btn-apagado { opacity: .45; pointer-events: none; }
        .barra-acciones { display: flex; flex-wrap: wrap; gap: 8px; }
        .barra-acciones a.btn { text-decoration: none; }

        .rubros { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; margin-top: 16px; }
        .rubros > span { font-size: 11px; font-weight: 700; letter-spacing: .06em; color: #94a3b8; text-transform: uppercase; margin-right: 4px; }
        .rubro { padding: 6px 13px; border-radius: 999px; font-size: 12.5px; font-weight: 600; cursor: pointer;
                 color: #cbd5e1; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.14);
                 transition: transform .15s, background .15s, color .15s, border-color .15s; }
        .rubro:hover { transform: translateY(-1px); background: rgba(255,255,255,.14); color: #fff; }
        .rubro[data-activo="1"] { background: linear-gradient(135deg,#ef4444,#b91c1c); border-color: transparent; color: #fff;
                                  box-shadow: 0 8px 18px -10px rgba(239,68,68,.95); }

        /* ── Barra de la hoja de ruta ── */
        .ruta-barra { display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap;
                      margin-top: 20px; padding: 16px 18px; border-radius: 18px; background: #fff;
                      border: 1px solid #e6eaf1; box-shadow: 0 10px 30px -22px rgba(15,23,42,.55); }
        .ruta-barra[data-activa="1"] { border-color: #fecaca;
                      background: linear-gradient(120deg,#fff7ed 0%,#ffffff 42%); }
        .ruta-icono { width: 44px; height: 44px; flex-shrink: 0; border-radius: 14px; display: grid; place-items: center;
                      color: #fff; background: linear-gradient(140deg,#ef4444,#7f1d1d); box-shadow: 0 10px 22px -12px rgba(185,28,28,.95); }
        .ruta-titulo { font-size: 14.5px; font-weight: 800; }
        .ruta-sub { font-size: 12.5px; color: #64748b; margin-top: 3px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
        .pastilla { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 999px;
                    background: #f1f5f9; color: #334155; font-size: 11.5px; font-weight: 700; }

        .btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 15px; border-radius: 11px;
               font-size: 13px; font-weight: 700; cursor: pointer; border: 1px solid #e2e8f0; background: #fff; color: #334155;
               transition: transform .15s, box-shadow .15s, background .15s, border-color .15s, color .15s; }
        .btn:hover:not(:disabled) { transform: translateY(-1px); border-color: #cbd5e1; box-shadow: 0 8px 18px -12px rgba(15,23,42,.7); }
        .btn:active:not(:disabled) { transform: translateY(0); }
        .btn:disabled { opacity: .5; cursor: not-allowed; }
        .btn-principal { border: 0; color: #fff; font-weight: 800; padding: 11px 18px;
                         background: linear-gradient(135deg,#ef4444,#9b1c1c); box-shadow: 0 10px 22px -12px rgba(185,28,28,1); }
        .btn-principal:hover:not(:disabled) { filter: brightness(1.06); box-shadow: 0 14px 26px -12px rgba(185,28,28,1); }
        .btn-principal:disabled { background: #e2e8f0; color: #94a3b8; box-shadow: none; }
        .btn-oscuro { border: 0; color: #fff; background: linear-gradient(135deg,#334155,#0f172a); }

        .aviso { margin-top: 14px; padding: 11px 15px; border-radius: 12px; font-size: 13px; font-weight: 600;
                 display: flex; align-items: center; gap: 9px; animation: aparecer .3s ease both; }
        .aviso-ok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; }
        .aviso-mal { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }

        /* ── Métricas ── */
        .metricas { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin-top: 22px; }
        .metrica { position: relative; overflow: hidden; text-align: left; padding: 14px 16px; border-radius: 16px; cursor: pointer;
                   background: #fff; border: 1px solid #e6eaf1; transition: transform .16s, box-shadow .16s, border-color .16s; }
        .metrica:hover { transform: translateY(-2px); box-shadow: 0 16px 30px -22px rgba(15,23,42,.8); }
        .metrica[data-activa="1"] { border-color: currentColor; box-shadow: 0 14px 28px -20px currentColor; }
        .metrica-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .metrica-top span { font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #94a3b8; }
        .metrica-valor { font-size: 26px; font-weight: 800; margin-top: 6px; letter-spacing: -.02em; }

        /* ── Tarjetas de resultado ── */
        .lista { display: flex; flex-direction: column; gap: 12px; margin-top: 18px; }
        .tarjeta { display: flex; overflow: hidden; border-radius: 18px; background: #fff; border: 1px solid #e6eaf1;
                   box-shadow: 0 4px 14px -12px rgba(15,23,42,.6); transition: transform .18s, box-shadow .18s, border-color .18s;
                   animation: aparecer .35s ease both; }
        .tarjeta:hover { transform: translateY(-2px); box-shadow: 0 20px 38px -26px rgba(15,23,42,.85); border-color: #dbe2ec; }
        .tarjeta[data-elegida="1"] { border-color: #b91c1c; box-shadow: 0 18px 34px -24px rgba(185,28,28,.9); }
        .tarjeta-barra { width: 6px; flex-shrink: 0; }
        .tarjeta-cuerpo { flex: 1; min-width: 0; padding: 17px 19px; }
        .orden { width: 25px; height: 25px; flex-shrink: 0; border-radius: 50%; display: grid; place-items: center;
                 font-size: 11.5px; font-weight: 800; color: #fff; background: linear-gradient(140deg,#ef4444,#7f1d1d); }
        .chip-prioridad { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px;
                          font-size: 11px; font-weight: 800; border: 1px solid; }
        .datos { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px,1fr)); gap: 8px; margin: 13px 0; }
        .dato { display: inline-flex; align-items: flex-start; gap: 8px; padding: 8px 11px; border-radius: 10px;
                font-size: 12.5px; color: #334155; text-decoration: none; background: #f8fafc; border: 1px solid #eef2f7;
                transition: background .15s, border-color .15s, color .15s; min-width: 0; }
        .dato span { overflow: hidden; text-overflow: ellipsis; }
        .dato:hover { background: #fff; border-color: #cbd5e1; color: #0f172a; }
        .dato svg { flex-shrink: 0; margin-top: 1px; color: #94a3b8; }
        .dato:hover svg { color: #b91c1c; }
        .notas { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .nota { border-radius: 12px; padding: 11px 14px; border: 1px solid; }
        .nota-titulo { display: flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 800; letter-spacing: .05em;
                       text-transform: uppercase; margin-bottom: 5px; }
        .nota p { margin: 0; font-size: 12.5px; line-height: 1.5; }
        .selector-vendedor { padding: 7px 12px; border-radius: 10px; border: 1px solid #e2e8f0; font-size: 12.5px;
                             color: #475569; background: #f8fafc; cursor: pointer; transition: border-color .15s, box-shadow .15s; }
        .selector-vendedor:focus { outline: none; border-color: #f87171; box-shadow: 0 0 0 3px rgba(248,113,113,.16); }
        .tilde { width: 18px; height: 18px; accent-color: #b91c1c; cursor: pointer; flex-shrink: 0; }

        .anillo { width: 46px; height: 46px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; }
        .anillo-centro { width: 36px; height: 36px; border-radius: 50%; background: #fff; display: grid; place-items: center; line-height: 1; }
        .anillo-centro span { font-size: 14px; font-weight: 800; }
        .anillo-centro small { font-size: 8px; color: #94a3b8; font-weight: 700; }

        /* ── Filtros ── */
        .filtros { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 18px; }
        .filtro { padding: 7px 15px; border-radius: 999px; border: 1px solid #e2e8f0; background: #fff; color: #475569;
                  font-weight: 700; font-size: 12.5px; cursor: pointer; transition: transform .15s, background .15s, color .15s; }
        .filtro:hover { transform: translateY(-1px); border-color: #cbd5e1; }
        .filtro[data-activo="1"] { background: linear-gradient(135deg,#ef4444,#9b1c1c); border-color: transparent; color: #fff;
                                   box-shadow: 0 10px 20px -14px rgba(185,28,28,1); }

        /* ── Croquis del recorrido ── */
        .croquis-caja { position: relative; border-radius: 16px; overflow: hidden; border: 1px solid #e6eaf1;
                        background: radial-gradient(120% 120% at 20% 0%, #f8fafc, #eef2f7); }
        .croquis-trazo { stroke-dashoffset: 400; animation: trazar 1.4s ease-out forwards; }
        .croquis-punto { animation: aparecer .4s ease both; }
        .croquis-pie { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px;
                       font-size: 11.5px; font-weight: 700; color: #64748b; background: rgba(255,255,255,.7);
                       border-top: 1px solid #e6eaf1; }

        /* ── Modal de la hoja de ruta ── */
        .capa { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center;
                padding: 16px; background: rgba(9,13,26,.62); backdrop-filter: blur(6px); animation: aparecer .2s ease both; }
        .modal { width: min(780px,100%); max-height: 92vh; overflow-y: auto; border-radius: 22px; background: #fff;
                 box-shadow: 0 40px 90px -30px rgba(2,6,23,.8); animation: subir .28s cubic-bezier(.2,.9,.3,1) both; }
        .modal-cabecera { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between;
                          gap: 12px; padding: 16px 20px; color: #fff; border-radius: 22px 22px 0 0;
                          background: radial-gradient(120% 200% at 0% 0%, #7f1d1d, #0f172a 70%); }
        .modal-cerrar { border: 0; border-radius: 10px; padding: 8px; cursor: pointer; display: grid; place-items: center;
                        background: rgba(255,255,255,.12); color: #fff; transition: background .15s; }
        .modal-cerrar:hover { background: rgba(255,255,255,.24); }
        .paradas { margin: 18px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 9px; }
        .parada { display: flex; gap: 12px; align-items: center; padding: 11px 13px; border-radius: 14px; background: #fff;
                  border: 1px solid #e6eaf1; transition: transform .15s, border-color .15s, box-shadow .15s; animation: aparecer .3s ease both; }
        .parada:hover { transform: translateX(2px); border-color: #fecaca; box-shadow: 0 12px 26px -22px rgba(185,28,28,1); }
        .parada-ir { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
                     color: #b91c1c; background: #fef2f2; border: 1px solid #fee2e2; transition: background .15s, color .15s; }
        .parada-ir:hover { background: #b91c1c; color: #fff; }
        .nota-tramos { margin-top: 12px; padding: 11px 13px; border-radius: 12px; font-size: 12px; line-height: 1.5;
                       background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; }

        /* ── Estados vacío / cargando ── */
        .vacio { text-align: center; padding: 64px 20px; color: #94a3b8; }
        .vacio-icono { width: 78px; height: 78px; margin: 0 auto 18px; border-radius: 26px; display: grid; place-items: center;
                       color: #b91c1c; background: linear-gradient(140deg,#fff1f2,#fef3c7); border: 1px solid #fee2e2; }
        .radar { width: 84px; height: 84px; margin: 0 auto 18px; border-radius: 50%; display: grid; place-items: center;
                 color: #b91c1c; background: radial-gradient(circle, #fff1f2, #fff);
                 border: 1px solid #fee2e2; animation: latir 1.6s ease-in-out infinite; }
        .esqueleto { height: 92px; border-radius: 18px; border: 1px solid #eef2f7;
                     background: linear-gradient(100deg,#f8fafc 30%,#eef2f7 50%,#f8fafc 70%); background-size: 220% 100%;
                     animation: brillar 1.3s linear infinite; }
        .gira { animation: girar 1s linear infinite; }

        @keyframes girar { to { transform: rotate(360deg); } }
        @keyframes brillar { to { background-position: -220% 0; } }
        @keyframes latir { 0%,100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(185,28,28,.25); }
                           50% { transform: scale(1.04); box-shadow: 0 0 0 16px rgba(185,28,28,0); } }
        @keyframes aparecer { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes subir { from { opacity: 0; transform: translateY(18px) scale(.98); } to { opacity: 1; transform: none; } }
        @keyframes trazar { to { stroke-dashoffset: 0; } }

        @media (prefers-reduced-motion: reduce) {
          .prospectos *, .prospectos *::before, .prospectos *::after { animation: none !important; transition: none !important; }
        }

        /* ── Celular ── */
        @media (max-width: 767px) {
          .prospectos { padding: 14px; }
          .hero { padding: 22px 18px; border-radius: 20px; }
          .hero h1 { font-size: 23px; }
          .campo, .campo-zona { flex: 1 1 100%; }
          .btn-buscar { width: 100%; }
          .metricas { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .notas { grid-template-columns: 1fr; }
          .ruta-barra .barra-acciones { width: 100%; }
          .ruta-barra .barra-acciones .btn { flex: 1 1 auto; justify-content: center; }
          .modal-cabecera { border-radius: 0; }
          .modal { border-radius: 18px; }
        }
      `}</style>

      {/* ── Cabecera ── */}
      <header className="hero">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span className="hero-chip"><Sparkles size={13} /> Prospección con IA</span>
          <button className="btn-ayuda" onClick={() => setAyuda(true)}><BookOpen size={15} /> Cómo usar</button>
        </div>
        <h1>Encontrá y ordená tus <em>clientes potenciales</em></h1>
        <p>Encontrá hoteles, venues de bodas, empresas de eventos, campings y más en cualquier zona de Estados Unidos. La IA puntúa cada negocio según su potencial para Nini T Group, te redacta el email o WhatsApp de presentación y arma la hoja de ruta para visitarlos.</p>

        <div className="panel-busqueda">
          <label className="campo">
            <Search size={16} />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()}
              placeholder="Rubro o tipo de negocio: event rentals, wedding venues…" aria-label="Rubro o tipo de negocio" />
          </label>
          <ZonaSelector valor={zona} onCambiar={setZona} onEnter={buscar} />
          <button className="btn-buscar" onClick={buscar}
            disabled={cargando || !busqueda.trim() || !zona.trim()}>
            {cargando ? <><Loader2 size={17} className="gira" /> Buscando…</> : <><Sparkles size={17} /> Buscar</>}
          </button>
        </div>

        <div className="rubros">
          <span>Rubros para NTG</span>
          {RUBROS.map((r) => (
            <button key={r.id} className="rubro" data-activo={busqueda === r.etiqueta ? 1 : 0} onClick={() => setBusqueda(r.etiqueta)}
              title={r.angulo}>{r.etiqueta}</button>
          ))}
        </div>

        <p className="hero-nota">
          El puntaje es afinidad con Nini T Group, no intención de compra confirmada. También podés escribir cualquier rubro
          (en español o inglés) y la zona como ciudad, estado o ZIP.
        </p>
      </header>

      {/* ── Acciones de la hoja de ruta ── */}
      <section className="ruta-barra" data-activa={hayRuta ? 1 : 0}>
        <div style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0 }}>
          <div className="ruta-icono"><Route size={21} /></div>
          <div style={{ minWidth: 0 }}>
            <div className="ruta-titulo">Hoja de ruta</div>
            <div className="ruta-sub">
              {hayRuta ? (
                <>
                  <span className="pastilla"><MapPin size={11} /> {paradas.length} paradas</span>
                  {kilometros > 0 && <span className="pastilla"><Navigation size={11} /> {kilometros.toFixed(1)} km aprox.</span>}
                  {seleccionados.length > 0 && <span className="pastilla"><CheckCircle2 size={11} /> solo los tildados</span>}
                  <span>ordenadas por cercanía</span>
                </>
              ) : "Hacé una búsqueda para habilitar estas acciones"}
            </div>
          </div>
        </div>
        <div className="barra-acciones">
          <button className="btn btn-principal" onClick={crearHojaRuta} disabled={!hayRuta} title="Ver el recorrido en el mapa">
            <Route size={16} /> Crear hoja de ruta <ArrowRight size={15} />
          </button>
          <button className="btn btn-compacto" onClick={() => abrirMapa(0)} disabled={!hayRuta} title="Abrir el recorrido en Google Maps">
            <Navigation size={16} /> <span className="solo-desktop">Google Maps</span>
          </button>
          <button className="btn btn-compacto" onClick={compartirRuta} disabled={!hayRuta} title="Mandarle la hoja de ruta al vendedor">
            <Share2 size={16} /> <span className="solo-desktop">Compartir</span>
          </button>
          <button className="btn btn-compacto" onClick={descargarRuta} disabled={!hayRuta} title="Descargar la hoja de ruta en PDF">
            <Download size={16} /> <span className="solo-desktop">Descargar</span>
          </button>
          <button className="btn btn-compacto" onClick={imprimirRuta} disabled={!hayRuta} title="Imprimir la hoja de ruta">
            <Printer size={16} /> <span className="solo-desktop">Imprimir</span>
          </button>
          <button className="btn btn-compacto" onClick={exportarCSV} disabled={!hayRuta} title="Descargar los clientes en una planilla">
            <FileSpreadsheet size={16} /> <span className="solo-desktop">CSV</span>
          </button>
          <button className="btn btn-compacto" onClick={enviarAVendedor} disabled={!seleccionados.length} title="Compartir solo los clientes tildados">
            <Send size={16} /> <span className="solo-desktop">Enviar a vendedor</span>
          </button>
        </div>
      </section>

      {mensajeAccion && <div className="aviso aviso-ok"><CheckCircle2 size={16} /> {mensajeAccion}</div>}
      {error && <div className="aviso aviso-mal"><Radar size={16} /> {error}</div>}

      {/* ── Modal de la hoja de ruta ── */}
      {rutaAbierta && (
        <div className="capa" role="dialog" aria-modal="true" aria-label="Hoja de ruta" onClick={() => setRutaAbierta(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-cabecera">
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(255,255,255,.14)" }}>
                  <Route size={19} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16.5, fontWeight: 800 }}>Hoja de ruta · {zona}</div>
                  <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 2 }}>
                    {paradas.length} paradas ordenadas por cercanía{kilometros > 0 ? ` · ${kilometros.toFixed(1)} km aprox.` : ""}
                  </div>
                </div>
              </div>
              <button className="modal-cerrar" onClick={() => setRutaAbierta(false)} aria-label="Cerrar"><X size={18} /></button>
            </div>

            <div style={{ padding: "18px 20px 22px" }}>
              <CroquisRuta paradas={paradas} />

              <div className="barra-acciones" style={{ marginTop: 16 }}>
                {tramos.map((grupo, i) => (
                  <button key={i} className="btn btn-principal" onClick={() => abrirMapa(i)}>
                    <Navigation size={16} />
                    {tramos.length > 1
                      ? `Google Maps · tramo ${i + 1} (${paradas.indexOf(grupo[0]) + 1}-${paradas.indexOf(grupo[grupo.length - 1]) + 1})`
                      : "Abrir en Google Maps"}
                  </button>
                ))}
                <button className="btn" onClick={compartirRuta}><Share2 size={16} /> Compartir</button>
                <button className="btn" onClick={descargarRuta}><Download size={16} /> Descargar PDF</button>
                <button className="btn" onClick={imprimirRuta}><Printer size={16} /> Imprimir</button>
              </div>

              {tramos.length > 1 && (
                <div className="nota-tramos">
                  Google Maps admite hasta {MAX_PARADAS_TRAMO} paradas por recorrido, así que la ruta se dividió en {tramos.length} tramos
                  encadenados: cada uno arranca donde termina el anterior, y el PDF lleva los links de los {tramos.length}.
                </div>
              )}

              <ol className="paradas">
                {paradas.map((p, i) => {
                  const c = colorPrioridad(p.prioridad);
                  return (
                    <li className="parada" key={p.place_id || i} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                      <div className="orden">{i + 1}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{p.nombre || "Sin nombre"}</span>
                          <span className="chip-prioridad" style={{ background: c.bg, color: c.text, borderColor: c.borde }}>{p.prioridad || "—"}</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 3 }}>{p.direccion || "Sin dirección"}</div>
                        <div style={{ fontSize: 12.5, color: "#475569", marginTop: 3, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {p.telefono && p.telefono !== "No disponible"
                            ? <a href={`tel:${p.telefono}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#0f172a", textDecoration: "none" }}><Phone size={12} /> {p.telefono}</a>
                            : <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Phone size={12} /> Sin teléfono</span>}
                          <span style={{ color: "#cbd5e1" }}>·</span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Send size={12} /> {vendedorAsignado[p.place_id] || "Sin asignar"}</span>
                        </div>
                      </div>
                      <a className="parada-ir" href={urlParada(p)} target="_blank" rel="noopener noreferrer" title="Ver esta parada en el mapa">
                        <MapPin size={16} />
                      </a>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* ── Contactar: email y WhatsApp redactados para ese negocio ── */}
      {mensaje && (() => {
        const r = mensaje.negocio;
        const emails = emailsDe(r);
        const wa = numeroWhatsApp(telefonoDe(r));
        const cambiar = (campo) => (e) => setMensaje((m) => ({ ...m, [campo]: e.target.value }));
        const mailto = `mailto:${encodeURIComponent(emails[0] || "")}?subject=${encodeURIComponent(mensaje.asunto || "")}&body=${encodeURIComponent(mensaje.email || "")}`;
        return (
          <div className="capa" role="dialog" aria-modal="true" aria-label={`Contactar a ${r.nombre}`} onClick={() => setMensaje(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-cabecera">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16.5, fontWeight: 800 }}>Contactar a {r.nombre}</div>
                  <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 2 }}>
                    Revisalo y mandalo vos, de a uno: es la forma segura de escribirle a alguien que todavía no nos conoce.
                  </div>
                </div>
                <button className="modal-cerrar" onClick={() => setMensaje(null)} aria-label="Cerrar"><X size={18} /></button>
              </div>

              <div style={{ padding: "18px 20px 22px" }}>
                {mensaje.cargando && (
                  <div className="vacio" style={{ padding: "36px 10px" }}>
                    <div className="radar"><Sparkles size={30} /></div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Redactando el mensaje para {r.nombre}…</div>
                  </div>
                )}
                {mensaje.error && <div className="aviso aviso-mal"><AlertTriangle size={16} /> {mensaje.error}</div>}

                {mensaje.email && (
                  <>
                    <section className="canal">
                      <div className="canal-titulo"><Mail size={15} /> Email {emails[0] ? `a ${emails[0]}` : "(este negocio no tiene email cargado: copialo y usá el formulario de su web)"}</div>
                      <input className="canal-campo" value={mensaje.asunto} onChange={cambiar("asunto")} aria-label="Asunto" />
                      <textarea className="canal-campo" rows={10} value={mensaje.email} onChange={cambiar("email")} aria-label="Cuerpo del email" />
                      <div className="barra-acciones">
                        <a className={`btn btn-principal${emails[0] ? "" : " btn-apagado"}`} href={emails[0] ? mailto : undefined}
                          onClick={() => emails[0] && marcarContactado(r, "email")}>
                          <Mail size={15} /> Abrir en mi correo
                        </a>
                        <button className="btn" onClick={() => copiar(`${mensaje.asunto}\n\n${mensaje.email}`, "Email copiado.")}><Copy size={15} /> Copiar</button>
                        {r.sitio_web && (
                          <a className="btn" href={r.sitio_web} target="_blank" rel="noopener noreferrer"><Globe size={15} /> Su web</a>
                        )}
                      </div>
                    </section>

                    <section className="canal">
                      <div className="canal-titulo"><MessageCircle size={15} /> WhatsApp {wa ? `al ${telefonoDe(r)}` : "(sin un teléfono válido de USA)"}</div>
                      <textarea className="canal-campo" rows={4} value={mensaje.whatsapp} onChange={cambiar("whatsapp")} aria-label="Mensaje de WhatsApp" />
                      <div className="barra-acciones">
                        <a className={`btn btn-principal${wa ? "" : " btn-apagado"}`} target="_blank" rel="noopener noreferrer"
                          href={wa ? `https://wa.me/${wa}?text=${encodeURIComponent(mensaje.whatsapp)}` : undefined}
                          onClick={() => wa && marcarContactado(r, "WhatsApp")}>
                          <MessageCircle size={15} /> Abrir WhatsApp
                        </a>
                        <button className="btn" onClick={() => copiar(mensaje.whatsapp, "Mensaje copiado.")}><Copy size={15} /> Copiar</button>
                      </div>
                      <p className="canal-nota">Muchos teléfonos de negocios son fijos y no tienen WhatsApp: si no abre, llamalos.</p>
                    </section>

                    <details className="canal">
                      <summary className="canal-titulo" style={{ cursor: "pointer" }}>Firma de los emails</summary>
                      <textarea className="canal-campo" rows={3} value={firma}
                        onChange={(e) => { setFirma(e.target.value); guardar(CLAVE_FIRMA, e.target.value); }} aria-label="Firma" />
                      <p className="canal-nota">
                        Para cumplir la ley de email comercial de USA (CAN-SPAM) la firma debe llevar una dirección postal real de NTG.
                        La línea para darse de baja se agrega sola. La firma nueva se usa en el próximo mensaje que redactes.
                      </p>
                    </details>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Buscando ── */}
      {cargando && (
        <div style={{ marginTop: 24 }}>
          <div className="vacio" style={{ paddingBottom: 26 }}>
            <div className="radar"><Radar size={34} /></div>
            <div style={{ fontSize: 17.5, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>Rastreando negocios en {zona}…</div>
            <div style={{ fontSize: 13.5 }}>Buscando en el mapa y puntuando cada negocio con la IA. Tarda entre 5 y 20 segundos.</div>
          </div>
          <div className="lista">{[0, 1, 2].map((i) => <div key={i} className="esqueleto" style={{ animationDelay: `${i * 160}ms` }} />)}</div>
        </div>
      )}

      {/* ── Resultados ── */}
      {busquedaHecha && !cargando && (
        <>
          <div className="metricas">
            {TARJETAS.map(({ clave, titulo, valor, color, icono: Icono }) => (
              <button key={clave} className="metrica" data-activa={filtro === clave ? 1 : 0} style={{ color }} onClick={() => setFiltro(clave)}>
                <div className="metrica-top">
                  <span>{titulo}</span>
                  <Icono size={16} />
                </div>
                <div className="metrica-valor" style={{ color }}>{valor}</div>
              </button>
            ))}
          </div>

          <div className="filtros">
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="filtro" onClick={seleccionarTodos}>
                <CheckCircle2 size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
                {seleccionados.length === clavesFiltradas.length && clavesFiltradas.length ? "Quitar selección" : "Seleccionar todos"}
              </button>
              {["TODOS", "ALTA", "MEDIA", "BAJA"].map((f) => (
                <button key={f} className="filtro" data-activo={filtro === f ? 1 : 0} onClick={() => setFiltro(f)}>{f} ({conteo[f]})</button>
              ))}
              <button className="filtro" data-activo={soloCon === "email" ? 1 : 0} onClick={() => setSoloCon(soloCon === "email" ? "" : "email")}>
                <Mail size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Con email ({resultados.filter((r) => emailsDe(r).length).length})
              </button>
              <button className="filtro" data-activo={soloCon === "telefono" ? 1 : 0} onClick={() => setSoloCon(soloCon === "telefono" ? "" : "telefono")}>
                <Phone size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Con teléfono ({resultados.filter((r) => telefonoDe(r)).length})
              </button>
            </div>
            <span style={{ fontSize: 12.5, color: "#64748b", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Building2 size={13} /> {filtrados.length} negocios
            </span>
          </div>

          {info && (
            <div className="fuente">
              {info.fuente === "google"
                ? "Datos de Google Maps."
                : "Datos de OpenStreetMap (gratis): algunos negocios no tienen teléfono o web cargados. Con una clave de Google Places los resultados son más completos."}
              {" "}{info.ia ? "Puntaje y enfoque analizados por la IA con la ficha de NTG." : "Puntaje calculado por reglas del rubro (la IA no respondió esta vez)."}
            </div>
          )}

          <div className="lista">
            {filtrados.map((r, i) => {
              const c = colorPrioridad(r.prioridad);
              const clave = r.place_id || `resultado-${i}`;
              const elegida = seleccionados.includes(clave);
              const emails = emailsDe(r);
              const tel = telefonoDe(r);
              const web = r.sitio_web || r.website;
              const orden = paradas.indexOf(r) + 1;
              const contacto = contactados[r.place_id];
              return (
                <article className="tarjeta" key={clave} data-elegida={elegida ? 1 : 0} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
                  <div className="tarjeta-barra" style={{ background: c.barra }} />
                  <div className="tarjeta-cuerpo">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                          <input className="tilde" type="checkbox" checked={elegida} onChange={() => alternarSeleccion(clave)}
                            aria-label={`Seleccionar ${r.nombre || "cliente"}`} />
                          {orden > 0 && <span className="orden" title="Orden en la hoja de ruta">{orden}</span>}
                          <span style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: "-.01em" }}>{r.nombre}</span>
                          <span className="chip-prioridad" style={{ background: c.bg, color: c.text, borderColor: c.borde }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.punto }} /> {r.prioridad}
                          </span>
                          {r.calificacion > 0 && (
                            <span style={{ fontSize: 12.5, color: "#64748b", display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <Star size={13} fill="#f59e0b" color="#f59e0b" /> {r.calificacion} <span style={{ color: "#94a3b8" }}>({r.num_resenas})</span>
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 5, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <Building2 size={13} /> {r.tipo_negocio || r.rubro || "Negocio"} · {r.ciudad || zona}
                          {r.perfil && <span className="pastilla">{r.perfil}</span>}
                          {contacto && (
                            <span className="pastilla pastilla-ok" title={new Date(contacto.fecha).toLocaleString("es-AR")}>
                              <UserCheck size={11} /> Contactado por {contacto.canal} · {new Date(contacto.fecha).toLocaleDateString("es-AR")}
                            </span>
                          )}
                        </div>
                        {r.motivo && <div style={{ fontSize: 12.5, color: "#334155", marginTop: 6 }}>{r.motivo}</div>}
                        {r.alerta && (
                          <div style={{ fontSize: 12.5, color: "#b45309", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                            <AlertTriangle size={13} /> {r.alerta}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <AnilloScore valor={r.lead_score} color={c.text} />
                        <select className="selector-vendedor" value={vendedorAsignado[r.place_id] || "Sin asignar"}
                          onChange={(e) => setVendedorAsignado((prev) => ({ ...prev, [r.place_id]: e.target.value }))}
                          aria-label={`Vendedor para ${r.nombre || "el cliente"}`}>
                          {VENDEDORES.map((v) => <option key={v}>{v}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="datos">
                      {r.direccion && (
                        <a className="dato" href={urlParada(r)} target="_blank" rel="noopener noreferrer" title="Ver en Google Maps">
                          <MapPin size={14} /><span>{r.direccion}</span><ExternalLink size={12} style={{ marginLeft: "auto" }} />
                        </a>
                      )}
                      {tel && (
                        <a className="dato" href={`tel:${tel}`} onClick={() => marcarContactado(r, "llamada")}><Phone size={14} /><span>{tel}</span></a>
                      )}
                      {emails.length > 0 && (
                        <span className="dato"><Mail size={14} /><span>{emails.slice(0, 2).join(" · ")}</span></span>
                      )}
                      {web && web !== "No disponible" && (
                        <a className="dato" href={web.startsWith("http") ? web : `https://${web}`} target="_blank" rel="noopener noreferrer">
                          <Globe size={14} /><span>{web.replace(/^https?:\/\//, "").split("/")[0]}</span><ExternalLink size={12} style={{ marginLeft: "auto" }} />
                        </a>
                      )}
                    </div>

                    {(r.productos_sugeridos || r.enfoque_venta) && (
                      <div className="notas">
                        {r.productos_sugeridos && r.productos_sugeridos !== "N/A" && (
                          <div className="nota" style={{ background: "#f0f9ff", borderColor: "#bae6fd" }}>
                            <div className="nota-titulo" style={{ color: "#0369a1" }}><ShoppingBag size={12} /> Productos sugeridos</div>
                            <p style={{ color: "#0c4a6e" }}>{r.productos_sugeridos}</p>
                          </div>
                        )}
                        {r.enfoque_venta && r.enfoque_venta !== "N/A" && (
                          <div className="nota" style={{ background: "#fefce8", borderColor: "#fde68a" }}>
                            <div className="nota-titulo" style={{ color: "#854d0e" }}><MessageSquareQuote size={12} /> Enfoque de venta</div>
                            <p style={{ color: "#713f12" }}>{r.enfoque_venta}</p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="contactar">
                      <button className="btn btn-principal" onClick={() => redactarPara(r)} title="La IA redacta el email y el WhatsApp de presentación">
                        <Sparkles size={15} /> Contactar
                      </button>
                      {tel && (
                        <a className="btn" href={`tel:${tel}`} onClick={() => marcarContactado(r, "llamada")}><Phone size={15} /> Llamar</a>
                      )}
                      {r.maps_url && (
                        <a className="btn" href={r.maps_url} target="_blank" rel="noopener noreferrer"><Star size={15} /> Ver en Google</a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {!filtrados.length && (
            <div className="vacio">
              <div className="vacio-icono"><Target size={32} /></div>
              <div style={{ fontSize: 16.5, fontWeight: 800, color: "#475569", marginBottom: 6 }}>Ningún negocio con esa prioridad</div>
              <div style={{ fontSize: 13.5 }}>Probá con otro filtro o buscá otro rubro en la zona.</div>
            </div>
          )}
        </>
      )}

      {/* ── Todavía sin buscar ── */}
      {!busquedaHecha && !cargando && !error && (
        <div className="vacio">
          <div className="vacio-icono"><Radar size={34} /></div>
          <div style={{ fontSize: 17.5, fontWeight: 800, color: "#475569", marginBottom: 6 }}>Listo para rastrear</div>
          <div style={{ fontSize: 13.5, maxWidth: 460, margin: "0 auto" }}>
            Elegí un rubro y la zona arriba y tocá Buscar. Después podés contactar a cada negocio por email o WhatsApp, o armar la hoja de ruta para visitarlos.
          </div>
          <button className="btn" style={{ marginTop: 16 }} onClick={() => setAyuda(true)}><BookOpen size={15} /> Ver el instructivo</button>
        </div>
      )}

      {ayuda && <Instructivo onCerrar={() => setAyuda(false)} />}
    </div>
  );
}
