// Contenido del Purchase Agreement de NINI T-GROUP.
//
// Portado del plugin de WordPress "NINIT Quotations" v3.3.0 (includes/models.php)
// para poder emitir cotizaciones sin depender del sitio. El texto es el mismo
// palabra por palabra: si hay que corregir algo del acuerdo, se corrige acá.

const IMG = "/cotizacion/img/";

export const empresa = {
  name: "NINI T-GROUP LLC",
  ein: "39-3860417",
  phone: "+1 (800) 495-5693",
  email: "sales@ninitgroup.com",
  address: "Miami, Florida, USA",
  country: "United States",
  website: "www.ninitgroup.com",
  rep: "Nicolas Hercun",
};

export const logo = IMG + "logo.png";
export const firmaRep = IMG + "nicolas-signature.png";

/**
 * Equipamiento que traen TODAS las unidades. Son fotos de los componentes
 * (bacha, inodoro, chasis, luces…), no de un modelo en particular, así que la
 * galería es la misma en cualquier cotización.
 */
const EQUIPAMIENTO = [
      { img: IMG + "3-stall/feat-sinks.jpg", title: "Sinks", desc: "Commercial ceramic sink with waterproof wooden cabinet and marble countertop." },
      { img: IMG + "3-stall/feat-toilet.jpg", title: "Flush Toilet", desc: "Commercial-grade ceramic flush toilet — highly durable and professional." },
      { img: IMG + "3-stall/feat-urinal.jpg", title: "Pressure Urinal", desc: "Commercial-grade ceramic or professional plastic urinal, highly durable (as per drawing)." },
      { img: IMG + "3-stall/feat-mirror.jpg", title: "Vanity", desc: "Large reinforced glass mirror with LED lighting for safety and visibility. High-quality waterproof wooden cabinet with marble." },
      { img: IMG + "3-stall/feat-lighting.jpg", title: "LED Lighting", desc: "LED ceiling lights, sockets, circuit breaker (standard 110V 60Hz USA). High-power 12V extractor fans." },
      { img: IMG + "3-stall/feat-chassis.jpg", title: "Durable Chassis", desc: "Hot-dip galvanized square tubes with high-strength welding — very solid construction." },
      { img: IMG + "3-stall/feat-wheels.jpg", title: "Wheel Size", desc: "15-inch heavy-duty professional trailer wheels." },
      { img: IMG + "3-stall/feat-jacks.jpg", title: "Support Jacks", desc: "Upgraded, 4 pieces per trailer." },
      { img: IMG + "3-stall/feat-extlighting.jpg", title: "Exterior Lighting", desc: "Full exterior LED safety lights (rear, side, and clearance) per US DOT regulations." },
      { img: IMG + "3-stall/feat-towbar.jpg", title: "Tow Bar & Jockey Wheel", desc: "Hot-dip galvanized." },
      { img: IMG + "3-stall/feat-steps.jpg", title: "Foldable Steps", desc: "Durable and high-quality foldable steps." },
      { img: IMG + "3-stall/feat-handrails.jpg", title: "Handrails", desc: "Aluminum handrails." },
      { img: IMG + "3-stall/feat-waterinlet.jpg", title: "Fresh Water Inlet", desc: "High-quality stainless steel type. Each trailer has 1 unit." },
      { img: IMG + "3-stall/feat-wateroutlet.jpg", title: "Waste Water Outlet", desc: "High-quality stainless steel type, 3 inch size." },
      { img: IMG + "3-stall/feat-gauge.jpg", title: "Water Gauge", desc: "Waste water tank level with full warning." },
      { img: IMG + "3-stall/feat-pump.jpg", title: "Water Pump & Pressurizer", desc: "Powerful heavy-duty high-flow water pump (1 unit). High-pressure water pressurizer with 50L capacity (1 unit)." },
      { img: IMG + "3-stall/feat-acheating.jpg", title: "A/C & Heating", desc: "High-flow heavy-duty water pump for reliable continuous operation. High-capacity A/C and heating system for climate control." },
      { img: IMG + "3-stall/feat-electrical.jpg", title: "Electrical System", desc: "Durable and safe wiring, standard country power socket, circuit breaker, LED ceiling light, 110V power inlet." },
];

/**
 * Lo que sí está confirmado de los modelos de los que no tenemos ficha técnica
 * con medidas. Sale del catálogo oficial del CRM (STANDARD FEATURES del prompt
 * de NINI BOT): nada de acá es inventado. Cuando llegue la ficha real de un
 * modelo, se le pone su propio `specs` y listo.
 */
const EQUIPO_ESTANDAR = [
  "High-capacity A/C and heating system.",
  "LED interior lighting and full exterior DOT safety lighting.",
  "Commercial-grade ceramic flush toilet in every stall.",
  "Sinks with waterproof cabinet, countertop and mirror in every stall.",
  "Fresh water and waste water tanks, with waste level gauge.",
  "Heavy-duty water pump and pressurizer.",
  "Electric brake system, foldable steps, stabilizer jacks and handrails.",
  'Fully "Plug and Play": on wheels, ready to roll and connect immediately.',
];

/** Precio y condiciones comunes a todos los modelos. */
const CONDICIONES = {
  valid_days: 15,
  delivery_time: "45-60 calendar days",
  quantity: 1,
  shipping_cost: 0.0,
  rep_name: "Nicolas Hercun",
};

export const modelos = {
  "2-stall": {
    name: "NTG 2-Station Luxury Portable Restroom Trailer",
    short: "2-Station Luxury",
    etiqueta: "2-Stall",
    nota: "Compact — weddings and private events",
    slug: "ntg-2stall",
    banos: 2,
    config_note: "Single axle configuration.",

    quote: { ...CONDICIONES, quote_number: "NTG 2-STALL", unit_price: 21500.0 },

    // Miniatura liviana para el selector (la foto grande pesa de más en el
    // celular). Se generan con: npx sharp-cli -i <foto> -o thumbs/<modelo>.jpg resize 420
    thumb: IMG + "thumbs/2-stall.jpg",
    hero: IMG + "2-stall/hero.jpg",
    floorplan: IMG + "2-stall/floorplan.jpg",
    interior: [
      IMG + "2-stall/int-1.jpg",
      IMG + "2-stall/int-2.jpg",
      IMG + "2-stall/int-3.jpg",
      IMG + "2-stall/int-4.jpg",
    ],

    specs: [
      "Two (2) private stalls: one (1) Ladies (toilet + sink) and one (1) Gentlemen (toilet + urinal + sink).",
      "Body size: 9.5 x 7.5 x 8.5 ft (14.5 ft total length including tow bar).",
      "Chassis: Single axle / High-strength hot-dip galvanized.",
      "Tanks: 200 gal (Fresh Water) / 400 gal (Waste Water).",
      ...EQUIPO_ESTANDAR,
    ],
    features: EQUIPAMIENTO,
  },

  "3-stall": {
    name: "NTG 3-Station Luxury Portable Restroom Trailer",
    short: "3-Station Luxury",
    etiqueta: "3-Stall",
    nota: "Most popular — best balance",
    slug: "ntg-3stall",
    banos: 3,
    config_note: "Maximum Premium Upgrade. Single axle configuration.",

    quote: {
      ...CONDICIONES,
      quote_number: "NTG 3-STALL",
      unit_price: 25500.0,
    },

    // Fotos reales y actualizadas de la unidad: son las mismas que el vendedor
    // le manda al cliente por chat con el botón "Fotos" (FOTOS_MODELOS en
    // src/App.jsx, hospedadas en ninitgroup.com/wp-content/uploads). Se guardan
    // acá en public/ en vez de linkear a ninitgroup.com porque el PDF firmado
    // las lee del disco (api/_cotizacion/pdf.js) y el WordPress hoy da 500.
    // Al cambiar las fotos del chat, volver a bajarlas a estos archivos.
    // Miniatura liviana para el selector (la foto grande pesa de más en el
    // celular). Se generan con: npx sharp-cli -i <foto> -o thumbs/<modelo>.jpg resize 420
    thumb: IMG + "thumbs/3-stall.jpg",
    hero: IMG + "3-stall/crm-exterior.jpg",
    floorplan: IMG + "3-stall/crm-floorplan.jpg",
    interior: [
      IMG + "3-stall/crm-interior-1.jpg",
      IMG + "3-stall/crm-interior-2.jpg",
      IMG + "3-stall/crm-interior-3.jpg",
      IMG + "3-stall/crm-interior-4.jpg",
    ],

    specs: [
      "Three (3) private stalls.",
      "Body size: 12 x 7 x 8.5 ft (17 ft total length including tow bar).",
      "Total weight capacity: 7,700 lbs.",
      "Tanks: 200 gal (Fresh Water) / 400 gal (Waste Water).",
      "Chassis: Single axle / High-strength hot-dip galvanized.",
      "Premium appliances: automatic soap dispensers, paper towel dispensers, and high-speed electric hand dryers in every stall.",
      "Stealth design: 100% concealed plumbing and wiring inside the walls.",
    ],

    features: EQUIPAMIENTO,
  },

  "4-stall": {
    name: "NTG 4-Station Luxury Portable Restroom Trailer",
    short: "4-Station Luxury",
    etiqueta: "4-Stall",
    nota: "Festivals and high traffic",
    slug: "ntg-4stall",
    banos: 4,
    config_note: "Dual (tandem) axle configuration.",

    quote: { ...CONDICIONES, quote_number: "NTG 4-STALL", unit_price: 31500.0 },

    // Miniatura liviana para el selector (la foto grande pesa de más en el
    // celular). Se generan con: npx sharp-cli -i <foto> -o thumbs/<modelo>.jpg resize 420
    thumb: IMG + "thumbs/4-stall.jpg",
    hero: IMG + "4-stall/hero.jpg",
    floorplan: IMG + "4-stall/floorplan.jpg",
    // int-5, int-6 y las dos planchas de equipamiento son fotos que pasó Nico
    // el 22-ago-2026: son de la unidad real, no del catálogo viejo.
    interior: [
      IMG + "4-stall/int-1.jpg",
      IMG + "4-stall/int-2.jpg",
      IMG + "4-stall/int-3.jpg",
      IMG + "4-stall/int-4.jpg",
      IMG + "4-stall/int-5.jpg",
      IMG + "4-stall/int-6.jpg",
      IMG + "4-stall/equipo-1.jpg",
      IMG + "4-stall/equipo-2.jpg",
      IMG + "4-stall/equipo-ac.jpg", // equipo de A/C y calefacción
      IMG + "4-stall/equipo-tanque.jpg", // tanque de agua en la sala de máquinas
      IMG + "4-stall/equipo-electrico.jpg", // tablero eléctrico y bomba de agua
    ],

    specs: [
      "Four (4) private stalls: two (2) Ladies (toilet + sink) and two (2) Gentlemen (toilet + urinal + sink).",
      "Body size: 18 x 7 x 8.5 ft (23 ft total length including tow bar).",
      "Chassis: Dual (tandem) axle / High-strength hot-dip galvanized.",
      "Tanks: 200 gal (Fresh Water) / 400 gal (Waste Water).",
      ...EQUIPO_ESTANDAR,
    ],
    features: EQUIPAMIENTO,
  },

  // 5-stall y 6-stall: precio cerrado por Nico el 23-ago-2026. Antes iban "a
  // pedido" (sin unit_price, sin firma posible); ahora se firman como el resto
  // y el 50% de anticipo lo calcula calcular() solo.
  "5-stall": {
    name: "NTG 5-Station Luxury Portable Restroom Trailer",
    short: "5-Station Luxury",
    etiqueta: "5-Stall",
    nota: "Large events — extra capacity",
    slug: "ntg-5stall",
    banos: 5,
    config_note: "",

    quote: { ...CONDICIONES, quote_number: "NTG 5-STALL", unit_price: 41500.0 },

    // Foto real de la unidad, que pasó Nico el 23-ago-2026: hasta entonces el
    // 5-stall era el único modelo sin exterior propio y en el selector salía
    // como un recuadro gris. Sigue sin plano y comparte los interiores con el
    // 6-stall, que es la unidad hermana.
    // Miniatura liviana para el selector (la foto grande pesa de más en el
    // celular). Se generan con: npx sharp-cli -i <foto> -o thumbs/<modelo>.jpg resize 420
    thumb: IMG + "thumbs/5-stall.jpg",
    hero: IMG + "5-stall/hero.jpg",
    floorplan: "",
    interior: [IMG + "6-stall/int-1.jpg", IMG + "6-stall/int-2.jpg"],

    specs: ["Five (5) private stalls.", ...EQUIPO_ESTANDAR],
    features: EQUIPAMIENTO,
  },

  "6-stall": {
    name: "NTG 6-Station Luxury Portable Restroom Trailer",
    short: "6-Station Luxury",
    etiqueta: "6-Stall",
    nota: "Maximum capacity — largest unit",
    slug: "ntg-6stall",
    banos: 6,
    config_note: "",

    quote: { ...CONDICIONES, quote_number: "NTG 6-STALL", unit_price: 46500.0 },

    // Miniatura liviana para el selector (la foto grande pesa de más en el
    // celular). Se generan con: npx sharp-cli -i <foto> -o thumbs/<modelo>.jpg resize 420
    thumb: IMG + "thumbs/6-stall.jpg",
    hero: IMG + "6-stall/hero.png",
    floorplan: "",
    interior: [IMG + "6-stall/int-1.jpg", IMG + "6-stall/int-2.jpg"],

    specs: ["Six (6) private stalls.", ...EQUIPO_ESTANDAR],
    features: EQUIPAMIENTO,
  },

  "ada-2": {
    name: "NTG ADA+2 Accessible Portable Restroom Trailer",
    short: "ADA+2 Accessible",
    etiqueta: "ADA+2",
    nota: "Federal ADA compliance",
    slug: "ntg-ada2",
    banos: 3,
    config_note: "",

    quote: { ...CONDICIONES, quote_number: "NTG ADA-2", unit_price: 30500.0 },

    // Miniatura liviana para el selector (la foto grande pesa de más en el
    // celular). Se generan con: npx sharp-cli -i <foto> -o thumbs/<modelo>.jpg resize 420
    thumb: IMG + "thumbs/ada-2.jpg",
    hero: IMG + "ada-2/hero.png",
    floorplan: "",
    interior: [IMG + "ada-2/int-1.png"],

    specs: [
      "One (1) ADA accessible stall with ramp access, plus two (2) standard private stalls.",
      ...EQUIPO_ESTANDAR,
    ],
    features: EQUIPAMIENTO,
  },
};

/** Orden en que se le ofrecen los modelos al cliente. */
export const MODELOS_ORDEN = ["2-stall", "3-stall", "4-stall", "5-stall", "6-stall", "ada-2"];

/** Los modelos, en orden y con su clave, para armar el selector. */
export function modelosElegibles() {
  return MODELOS_ORDEN.filter((k) => modelos[k]).map((k) => ({ clave: k, ...modelos[k] }));
}

/** Un modelo sin precio cerrado no se firma: se pide cotización. */
export const esAPedido = (modelo) => !!modelo?.quote?.a_pedido;

export const terminos = [
  "Delivery & Pickup: Free pickup at the NINI T-GROUP Hub in Miami, FL or Long Beach, CA. Direct Turnkey Delivery to the Buyer's address is also available; ground freight is quoted separately based on destination.",
  "Warranty: 24-Month Manufacturer Warranty.",
  "Customizations: Custom colors for interior and exterior from our premium palettes (e.g., Quartz Grey, Onyx Black, Deep Burgundy) are included at no additional cost.",
  "Taxes: The quoted price does not include sales tax or registration fees. The customer is responsible for all applicable taxes based on the state of registration.",
  'Condition: Fully "Plug and Play", on wheels, ready to roll and connect immediately.',
];

/**
 * Los dos ejes que el cliente elige sin pagar de más. Antes eran dos parrafones
 * que repetían por escrito los colores que la página ya muestra en muestras;
 * ahora es el título y una línea corta al lado de cada paleta.
 */
export const personalizacion = [
  {
    titulo: "Exterior Color",
    texto: "Fully customizable body color, from our premium exterior palette.",
  },
  {
    titulo: "Interior Finishes",
    texto:
      "Your combination of cabinet finish, marble countertop and waterproof vinyl flooring.",
  },
];

/**
 * Color aproximado de cada opción de exterior, SOLO para pintar la muestra en
 * la página. El que manda es el nombre: es el que se valida al firmar
 * (opcionesCliente.exterior) y el que viaja en el acuerdo.
 */
export const coloresExterior = {
  "Pure White": "#f1f1ee",
  "Quartz Grey": "#8b9199",
  "Champagne Gold": "#c9ae82",
  "Deep Burgundy": "#5f1f2b",
  "Onyx Black": "#1d1f22",
};

/**
 * Opciones que el cliente elige por su cuenta en la cotización abierta
 * (la que se manda sin nombre para que la complete quien la recibe).
 *
 * El servidor valida contra estas mismas listas: si llega algo que no está acá,
 * la firma se rechaza. Por eso conviene tocar solo este bloque cuando cambien
 * los colores o las formas de entrega.
 */
export const opcionesCliente = {
  exterior: [
    "Pure White",
    "Quartz Grey",
    "Champagne Gold",
    "Deep Burgundy",
    "Onyx Black",
  ],
  entrega: [
    "Pickup at NINI T-GROUP Hub — Miami, FL (Free)",
    "Pickup at NINI T-GROUP Hub — Long Beach, CA (Free)",
    "Direct Turnkey Delivery to my address (Ground freight quoted separately)",
  ],
  // Máximo de unidades que se pueden pedir desde el formulario. Más que esto
  // es un pedido mayorista y lo cotiza el equipo a mano.
  cantidadMaxima: 5,
};

/** Terminaciones interiores como las ve el cliente en el desplegable. */
export function opcionesInterior() {
  return terminaciones.map((t) => `${t.name} (${t.finish})`);
}

export const terminaciones = [
  { img: IMG + "finishes/01-pure-white.jpg", name: "Pure White", finish: "Matte" },
  { img: IMG + "finishes/02-snow-mountain-stone.jpg", name: "Snow Mountain Stone", finish: "Matte" },
  { img: IMG + "finishes/03-florence-black-gold.jpg", name: "Florence Black Gold", finish: "Matte" },
  { img: IMG + "finishes/04-florence-white-gold.jpg", name: "Florence White Gold", finish: "Matte" },
  { img: IMG + "finishes/05-armani-gray.jpg", name: "Armani Gray", finish: "Matte" },
  { img: IMG + "finishes/06-pandora.jpg", name: "Pandora", finish: "Glossy" },
  { img: IMG + "finishes/07-italian-gray.jpg", name: "Italian Gray", finish: "Glossy" },
  { img: IMG + "finishes/08-fish-belly-white.jpg", name: "Fish Belly White", finish: "Glossy" },
  { img: IMG + "finishes/09-white-jade.jpg", name: "White Jade", finish: "Glossy" },
  { img: IMG + "finishes/10-pure-black.jpg", name: "Pure Black", finish: "Matte" },
];

export const contrato = {
  section_title: "Purchase Summary",
  scope_of_work:
    'NINI T-GROUP LLC ("the Company") agrees to coordinate the manufacturing of the unit through its associated manufacturing partners, and to deliver or make available for pickup, and hand over, one (1) portable restroom trailer unit built to the specifications, finishes, and price detailed in this proposal.',
  included: [
    "Manufacturing of the unit, through our associated manufacturing partners, per the specifications listed in this proposal",
    "All standard features and equipment listed in the Features & Equipment section",
    "Customization options selected by the client at no additional cost",
    "Standard factory warranty (see Warranty below)",
    "Delivery or pickup coordination as selected by the client",
  ],
  excluded: [
    "Sales tax, registration, or state-specific fees",
    "Site preparation, permits, or utility hookups at the delivery location",
    "Modifications requested after production has started",
    "Ground freight for Direct Turnkey Delivery, quoted separately based on destination",
  ],
  warranty:
    "24-Month Manufacturer Warranty covering structural components, plumbing, and electrical systems under normal use. Excludes damage from misuse, neglect, or unauthorized modification.",
  included_documentation: [
    "Manufacturer Certificate of Origin (MCO/MSO)",
    "Bill of Sale",
    "VIN Identification",
    "Registration Documentation",
  ],
  client_resp: [
    "Provide accurate delivery address and site access information",
    "Ensure the delivery site is accessible for the trailer and tow vehicle",
    "Make payments according to the agreed schedule below",
    "Review and approve final specifications before production begins",
  ],
  company_resp: [
    "Coordinate manufacturing of the unit, through our associated manufacturing partners, according to the agreed specifications",
    "Communicate proactively on production status and estimated delivery",
    "Deliver or make the unit available for pickup within the estimated timeframe",
    "Honor the factory warranty terms listed above",
  ],
  payment_schedule:
    "50% deposit due upon signing to secure the production slot.\n50% remaining balance due prior to delivery or pickup, once the unit is ready.",
  procedure:
    "1. Client electronically signs this Purchase Agreement.\n2. Deposit invoice is sent and payment is confirmed.\n3. Unit enters the production queue.\n4. Client receives periodic updates during manufacturing.\n5. Final balance is invoiced prior to delivery.\n6. Delivery or pickup is coordinated and completed.",
  terms: [
    "Custom Manufactured Product: The unit(s) described in this Agreement are custom-manufactured according to the specifications, configuration, and finishes selected by the Buyer. Because each unit is built to order, this Agreement is binding upon execution and the manufacturing process begins promptly after the deposit described above is received.",
    "Approved Specifications: The specifications, colors, materials, and floor plan included in this Agreement represent the final configuration approved by the Buyer. Renders and illustrations shown in this document are for reference purposes only; exterior colors and approved specifications are included, but logos, branding, graphics, or decals shown in such images are not included unless expressly stated in this Agreement. Any change requested after approval may affect price and delivery time and must be agreed to in writing by both parties.",
    "Minor Design Variations: Buyer acknowledges that due to the handcrafted and custom nature of manufacturing, minor variations in color shade, material grain, or finish compared to renders or samples may occur and do not constitute a defect or breach of this Agreement.",
    "Payment Instructions: All payments must be made strictly according to the official wire/payment instructions provided exclusively in the official Invoice issued by NINI T-GROUP LLC. NINI T-GROUP LLC will not accept payment instructions received through any other channel. Buyer is responsible for verifying payment instructions directly with NINI T-GROUP LLC before sending any funds.",
    "Registration Documents: NINI T-GROUP LLC will provide the Bill of Sale, the Manufacturer's Certificate of Origin (MCO/MSO), and VIN Identification necessary for registration of the unit(s). Buyer is responsible for registration, titling, licensing, permits, and any applicable taxes required in Buyer's state.",
    "Entire Agreement: This Agreement, together with the specifications and configuration detailed herein, constitutes the entire agreement between the parties regarding the subject matter herein and supersedes all prior discussions, proposals, or quotations. This Agreement may only be modified in writing signed by both parties. No verbal representation shall modify this Agreement.",
    "Electronic Signature: This Agreement may be signed electronically by the Buyer, and such electronic signature shall have the same legal validity and binding effect as a handwritten signature. Upon electronic signature, both parties will receive a signed copy of this Agreement by email.",
  ],
  acceptance_text:
    "I accept this Purchase Agreement and authorize NINI T-GROUP to begin the project.",
};

/** Totales de la cotización, igual que ninit_q_compute() del plugin. */
export function calcular(modelo, cliente) {
  const q = { ...modelo.quote, ...cliente.precio };

  // Modelo sin precio de lista: no hay total que mostrar ni acuerdo que firmar,
  // se cotiza a pedido. Hoy todos los del catálogo tienen precio; el mecanismo
  // queda para cuando entre un modelo nuevo antes de que le cierren el número.
  const aPedido = !!q.a_pedido && !(Number(q.unit_price) > 0);

  const cantidad = Math.max(1, parseInt(q.quantity, 10) || 1);
  const unitario = Number(q.unit_price) || 0;
  const envio = Number(q.shipping_cost) || 0;
  const subtotal = unitario * cantidad;
  // Descuento comercial cerrado con el cliente. Se guarda en positivo y se
  // muestra como una línea aparte, para que el cliente vea el beneficio en
  // lugar de un unitario más bajo sin explicación.
  const descuento = Math.max(0, Number(q.discount) || 0);
  const total = Math.max(0, subtotal + envio - descuento);
  const anticipo =
    q.down_payment !== undefined && q.down_payment !== ""
      ? Number(q.down_payment)
      : Math.round(total * 0.5 * 100) / 100;

  return {
    a_pedido: aPedido,
    quote_number: q.quote_number || "",
    quote_date: cliente.fecha,
    delivery_time: q.delivery_time || "45-60 calendar days",
    unit_price: unitario,
    quantity: cantidad,
    shipping_cost: envio,
    subtotal,
    discount: descuento,
    discount_note: q.discount_note || "",
    total,
    down_payment: anticipo,
    balance: Math.max(0, total - anticipo),
    down_pct: total > 0 ? Math.round((anticipo / total) * 100) : 0,
    rep_name: q.rep_name || empresa.rep,
  };
}

/** "US$25,000.00" — mismo formato que ninit_q_usd(). */
export function usd(n) {
  return (
    "US$" +
    Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** "August 7, 2026" — mismo formato que el 'F j, Y' del plugin. */
export function fechaLarga(ymd) {
  const [a, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
