import { useId } from "react";

export default function LogoNinit({ height = 48, color = "#1a3a6b", style = {} }) {
  const viewW = 300;
  const viewH = 88;
  const w = Math.round((height / viewH) * viewW);

  // id único por instancia (evita colisiones si hay más de un logo en pantalla)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const shineId = `shine-${uid}`;
  const sweepId = `sweep-${uid}`;

  // Formas del contorno del tráiler (se dibujan 2 veces: base + destello encima)
  const contorno = (stroke, extra = {}) => (
    <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" {...extra}>
      <circle cx="22" cy="74" r="8" />
      <circle cx="72" cy="74" r="8" />
      <rect x="5" y="18" width="88" height="48" rx="7" />
      <path d="M 24 18 Q 24 7 36 7 Q 48 7 48 18" />
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
        {/* Banda de luz angosta que barre el contorno (el "sol" que refleja) */}
        <linearGradient id={shineId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="46" y2="0">
          <stop offset="0"   stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#8fd3ff" stopOpacity="1" />
          <stop offset="1"   stopColor="#ffffff" stopOpacity="0" />
          {/* Barre de izquierda a derecha ~1.4s y espera ~3.6s → ciclo de 5s */}
          <animateTransform
            id={sweepId}
            attributeName="gradientTransform"
            type="translate"
            from="-60 0"
            to="160 0"
            dur="1.4s"
            begin={`0s; ${sweepId}.end+3.6s`}
            repeatCount="1"
            fill="freeze"
          />
        </linearGradient>
      </defs>

      {/* Línea de suelo */}
      <line x1="4" y1="82" x2="96" y2="82" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />

      {/* Contorno base */}
      {contorno(color)}

      {/* Separador lateral */}
      <line x1="80" y1="22" x2="80" y2="62" stroke={color} strokeWidth="1.5" opacity="0.45" />

      {/* Destello: mismo contorno pintado con la banda de luz, en modo "screen"
          para que sume brillo sobre el trazo base sin taparlo */}
      {contorno(`url(#${shineId})`, {
        strokeWidth: "2.6",
        style: { mixBlendMode: "screen" },
      })}

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
