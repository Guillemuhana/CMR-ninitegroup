// Utilidades mínimas para el asistente NINI BOT
// - carga el prompt maestro desde /nini_master_prompt.md
// - detección de idioma básica
// - estimación aproximada de envío basada en rango de ZIP

export async function getMasterPrompt() {
  try {
    const r = await fetch('/nini_master_prompt.md');
    if (!r.ok) return null;
    return await r.text();
  } catch (e) {
    console.error('No se pudo cargar el prompt maestro', e);
    return null;
  }
}

export function detectLanguage(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim().toLowerCase();
  // Indicadores simples
  const spanish = /\b(hola|buenas|gracias|cuánto|precio|cuanto|estoy|necesito|humano|humano)\b/;
  const english = /\b(hi|hello|thanks|how much|price|i need|human)\b/;
  if (spanish.test(t)) return 'es';
  if (english.test(t)) return 'en';
  return null; // sin detección clara
}

export function estimateDeliveryByZip(zip) {
  // zip: string or number (US 5-digit). Esto es solo una heurística aproximada.
  const z = String(zip || '').trim();
  if (!/^\d{5}$/.test(z)) return { hub: 'Unknown', miles: null, cost: null, note: 'ZIP inválido' };
  const first = Number(z[0]);
  let hub = 'Miami';
  let miles = 800; // valor por defecto
  if (first <= 3) {
    hub = 'Miami';
    miles = 600; // promedio aproximado para zona este/sureste
  } else if (first <= 6) {
    hub = 'Texas';
    miles = 1000; // promedio aproximado para zona centro
  } else {
    hub = 'Long Beach';
    miles = 1500; // promedio aproximado para zona oeste
  }
  const cost = Math.round(miles * 3.5);
  return {
    hub,
    estimatedMiles: miles,
    estimatedCostUSD: cost,
    note: 'Estimación aproximada. Use esta cifra como referencia; el costo final depende de routing y programación.'
  };
}

export function formatEstimateForCustomer(zip) {
  const e = estimateDeliveryByZip(zip);
  if (!e.estimatedMiles) return 'No puedo estimar entrega con el ZIP proporcionado.';
  return `Delivery to ZIP code ${zip} would typically be handled from our ${e.hub} logistics hub. Estimated final delivery would be approximately $${e.estimatedCostUSD} depending on routing and scheduling.`;
}
