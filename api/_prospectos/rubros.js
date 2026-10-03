// Rubros que el buscador de clientes potenciales sabe rastrear para NTG.
//
// Es la fuente única: el servidor lo usa para armar la búsqueda y el puntaje
// base, y la pantalla (src/prospectos/Prospectos.jsx) para los accesos
// rápidos. Archivo puro, sin dependencias, así lo importan los dos lados y
// `npm test`.
//
// POR QUÉ ESTOS RUBROS
// NTG vende el trailer como el activo de un negocio de renta (ver FICHA_BUSINESS
// en api/_ntg.js). Hay dos clases de comprador en la calle:
//  · el que ya vive de alquilar (baños portátiles, party rentals, séptico): se
//    suma una línea de ticket más alto a clientes que ya tiene → compra para
//    re-alquilar, es el que más puntúa;
//  · el que hoy PAGA el alquiler cada fin de semana (venues de bodas, hoteles
//    con eventos al aire libre, campings, fairgrounds, viñedos, golf): tener
//    la unidad propia le corta un gasto recurrente.
// Constructoras, catering y organizadores quedan más abajo: alquilan o
// derivan, compran menos.
//
// `osm` es cómo buscarlo en OpenStreetMap cuando no hay clave de Google:
// "clave=valor" busca por etiqueta del mapa, lo demás por nombre.
//
// `pitch` es la frase en inglés del mensaje de presentación cuando no hay IA.
//
// `base` es el puntaje de afinidad del rubro (0-100) antes de mirar el
// negocio puntual. `unidad` usa sólo capacidades publicadas en la ficha.

export const RUBROS = [
  {
    id: "banos",
    etiqueta: "Baños portátiles",
    query: "portable toilet rental",
    claves: ["portable toilet", "porta potty", "porta-potty", "portable restroom", "baño portatil", "banos portatiles", "sanitarios portatiles"],
    osm: ["portable toilet", "porta potty", "sanitation"],
    base: 92,
    perfil: "Operador que ya alquila",
    paquete: "Starter o Business Launch",
    unidad: "2-Stall o 3-Stall para sumar una línea premium",
    angulo: "Ya tiene los clientes y la logística: el trailer es la versión de ticket alto de lo que hoy alquila.",
    pitch: "You already serve the events that need restrooms: a restroom trailer is the higher-ticket version of what you rent today, for the same customers.",
  },
  {
    id: "party",
    etiqueta: "Alquiler para eventos",
    query: "party and event rental company",
    claves: ["event rental", "party rental", "tent rental", "alquiler para eventos", "alquiler de eventos", "carpas", "party"],
    osm: ["shop=party", "party rental", "event rental"],
    base: 85,
    perfil: "Operador que ya alquila",
    paquete: "Business Launch",
    unidad: "3-Stall (~150-250 personas)",
    angulo: "Ya le alquila carpas y mobiliario a los mismos eventos que necesitan baños de calidad.",
    pitch: "The weddings and events you rent tents and furniture to also need quality restrooms, and a restroom trailer lets you offer that under your own name.",
  },
  {
    id: "septico",
    etiqueta: "Séptico y sanitarios",
    query: "septic tank service",
    claves: ["septic", "sanitation", "pump out", "septico", "desagote"],
    osm: ["septic", "sanitation"],
    base: 74,
    perfil: "Operador que ya alquila",
    paquete: "Starter",
    unidad: "2-Stall",
    angulo: "Tiene camión y experiencia sanitaria: puede operar el trailer o ser partner de pump-out.",
    pitch: "With your trucks and sanitation know-how, a restroom trailer can become a new rental line, or a service partnership with trailer operators.",
  },
  {
    id: "bodas",
    etiqueta: "Venues de bodas",
    query: "wedding venue",
    claves: ["wedding", "boda", "bodas", "barn venue", "banquet", "salon de fiestas", "salones"],
    osm: ["amenity=events_venue", "wedding venue", "banquet"],
    base: 78,
    perfil: "Paga alquiler recurrente",
    paquete: "Starter (uso propio + alquiler)",
    unidad: "3-Stall o 4-Stall según el tamaño de las bodas",
    angulo: "Si alquila baños para cada boda al aire libre, la unidad propia corta ese gasto y mejora la experiencia del invitado.",
    pitch: "If you rent restrooms for outdoor ceremonies, owning a restroom trailer can replace that recurring cost and upgrade the guest experience.",
  },
  {
    id: "hoteles",
    etiqueta: "Hoteles y resorts",
    query: "resort hotel with event space",
    claves: ["hotel", "hoteles", "resort", "motel", "lodge", "hospedaje"],
    osm: ["tourism=hotel", "leisure=resort", "tourism=motel"],
    base: 60,
    perfil: "Paga alquiler recurrente",
    paquete: "Starter o Managed",
    unidad: "ADA+2 o 3-Stall para eventos en jardines, piscina o playa",
    angulo: "Eventos al aire libre, bodas en el jardín y remodelaciones: necesitan baños extra lejos del edificio.",
    pitch: "For garden weddings, poolside or beach events and renovations, a restroom trailer adds comfortable restrooms right where your guests are.",
  },
  {
    id: "campings",
    etiqueta: "Campings y RV parks",
    query: "RV park campground",
    claves: ["rv park", "campground", "camping", "campsite", "glamping", "casas rodantes"],
    osm: ["tourism=caravan_site", "tourism=camp_site"],
    base: 72,
    perfil: "Paga alquiler recurrente",
    paquete: "Starter",
    unidad: "2-Stall o 3-Stall como bloque sanitario extra",
    angulo: "En temporada alta el bloque sanitario queda corto; un trailer suma capacidad sin obra.",
    pitch: "In peak season a restroom trailer adds sanitary capacity for your guests without any construction.",
  },
  {
    id: "fairgrounds",
    etiqueta: "Fairgrounds y recintos",
    query: "fairgrounds event center",
    claves: ["fairground", "fair", "expo", "arena", "stadium", "amphitheater", "recinto", "estadio", "feria"],
    osm: ["amenity=exhibition_centre", "leisure=stadium", "fairgrounds"],
    base: 68,
    perfil: "Paga alquiler recurrente",
    paquete: "Managed",
    unidad: "4-Stall (~250-300 personas) o varias unidades",
    angulo: "Ferias, rodeos y conciertos con picos de público: hoy alquilan baños evento por evento.",
    pitch: "For fairs, rodeos and concerts with big crowds, owning restroom trailers can replace renting units event by event.",
  },
  {
    id: "vinedos",
    etiqueta: "Viñedos y granjas",
    query: "winery vineyard event venue",
    claves: ["winery", "vineyard", "farm venue", "ranch", "viñedo", "vinedo", "bodega", "granja", "rancho"],
    osm: ["craft=winery", "tourism=wine_cellar", "ranch"],
    base: 70,
    perfil: "Paga alquiler recurrente",
    paquete: "Starter",
    unidad: "3-Stall",
    angulo: "Degustaciones, bodas y festivales en el campo, lejos de cualquier baño fijo.",
    pitch: "For tastings, weddings and festivals on your property, a restroom trailer brings climate-controlled restrooms far from any building.",
  },
  {
    id: "golf",
    etiqueta: "Golf y country clubs",
    query: "golf course country club",
    claves: ["golf", "country club", "club de campo"],
    osm: ["leisure=golf_course"],
    base: 60,
    perfil: "Paga alquiler recurrente",
    paquete: "Starter",
    unidad: "2-Stall para torneos y hoyos alejados",
    angulo: "Torneos y eventos corporativos en la cancha, a distancia del clubhouse.",
    pitch: "For tournaments and corporate outings, a restroom trailer puts proper restrooms out on the course, away from the clubhouse.",
  },
  {
    id: "organizadores",
    etiqueta: "Organizadores y festivales",
    query: "event planner festival organizer",
    claves: ["event planner", "event management", "festival", "promoter", "organizador", "productora", "wedding planner"],
    osm: ["office=event_management", "events"],
    base: 58,
    perfil: "Deriva o alquila",
    paquete: "Business Launch",
    unidad: "3-Stall",
    angulo: "Contrata baños para cada cliente: puede comprar para dejar de tercerizar o ser un canal de referidos.",
    pitch: "Instead of subcontracting restrooms for every client, you could own a restroom trailer, or simply refer your clients to us.",
  },
  {
    id: "construccion",
    etiqueta: "Constructoras",
    query: "general contractor construction company",
    claves: ["construction", "contractor", "builder", "constructora", "construccion", "obra"],
    osm: ["office=construction_company", "craft=builder", "construction"],
    base: 55,
    perfil: "Paga alquiler recurrente",
    paquete: "Starter",
    unidad: "2-Stall para obras largas o para el personal de oficina de obra",
    angulo: "Obras de meses con personal fijo: la unidad propia se amortiza contra el alquiler mensual.",
    pitch: "On long projects, a restroom trailer for your crew or site office can pay for itself against monthly rentals.",
  },
  {
    id: "catering",
    etiqueta: "Catering",
    query: "catering company",
    claves: ["catering", "caterer"],
    osm: ["craft=caterer", "catering"],
    base: 50,
    perfil: "Deriva o alquila",
    paquete: "Starter",
    unidad: "2-Stall",
    angulo: "Ya vende el servicio completo del evento: sumar baños de calidad es una línea más para facturar.",
    pitch: "You already deliver the full event experience: quality restroom trailers could be one more line you offer your clients.",
  },
  {
    id: "talleres-mecanicos",
    etiqueta: "Talleres mecánicos",
    query: "taller mecánico",
    claves: ["taller mecanico", "talleres mecanicos", "mecanica automotriz", "auto repair", "car repair", "mechanic"],
    osm: ["shop=car_repair", "craft=car_repair"],
    base: 35,
    perfil: "Afinidad por validar",
    paquete: "Por validar",
    unidad: "Por validar",
    angulo: "Confirmar si el negocio organiza eventos o necesita baños móviles antes de evaluar una propuesta.",
    pitch: "Before discussing a restroom trailer, confirm whether your business organizes events or needs mobile restrooms.",
  },
];

const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** El rubro que corresponde a lo que escribieron, o null si no se reconoce. */
export function rubroDe(texto) {
  const t = sinTildes(texto).trim();
  if (!t) return null;
  const exacto = RUBROS.find((r) => r.id === t || sinTildes(r.etiqueta) === t || sinTildes(r.query) === t);
  if (exacto) return exacto;
  return RUBROS.find((r) => r.claves.some((c) => t.includes(sinTildes(c)))) || null;
}
