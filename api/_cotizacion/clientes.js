// Cotizaciones emitidas: una entrada por cliente.
//
// Es el equivalente al CLIENT MODE del plugin de WordPress (includes/client.php),
// pero admitiendo varias a la vez en lugar de una sola. Lo usan dos cosas:
//   - scripts/generar-cotizacion.mjs, para escribir la página del cliente.
//   - api/cotizacion-firmar.js, para saber qué se firmó y con qué precio
//     (el precio NUNCA se toma de lo que manda el navegador).
//
// Para emitir una cotización nueva: agregar una entrada acá y correr
//   node scripts/generar-cotizacion.mjs <slug>

// Cotización ABIERTA: la misma propuesta pero sin nombre ni datos de nadie.
// Es la que se manda "a cualquiera" — el que la recibe elige el modelo (2, 3,
// 4, 5, 6 stalls o ADA+2), completa sus datos, elige cantidad, color,
// terminación y forma de entrega, firma y envía. El
// acuerdo firmado llega a ninitgroup@gmail.com (NUNCA se le manda copia al
// cliente, igual que en las cotizaciones nominadas).
//
// El precio no se negocia acá: sale del precio de lista del modelo en
// datos.js. Del navegador solo se aceptan datos de contacto y opciones, y
// todas se validan contra las listas de opcionesCliente.
export const SLUG_ABIERTA = "ntg-quote";

export const cotizacionAbierta = {
  slug: SLUG_ABIERTA,
  abierta: true,
  token: "", // link público: no hace falta que sea inadivinable, no lleva datos de nadie
  modelo: "3-stall", // el que viene marcado al abrir; el cliente puede cambiarlo
  // La fecha del acuerdo es el día en que el cliente firma: la pone el
  // servidor al recibir la firma, y la página la muestra con la del navegador.
  fecha: null,

  nombre: "",
  email: "",
  telefono: "",
  ubicacion: "",
  empresa: "",

  config_note: "",

  // Sin precio propio: manda el precio de lista de datos.js. La cantidad y el
  // anticipo (50%) se calculan con lo que el cliente elige.
  precio: {},
};

export const cotizaciones = [
  {
    slug: "jose-gamez",
    // La página se publica como <slug>-<token>.html. El token hace que el link
    // no se pueda adivinar: el documento lleva datos y precio de un cliente
    // real, y cualquiera con la URL lo puede abrir.
    token: "7fq2m9",
    modelo: "3-stall",
    fecha: "2026-08-07", // fecha de emisión que se imprime en el acuerdo

    nombre: "José Gámez",
    email: "Joseg197644@gmail.com",
    telefono: "",
    ubicacion: "Miami, FL",
    empresa: "",

    config_note:
      "Unit quoted for delivery in Miami, FL. Delivery included at no additional cost.",

    // Precio cerrado para este cliente: pisa el precio de lista del modelo.
    precio: {
      quote_number: "NTG-3STALL-JG",
      unit_price: 25000.0,
      quantity: 1,
      shipping_cost: 0.0,
      discount: 2000.0,
      discount_note: "Special discount applied to this quotation.",
      // 50% del total ya con el descuento aplicado (23.000).
      down_payment: 11500.0,
      delivery_time: "55-65 calendar days",
    },
  },

  // Cotización interna de prueba. No es de ningún cliente: existe para poder
  // firmar y comprobar que el circuito de mail sigue funcionando sin escribirle
  // a nadie de verdad. Al firmarla, el aviso va a sales@ninitgroup.com igual que
  // una real. Si alguna vez llega a la casilla de abajo un mail dirigido AL
  // CLIENTE (asunto NTG-PRUEBA con formato de cotización, no el aviso interno),
  // es que se reintrodujo la copia al cliente, que está desactivada a propósito.
  // Ojo: esa misma casilla recibe a propósito los avisos de la cotización
  // abierta, así que ya no alcanza con ver "llegó algo a ninitgroup@gmail.com".
  {
    slug: "prueba-interna",
    token: "ntg9k4x2",
    modelo: "3-stall",
    fecha: "2026-08-07",
    nombre: "Prueba Interna NTG",
    email: "ninitgroup@gmail.com",
    telefono: "",
    ubicacion: "Miami, FL",
    empresa: "",
    config_note: "PRUEBA INTERNA — no es una cotización real.",
    precio: {
      quote_number: "NTG-PRUEBA",
      unit_price: 25000.0,
      quantity: 1,
      shipping_cost: 0.0,
      down_payment: 12500.0,
      delivery_time: "45-60 calendar days",
    },
  },
];

/** La abierta + todas las nominadas. */
export function todasLasCotizaciones() {
  return [cotizacionAbierta, ...cotizaciones];
}

export function buscarCotizacion(slug) {
  return todasLasCotizaciones().find((c) => c.slug === slug) || null;
}

/** Nombre del archivo publicado, sin extensión. */
export function archivoDe(cliente) {
  return cliente.token ? `${cliente.slug}-${cliente.token}` : cliente.slug;
}
