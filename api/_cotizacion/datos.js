// Contenido del Purchase Agreement de NINI T-GROUP.
//
// Portado del plugin de WordPress "NINIT Quotations" v3.3.0 (includes/models.php)
// para poder emitir cotizaciones sin depender del sitio. El texto es el mismo
// palabra por palabra: si hay que corregir algo del acuerdo, se corrige acá.

const IMG = "/cotizacion/img/";

export const empresa = {
  name: "NINI T-GROUP LLC",
  ein: "39-3860417",
  phone: "+1 (786) 385-9402",
  email: "sales@ninitgroup.com",
  address: "Miami, Florida, USA",
  country: "United States",
  website: "www.ninitgroup.com",
  rep: "Nicolas Hercun",
};

export const logo = IMG + "logo.png";
export const firmaRep = IMG + "nicolas-signature.png";

export const modelos = {
  "3-stall": {
    name: "NTG 3-Station Luxury Portable Restroom Trailer",
    short: "3-Station Luxury",
    slug: "ntg-3stall",
    config_note: "Maximum Premium Upgrade. Triple axle configuration.",

    quote: {
      quote_number: "NTG 3-STALL",
      valid_days: 15,
      delivery_time: "45-60 calendar days",
      unit_price: 26700.0,
      quantity: 1,
      shipping_cost: 0.0,
      down_payment: 13350.0,
      rep_name: "Nicolas Hercun",
    },

    // Fotos reales y actualizadas de la unidad: son las mismas que el vendedor
    // le manda al cliente por chat con el botón "Fotos" (FOTOS_MODELOS en
    // src/App.jsx, hospedadas en ninitgroup.com/wp-content/uploads). Se guardan
    // acá en public/ en vez de linkear a ninitgroup.com porque el PDF firmado
    // las lee del disco (api/_cotizacion/pdf.js) y el WordPress hoy da 500.
    // Al cambiar las fotos del chat, volver a bajarlas a estos archivos.
    hero: IMG + "3-stall/crm-exterior.jpg",
    floorplan: IMG + "3-stall/crm-floorplan.jpg",
    interior: [
      IMG + "3-stall/crm-interior-1.jpg",
      IMG + "3-stall/crm-interior-2.jpg",
      IMG + "3-stall/crm-interior-3.jpg",
      IMG + "3-stall/crm-interior-4.jpg",
    ],

    specs: [
      "Body size: 12.5 x 7.5 x 8.5 ft.",
      "Total weight capacity: 7,700 lbs.",
      "Tanks: 300 gal (Fresh Water) / 550 gal (Waste Water).",
      "Chassis: Triple axle configuration / High-strength hot-dip galvanized.",
      "Premium appliances: automatic soap dispensers, paper towel dispensers, and high-speed electric hand dryers in every stall.",
      "Stealth design: 100% concealed plumbing and wiring inside the walls.",
    ],

    features: [
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
    ],
  },
};

export const terminos = [
  "Pickup Location: Unit also available for pickup at our Doral, Miami facility, if preferred. Delivery is complimentary either way — at no additional cost to the Buyer.",
  "Warranty: 12-Month Manufacturer Warranty.",
  "Customizations: Custom colors for interior and exterior from our premium palettes (e.g., Quartz Grey, Onyx Black, Deep Burgundy) are included at no additional cost.",
  "Taxes: The quoted price does not include sales tax or registration fees. The customer is responsible for all applicable taxes based on the state of registration.",
  'Condition: Fully "Plug and Play", on wheels, ready to roll and connect immediately.',
];

export const personalizacion = [
  "Exterior Color: Fully customizable body color. Choose from our premium exterior palette (Pure White, Quartz Grey, Champagne Gold, Deep Burgundy, and more) to match your branding or event style.",
  "Interior Finishes: Customize the interior by selecting your preferred combination of wooden cabinet finishes, marble countertop styles, and waterproof vinyl flooring.",
];

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
  ],
  warranty:
    "12-Month Manufacturer Warranty covering structural components, plumbing, and electrical systems under normal use. Excludes damage from misuse, neglect, or unauthorized modification.",
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
