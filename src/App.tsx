import { useEffect, useMemo, useState } from "react";
import { Home, ListFilter, TrendingUp, CirclePlus, Settings2, LogOut, RefreshCcw } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import EditarMovimiento from "./components/EditarMovimiento";
import MovimientosPanel from "./components/MovimientosPanel";
import InicioPanel from "./components/InicioPanel";
import NuevoMovimientoPanel from "./components/NuevoMovimientoPanel";
import AjustesPanel from "./components/AjustesPanel";
import InversionesPanel from "./components/InversionesPanel";
import { montoParaBD } from "./types";
import type { Categoria, Cuenta, Movimiento } from "./types";


type Tab = "inicio" | "movimientos" | "inversiones" | "agregar" | "ajustes";
const fechaHoy = () => new Date().toLocaleDateString("en-CA");
const normalizarBusqueda = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
const mesHoy = () => fechaHoy().slice(0, 7);

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(() => window.location.hash.includes("type=recovery"));
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("inicio");
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cuentasDisponibles, setCuentasDisponibles] = useState(true);
  const [periodo, setPeriodo] = useState("mes");
  const [mes, setMes] = useState(mesHoy());
  const [dia, setDia] = useState(fechaHoy());
  const [desde, setDesde] = useState(fechaHoy());
  const [hasta, setHasta] = useState(fechaHoy());
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [busquedaDestinatario, setBusquedaDestinatario] = useState("");
  const [filtroCuenta, setFiltroCuenta] = useState("todas");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tipoNuevo, setTipoNuevo] = useState<"gasto" | "ingreso" | "inversion" | "transferencia">("gasto");
  const [montoNuevo, setMontoNuevo] = useState("");
  const [fechaNueva, setFechaNueva] = useState(fechaHoy());
  const [categoriaNueva, setCategoriaNueva] = useState("");
  const [cuentaNueva, setCuentaNueva] = useState("");
  const [cuentaDestinoNueva, setCuentaDestinoNueva] = useState("");
  const [descripcionNueva, setDescripcionNueva] = useState("");
  const [destinatarioNuevo, setDestinatarioNuevo] = useState("");
  const [notice, setNotice] = useState("");
  const [editando, setEditando] = useState<Movimiento | null>(null);

  useEffect(() => {
    if (!supabase) { setStarting(false); return; }
    const client = supabase;
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setStarting(false);
    }).catch(() => setStarting(false));
    const { data } = client.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function cargar() {
    if (!supabase || !session) return;
    setLoading(true);
    setError("");
    const client = supabase;
    const userId = session.user.id;
    // La paginación evita el límite de 3.000 movimientos y el tope de filas
    // por consulta de Supabase. Los saldos se calculan sobre todo el historial.
    const cargarHistorialCompleto = async () => {
      const todos: Movimiento[] = [];
      const pagina = 1000;
      for (let inicio = 0; ; inicio += pagina) {
        const resultado = await client.from("movimientos")
          .select("id,tipo,monto,moneda,fecha,hora,descripcion,destinatario,estado,categoria_id,cuenta_origen_id,cuenta_destino_id")
          .eq("user_id", userId)
          .order("fecha", { ascending: false })
          .order("id", { ascending: false })
          .range(inicio, inicio + pagina - 1);
        if (resultado.error) return { data: null, error: resultado.error };
        const lote = (resultado.data || []) as Movimiento[];
        todos.push(...lote);
        if (lote.length < pagina) break;
      }
      return { data: todos, error: null };
    };
    const [mov, cat, cta] = await Promise.all([
      cargarHistorialCompleto(),
      client.from("categorias").select("id,nombre,tipo,activa,color").order("nombre"),
      client.from("cuentas").select("id,nombre,tipo,moneda,activa,saldo_inicial").eq("user_id",userId).order("nombre"),
    ]);
    // Compatibilidad hasta ejecutar la migración: el resto de MERCA sigue funcionando.
    const migracionPendiente = !!cta.error && (cta.error.code === "42703" || /saldo_inicial/i.test(cta.error.message));
    let cuentasCargadas: Cuenta[] = [];
    let errorCuentas = cta.error;
    if (migracionPendiente) {
      const legacy = await client.from("cuentas").select("id,nombre,tipo,moneda,activa").eq("user_id",userId).order("nombre");
      errorCuentas = legacy.error;
      cuentasCargadas = (legacy.data || []).map(c => ({...c,saldo_inicial:0})) as Cuenta[];
    } else if (!cta.error) {
      cuentasCargadas = (cta.data || []) as Cuenta[];
    }
    setCuentasDisponibles(!migracionPendiente && !errorCuentas);
    if (mov.error || cat.error || errorCuentas) setError(mov.error?.message || cat.error?.message || errorCuentas?.message || "Error desconocido");
    else {
      setMovimientos((mov.data || []) as Movimiento[]);
      setCategorias((cat.data || []) as Categoria[]);
      setCuentas(cuentasCargadas);
    }
    setLoading(false);
  }

  useEffect(() => { if (session) void cargar(); else { setMovimientos([]); setCategorias([]); setCuentas([]); setCuentasDisponibles(true); } }, [session?.user.id]);

  const visibles = useMemo(() => movimientos.filter(m => {
    if (m.tipo === "inversion") return false; // Historial separado para inversiones
    if (periodo === "mes" && !m.fecha.startsWith(mes)) return false;
    if (periodo === "dia" && m.fecha !== dia) return false;
    if (periodo === "rango" && (m.fecha < desde || m.fecha > hasta)) return false;
    if (busquedaDestinatario.trim() && !normalizarBusqueda(m.destinatario ?? "").includes(normalizarBusqueda(busquedaDestinatario))) return false;
    if (filtroCuenta === "sin_asignar") {
      const origen = m.tipo === "ingreso" ? m.cuenta_destino_id : m.cuenta_origen_id;
      if (m.tipo === "transferencia" ? !!m.cuenta_origen_id && !!m.cuenta_destino_id : !!origen) return false;
    } else if (filtroCuenta !== "todas" && m.cuenta_origen_id !== filtroCuenta && m.cuenta_destino_id !== filtroCuenta) return false;
    return filtroEstado === "todos" || m.estado === filtroEstado;
  } ), [movimientos, periodo, mes, dia, desde, hasta, filtroEstado, busquedaDestinatario, filtroCuenta]);


  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setAuthError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) setAuthError("No se pudo iniciar sesión. Comprobá tu correo y contraseña.");
    setBusy(false);
  }

  async function enviarRecuperacion(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setAuthError("");
    setRecoveryMessage("");
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setBusy(false);
    if (err) {
      setAuthError(err.message);
    } else {
      setRecoveryMessage("Si el correo está autorizado para recibir mensajes de Supabase, te llegará un enlace para elegir una contraseña nueva. Revisá también spam.");
    }
  }

  async function guardarNuevaContrasena(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (newPassword.length < 12) {
      setAuthError("Usá una contraseña de al menos 12 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setAuthError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setAuthError("");
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (err) {
      setAuthError(err.message);
    } else {
      setNewPassword("");
      setConfirmPassword("");
      setRecoveryMode(false);
      setShowPasswordReset(false);
      setNotice("Contraseña actualizada. Tu sesión está iniciada.");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }

  async function actualizarEstado(id: string, estado: string) {
    if (!supabase) return;
    setBusy(true);
    const { error: err } = await supabase.from("movimientos").update({ estado, updated_at: new Date().toISOString() }).eq("id", id);
    setBusy(false);
    if (err) setError(err.message);
    else { setNotice(estado === "confirmado" ? "Movimiento confirmado" : "Movimiento descartado"); await cargar(); }
  }

  async function guardarEdicion(data: {
    tipo: "gasto" | "ingreso" | "transferencia" | "inversion";
    monto: string;
    fecha: string;
    hora: string | null;
    categoria_id: string | null;
    descripcion: string | null;
    destinatario: string | null;
    cuenta_origen_id?: string | null;
    cuenta_destino_id?: string | null;
    estado: "pendiente_revision" | "confirmado" | "descartado";
  }) {
    if (!supabase || !editando) return;
    setBusy(true);
    setError("");
    const { error: err } = await supabase.from("movimientos").update({
      ...data, updated_at: new Date().toISOString(),
    }).eq("id", editando.id);
    setBusy(false);
    if (err) setError("No se pudieron guardar los cambios: " + err.message);
    else { setEditando(null); setNotice("Movimiento actualizado"); await cargar(); }
  }

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !session) return;
    const importe = montoParaBD(montoNuevo);
    const esTransferencia = tipoNuevo === "transferencia";
    if (!importe || !fechaNueva || (!esTransferencia && !categorias.some(c=>c.id===categoriaNueva && c.tipo===tipoNuevo && c.activa))) {
      setError("Revisá el importe, la fecha y seleccioná una categoría activa del tipo correspondiente."); return;
    }
    const cuentasActivas = cuentas.filter(c => c.activa);
    if (esTransferencia && (!cuentaNueva || !cuentaDestinoNueva || cuentaNueva === cuentaDestinoNueva ||
        !cuentasActivas.some(c => c.id === cuentaNueva) || !cuentasActivas.some(c => c.id === cuentaDestinoNueva))) {
      setError("Para una transferencia, elegí dos billeteras activas y diferentes."); return;
    }
    if (!esTransferencia && cuentaNueva && !cuentasActivas.some(c => c.id === cuentaNueva)) {
      setError("Elegí una billetera activa o dejá el movimiento sin asignar."); return;
    }
    setBusy(true); setError("");
    const { error: err } = await supabase.from("movimientos").insert({
      user_id: session.user.id,
      tipo: tipoNuevo, monto: importe, moneda: "ARS",
      fecha: fechaNueva, categoria_id: esTransferencia ? null : categoriaNueva,
      descripcion: descripcionNueva.trim() || null,
      cuenta_origen_id: tipoNuevo !== "ingreso" ? (cuentaNueva || null) : null,
      cuenta_destino_id: esTransferencia ? cuentaDestinoNueva : tipoNuevo === "ingreso" ? (cuentaNueva || null) : null,
      destinatario: tipoNuevo === "gasto" || tipoNuevo === "inversion" ? (destinatarioNuevo.trim() || null) : null,
      origen_registro: "manual", estado: "confirmado",
    });
    setBusy(false);
    if (err) setError(tipoNuevo === "inversion" && err.code === "23514" ? "Para habilitar inversiones, ejecutá primero la migración SQL de Inversiones en Supabase." : err.message);
    else {
      setMontoNuevo(""); setDescripcionNueva(""); setDestinatarioNuevo(""); setCategoriaNueva(""); setCuentaNueva(""); setCuentaDestinoNueva("");
      setNotice(esTransferencia?"Transferencia registrada correctamente":tipoNuevo==="inversion"?"Inversión registrada correctamente":"Movimiento agregado correctamente");
      setTab(tipoNuevo==="inversion"?"inversiones":"movimientos"); await cargar();
    }
  }

  function exportarCSV() {
    const encabezado = "fecha,tipo,monto,moneda,categoria,destinatario,descripcion,estado,cuenta_origen,cuenta_destino";
    const esc = (v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const filas = movimientos.map(m => [
      m.fecha, m.tipo, m.monto, m.moneda,
      categorias.find(c => c.id === m.categoria_id)?.nombre ?? "", m.destinatario ?? "", m.descripcion ?? "", m.estado,
      cuentas.find(c => c.id === m.cuenta_origen_id)?.nombre ?? "", cuentas.find(c => c.id === m.cuenta_destino_id)?.nombre ?? ""
    ].map(esc).join(","));
    const blob = new Blob(["\uFEFF" + [encabezado, ...filas].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "merca-movimientos.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  if (!supabase) return <div className="centered"><div className="panel auth"><div className="brand brandLogo"><img src="/icon.svg" alt="" aria-hidden="true" />MERCA<span>.</span></div><h1>Configuración pendiente</h1><p>La aplicación ya está preparada. Falta configurar <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> en Cloudflare Pages.</p><p>No publiques claves administrativas ni el token de Atajos.</p></div></div>;
  if (starting) return <div className="centered">Iniciando MERCA…</div>;
  if (recoveryMode) return (
    <div className="centered">
      <form onSubmit={guardarNuevaContrasena} className="panel auth">
        <div className="brand brandLogo"><img src="/icon.svg" alt="" aria-hidden="true" />MERCA<span>.</span></div>
        <h1>Elegí una contraseña nueva</h1>
        {!session && <p>Validando el enlace de recuperación… Si tarda demasiado, volvé a solicitarlo.</p>}
        <label>Contraseña nueva<input type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label>
        <label>Repetir contraseña<input type="password" autoComplete="new-password" minLength={12} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label>
        {authError && <div className="message error" role="alert">{authError}</div>}
        <button type="submit" className="primary" disabled={busy || !session}>{busy ? "Actualizando…" : "Establecer contraseña"}</button>
      </form>
    </div>
  );
  if (showPasswordReset && !session) return (
    <div className="centered">
      <form onSubmit={enviarRecuperacion} className="panel auth">
        <div className="brand brandLogo"><img src="/icon.svg" alt="" aria-hidden="true" />MERCA<span>.</span></div>
        <h1>Recuperar acceso</h1>
        <p>Escribí el correo del usuario que creaste en Supabase.</p>
        <label>Correo electrónico<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" /></label>
        {authError && <div className="message error" role="alert">{authError}</div>}
        {recoveryMessage && <div className="message success" role="status">{recoveryMessage}</div>}
        <button className="primary" disabled={busy}>{busy ? "Enviando…" : "Enviar enlace de recuperación"}</button>
        <button type="button" className="secondary" onClick={() => { setShowPasswordReset(false); setAuthError(""); setRecoveryMessage(""); }}>Volver a iniciar sesión</button>
      </form>
    </div>
  );
  if (!session) return (
    <div className="centered">
      <form onSubmit={login} className="panel auth">
        <div className="brand brandLogo"><img src="/icon.svg" alt="" aria-hidden="true" />MERCA<span>.</span></div>
        <h1>Tus finanzas, claras.</h1>
        <p>Ingresá con tu cuenta personal de MERCA.</p>
        <label>Correo electrónico<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" /></label>
        <label>Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        {authError && <div className="message error" role="alert">{authError}</div>}
        <button className="primary" disabled={busy}>{busy ? "Ingresando…" : "Iniciar sesión"}</button>
        <button type="button" className="secondary" onClick={() => { setShowPasswordReset(true); setAuthError(""); }}>¿Olvidaste tu contraseña?</button>
      </form>
    </div>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand brandLogo"><img src="/icon.svg" alt="" aria-hidden="true" />MERCA<span>.</span></div>
        <div className="slogan">Control personal de finanzas</div>
        <nav aria-label="Menú principal">
          <button className={tab === "inicio" ? "nav active" : "nav"} onClick={() => { setTab("inicio"); setError(""); }}><Home size={19}/> <span>Inicio</span></button>
          <button className={tab === "movimientos" ? "nav active" : "nav"} onClick={() => { setTab("movimientos"); setError(""); }}><ListFilter size={19}/> <span>Movimientos</span></button>
          <button className={tab === "inversiones" ? "nav active" : "nav"} onClick={() => { setTab("inversiones"); setError(""); }}><TrendingUp size={19}/> <span>Inversiones</span></button>
          <button className={tab === "agregar" ? "nav active" : "nav"} onClick={() => { setTab("agregar"); setError(""); }}><CirclePlus size={19}/> <span>Agregar</span></button>
          <button className={tab === "ajustes" ? "nav active" : "nav"} onClick={() => { setTab("ajustes"); setError(""); }}><Settings2 size={19}/> <span>Ajustes</span></button>
        </nav>
        <button className="logout" onClick={() => { if (supabase) void supabase.auth.signOut(); }}><LogOut size={17}/> Cerrar sesión</button>
      </aside>
      <main className="appMain">
        <header className="top"><div><div className="overline">MERCA / FINANZAS PERSONALES</div><h1>{({ inicio: "Tu resumen", movimientos: "Movimientos", inversiones: "Inversiones", agregar: "Nuevo movimiento", ajustes: "Ajustes" } as const)[tab]}</h1><p className="mv-page-subtitle">{({inicio:"Una mirada clara a tus finanzas personales.",movimientos:"Revisá y gestioná todos tus movimientos en un solo lugar.",inversiones:"Controlá tus aportes sin mezclarlos con los gastos.",agregar:"Registrá gastos e ingresos de manera rápida.",ajustes:"Organizá categorías, cuentas y opciones de respaldo."} as const)[tab]}</p></div><button className="subtle" onClick={() => void cargar()} disabled={loading}><RefreshCcw size={16}/> {loading ? "Cargando…" : "Actualizar"}</button></header>
        {error && <div className="message error" role="alert">{error}</div>}
        {notice && <div className="message success" role="status" onClick={() => setNotice("")}>{notice} ×</div>}
        {tab === "inicio" && <InicioPanel
          movimientos={movimientos}
          categorias={categorias}
          cuentas={cuentas}
          periodo={periodo} mes={mes} dia={dia} desde={desde} hasta={hasta}
          onPeriodo={setPeriodo} onMes={setMes} onDia={setDia} onDesde={setDesde} onHasta={setHasta}
          onAgregar={() => setTab("agregar")}
          onCuentas={() => setTab("ajustes")}
          onHistorial={(pendientes=false) => {
            setTab("movimientos");
            setFiltroEstado(pendientes ? "pendiente_revision" : "todos");
            setBusquedaDestinatario("");
            setFiltroCuenta("todas");
            if (pendientes) setPeriodo("todo");
          }}
        />}
        {tab === "movimientos" && (
          <MovimientosPanel
            movimientos={visibles}
            categorias={categorias}
            cuentas={cuentas}
            periodo={periodo}
            mes={mes}
            dia={dia}
            desde={desde}
            hasta={hasta}
            filtroEstado={filtroEstado}
            busquedaDestinatario={busquedaDestinatario}
            filtroCuenta={filtroCuenta}
            busy={busy}
            onPeriodo={setPeriodo}
            onMes={setMes}
            onDia={setDia}
            onDesde={setDesde}
            onHasta={setHasta}
            onEstado={setFiltroEstado}
            onBusqueda={setBusquedaDestinatario}
            onCuenta={setFiltroCuenta}
            onLimpiar={() => {
              setPeriodo("mes");
              setMes(mesHoy());
              setDia(fechaHoy());
              setDesde(fechaHoy());
              setHasta(fechaHoy());
              setFiltroEstado("todos");
              setBusquedaDestinatario("");
              setFiltroCuenta("todas");
            }}
            onEditar={setEditando}
            onCambiarEstado={(id, estado) => void actualizarEstado(id, estado)}
          />
        )}
        {tab === "inversiones" && <InversionesPanel movimientos={movimientos} categorias={categorias} cuentas={cuentas} busy={busy} onEditar={setEditando} onCambiarEstado={(id,estado)=>void actualizarEstado(id,estado)} onAgregar={()=>{setTipoNuevo("inversion");setCategoriaNueva("");setCuentaNueva("");setTab("agregar");}} />}
        {tab === "agregar" && <NuevoMovimientoPanel
          tipo={tipoNuevo} monto={montoNuevo} fecha={fechaNueva} categoriaId={categoriaNueva}
          cuentaId={cuentaNueva} cuentaDestinoId={cuentaDestinoNueva} destinatario={destinatarioNuevo} descripcion={descripcionNueva}
          categorias={categorias} cuentas={cuentas.filter(c=>c.activa!==false)} busy={busy}
          onTipo={tipo => { setTipoNuevo(tipo); setCategoriaNueva(""); setCuentaNueva(""); setCuentaDestinoNueva(""); }}
          onMonto={setMontoNuevo} onFecha={setFechaNueva} onCategoria={setCategoriaNueva}
          onCuenta={setCuentaNueva} onCuentaDestino={setCuentaDestinoNueva} onDestinatario={setDestinatarioNuevo} onDescripcion={setDescripcionNueva}
          onGuardar={agregar}
          onLimpiar={() => { setMontoNuevo(""); setFechaNueva(fechaHoy()); setCuentaNueva(""); setCuentaDestinoNueva(""); setCategoriaNueva(""); setDestinatarioNuevo(""); setDescripcionNueva(""); setError(""); }}
          onCategorias={() => setTab("ajustes")}
          onCuentas={() => setTab("ajustes")}
        />}
        {tab === "ajustes" && <AjustesPanel
          userId={session.user.id} email={session.user.email || ""}
          categorias={categorias} cuentas={cuentas} movimientos={movimientos} cuentasDisponibles={cuentasDisponibles}
          onReload={cargar} onError={setError} onNotice={setNotice}
          onExportar={exportarCSV}
        />}
      </main>
      {editando && <EditarMovimiento key={editando.id} movimiento={editando} categorias={categorias} cuentas={cuentas} busy={busy} onSave={guardarEdicion} onClose={() => setEditando(null)} />}
      <nav className="bottomNav" aria-label="Navegación móvil"><button className={tab==="inicio"?"selected":""} onClick={()=>setTab("inicio")}><Home size={22}/>Inicio</button><button className={tab==="movimientos"?"selected":""} onClick={()=>setTab("movimientos")}><ListFilter size={22}/>Historial</button><button className={tab==="inversiones"?"selected":""} onClick={()=>setTab("inversiones")}><TrendingUp size={22}/>Invertir</button><button className={tab==="agregar"?"selected":""} onClick={()=>setTab("agregar")}><CirclePlus size={22}/>Agregar</button><button className={tab==="ajustes"?"selected":""} onClick={()=>setTab("ajustes")}><Settings2 size={22}/>Ajustes</button></nav>
    </div>
  );
}
