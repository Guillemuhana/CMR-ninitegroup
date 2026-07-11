import { useId } from "react";

export default function LogoNinit({ height = 48, color = "#1a3a6b", style = {} }) {
  const viewW = 300;
  const viewH = 88;
  const w = Math.round((height / viewH) * viewW);

  // id único por instancia (evita colisiones si hay más de un logo en pantalla)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const glowId = `glow-${uid}`;

  // Un "destello" que recorre una forma: segmento corto y brillante que viaja
  // por el trazo (stroke-dash) y aparece/desaparece en un ciclo de 5s.
  const Destello = ({ children, begin = "0s" }) => (
    <g
      fill="none"
      stroke="#eaf7ff"
      strokeWidth="3"
      strokeLinecap="round"
      filter={`url(#${glowId})`}
    >
      {children}
      {/* El segmento (10% del contorno) viaja por todo el trazo */}
      <animate
        attributeName="stroke-dashoffset"
        dur="5s"
        begin={begin}
        repeatCount="indefinite"
        values="100; 0; 0"
        keyTimes="0; 0.32; 1"
        calcMode="spline"
        keySplines="0.45 0 0.2 1; 0 0 1 1"
      />
      {/* Solo se ve mientras viaja; el resto del ciclo, invisible */}
      <animate
        attributeName="opacity"
        dur="5s"
        begin={begin}
        repeatCount="indefinite"
        values="0; 1; 1; 0; 0"
        keyTimes="0; 0.04; 0.28; 0.4; 1"
      />
    </g>
  );

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={w}
      height={height}
      viewBox={`0 0 ${viewW} ${viewH}`}
      style={style}
    >
      <defs>
        {/* Resplandor suave para que el destello parezca luz (reflejo del sol) */}
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Línea de suelo */}
      <line x1="4" y1="82" x2="96" y2="82" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />

      {/* ── Contorno base del tráiler ── */}
      <g fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round">
        <circle cx="22" cy="74" r="8" />
        <circle cx="72" cy="74" r="8" />
        <rect x="5" y="18" width="88" height="48" rx="7" />
        <path d="M 24 18 Q 24 7 36 7 Q 48 7 48 18" />
      </g>

      {/* Separador lateral */}
      <line x1="80" y1="22" x2="80" y2="62" stroke={color} strokeWidth="1.5" opacity="0.45" />

      {/* ── Destello que recorre el marco principal ── */}
      <Destello>
        <rect x="5" y="18" width="88" height="48" rx="7" pathLength="100" strokeDasharray="10 90" strokeDashoffset="100" />
      </Destello>

      {/* Segundo destello, un toque desfasado, sobre la cúpula (más vida) */}
      <Destello begin="0.35s">
        <path d="M 24 18 Q 24 7 36 7 Q 48 7 48 18" pathLength="100" strokeDasharray="14 86" strokeDashoffset="100" />
      </Destello>

      {/* Texto principal */}
      <text
        x="106" y="50"
        fontFamily="'Manrope', 'Segoe UI', 'Helvetica Neue', sans-serif"
        fontWeight="800" fontSize="30" fill={color} letterSpacing="-0.3"
      >
        NinitGroup
      </text>

      {/* Subtexto */}
      <text
        x="108" y="68"
        fontFamily="'Inter', 'Segoe UI', 'Helvetica Neue', sans-serif"
        fontWeight="500" fontSize="13" fill={color} opacity="0.7" letterSpacing="0.8"
      >
        Sistema de CMR
      </text>
    </svg>
  );
}
