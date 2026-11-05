import type { FormEvent } from "react";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, TrendingUp, CalendarDays, CircleHelp, CirclePlus, FileText, Landmark, RotateCcw, Save, Tag, Wallet } from "lucide-react";
import type { Categoria } from "../types";

type Cuenta={id:string;nombre:string};
type Props={
  tipo:"gasto"|"ingreso"|"inversion"|"transferencia"; monto:string; fecha:string; categoriaId:string; cuentaId:string; cuentaDestinoId:string; destinatario:string; descripcion:string;
  categorias:Categoria[]; cuentas:Cuenta[]; busy:boolean;
  onTipo:(v:"gasto"|"ingreso"|"inversion"|"transferencia")=>void; onMonto:(v:string)=>void; onFecha:(v:string)=>void;
  onCategoria:(v:string)=>void; onCuenta:(v:string)=>void; onCuentaDestino:(v:string)=>void; onDestinatario:(v:string)=>void; onDescripcion:(v:string)=>void;
  onGuardar:(e:FormEvent)=>void; onLimpiar:()=>void; onCategorias:()=>void; onCuentas:()=>void;
};
export default function NuevoMovimientoPanel({tipo,monto,fecha,categoriaId,cuentaId,cuentaDestinoId,destinatario,descripcion,categorias,cuentas,busy,onTipo,onMonto,onFecha,onCategoria,onCuenta,onCuentaDestino,onDestinatario,onDescripcion,onGuardar,onLimpiar,onCategorias,onCuentas}:Props){
  const opciones=categorias.filter(c=>c.tipo===tipo&&c.activa);
  return <div className="addV2-layout">
    <section className="addV2-panel">
      <header className="addV2-heading"><div className="addV2-heading-icon"><CirclePlus size={23}/></div><div><h2>Registrar movimiento</h2><p>Ingresá una operación de forma manual</p></div></header>
      <form className="addV2-form" onSubmit={onGuardar}>
        <fieldset className="addV2-type-group"><legend>Tipo de movimiento</legend><div className="addV2-toggle">
          <button type="button" aria-pressed={tipo==="ingreso"} className={tipo==="ingreso"?"is-active is-income":""} onClick={()=>onTipo("ingreso")}><ArrowDownLeft size={19}/> Ingreso</button>
          <button type="button" aria-pressed={tipo==="gasto"} className={tipo==="gasto"?"is-active is-expense":""} onClick={()=>onTipo("gasto")}><ArrowUpRight size={19}/> Gasto</button><button type="button" aria-pressed={tipo==="inversion"} className={tipo==="inversion"?"is-active is-investment":""} onClick={()=>onTipo("inversion")}><TrendingUp size={19}/> Inversión</button><button type="button" aria-pressed={tipo==="transferencia"} className={tipo==="transferencia"?"is-active is-transfer":""} onClick={()=>onTipo("transferencia")}><ArrowRightLeft size={19}/> Transferencia</button>
        </div></fieldset>
        <label className="addV2-field"><span>Importe en ARS <strong>*</strong></span><span className="addV2-input-wrap"><span className="addV2-prefix">ARS $</span><input required autoComplete="off" type="text" inputMode="decimal" value={monto} onChange={e=>onMonto(e.target.value)} placeholder="15.000,50" aria-label="Importe en pesos argentinos"/></span></label>
        <div className="addV2-columns">
          <label className="addV2-field"><span>Fecha <strong>*</strong></span><span className="addV2-input-wrap"><CalendarDays size={18}/><input required type="date" value={fecha} onChange={e=>onFecha(e.target.value)}/></span></label>
          {tipo!=="transferencia" && cuentas.length>0 && <label className="addV2-field"><span>{tipo==="ingreso"?"Billetera de destino":"Billetera de origen"} (opcional)</span><span className="addV2-input-wrap"><Wallet size={18}/><select value={cuentaId} onChange={e=>onCuenta(e.target.value)}><option value="">Sin asignar</option>{cuentas.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></span></label>}
        </div>
        {tipo==="transferencia" && <div className="addV2-columns">
          <label className="addV2-field"><span>Billetera de origen <strong>*</strong></span><span className="addV2-input-wrap"><Wallet size={18}/><select required value={cuentaId} onChange={e=>onCuenta(e.target.value)}><option value="">Seleccioná origen</option>{cuentas.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></span></label>
          <label className="addV2-field"><span>Billetera de destino <strong>*</strong></span><span className="addV2-input-wrap"><Landmark size={18}/><select required value={cuentaDestinoId} onChange={e=>onCuentaDestino(e.target.value)}><option value="">Seleccioná destino</option>{cuentas.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></span></label>
        </div>}
        {tipo!=="transferencia" && <label className="addV2-field"><span>Categoría <strong>*</strong></span><span className="addV2-input-wrap"><Tag size={18}/><select required value={categoriaId} onChange={e=>onCategoria(e.target.value)}><option value="">Seleccioná una categoría</option>{opciones.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></span></label>}
        {tipo!=="transferencia" && !opciones.length && <div className="addV2-help"><CircleHelp size={17}/><span>No tenés categorías activas para {tipo==="gasto"?"gastos":tipo==="ingreso"?"ingresos":"inversiones"}.</span><button type="button" onClick={onCategorias}>Crear categoría</button></div>}
        {!cuentas.length && <div className="addV2-help"><CircleHelp size={17}/><span>Para identificar cada operación, creá tus billeteras desde Ajustes.</span><button type="button" onClick={onCuentas}>Administrar billeteras</button></div>}
        {tipo==="transferencia" && <p className="addV2-help">Mover dinero entre billeteras propias no es un gasto ni un ingreso.</p>}
        {(tipo==="gasto"||tipo==="inversion")&&<label className="addV2-field"><span>{tipo==="inversion"?"Activo, instrumento o plataforma (opcional)":"Destinatario o comercio (opcional)"}</span><span className="addV2-input-wrap"><Wallet size={18}/><input type="text" maxLength={120} value={destinatario} onChange={e=>onDestinatario(e.target.value)} placeholder={tipo==="inversion"?"Ej. Fondo común, acciones, broker":"Ej. Grido, farmacia, Juan Pérez"}/></span></label>}
        <label className="addV2-field"><span>Descripción (opcional)</span><span className="addV2-input-wrap"><FileText size={18}/><input type="text" value={descripcion} onChange={e=>onDescripcion(e.target.value)} placeholder="Ej. Almuerzo, sueldo, alquiler"/></span></label>
        <div className="addV2-form-actions"><button type="button" className="addV2-reset" onClick={onLimpiar} disabled={busy}><RotateCcw size={17}/> Limpiar</button><button className="addV2-save" disabled={busy||(tipo==="transferencia"?cuentas.length<2||!cuentaId||!cuentaDestinoId||cuentaId===cuentaDestinoId:!opciones.length)} type="submit"><Save size={19}/>{busy?"Guardando…":"Guardar movimiento"}</button></div>
      </form>
    </section>
    <aside className="addV2-aside">
      <section className="addV2-note"><span className="addV2-note-icon"><Wallet size={23}/></span><h3>Tus finanzas, ordenadas</h3><p>Este movimiento se guardará en MERCA con estado <strong>Confirmado</strong>.</p>{tipo==="inversion"&&<p className="addV2-invest-note">Las inversiones disminuyen el dinero disponible, pero no se contabilizan como gastos de consumo.</p>}</section>
      <section className="addV2-note addV2-shortcuts"><span className="addV2-note-icon"><ArrowUpRight size={23}/></span><h3>Gastos desde iPhone</h3><p>Podés compartir los comprobantes de gastos desde Atajos. Los ingresos se registran manualmente en esta pantalla.</p></section>
    </aside>
  </div>;
}
