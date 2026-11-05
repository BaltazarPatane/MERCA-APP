import { useState } from "react";
import type { FormEvent } from "react";
import { montoParaBD } from "../types";
import type { Categoria, Movimiento } from "../types";

export type MovimientoEditado = {
  tipo: "gasto" | "ingreso" | "transferencia" | "inversion";
  monto: string;
  fecha: string;
  hora: string | null;
  categoria_id: string | null;
  descripcion: string | null;
  destinatario: string | null;
  estado: "pendiente_revision" | "confirmado" | "descartado";
  cuenta_origen_id?: string | null;
  cuenta_destino_id?: string | null;
};

type Props = {
  movimiento: Movimiento;
  categorias: Categoria[];
  cuentas: {id:string; nombre:string; activa?:boolean}[];
  busy: boolean;
  onSave: (data: MovimientoEditado) => Promise<void>;
  onClose: () => void;
};

export default function EditarMovimiento({ movimiento, categorias, cuentas, busy, onSave, onClose }: Props) {
  const [tipo, setTipo] = useState(movimiento.tipo);
  const [monto, setMonto] = useState(String(movimiento.monto).replace(".", ","));
  const [fecha, setFecha] = useState(movimiento.fecha);
  const [hora, setHora] = useState(movimiento.hora?.slice(0, 5) ?? "");
  const [categoriaId, setCategoriaId] = useState(movimiento.categoria_id ?? "");
  const [descripcion, setDescripcion] = useState(movimiento.descripcion ?? "");
  const [cuentaId, setCuentaId] = useState(movimiento.tipo === "ingreso" ? (movimiento.cuenta_destino_id ?? "") : (movimiento.cuenta_origen_id ?? ""));
  const [cuentaDestinoId, setCuentaDestinoId] = useState(movimiento.cuenta_destino_id ?? "");
  const [destinatario, setDestinatario] = useState(movimiento.destinatario ?? "");
  const [estado, setEstado] = useState(movimiento.estado);
  const [errorLocal, setErrorLocal] = useState("");

  const opciones = categorias.filter(c => c.tipo === tipo && (c.activa || c.id === categoriaId));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setErrorLocal("");
    const normalizado = montoParaBD(monto);
    if (!normalizado) {
      setErrorLocal("Ingresá un monto positivo válido, por ejemplo 15.000,50.");
      return;
    }
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      setErrorLocal("Elegí una fecha válida.");
      return;
    }
    if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
      setErrorLocal("La hora debe tener el formato HH:MM.");
      return;
    }
    if (tipo !== "transferencia" && !categoriaId) {
      setErrorLocal("Elegí una categoría del tipo correspondiente.");
      return;
    }
    if (tipo === "transferencia" && cuentaId && cuentaId === cuentaDestinoId) {
      setErrorLocal("La billetera de origen y la de destino deben ser diferentes.");
      return;
    }

    await onSave({
      tipo,
      monto: normalizado,
      fecha,
      hora: hora || null,
      categoria_id: tipo === "transferencia" ? null : categoriaId,
      descripcion: descripcion.trim() || null,
      destinatario: tipo === "gasto" || tipo === "inversion" ? (destinatario.trim() || null) : null,
      cuenta_origen_id: tipo === "ingreso" ? null : (cuentaId || null),
      cuenta_destino_id: tipo === "ingreso" ? (cuentaId || null) : tipo === "transferencia" ? (cuentaDestinoId || null) : null,
      estado,
    });
  }

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <section className="panel modalBox" role="dialog" aria-modal="true" aria-labelledby="editar-mov-title">
        <div className="sectionTitle">
          <h2 id="editar-mov-title">Editar movimiento</h2>
          <button className="secondary mini" type="button" onClick={onClose} disabled={busy} aria-label="Cerrar edición">✕</button>
        </div>
        <form className="form" onSubmit={guardar}>
          <label>Tipo
            <select value={tipo} onChange={e => {
              const siguiente = e.target.value as Movimiento["tipo"];
              setTipo(siguiente);
              setCategoriaId(siguiente === movimiento.tipo ? movimiento.categoria_id ?? "" : "");
              // Gastos e inversiones utilizan cuenta de origen; ingresos, cuenta destino.
              if (siguiente !== tipo && (siguiente === "ingreso" || tipo === "ingreso")) setCuentaId("");
            }}>
              <option value="gasto">Gasto</option>
              <option value="ingreso">Ingreso</option><option value="inversion">Inversión</option>
              <option value="transferencia" disabled={movimiento.tipo !== "transferencia"}>Transferencia propia</option>
            </select>
          </label>
          {tipo === "transferencia" && <p className="muted small">Las transferencias entre billeteras propias no afectan el balance total, solo la distribución.</p>}
          <label>Importe (ARS)
            <input inputMode="decimal" required value={monto} onChange={e => setMonto(e.target.value)} />
          </label>
          <div className="formTwo">
            <label>Fecha
              <input type="date" required value={fecha} onChange={e => setFecha(e.target.value)} />
            </label>
            <label>Hora (opcional)
              <input type="time" value={hora} onChange={e => setHora(e.target.value)} />
            </label>
          </div>
          {tipo !== "transferencia" && <label>Categoría
            <select required value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
              <option value="">Seleccionar</option>
              {opciones.map(c => <option key={c.id} value={c.id}>{c.nombre}{!c.activa ? " (inactiva)" : ""}</option>)}
            </select>
          </label>}
          {(tipo === "gasto" || tipo === "inversion") && <label>{tipo === "inversion" ? "Activo, instrumento o plataforma (opcional)" : "Destinatario o comercio (opcional)"}
            <input maxLength={120} value={destinatario} onChange={e => setDestinatario(e.target.value)} placeholder="Ej. Grido" />
          </label>}
          {cuentas.length > 0 && <label>{tipo === "ingreso" ? "Billetera de destino" : "Billetera de origen"} (opcional)
            <select value={cuentaId} onChange={e => setCuentaId(e.target.value)}>
              <option value="">Sin asignar</option>
              {cuentas.filter(c => c.activa !== false || c.id === cuentaId).map(c => <option key={c.id} value={c.id}>{c.nombre}{c.activa === false ? " (inactiva)" : ""}</option>)}
            </select>
          </label>}
          {tipo === "transferencia" && cuentas.length > 0 && <label>Billetera de destino (opcional para movimientos antiguos)
            <select value={cuentaDestinoId} onChange={e => setCuentaDestinoId(e.target.value)}>
              <option value="">Sin asignar</option>
              {cuentas.filter(c => c.activa !== false || c.id === cuentaDestinoId).map(c => <option key={c.id} value={c.id}>{c.nombre}{c.activa === false ? " (inactiva)" : ""}</option>)}
            </select>
          </label>}
          <label>Descripción
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="¿Qué fue este movimiento?" />
          </label>
          <label>Estado
            <select value={estado} onChange={e => setEstado(e.target.value as Movimiento["estado"])}>
              <option value="pendiente_revision">Pendiente de revisión</option>
              <option value="confirmado">Confirmado</option>
              <option value="descartado">Descartado</option>
            </select>
          </label>
          {errorLocal && <div className="message error" role="alert">{errorLocal}</div>}
          <div className="formActions">
            <button className="secondary" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
            <button className="primary" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
