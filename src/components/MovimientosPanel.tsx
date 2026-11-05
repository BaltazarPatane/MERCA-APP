import type { LucideIcon } from "lucide-react";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarDays,
  Car,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Dumbbell,
  House,
  Landmark,
  Pencil,
  Search,
  Shirt,
  ShoppingBasket,
  SlidersHorizontal,
  Stethoscope,
  Tag,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react";
import type { Categoria, Movimiento } from "../types";

type Cuenta = { id: string; nombre: string };
type Estado = Movimiento["estado"];

type Props = {
  movimientos: Movimiento[];
  categorias: Categoria[];
  cuentas: Cuenta[];
  periodo: string;
  mes: string;
  dia: string;
  desde: string;
  hasta: string;
  filtroEstado: string;
  busquedaDestinatario: string;
  filtroCuenta: string;
  busy: boolean;
  onPeriodo: (v: string) => void;
  onMes: (v: string) => void;
  onDia: (v: string) => void;
  onDesde: (v: string) => void;
  onHasta: (v: string) => void;
  onEstado: (v: string) => void;
  onBusqueda: (v: string) => void;
  onCuenta: (v: string) => void;
  onLimpiar: () => void;
  onEditar: (movimiento: Movimiento) => void;
  onCambiarEstado: (id: string, estado: "confirmado" | "descartado") => void;
};

const dinero = (monto: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(monto);

const nombreEstado: Record<Estado, string> = {
  confirmado: "Confirmado",
  pendiente_revision: "Pendiente",
  descartado: "Descartado",
};

const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");

function iconoCategoria(nombre: string, tipo: Movimiento["tipo"]): LucideIcon {
  if (tipo === "ingreso") return ArrowDownLeft;
  if (tipo === "transferencia") return ArrowRightLeft;
  const n = normalizar(nombre);
  if (/comida|restaur|cafe|bar|helad|almuer|cena|delivery/.test(n)) return UtensilsCrossed;
  if (/ropa|calzado|vestir|indumentaria/.test(n)) return Shirt;
  if (/salud|medic|farmac|doctor/.test(n)) return Stethoscope;
  if (/hogar|casa|alquiler|vivienda/.test(n)) return House;
  if (/transporte|auto|combustible|nafta|viaje|uber/.test(n)) return Car;
  if (/basquet|deport|gym|gimnasio|actividad/.test(n)) return Dumbbell;
  if (/super|compra|mercado/.test(n)) return ShoppingBasket;
  return Tag;
}

function estiloCategoria(nombre: string, tipo: Movimiento["tipo"]): string {
  if (tipo === "ingreso") return "income";
  if (tipo === "transferencia") return "transfer";
  const n = normalizar(nombre);
  if (/comida|restaur|cafe|bar|helad|almuer|cena|delivery/.test(n)) return "food";
  if (/ropa|calzado|vestir|indumentaria/.test(n)) return "clothing";
  if (/salud|medic|farmac/.test(n)) return "health";
  if (/hogar|casa|alquiler|vivienda/.test(n)) return "home";
  if (/transporte|auto|combustible|nafta|viaje|uber/.test(n)) return "transport";
  if (/basquet|deport|gym|gimnasio/.test(n)) return "sport";
  return "other";
}

function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.split("-");
  return `${d}/${m}/${a}`;
}

function origenLegible(descripcion: string | null, tipo: Movimiento["tipo"]): string {
  if (descripcion?.trim() === "Comprobante recibido por Atajos") return "Atajos";
  return descripcion?.trim() || (tipo === "ingreso" ? "Ingreso manual" : "Gasto manual");
}

export default function MovimientosPanel({
  movimientos,
  categorias,
  cuentas,
  periodo,
  mes,
  dia,
  desde,
  hasta,
  filtroEstado,
  busquedaDestinatario,
  filtroCuenta,
  busy,
  onPeriodo,
  onMes,
  onDia,
  onDesde,
  onHasta,
  onEstado,
  onBusqueda,
  onCuenta,
  onLimpiar,
  onEditar,
  onCambiarEstado,
}: Props) {
  const categoriasPorId = new Map(categorias.map(c => [c.id, c.nombre]));
  const cuentasPorId = new Map(cuentas.map(c => [c.id, c.nombre]));
  const filtrosActivos =
    periodo !== "mes" ||
    mes !== new Date().toLocaleDateString("en-CA").slice(0, 7) ||
    filtroEstado !== "todos" ||
    busquedaDestinatario.trim() !== "" ||
    filtroCuenta !== "todas";

  return (
    <div className="mv-screen">
      <section className="mv-filters" aria-label="Filtros de movimientos">
        <div className="mv-filters-header">
          <div className="mv-filters-title">
            <SlidersHorizontal size={18} aria-hidden="true" />
            <h2>Filtros</h2>
          </div>
          <button className="mv-clear" type="button" onClick={onLimpiar} disabled={!filtrosActivos}>
            <X size={14} aria-hidden="true" /> Limpiar filtros
          </button>
        </div>
        <div className="mv-filter-grid">
          <label className="mv-field">
            <span>Período</span>
            <span className="mv-control mv-select">
              <CalendarDays size={17} aria-hidden="true" />
              <select value={periodo} onChange={e => onPeriodo(e.target.value)}>
                <option value="mes">Mes</option>
                <option value="dia">Día</option>
                <option value="rango">Rango de fechas</option>
                <option value="todo">Todo el historial</option>
              </select>
              <ChevronDown className="mv-chevron" size={16} aria-hidden="true" />
            </span>
          </label>
          {periodo === "mes" && (
            <label className="mv-field">
              <span>Mes</span>
              <span className="mv-control mv-date-control">
                <input type="month" value={mes} onChange={e => onMes(e.target.value)} />
              </span>
            </label>
          )}
          {periodo === "dia" && (
            <label className="mv-field">
              <span>Fecha</span>
              <span className="mv-control mv-date-control">
                <input type="date" value={dia} onChange={e => onDia(e.target.value)} />
              </span>
            </label>
          )}
          {periodo === "rango" && (
            <>
              <label className="mv-field">
                <span>Desde</span>
                <span className="mv-control mv-date-control">
                  <input type="date" value={desde} onChange={e => onDesde(e.target.value)} />
                </span>
              </label>
              <label className="mv-field">
                <span>Hasta</span>
                <span className="mv-control mv-date-control">
                  <input type="date" min={desde} value={hasta} onChange={e => onHasta(e.target.value)} />
                </span>
              </label>
            </>
          )}
          <label className="mv-field">
            <span>Estado</span>
            <span className="mv-control mv-select">
              <CircleHelp size={17} aria-hidden="true" />
              <select value={filtroEstado} onChange={e => onEstado(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="confirmado">Confirmados</option>
                <option value="pendiente_revision">Pendientes</option>
                <option value="descartado">Descartados</option>
              </select>
              <ChevronDown className="mv-chevron" size={16} aria-hidden="true" />
            </span>
          </label>
          <label className="mv-field">
            <span>Billetera</span>
            <span className="mv-control mv-select">
              <Wallet size={17} aria-hidden="true"/>
              <select value={filtroCuenta} onChange={e => onCuenta(e.target.value)}>
                <option value="todas">Todas las billeteras</option>
                <option value="sin_asignar">Sin asignar</option>
                {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <ChevronDown className="mv-chevron" size={16} aria-hidden="true"/>
            </span>
          </label>
          <label className="mv-field mv-recipient-filter">
            <span>Buscar destinatario</span>
            <span className="mv-control mv-search">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                value={busquedaDestinatario}
                onChange={e => onBusqueda(e.target.value)}
                placeholder="Nombre, alias, CBU o CVU..."
                autoComplete="off"
              />
            </span>
          </label>
        </div>
      </section>

      <section className="mv-history" aria-label="Historial de movimientos">
        <header className="mv-history-header">
          <h2>Historial</h2>
          <span>{movimientos.length} {movimientos.length === 1 ? "movimiento" : "movimientos"}</span>
        </header>
        <div className="mv-column-head" aria-hidden="true">
          <span>Movimiento</span>
          <span>Categoría</span>
          <span>Cuenta</span>
          <span>Estado</span>
          <span>Monto</span>
        </div>
        {movimientos.length === 0 ? (
          <div className="mv-empty">
            <Search size={32} aria-hidden="true" />
            <strong>No hay movimientos para estos filtros</strong>
            <p>Probá otro período, estado o destinatario.</p>
            <button className="mv-action" type="button" onClick={onLimpiar}>Restablecer filtros</button>
          </div>
        ) : (
          <div className="mv-rows">
            {movimientos.map(m => {
              const categoria = (m.categoria_id && categoriasPorId.get(m.categoria_id)) || "Sin categoría";
              const CuentaIcono = m.tipo === "transferencia" ? ArrowRightLeft : Landmark;
              const Icono = iconoCategoria(categoria, m.tipo);
              const estilo = estiloCategoria(categoria, m.tipo);
              const idCuenta = m.tipo === "ingreso" ? m.cuenta_destino_id : m.cuenta_origen_id;
              const origenCuenta = m.cuenta_origen_id ? (cuentasPorId.get(m.cuenta_origen_id) || "Cuenta no disponible") : "Sin asignar";
              const destinoCuenta = m.cuenta_destino_id ? (cuentasPorId.get(m.cuenta_destino_id) || "Cuenta no disponible") : "Sin asignar";
              const nombreCuenta = m.tipo === "transferencia" ? origenCuenta + " → " + destinoCuenta
                : idCuenta ? cuentasPorId.get(idCuenta) || "Cuenta no disponible" : "Sin asignar";
              const DestIcono = m.tipo === "ingreso" ? ArrowDownLeft : m.tipo === "transferencia" ? ArrowRightLeft : ArrowUpRight;
              const nombreMovimiento = m.destinatario || (m.tipo === "ingreso" ? "Ingreso" : m.tipo === "transferencia" ? "Transferencia" : "Sin destinatario");
              return (
                <article key={m.id} className="mv-row">
                  <div className="mv-cell mv-movement">
                    <span className={`mv-category-icon mv-icon-${estilo}`} aria-hidden="true"><Icono size={22} strokeWidth={2.25} /></span>
                    <div className="mv-movement-info">
                      <span className="mv-movement-category">{categoria}</span>
                      <strong title={nombreMovimiento}>{nombreMovimiento}</strong>
                      <span className="mv-movement-meta">
                        <time dateTime={m.fecha}>{fechaCorta(m.fecha)}</time>
                        {m.hora && <><i aria-hidden="true">·</i><Clock3 size={12} aria-hidden="true" />{m.hora.slice(0, 5)}</>}
                        <i aria-hidden="true">·</i>{origenLegible(m.descripcion, m.tipo)}
                      </span>
                      <div className="mv-row-actions">
                        <button type="button" className="mv-action" disabled={busy} onClick={() => onEditar(m)}>
                          <Pencil size={14} aria-hidden="true" /> Editar
                        </button>
                        {m.estado === "pendiente_revision" && (
                          <>
                            <button type="button" className="mv-action mv-approve" disabled={busy} onClick={() => onCambiarEstado(m.id, "confirmado")}>
                              <Check size={14} aria-hidden="true" /> Confirmar
                            </button>
                            <button type="button" className="mv-action mv-reject" disabled={busy} onClick={() => onCambiarEstado(m.id, "descartado")}>
                              <X size={14} aria-hidden="true" /> Descartar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mv-cell mv-category-cell">
                    <span className="mv-mobile-label">Categoría</span>
                    <span className="mv-category-badge"><Icono size={15} aria-hidden="true" />{categoria}</span>
                  </div>
                  <div className="mv-cell mv-account">
                    <span className="mv-mobile-label">Cuenta</span>
                    <CuentaIcono size={17} aria-hidden="true" />
                    <span title={nombreCuenta}>{nombreCuenta}</span>
                  </div>
                  <div className="mv-cell mv-status-cell">
                    <span className="mv-mobile-label">Estado</span>
                    <span className={`mv-status mv-status-${m.estado}`}>
                      {m.estado === "confirmado" ? <Check size={15} aria-hidden="true" /> : m.estado === "pendiente_revision" ? <Clock3 size={15} aria-hidden="true" /> : <X size={15} aria-hidden="true" />}
                      {nombreEstado[m.estado]}
                    </span>
                  </div>
                  <div className="mv-cell mv-amount-cell">
                    <span className="mv-mobile-label">Monto</span>
                    <span className={`mv-amount ${m.tipo === "ingreso" ? "mv-positive" : m.tipo === "gasto" ? "mv-negative" : "mv-neutral"}`}>
                      <DestIcono size={17} aria-hidden="true" />
                      <span>{m.tipo === "ingreso" ? "+" : m.tipo === "gasto" ? "−" : ""} {dinero(Number(m.monto))}</span>
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <footer className="mv-history-footer">
          <Wallet size={14} aria-hidden="true" />
          Historial cargado por páginas. Las operaciones sin billetera se conservan y pueden editarse.
        </footer>
      </section>
    </div>
  );
}
