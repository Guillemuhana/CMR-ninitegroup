// Cartera de clientes potenciales guardados.
//
// Los datos y las acciones los maneja Prospectos.jsx (que también tiene el
// modal de Contactar y los estilos): esto sólo muestra la lista y avisa qué
// se cambió.

import { useMemo, useState } from "react";
import {
  AlertTriangle, Building2, Database, ExternalLink, FileSpreadsheet, Globe, Loader2, Mail, MapPin,
  MessageSquareQuote, Phone, Search, Sparkles, Trash2, UserCheck,
} from "lucide-react";
import { AnilloScore, colorPrioridad, descargarCSV, emailsDe, telefonoDe, urlMapaNegocio } from "./comun";
import { ESTADOS, estadoDe } from "./cartera";

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

/** Nota que se guarda al salir del campo, no en cada tecla. */
function CampoNota({ valor, onGuardar }) {
  const [texto, setTexto] = useState(valor || "");
  return (
    <textarea className="canal-campo" rows={2} value={texto} placeholder="Nota: qué dijo, cuándo volver a llamar…"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => { if ((texto || "") !== (valor || "")) onGuardar(texto); }}
      aria-label="Nota" style={{ marginBottom: 0 }} />
  );
}

export default function Guardados({ estado, lista, vendedores, onActualizar, onBorrar, onContactar, onLlamar, onIrABuscar }) {
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [texto, setTexto] = useState("");

  const conteo = useMemo(() => {
    const c = { todos: lista.length };
    for (const e of ESTADOS) c[e.id] = lista.filter((g) => g.estado === e.id).length;
    return c;
  }, [lista]);

  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return lista
      .filter((g) => filtroEstado === "todos" || g.estado === filtroEstado)
      .filter((g) => !t || [g.nombre, g.ciudad, g.direccion, g.rubro, g.nota, g.vendedor].some((v) => String(v || "").toLowerCase().includes(t)));
  }, [lista, filtroEstado, texto]);

  const exportar = () => {
    if (!visibles.length) return;
    descargarCSV(
      `clientes-guardados_${new Date().toLocaleDateString("es-AR").replace(/\//g, "-")}.csv`,
      ["Estado", "Prioridad", "Score", "Nombre", "Rubro", "Dirección", "Teléfono", "Email", "Web", "Sugerido", "Enfoque de venta",
        "Vendedor", "Nota", "Contactos", "Último contacto", "Canal", "Búsqueda", "Zona", "Guardado"],
      visibles.map((g) => [estadoDe(g.estado).etiqueta, g.prioridad, g.lead_score, g.nombre, g.rubro, g.direccion, g.telefono, g.email,
        g.sitio_web, g.productos_sugeridos, g.enfoque_venta, g.vendedor || "Sin asignar", g.nota, g.contactos,
        fecha(g.ultimo_contacto_at), g.ultimo_canal, g.busqueda, g.zona, fecha(g.created_at)]),
    );
  };

  if (estado.cargando) {
    return (
      <div className="vacio">
        <div className="radar"><Loader2 size={30} className="gira" /></div>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#475569" }}>Cargando clientes guardados…</div>
      </div>
    );
  }

  if (estado.faltaTabla) {
    return (
      <div className="cuidados" style={{ marginTop: 22 }}>
        <div className="canal-titulo" style={{ color: "#9a3412" }}><Database size={15} /> Falta un paso para poder guardar clientes</div>
        <ul>
          <li>Hay que crear la tabla donde se guardan, una sola vez.</li>
          <li>Entrá a Supabase → proyecto de producción → <b>SQL Editor</b>.</li>
          <li>Pegá el contenido del archivo <b>supabase_prospectos_migration.sql</b> (está en el repositorio) y tocá <b>Run</b>.</li>
          <li>Volvé acá y recargá la página.</li>
        </ul>
      </div>
    );
  }

  return (
    <div>
      {estado.error && <div className="aviso aviso-mal"><AlertTriangle size={16} /> {estado.error}</div>}

      <div className="filtros">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="filtro" data-activo={filtroEstado === "todos" ? 1 : 0} onClick={() => setFiltroEstado("todos")}>Todos ({conteo.todos})</button>
          {ESTADOS.map((e) => (
            <button key={e.id} className="filtro" data-activo={filtroEstado === e.id ? 1 : 0} onClick={() => setFiltroEstado(e.id)}>
              {e.etiqueta} ({conteo[e.id]})
            </button>
          ))}
        </div>
        <button className="btn" onClick={exportar} disabled={!visibles.length}><FileSpreadsheet size={15} /> CSV</button>
      </div>

      {lista.length > 0 && (
        <label className="campo campo-claro" style={{ display: "block", marginTop: 12 }}>
          <Search size={16} />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre, ciudad, rubro, vendedor o nota" aria-label="Buscar en guardados" />
        </label>
      )}

      <div className="lista">
        {visibles.map((g) => {
          const c = colorPrioridad(g.prioridad);
          const e = estadoDe(g.estado);
          const tel = telefonoDe(g);
          const emails = emailsDe(g);
          return (
            <article className="tarjeta" key={g.id} data-descartado={g.estado === "descartado" ? 1 : 0}>
              <div className="tarjeta-barra" style={{ background: c.barra }} />
              <div className="tarjeta-cuerpo">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: "-.01em" }}>{g.nombre}</span>
                      <span className="chip-prioridad" style={{ background: c.bg, color: c.text, borderColor: c.borde }}>{g.prioridad}</span>
                      <span className="chip-prioridad" style={{ background: e.fondo, color: e.color, borderColor: "transparent" }}>{e.etiqueta}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 5, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Building2 size={13} /> {g.rubro || g.tipo_negocio || "Negocio"}{g.ciudad ? ` · ${g.ciudad}` : ""}
                      <span style={{ color: "#cbd5e1" }}>·</span> guardado el {fecha(g.created_at)}
                      {g.contactos > 0 && (
                        <span className="pastilla pastilla-ok"><UserCheck size={11} /> {g.contactos} {g.contactos === 1 ? "contacto" : "contactos"} · último por {g.ultimo_canal} el {fecha(g.ultimo_contacto_at)}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <AnilloScore valor={g.lead_score} color={c.text} />
                    <select className="selector-vendedor" value={g.estado} onChange={(ev) => onActualizar(g, { estado: ev.target.value })} aria-label="Estado">
                      {ESTADOS.map((x) => <option key={x.id} value={x.id}>{x.etiqueta}</option>)}
                    </select>
                    <select className="selector-vendedor" value={g.vendedor || "Sin asignar"} aria-label="Vendedor"
                      onChange={(ev) => onActualizar(g, { vendedor: ev.target.value === "Sin asignar" ? null : ev.target.value })}>
                      {vendedores.map((v) => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                </div>

                <div className="datos">
                  {g.direccion && (
                    <a className="dato" href={urlMapaNegocio(g)} target="_blank" rel="noopener noreferrer">
                      <MapPin size={14} /><span>{g.direccion}</span><ExternalLink size={12} style={{ marginLeft: "auto" }} />
                    </a>
                  )}
                  {tel && <a className="dato" href={`tel:${tel}`} onClick={() => onLlamar(g)}><Phone size={14} /><span>{tel}</span></a>}
                  {emails.length > 0 && <span className="dato"><Mail size={14} /><span>{emails.slice(0, 2).join(" · ")}</span></span>}
                  {g.sitio_web && (
                    <a className="dato" href={g.sitio_web} target="_blank" rel="noopener noreferrer">
                      <Globe size={14} /><span>{g.sitio_web.replace(/^https?:\/\//, "").split("/")[0]}</span><ExternalLink size={12} style={{ marginLeft: "auto" }} />
                    </a>
                  )}
                </div>

                {g.enfoque_venta && (
                  <div className="nota" style={{ background: "#fefce8", borderColor: "#fde68a", marginBottom: 10 }}>
                    <div className="nota-titulo" style={{ color: "#854d0e" }}><MessageSquareQuote size={12} /> Enfoque de venta{g.productos_sugeridos ? ` · ${g.productos_sugeridos}` : ""}</div>
                    <p style={{ color: "#713f12" }}>{g.enfoque_venta}</p>
                  </div>
                )}

                <CampoNota key={`${g.id}-${g.updated_at}`} valor={g.nota} onGuardar={(nota) => onActualizar(g, { nota })} />

                <div className="contactar">
                  <button className="btn btn-principal" onClick={() => onContactar(g)}><Sparkles size={15} /> Contactar</button>
                  {tel && <a className="btn" href={`tel:${tel}`} onClick={() => onLlamar(g)}><Phone size={15} /> Llamar</a>}
                  <button className="btn" style={{ marginLeft: "auto" }} title="Quitar de guardados"
                    onClick={() => { if (window.confirm(`¿Quitar a ${g.nombre} de los guardados?`)) onBorrar(g); }}>
                    <Trash2 size={15} /> Quitar
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {!lista.length && (
        <div className="vacio">
          <div className="vacio-icono"><Database size={32} /></div>
          <div style={{ fontSize: 16.5, fontWeight: 800, color: "#475569", marginBottom: 6 }}>Todavía no guardaste clientes</div>
          <div style={{ fontSize: 13.5, maxWidth: 440, margin: "0 auto" }}>
            Hacé una búsqueda, tildá los que te interesan (o ninguno para guardar todos) y tocá <b>Guardar clientes</b>.
          </div>
          <button className="btn btn-principal" style={{ marginTop: 16 }} onClick={onIrABuscar}><Search size={15} /> Ir a buscar</button>
        </div>
      )}
      {lista.length > 0 && !visibles.length && (
        <div className="vacio">
          <div style={{ fontSize: 15, fontWeight: 800, color: "#475569" }}>Ningún guardado con ese filtro</div>
        </div>
      )}
    </div>
  );
}
