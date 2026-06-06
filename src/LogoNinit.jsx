export default function LogoNinit({ height = 48, color = "#1a3a6b", style = {} }) {
  const viewW = 300;
  const viewH = 88;
  const w = Math.round((height / viewH) * viewW);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={w}
      height={height}
      viewBox={`0 0 ${viewW} ${viewH}`}
      style={style}
    >
      {/* Línea de suelo */}
      <line x1="4" y1="82" x2="96" y2="82" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />

      {/* Rueda izquierda */}
      <circle cx="22" cy="74" r="8" fill="none" stroke={color} strokeWidth="2.2" />
      {/* Rueda derecha */}
      <circle cx="72" cy="74" r="8" fill="none" stroke={color} strokeWidth="2.2" />

      {/* Cuerpo principal */}
      <rect x="5" y="18" width="88" height="48" rx="7" fill="none" stroke={color} strokeWidth="2.2" />

      {/* Cúpula superior */}
      <path d="M 24 18 Q 24 7 36 7 Q 48 7 48 18" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />

      {/* Separador lateral */}
      <line x1="80" y1="22" x2="80" y2="62" stroke={color} strokeWidth="1.5" opacity="0.45" />

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
