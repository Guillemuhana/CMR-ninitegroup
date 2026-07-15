// ============================================================
// SISTEMA DE DISEÑO — NINIT Group CRM
// ============================================================
// Fuente única de verdad para color, radios, sombras y tipografía.
//
// Por qué existe: el CRM tiene ~1.100 estilos inline que leen las paletas
// `L` (App.jsx) y `C` (lib.js). Esas dos paletas ahora DERIVAN de este
// archivo, así que cambiar un token acá re-skinea todo el CRM sin tocar
// ningún componente. Es el paso previo a migrar los inline a clases CSS.
//
// La paleta sale del mockup de escritorio: rail de navegación azul noche,
// acción índigo, IA violeta. `ESTADOS` (lib.js) mantiene sus colores
// propios de embudo y no se toca desde acá.
// ============================================================

export const COLOR = {
  // ── Rail de navegación (la columna oscura del mockup) ──────
  navBg:         "#171C2F",
  navBgHover:    "#232A45",
  navActive:     "#4F62D8",
  navText:       "#9AA3BC",
  navTextActive: "#FFFFFF",
  navBorder:     "#252B44",

  // ── Superficies ────────────────────────────────────────────
  canvas:       "#F7F8FA",  // fondo de la app
  surface:      "#FFFFFF",  // paneles, tarjetas
  surfaceAlt:   "#F1F3F7",  // inputs, chips, hover suave
  border:       "#E6E9EF",
  borderStrong: "#D3D8E2",

  // ── Texto ──────────────────────────────────────────────────
  ink:      "#171B26",
  inkMuted: "#6B7383",
  inkFaint: "#98A0B0",

  // ── Acción / marca ─────────────────────────────────────────
  primary:     "#4F62D8",
  primaryDark: "#3D4FC0",
  primarySoft: "#EEF0FC",

  // ── IA (el hilo de "Avanzar con IA") ───────────────────────
  ai:     "#6D4FE0",
  aiDark: "#5B3FD0",
  aiSoft: "#F1EDFD",

  // ── Semánticos (independientes del acento) ─────────────────
  success:     "#22C55E",
  successSoft: "#E6F8EE",
  warning:     "#D97706",
  warningSoft: "#FEF3C7",
  danger:      "#DC2626",
  dangerSoft:  "#FEE2E2",

  // ── Burbujas del chat ──────────────────────────────────────
  bubbleIn:  "#FFFFFF",  // cliente
  bubbleOut: "#E4F7EC",  // vendedor
  bubbleBot: "#FFFBEB",  // bot
};

// Radios. `btn` es el que aplica la regla global de index.html: hoy vale 10
// para replicar exactamente el aspecto actual. Cambiarlo acá cambia los 326
// border-radius inline de golpe.
export const RADIUS = {
  btn:  10,
  sm:   6,
  md:   10,
  lg:   14,
  xl:   18,
  pill: 999,
};

export const SHADOW = {
  sm:  "0 1px 4px rgba(16,24,40,.06)",
  md:  "0 2px 10px rgba(16,24,40,.08)",
  lg:  "0 8px 30px rgba(16,24,40,.12)",
  ai:  "0 8px 22px rgba(109,79,224,.32)",
};

export const GRAD = {
  ai:  "linear-gradient(120deg, #4F62D8 0%, #6D4FE0 100%)",
  btn: "linear-gradient(120deg, #4F62D8 0%, #6D4FE0 100%)",
};

export const FONT = {
  display: "'Manrope', system-ui, sans-serif",
  body:    "'Inter', system-ui, sans-serif",
};

// Breakpoints. Hoy el CRM solo conoce 768 (useIsMobile). `tablet` todavía no
// tiene consumidores: entra en la Fase 7 junto con la capa de tablet.
export const BP = {
  mobile: 768,
  tablet: 1180,
};
