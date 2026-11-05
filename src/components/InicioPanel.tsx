import { useMemo } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarDays, ChartNoAxesCombined, CheckCircle2, ChevronDown, CirclePlus, Clock3, ListFilter, PieChart, Wallet } from "lucide-react";
import type { Categoria, Movimiento } from "../types";
import { resumenFinanciero } from "../lib/finanzas";

type Props = {
  movimientos: Movimiento[]; categorias: Categoria[];
  periodo: string; mes: string; dia: string; desde: string; hasta: string;
  onPeriodo:(v:string)=>void; onMes:(v:string)=>void; onDia:(v:string)=>void;
  onDesde:(v:string)=>void; onHasta:(v:string)=>void;
  onHistorial:(pendientes?:boolean)=>void; onAgregar:()=>void;
};
const money=(n:number)=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:2}).format(n);
const colores=["#32e4b7","#31b9d6","#5c9df3","#b286ec","#ffbb54","#819ba4","#e97b9b","#46c6a5"];
const fecha=(v:string)=>{const [a,m,d]=v.split("-");return d+"/"+m+"/"+a;};
const origen=(m:Movimiento)=>m.descripcion === "Comprobante recibido por Atajos" ? "Atajos" : (m.descripcion?.trim() || (m.tipo === "ingreso" ? "Ingreso manual" : "Gasto manual"));

export default function InicioPanel({movimientos,categorias,periodo,mes,dia,desde,hasta,onPeriodo,onMes,onDia,onDesde,onHasta,onHistorial,onAgregar}:Props){
  const enPeriodo=useMemo(()=>movimientos.filter(m=>{
    if(periodo==="mes"&&!m.fecha.startsWith(mes))return false;
    if(periodo==="dia"&&m.fecha!==dia)return false;
    if(periodo==="rango"&&(m.fecha<desde||m.fecha>hasta))return false;
    return true;
  }),[movimientos,periodo,mes,dia,desde,hasta]);
  const confirmados=enPeriodo.filter(m=>m.estado==="confirmado");
  const { ingresos, gastos, inversiones, balanceDisponible: balance } = resumenFinanciero(enPeriodo);
  // El saldo total es independiente de los filtros de fechas del resumen.
  const balanceHistorico = useMemo(() => resumenFinanciero(movimientos).balanceDisponible, [movimientos]);
  const nombres=new Map(categorias.map(c=>[c.id,c.nombre]));
  const distribucion=useMemo(()=>{
    const suma=new Map<string,number>();
    confirmados.filter(m=>m.tipo==="gasto").forEach(m=>{
      const nombre=(m.categoria_id&&nombres.get(m.categoria_id))||"Sin categoría";
      suma.set(nombre,(suma.get(nombre)||0)+Number(m.monto));
    });
    return [...suma].sort((a,b)=>b[1]-a[1]).map(([nombre,importe],i)=>({nombre,importe,color:colores[i%colores.length],porcentaje:gastos?importe/gastos*100:0}));
  },[movimientos,periodo,mes,dia,desde,hasta,categorias]);
  let acumulado=0;
  const segmentos=distribucion.map(d=>{const inicio=acumulado;acumulado+=d.porcentaje;return d.color+" "+inicio+"% "+acumulado+"%";});
  const fondo=segmentos.length?"conic-gradient("+segmentos.join(", ")+")":"conic-gradient(#244c4d 0% 100%)";
  const meses=useMemo(()=>{
    const base=periodo==="mes"&&/^\d{4}-\d{2}$/.test(mes)?new Date(Number(mes.slice(0,4)),Number(mes.slice(5,7))-1,1):new Date();
    return Array.from({length:6},(_,i)=>{
      const d=new Date(base.getFullYear(),base.getMonth()-5+i,1);
      const clave=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
      return {clave,etiqueta:new Intl.DateTimeFormat("es-AR",{month:"short"}).format(d).replace(".",""),
        importe:movimientos.filter(m=>m.estado==="confirmado"&&m.tipo==="gasto"&&m.fecha.startsWith(clave)).reduce((s,m)=>s+Number(m.monto),0)};
    });
  },[movimientos,periodo,mes]);
  const maxMes=Math.max(1,...meses.map(m=>m.importe));
  const pendientes=movimientos.filter(m=>m.estado==="pendiente_revision").length;
  const recientes=[...enPeriodo].sort((a,b)=>(b.fecha+" "+(b.hora||"")).localeCompare(a.fecha+" "+(a.hora||""))).slice(0,5);
  return <div className="homeV2">
    <section className="mv-filters homeV2-filters" aria-label="Filtros del resumen">
      <div className="mv-filters-header"><div className="mv-filters-title"><CalendarDays size={18}/><h2>Período del resumen</h2></div><span className="homeV2-hint">Solo movimientos confirmados</span></div>
      <div className="mv-filter-grid homeV2-filter-grid">
        <label className="mv-field"><span>Período</span><span className="mv-control mv-select"><CalendarDays size={17}/><select value={periodo} onChange={e=>onPeriodo(e.target.value)}><option value="mes">Mes</option><option value="dia">Día</option><option value="rango">Rango de fechas</option><option value="todo">Todo el historial</option></select><ChevronDown className="mv-chevron" size={16}/></span></label>
        {periodo==="mes"&&<label className="mv-field"><span>Mes</span><span className="mv-control mv-date-control"><input type="month" value={mes} onChange={e=>onMes(e.target.value)}/></span></label>}
        {periodo==="dia"&&<label className="mv-field"><span>Fecha</span><span className="mv-control mv-date-control"><input type="date" value={dia} onChange={e=>onDia(e.target.value)}/></span></label>}
        {periodo==="rango"&&<><label className="mv-field"><span>Desde</span><span className="mv-control mv-date-control"><input type="date" value={desde} onChange={e=>onDesde(e.target.value)}/></span></label><label className="mv-field"><span>Hasta</span><span className="mv-control mv-date-control"><input type="date" min={desde} value={hasta} onChange={e=>onHasta(e.target.value)}/></span></label></>}
        <aside className="homeV2-current-balance" aria-label="Dinero total disponible">
          <span className="homeV2-current-balance-title"><Wallet size={17}/> Dinero total disponible</span>
          <strong className={balanceHistorico < 0 ? "homeV2-negative" : ""}>{money(balanceHistorico)}</strong>
          <small>Todo el historial · movimientos confirmados</small>
        </aside>
      </div>
    </section>
    <section className="homeV2-stats" aria-label="Balance">
      <article className="homeV2-stat homeV2-expenses"><span className="homeV2-stat-icon"><ArrowUpRight size={24}/></span><div><p>Gastos del período</p><strong>{money(gastos)}</strong><small>Movimientos confirmados</small></div></article>
      <article className="homeV2-stat homeV2-income"><span className="homeV2-stat-icon"><ArrowDownLeft size={24}/></span><div><p>Ingresos del período</p><strong>{money(ingresos)}</strong><small>Registrados desde la web</small></div></article>
      <article className="homeV2-stat homeV2-investments"><span className="homeV2-stat-icon"><ChartNoAxesCombined size={24}/></span><div><p>Inversiones del período</p><strong>{money(inversiones)}</strong><small>Aportes confirmados</small></div></article>
      <article className="homeV2-stat homeV2-balance"><span className="homeV2-stat-icon"><Wallet size={24}/></span><div><p>Balance del período</p><strong className={balance<0?"homeV2-negative":""}>{money(balance)}</strong><small>Ingresos − gastos − inversiones</small></div></article>
    </section>
    <div className="homeV2-analysis">
      <section className="homeV2-panel">
        <header className="homeV2-heading"><div><h2><PieChart size={19}/>Gastos por categoría</h2><p>Distribución de gastos confirmados</p></div></header>
        {distribucion.length?<div className="homeV2-categories">
          <div className="homeV2-donut" style={{background:fondo}} role="img" aria-label={"Distribución entre "+distribucion.length+" categorías"}><div><strong>{money(gastos)}</strong><small>Total gastado</small></div></div>
          <div className="homeV2-legend">{distribucion.map(d=><div key={d.nombre} className="homeV2-legend-row"><i style={{background:d.color}}/><span>{d.nombre}</span><strong>{money(d.importe)}</strong><small>{Math.round(d.porcentaje)}%</small></div>)}</div>
        </div>:<div className="homeV2-empty"><PieChart size={28}/><p>No hay gastos confirmados en este período.</p></div>}
      </section>
      <section className="homeV2-panel">
        <header className="homeV2-heading"><div><h2><ChartNoAxesCombined size={19}/>Evolución de gastos</h2><p>Últimos seis meses · datos reales</p></div></header>
        <div className="homeV2-chart" role="img" aria-label={meses.map(m=>m.clave+": "+money(m.importe)).join("; ")}>
          {meses.map(m=><div key={m.clave} className="homeV2-chart-month"><div className="homeV2-chart-bar-wrap"><div className="homeV2-chart-bar" style={{height:(m.importe?Math.max(5,m.importe/maxMes*100):2)+"%"}} title={m.clave+": "+money(m.importe)}/></div><span>{m.etiqueta}</span></div>)}
        </div>
        <p className="homeV2-chart-note">Importes confirmados del historial de MERCA</p>
      </section>
    </div>
    <section className="homeV2-panel">
      <header className="homeV2-heading homeV2-recent-head"><div><h2><ListFilter size={19}/>Últimos movimientos</h2><p>Operaciones del período seleccionado</p></div><button className="homeV2-text-button" type="button" onClick={()=>onHistorial(false)}>Ver todos <ArrowRight size={16}/></button></header>
      {recientes.length?<div className="homeV2-recent-list">{recientes.map(m=><div className="homeV2-recent-row" key={m.id}><span className={"homeV2-recent-icon "+(m.tipo==="ingreso"?"income":m.tipo==="inversion"?"investment":"")} >{m.tipo==="ingreso"?<ArrowDownLeft size={19}/>:<ArrowUpRight size={19}/>}</span><div className="homeV2-recent-info"><strong>{m.destinatario || (m.tipo==="ingreso"?"Ingreso":m.tipo==="transferencia"?"Transferencia":m.tipo==="inversion"?"Inversión":"Gasto")}</strong><small>{(m.categoria_id&&nombres.get(m.categoria_id))||"Sin categoría"} · {fecha(m.fecha)} · {origen(m)}</small></div><span className={"homeV2-recent-amount "+(m.tipo==="ingreso"?"income":m.tipo==="inversion"?"investment":"")}>{m.tipo==="ingreso"?"+":m.tipo==="gasto"||m.tipo==="inversion"?"−":""}{money(Number(m.monto))}</span><span className={"homeV2-recent-status "+m.estado}>{m.estado==="confirmado"?"Confirmado":m.estado==="descartado"?"Descartado":"Pendiente"}</span></div>)}</div>:<div className="homeV2-empty"><ListFilter size={28}/><p>Sin movimientos para el período seleccionado.</p></div>}
    </section>
    <div className="homeV2-actions">
      <button className="homeV2-primary-action" type="button" onClick={onAgregar}><CirclePlus size={19}/> Agregar movimiento</button>
      <button className="homeV2-secondary-action" type="button" onClick={()=>onHistorial(true)}>{pendientes?<Clock3 size={19}/>:<CheckCircle2 size={19}/>} {pendientes} {pendientes===1?"movimiento por revisar":"movimientos por revisar"} <ArrowRight size={17}/></button>
    </div>
  </div>;
}
