// Cálculo de todas las métricas del día para el reporte del CEO.
//
// Lee de Supabase con service role (sin RLS) y devuelve un objeto plano que
// consumen tanto el generador de PDF como el resumen de IA. No formatea nada:
// solo números, listas y rankings.

import { rangoDia, sumarDias, horaLocal, TZ } from "./dia.js";

const ESTADOS_CERRADOS = ["vendido", "pedido", "cerrado"];
const NO_VENDEDOR = new Set(["", "bot", "sistema", "system", "ia", "nini"]);
const TOPE_RESPUESTA_MIN = 480; // 8 h: más que eso no es "tiempo de respuesta", es otro día

const num = (v) => Number(v) || 0;

function mediana(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function promedio(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function esVendedor(nombre) {
  return !!nombre && !NO_VENDEDOR.has(String(nombre).trim().toLowerCase());
}

// PostgREST devuelve como máximo 1.000 filas por request. Un día movido supera
// ese tope fácil (8 días de mensajes), así que todo lo que puede crecer se pide
// por páginas. `hacerQuery` tiene que devolver una query NUEVA en cada llamada.
async function traerPaginado(hacerQuery, tam = 1000, tope = 100000) {
  const filas = [];
  for (let desde = 0; desde < tope; desde += tam) {
    const { data, error } = await hacerQuery().range(desde, desde + tam - 1);
    if (error) return { data: null, error };
    filas.push(...(data || []));
    if (!data || data.length < tam) break;
  }
  return { data: filas, error: null };
}

// Columnas de `contactos` que el reporte usa. Las opcionales vienen de
// migraciones posteriores que no están aplicadas en todos los entornos, así que
// si Postgres rechaza alguna se reintenta con el set base.
const CONTACTOS_BASE = "id,nombre,telefono,vendedor,estado,created_at,updated_at,bot_activo,seguimiento_at,ultimo_in_at,ultimo_out_at";
const CONTACTOS_EXTRA = "empresa,nota_seguimiento,revisado_at";

async function traerContactos(db) {
  const pedir = (cols) => traerPaginado(() => db.from("contactos").select(cols).order("id"));
  const completo = await pedir(`${CONTACTOS_BASE},${CONTACTOS_EXTRA}`);
  if (!completo.error) return completo;
  if (!/column .* does not exist/i.test(completo.error.message || "")) return completo;
  return pedir(CONTACTOS_BASE);
}

/**
 * @param {object} db  cliente de Supabase con service role
 * @param {string} fecha  "YYYY-MM-DD" en la zona de la operación
 */
export async function calcularMetricas(db, fecha, tz = TZ) {
  const { inicio, fin, desde } = rangoDia(fecha, tz, 7);
  const isoInicio = inicio.toISOString();
  const isoFin = fin.toISOString();
  const isoDesde = desde.toISOString();

  const [msgsRes, textosRes, contRes, pedRes, vendRes, sesRes] = await Promise.all([
    // Ventana de 8 días (el día del reporte + 7 previos para las comparativas),
    // sin el texto de los mensajes: para las métricas solo hacen falta los metadatos.
    traerPaginado(() => db.from("mensajes")
      .select("id,contacto_id,direccion,origen,agente,created_at")
      .gte("created_at", isoDesde).lt("created_at", isoFin)
      .order("created_at", { ascending: true }).order("id")),
    // El texto solo del día del reporte, que es lo único que se muestra.
    traerPaginado(() => db.from("mensajes")
      .select("id,contenido")
      .gte("created_at", isoInicio).lt("created_at", isoFin)
      .order("id")),
    traerContactos(db),
    traerPaginado(() => db.from("pedidos")
      .select("id,contacto_id,vendedor,total,estado,created_at")
      .gte("created_at", isoDesde).lt("created_at", isoFin).order("id")),
    db.from("vendedores").select("id,nombre,email,role,activo"),
    db.from("sesiones_vendedor").select("*").gte("inicio_sesion", isoInicio).lt("inicio_sesion", isoFin),
  ]);

  const errores = [msgsRes, textosRes, contRes, pedRes, vendRes]
    .map((r) => r.error?.message)
    .filter(Boolean);
  if (errores.length) throw new Error("Supabase: " + errores.join(" | "));

  const todosMsgs = msgsRes.data || [];
  const textoPorId = new Map((textosRes.data || []).map((m) => [m.id, m.contenido]));
  const contactos = contRes.data || [];
  const todosPedidos = pedRes.data || [];
  const vendedores = vendRes.data || [];
  const sesiones = sesRes.data || [];

  const enElDia = (r) => r.created_at >= isoInicio && r.created_at < isoFin;
  const msgs = todosMsgs.filter(enElDia);
  const pedidos = todosPedidos.filter(enElDia);
  const contactoPorId = new Map(contactos.map((c) => [c.id, c]));

  // ── Equipo: tabla `vendedores` + cualquiera con actividad real ─────────
  const nombres = new Set();
  vendedores
    .filter((v) => (v.role || "vendedor") !== "ceo" && v.activo !== false)
    .forEach((v) => esVendedor(v.nombre) && nombres.add(v.nombre));
  todosMsgs.forEach((m) => esVendedor(m.agente) && nombres.add(m.agente));
  contactos.forEach((c) => esVendedor(c.vendedor) && nombres.add(c.vendedor));
  const equipo = [...nombres];

  // ── Volumen ───────────────────────────────────────────────────────────
  const entrantes = msgs.filter((m) => m.direccion === "in");
  const salientes = msgs.filter((m) => m.direccion !== "in");
  const porBot = salientes.filter((m) => m.origen === "bot");
  const porHumano = salientes.filter((m) => m.origen !== "bot");

  // ── Tiempos de respuesta: por par in → out dentro del día ─────────────
  const porContacto = new Map();
  for (const m of msgs) {
    if (!porContacto.has(m.contacto_id)) porContacto.set(m.contacto_id, []);
    porContacto.get(m.contacto_id).push(m);
  }

  const respuestas = []; // { vendedor, minutos, esBot, contacto_id }
  const chatsRespondidosPorHumano = new Set();
  const chatsConEntrante = new Set();
  const chatsSinResponder = [];

  for (const [contactoId, lista] of porContacto) {
    let pendiente = null;
    for (const m of lista) {
      if (m.direccion === "in") {
        chatsConEntrante.add(contactoId);
        if (!pendiente) pendiente = m;
      } else {
        if (m.origen !== "bot") chatsRespondidosPorHumano.add(contactoId);
        if (pendiente) {
          const minutos = (new Date(m.created_at) - new Date(pendiente.created_at)) / 60000;
          if (minutos >= 0 && minutos <= TOPE_RESPUESTA_MIN) {
            respuestas.push({
              vendedor: m.origen === "bot" ? null : (m.agente || null),
              minutos, esBot: m.origen === "bot", contacto_id: contactoId,
            });
          }
          pendiente = null;
        }
      }
    }
    if (pendiente) {
      const c = contactoPorId.get(contactoId);
      chatsSinResponder.push({
        nombre: c?.nombre || c?.telefono || "Sin nombre",
        vendedor: c?.vendedor || "sin asignar",
        estado: c?.estado || "nuevo",
        desde: pendiente.created_at,
        esperaMin: Math.round((fin - new Date(pendiente.created_at)) / 60000),
      });
    }
  }
  chatsSinResponder.sort((a, b) => b.esperaMin - a.esperaMin);

  const tiemposHumanos = respuestas.filter((r) => !r.esBot).map((r) => r.minutos);
  const tiemposBot = respuestas.filter((r) => r.esBot).map((r) => r.minutos);

  // ── Actividad por hora (hora local de la operación) ────────────────────
  const horas = Array.from({ length: 24 }, (_, h) => ({ hora: h, entrantes: 0, salientes: 0 }));
  for (const m of msgs) {
    const h = horaLocal(new Date(m.created_at), tz);
    if (m.direccion === "in") horas[h].entrantes++;
    else horas[h].salientes++;
  }
  const horaPico = horas.reduce((a, b) => (b.entrantes + b.salientes > a.entrantes + a.salientes ? b : a), horas[0]);

  // ── Clientes ──────────────────────────────────────────────────────────
  const nuevos = contactos.filter((c) => c.created_at >= isoInicio && c.created_at < isoFin);
  const cerradosHoy = contactos.filter(
    (c) => ESTADOS_CERRADOS.includes(c.estado) && c.updated_at >= isoInicio && c.updated_at < isoFin
  );
  const ahoraFin = fin.getTime();
  const seguimientosVencidos = contactos.filter(
    (c) => c.seguimiento_at && new Date(c.seguimiento_at).getTime() <= ahoraFin && !ESTADOS_CERRADOS.includes(c.estado)
  );
  const leadsSinAsignar = nuevos.filter((c) => !esVendedor(c.vendedor));

  // ── Facturación ───────────────────────────────────────────────────────
  const facturacion = pedidos.reduce((s, p) => s + num(p.total), 0);

  // ── Ranking por vendedor ──────────────────────────────────────────────
  const sesionPorNombre = new Map();
  for (const s of sesiones) {
    const nombre = s.vendedor_nombre
      || vendedores.find((v) => v.id === s.vendedor_id)?.nombre;
    if (!esVendedor(nombre)) continue;
    sesionPorNombre.set(nombre, (sesionPorNombre.get(nombre) || 0) + num(s.duracion_seg));
  }

  const porVendedor = equipo.map((v) => {
    const enviados = salientes.filter((m) => m.agente === v && m.origen !== "bot");
    const chatsAtendidos = new Set(enviados.map((m) => m.contacto_id));
    const cartera = contactos.filter((c) => c.vendedor === v);
    const carteraIds = new Set(cartera.map((c) => c.id));
    const chatsQueEscribieron = [...chatsConEntrante].filter((id) => carteraIds.has(id));
    const respondidosDeSuCartera = chatsQueEscribieron.filter((id) => chatsRespondidosPorHumano.has(id));
    const tiempos = respuestas.filter((r) => r.vendedor === v).map((r) => r.minutos);
    const pedidosV = pedidos.filter((p) => p.vendedor === v);
    const cerradosV = cerradosHoy.filter((c) => c.vendedor === v);
    const carteraCerrada = cartera.filter((c) => ESTADOS_CERRADOS.includes(c.estado));

    return {
      vendedor: v,
      mensajes: enviados.length,
      chats: chatsAtendidos.size,
      nuevosAsignados: nuevos.filter((c) => c.vendedor === v).length,
      primerasRespuestas: tiempos.length,
      respuestaMedianaMin: mediana(tiempos),
      respuestaPromMin: promedio(tiempos),
      chatsPendientesCartera: chatsQueEscribieron.length - respondidosDeSuCartera.length,
      cobertura: chatsQueEscribieron.length
        ? respondidosDeSuCartera.length / chatsQueEscribieron.length : null,
      cerrados: cerradosV.length,
      pedidos: pedidosV.length,
      facturacion: pedidosV.reduce((s, p) => s + num(p.total), 0),
      cartera: cartera.length,
      conversionCartera: cartera.length ? carteraCerrada.length / cartera.length : 0,
      conectadoMin: Math.round((sesionPorNombre.get(v) || 0) / 60),
    };
  });

  // Efectividad del día (0-100), relativa al mejor del equipo:
  //   45 % velocidad de respuesta · 30 % cobertura de su cartera · 25 % resultado
  const activos = porVendedor.filter((v) => v.mensajes > 0 || v.chats > 0 || v.pedidos > 0);
  const mejorTiempo = Math.min(...activos.map((v) => v.respuestaMedianaMin ?? Infinity), Infinity);
  const maxResultado = Math.max(...activos.map((v) => v.cerrados + v.pedidos), 0);
  const maxMensajes = Math.max(...activos.map((v) => v.mensajes), 0);

  for (const v of porVendedor) {
    const velocidad = v.respuestaMedianaMin != null && isFinite(mejorTiempo)
      ? Math.min(1, (mejorTiempo || 1) / Math.max(v.respuestaMedianaMin, 1))
      : (v.mensajes > 0 ? 0.35 : 0);
    const cobertura = v.cobertura != null ? v.cobertura : (v.mensajes > 0 ? 0.5 : 0);
    const resultado = maxResultado > 0
      ? (v.cerrados + v.pedidos) / maxResultado
      : (maxMensajes > 0 ? v.mensajes / maxMensajes * 0.5 : 0);
    v.efectividad = (v.mensajes > 0 || v.chats > 0 || v.pedidos > 0)
      ? Math.round(100 * (0.45 * velocidad + 0.30 * cobertura + 0.25 * resultado))
      : 0;
  }

  const ranking = [...porVendedor].sort(
    (a, b) => b.efectividad - a.efectividad || b.mensajes - a.mensajes
  );
  const activosRanking = ranking.filter((v) => v.mensajes > 0 || v.chats > 0 || v.pedidos > 0);
  const inactivos = ranking.filter((v) => !(v.mensajes > 0 || v.chats > 0 || v.pedidos > 0));

  // ── Top conversaciones del día ────────────────────────────────────────
  const conversaciones = [...porContacto.entries()].map(([id, lista]) => {
    const c = contactoPorId.get(id) || {};
    const ins = lista.filter((m) => m.direccion === "in").length;
    const ultimo = lista[lista.length - 1];
    return {
      contacto_id: id,
      nombre: c.nombre || c.telefono || "Sin nombre",
      empresa: c.empresa || "",
      vendedor: esVendedor(c.vendedor) ? c.vendedor : "sin asignar",
      estado: c.estado || "nuevo",
      mensajes: lista.length,
      entrantes: ins,
      nuevo: !!(c.created_at >= isoInicio && c.created_at < isoFin),
      bot: !!c.bot_activo,
      ultimoAt: ultimo?.created_at || null,
      ultimoTexto: (textoPorId.get(ultimo?.id) || "").replace(/\s+/g, " ").trim().slice(0, 180),
    };
  }).sort((a, b) => b.mensajes - a.mensajes);

  // ── Comparativa: día previo y promedio de los 7 previos ───────────────
  const serie7 = [];
  for (let i = 7; i >= 1; i--) {
    const f = sumarDias(fecha, -i);
    const r = rangoDia(f, tz);
    const a = r.inicio.toISOString(), b = r.fin.toISOString();
    const mm = todosMsgs.filter((m) => m.created_at >= a && m.created_at < b);
    serie7.push({
      fecha: f,
      mensajes: mm.length,
      entrantes: mm.filter((m) => m.direccion === "in").length,
      chats: new Set(mm.map((m) => m.contacto_id)).size,
      nuevos: contactos.filter((c) => c.created_at >= a && c.created_at < b).length,
      facturacion: todosPedidos.filter((p) => p.created_at >= a && p.created_at < b)
        .reduce((s, p) => s + num(p.total), 0),
    });
  }
  const hoySerie = {
    fecha, mensajes: msgs.length, entrantes: entrantes.length,
    chats: porContacto.size, nuevos: nuevos.length, facturacion,
  };
  const ayer = serie7[serie7.length - 1] || null;
  const prom7 = {
    mensajes: promedio(serie7.map((d) => d.mensajes)) || 0,
    entrantes: promedio(serie7.map((d) => d.entrantes)) || 0,
    chats: promedio(serie7.map((d) => d.chats)) || 0,
    nuevos: promedio(serie7.map((d) => d.nuevos)) || 0,
    facturacion: promedio(serie7.map((d) => d.facturacion)) || 0,
  };

  return {
    fecha, tz,
    generadoAt: new Date().toISOString(),
    kpis: {
      mensajes: msgs.length,
      entrantes: entrantes.length,
      salientes: salientes.length,
      porBot: porBot.length,
      porHumano: porHumano.length,
      botPct: salientes.length ? Math.round(porBot.length / salientes.length * 100) : 0,
      chatsActivos: porContacto.size,
      chatsConEntrante: chatsConEntrante.size,
      chatsSinResponder: chatsSinResponder.length,
      clientesNuevos: nuevos.length,
      leadsSinAsignar: leadsSinAsignar.length,
      cerrados: cerradosHoy.length,
      pedidos: pedidos.length,
      facturacion,
      ticket: pedidos.length ? facturacion / pedidos.length : 0,
      respuestaMedianaMin: mediana(tiemposHumanos),
      respuestaPromMin: promedio(tiemposHumanos),
      respuestaBotMedianaMin: mediana(tiemposBot),
      primerasRespuestas: tiemposHumanos.length,
      seguimientosVencidos: seguimientosVencidos.length,
      horaPico: horaPico.entrantes + horaPico.salientes > 0 ? horaPico.hora : null,
      tasaRespuesta: chatsConEntrante.size
        ? Math.round((chatsConEntrante.size - chatsSinResponder.length) / chatsConEntrante.size * 100)
        : null,
      conectadoTotalMin: Math.round([...sesionPorNombre.values()].reduce((a, b) => a + b, 0) / 60),
    },
    horas,
    porVendedor: activosRanking,
    inactivos: inactivos.map((v) => v.vendedor),
    conversaciones,
    pendientes: {
      sinResponder: chatsSinResponder.slice(0, 12),
      seguimientos: seguimientosVencidos.slice(0, 12).map((c) => ({
        nombre: c.nombre || c.telefono, vendedor: c.vendedor || "sin asignar",
        estado: c.estado, seguimiento_at: c.seguimiento_at, nota: c.nota_seguimiento || "",
      })),
      leadsSinAsignar: leadsSinAsignar.slice(0, 12).map((c) => ({
        nombre: c.nombre || c.telefono, estado: c.estado, created_at: c.created_at,
      })),
    },
    nuevosClientes: nuevos.map((c) => ({
      nombre: c.nombre || c.telefono, empresa: c.empresa || "",
      vendedor: esVendedor(c.vendedor) ? c.vendedor : "sin asignar",
      estado: c.estado, created_at: c.created_at,
    })),
    pedidosDelDia: pedidos.map((p) => ({
      cliente: contactoPorId.get(p.contacto_id)?.nombre
        || contactoPorId.get(p.contacto_id)?.telefono || "—",
      vendedor: p.vendedor || "—", total: num(p.total), estado: p.estado,
    })),
    comparativa: { hoy: hoySerie, ayer, prom7, serie7 },
  };
}
