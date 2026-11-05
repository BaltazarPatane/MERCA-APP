import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Banknote, Check, CirclePlus, Landmark, Pencil, Power, Wallet, X } from "lucide-react";
import type { Cuenta, Movimiento } from "../types";
import { resumenPorCuentas, saldoInicialParaBD } from "../lib/cuentas";
import { supabase } from "../lib/supabase";

type Props = {
  userId: string;
  cuentas: Cuenta[];
  movimientos: Movimiento[];
  disponible: boolean;
  onReload: () => Promise<void>;
  onError: (texto: string) => void;
  onNotice: (texto: string) => void;
};
const tipos = [
  { id: "billetera", nombre: "Billetera virtual" },
  { id: "banco", nombre: "Cuenta bancaria" },
  { id: "efectivo", nombre: "Efectivo" },
  { id: "otra", nombre: "Otra cuenta" },
];
const nombreTipo = (valor: string) => tipos.find(t => t.id === valor)?.nombre || valor;
const peso = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(n);
const normalizar = (s: string) => s.trim().replace(/\s+/g, " ");

export default function GestionCuentas({ userId, cuentas, movimientos, disponible, onReload, onError, onNotice }: Props) {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("billetera");
  const [saldo, setSaldo] = useState("0");
  const [busy, setBusy] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [tipoEditado, setTipoEditado] = useState("billetera");
  const [saldoEditado, setSaldoEditado] = useState("0");
  const resumen = useMemo(() => resumenPorCuentas(cuentas, movimientos), [cuentas, movimientos]);
  const balancePorId = new Map(resumen.detalle.map(c => [c.id, c.saldo]));

  function validarNombre(v: string, id?: string) {
    const limpio = normalizar(v);
    if (!limpio || limpio.length > 60) { onError("El nombre de la billetera debe tener entre 1 y 60 caracteres."); return null; }
    if (cuentas.some(c => c.id !== id && c.nombre.toLocaleLowerCase("es") === limpio.toLocaleLowerCase("es"))) {
      onError("Ya existe una billetera o cuenta con ese nombre."); return null;
    }
    return limpio;
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !disponible || busy) return;
    const limpio = validarNombre(nombre);
    const inicial = saldoInicialParaBD(saldo);
    if (!limpio) return;
    if (inicial === null) { onError("El saldo inicial debe ser cero o positivo, con hasta dos decimales."); return; }
    setBusy(true); onError("");
    const { error } = await supabase.from("cuentas").insert({
      user_id: userId, nombre: limpio, tipo, moneda: "ARS", activa: true, saldo_inicial: inicial,
    });
    setBusy(false);
    if (error) { onError("No se pudo crear la billetera: " + error.message); return; }
    setNombre(""); setSaldo("0");
    onNotice("Billetera creada"); await onReload();
  }

  function editar(c: Cuenta) {
    setEditandoId(c.id);
    setNombreEditado(c.nombre);
    setTipoEditado(c.tipo);
    setSaldoEditado(String(c.saldo_inicial).replace(".", ","));
    onError("");
  }

  async function guardar(c: Cuenta) {
    if (!supabase || !disponible || busy) return;
    const limpio = validarNombre(nombreEditado, c.id);
    const inicial = saldoInicialParaBD(saldoEditado);
    if (!limpio) return;
    if (inicial === null) { onError("Revisá el saldo inicial: solo se admite un valor positivo o cero."); return; }
    setBusy(true); onError("");
    const { error } = await supabase.from("cuentas").update({
      nombre: limpio, tipo: tipoEditado, saldo_inicial: inicial,
    }).eq("id", c.id).eq("user_id", userId);
    setBusy(false);
    if (error) { onError("No se pudo actualizar la billetera: " + error.message); return; }
    setEditandoId(null);
    onNotice("Billetera actualizada"); await onReload();
  }

  async function cambiarEstado(c: Cuenta) {
    if (!supabase || !disponible || busy) return;
    setBusy(true); onError("");
    const { error } = await supabase.from("cuentas").update({ activa: !c.activa })
      .eq("id", c.id).eq("user_id", userId);
    setBusy(false);
    if (error) { onError("No se pudo cambiar el estado: " + error.message); return; }
    onNotice(c.activa ? "Billetera desactivada; se conserva su historial" : "Billetera activada");
    await onReload();
  }

  return <section className="settingsV2-panel" aria-labelledby="ajustes-cuentas">
    <header className="settingsV2-panel-header">
      <span className="settingsV2-panel-icon"><Wallet size={21}/></span>
      <div><h2 id="ajustes-cuentas">Billeteras y cuentas</h2><p>Administrá dónde entra y sale tu dinero, sin modificar las categorías.</p></div>
      <span className="settingsV2-count">{cuentas.length}</span>
    </header>
    {!disponible && <div className="message error" role="alert">Para crear y administrar billeteras, ejecutá primero la migración SQL de billeteras en Supabase. Los movimientos existentes no se modifican.</div>}
    <form className="settingsV2-create settingsV2-wallet-create" onSubmit={crear}>
      <label><span>Nombre</span><input required maxLength={60} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Mercado Pago" disabled={busy || !disponible}/></label>
      <label><span>Tipo</span><select value={tipo} onChange={e => setTipo(e.target.value)} disabled={busy || !disponible}>{tipos.map(t => <option value={t.id} key={t.id}>{t.nombre}</option>)}</select></label>
      <label><span>Saldo de apertura (ARS)</span><input inputMode="decimal" value={saldo} onChange={e => setSaldo(e.target.value)} placeholder="0,00" disabled={busy || !disponible}/></label>
      <button className="settingsV2-create-button" type="submit" disabled={busy || !disponible}><CirclePlus size={17}/> Crear</button>
    </form>
    <p className="settingsV2-footnote">El saldo de apertura se suma a los movimientos asociados a esa cuenta. Dejalo en cero si esos fondos ya aparecen como ingresos en MERCA; de lo contrario, los contarías dos veces.</p>
    {cuentas.length ? <div className="settingsV2-account-list">
      {cuentas.map(c => <div className="settingsV2-wallet-row" key={c.id}>
        <div className="settingsV2-wallet-top">
          <span className="settingsV2-account-icon">{c.tipo === "efectivo" ? <Banknote size={21}/> : c.tipo === "banco" ? <Landmark size={21}/> : <Wallet size={21}/>}</span>
          <div className="settingsV2-wallet-name"><strong>{c.nombre}</strong><small>{nombreTipo(c.tipo)} · {c.activa ? "Activa" : "Inactiva"}</small></div>
          <strong className="settingsV2-wallet-total">{peso(balancePorId.get(c.id) || 0)}</strong>
          <div className="settingsV2-wallet-actions">
            <button type="button" title="Editar billetera" aria-label={"Editar " + c.nombre} disabled={busy} onClick={() => editandoId === c.id ? setEditandoId(null) : editar(c)}><Pencil size={16}/></button>
            <button type="button" title={c.activa ? "Desactivar" : "Activar"} aria-label={(c.activa ? "Desactivar " : "Activar ") + c.nombre} disabled={busy} onClick={() => void cambiarEstado(c)}><Power size={16}/></button>
          </div>
        </div>
        {editandoId === c.id && <div className="settingsV2-wallet-edit">
          <label>Nombre<input required maxLength={60} value={nombreEditado} onChange={e => setNombreEditado(e.target.value)}/></label>
          <label>Tipo<select value={tipoEditado} onChange={e => setTipoEditado(e.target.value)}>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            {!tipos.some(t => t.id === tipoEditado) && <option value={tipoEditado}>{tipoEditado}</option>}
          </select></label>
          <label>Saldo de apertura<input inputMode="decimal" value={saldoEditado} onChange={e => setSaldoEditado(e.target.value)}/></label>
          <button type="button" disabled={busy} onClick={() => void guardar(c)}><Check size={16}/> Guardar</button>
          <button type="button" className="settingsV2-wallet-cancel" disabled={busy} onClick={() => setEditandoId(null)}><X size={16}/> Cancelar</button>
        </div>}
      </div>)}
    </div> : <div className="settingsV2-empty"><Wallet size={28}/><p>No hay billeteras creadas. Podés comenzar con Mercado Pago, efectivo o tu banco.</p></div>}
    {resumen.movimientosSinAsignar > 0 && <p className="settingsV2-footnote">{resumen.movimientosSinAsignar} movimientos confirmados tienen alguna cuenta sin asignar. Su saldo neto ({peso(resumen.saldoSinAsignar)}) se muestra por separado para no perder dinero del cálculo histórico. Podés asignarlos desde «Movimientos» o «Inversiones» → Editar.</p>}
    <p className="settingsV2-footnote">Desactivar una cuenta no elimina su saldo ni sus movimientos; solo impide seleccionarla en registros nuevos. Los movimientos de Atajos siguen entrando sin cuenta hasta que configuremos su asignación automática.</p>
  </section>;
}
