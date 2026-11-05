import { useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Check, CirclePlus, Pencil, PieChart, Search, TrendingUp, Wallet, X } from "lucide-react";
import type { Categoria, Movimiento } from "../types";
import { resumenFinanciero } from "../lib/finanzas";

type Cuenta={id:string;nombre:string};
type Props={movimientos:Movimiento[];categorias:Categoria[];cuentas:Cuenta[];busy:boolean;onAgregar:()=>void;onEditar:(m:Movimiento)=>void;onCambiarEstado:(id:string,estado:"confirmado"|"descartado")=>void};
const peso=(n:number)=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:2}).format(n);
const hoy=()=>new Date().toLocaleDateString("en-CA");
const colores=["#53e9c0","#5caaec","#c495ef","#fac66d","#e88aaf","#6ad8e1"];
const fechaLegible=(d:string)=>d.split("-").reverse().join("/");
const nombreEstado=(s:Movimiento["estado"])=>s==="confirmado"?"Confirmado":s==="descartado"?"Descartado":"Pendiente";

export default function InversionesPanel({movimientos,categorias,cuentas,busy,onAgregar,onEditar,onCambiarEstado}:Props){
  const [periodo,setPeriodo]=useState("mes");
  const [mes,setMes]=useState(hoy().slice(0,7));
  const [desde,setDesde]=useState(hoy());
  const [hasta,setHasta]=useState(hoy());
  const [categoriaId,setCategoriaId]=useState("todas");
  const [cuentaId,setCuentaId]=useState("todas");
  const [estado,setEstado]=useState("todos");
  const [buscar,setBuscar]=useState("");
  const inversiones=useMemo(()=>movimientos.filter(m=>m.tipo==="inversion"),[movimientos]);
  const categoriasInv=categorias.filter(c=>c.tipo==="inversion");
  const filtradas=useMemo(()=>inversiones.filter(m=>{
    if(periodo==="mes"&&!m.fecha.startsWith(mes))return false;
    if(periodo==="rango"&&(m.fecha<desde||m.fecha>hasta))return false;
    if(categoriaId!=="todas"&&m.categoria_id!==categoriaId)return false;
    if(cuentaId==="sin_asignar"&&m.cuenta_origen_id)return false;
    if(cuentaId!=="todas"&&cuentaId!=="sin_asignar"&&m.cuenta_origen_id!==cuentaId)return false;
    if(estado!=="todos"&&m.estado!==estado)return false;
    if(buscar.trim()&&!((m.destinatario||"")+" "+(m.descripcion||"")).toLocaleLowerCase("es").includes(buscar.toLocaleLowerCase("es").trim()))return false;
    return true;
  }),[inversiones,periodo,mes,desde,hasta,categoriaId,cuentaId,estado,buscar]);
  const confirmadas=filtradas.filter(m=>m.estado==="confirmado");
  const capital=resumenFinanciero(filtradas).inversiones;
  const acumulado=resumenFinanciero(inversiones).inversiones;
  const pendientes=filtradas.filter(m=>m.estado==="pendiente_revision").length;
  const mapaCategorias=new Map(categorias.map(c=>[c.id,c.nombre]));
  const mapaCuentas=new Map(cuentas.map(c=>[c.id,c.nombre]));
  const porCategoria=useMemo(()=>{
    const mapa=new Map<string,number>();
    confirmadas.forEach(m=>{
      const categoria=(m.categoria_id&&mapaCategorias.get(m.categoria_id))||"Sin categoría";
      mapa.set(categoria,(mapa.get(categoria)||0)+Number(m.monto));
    });
    return [...mapa.entries()].sort((a,b)=>b[1]-a[1]);
  },[movimientos,periodo,mes,desde,hasta,categoriaId,cuentaId,estado,buscar,categorias]);

  return <div className="investV1">
    <div className="investV1-toolbar">
      <div><h2><TrendingUp size={21}/> Tu capital invertido</h2><p>Registrá aportes a inversiones y consultá su historial sin mezclarlos con los gastos diarios.</p></div>
      <button type="button" onClick={onAgregar} className="investV1-primary"><CirclePlus size={18}/> Nueva inversión</button>
    </div>
    <div className="investV1-stats">
      <article><span>Invertido en el período</span><strong>{peso(capital)}</strong><small>Solo aportes confirmados</small></article>
      <article><span>Capital aportado histórico</span><strong>{peso(acumulado)}</strong><small>Suma de aportes, sin rentabilidad</small></article>
      <article><span>Operaciones del período</span><strong>{filtradas.length}</strong><small>{pendientes} pendientes de revisión</small></article>
    </div>
    <section className="investV1-filterbox" aria-label="Filtros de inversiones">
      <div className="investV1-filterhead"><h3><CalendarDays size={18}/> Filtrar inversiones</h3><button type="button" onClick={()=>{setPeriodo("mes");setMes(hoy().slice(0,7));setDesde(hoy());setHasta(hoy());setCategoriaId("todas");setCuentaId("todas");setEstado("todos");setBuscar("");}}>Restablecer</button></div>
      <div className="investV1-filters">
        <label>Período<select value={periodo} onChange={e=>setPeriodo(e.target.value)}><option value="mes">Mes</option><option value="rango">Rango</option><option value="todo">Todo el historial</option></select></label>
        {periodo==="mes"&&<label>Mes<input type="month" value={mes} onChange={e=>setMes(e.target.value)}/></label>}
        {periodo==="rango"&&<><label>Desde<input type="date" value={desde} onChange={e=>setDesde(e.target.value)}/></label><label>Hasta<input type="date" min={desde} value={hasta} onChange={e=>setHasta(e.target.value)}/></label></>}
        <label>Categoría<select value={categoriaId} onChange={e=>setCategoriaId(e.target.value)}><option value="todas">Todas</option>{categoriasInv.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
        <label>Billetera<select value={cuentaId} onChange={e=>setCuentaId(e.target.value)}><option value="todas">Todas</option><option value="sin_asignar">Sin asignar</option>{cuentas.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
        <label>Estado<select value={estado} onChange={e=>setEstado(e.target.value)}><option value="todos">Todos</option><option value="confirmado">Confirmados</option><option value="pendiente_revision">Pendientes</option><option value="descartado">Descartados</option></select></label>
        <label className="investV1-search">Buscar activo o plataforma<span><Search size={16}/><input type="search" value={buscar} onChange={e=>setBuscar(e.target.value)} placeholder="Nombre o descripción"/></span></label>
      </div>
    </section>
    <div className="investV1-content">
      <section className="investV1-history" aria-label="Historial de inversiones">
        <header><h3>Historial de inversiones</h3><span>{filtradas.length} {filtradas.length===1?"movimiento":"movimientos"}</span></header>
        {filtradas.length===0&&<div className="investV1-empty"><TrendingUp size={31}/><strong>Sin inversiones para estos filtros</strong><p>Podés registrar la primera desde «Nueva inversión» o cambiar los filtros.</p></div>}
        {filtradas.map(m=><article className="investV1-item" key={m.id}>
          <span className="investV1-itemicon"><TrendingUp size={22}/></span>
          <div className="investV1-itemdetails">
            <span className="investV1-itemcat">{(m.categoria_id&&mapaCategorias.get(m.categoria_id))||"Sin categoría"}</span>
            <strong>{m.destinatario||m.descripcion||"Aporte a inversión"}</strong>
            <small>{fechaLegible(m.fecha)}{m.hora?" · "+m.hora.slice(0,5):""}{m.cuenta_origen_id?" · "+(mapaCuentas.get(m.cuenta_origen_id)||"Cuenta no disponible"):" · Sin asignar"}</small>
            {m.destinatario&&m.descripcion&&<p>{m.descripcion}</p>}
            <div className="investV1-itemactions"><button type="button" disabled={busy} onClick={()=>onEditar(m)}><Pencil size={14}/> Editar</button>
              {m.estado==="pendiente_revision"&&<><button type="button" disabled={busy} onClick={()=>onCambiarEstado(m.id,"confirmado")}><Check size={14}/> Confirmar</button><button type="button" disabled={busy} onClick={()=>onCambiarEstado(m.id,"descartado")}><X size={14}/> Descartar</button></>}
            </div>
          </div>
          <div className="investV1-itemright"><strong>{peso(Number(m.monto))}</strong><span className={"investV1-status "+m.estado}>{nombreEstado(m.estado)}</span></div>
        </article>)}
      </section>
      <aside className="investV1-aside">
        <section><h3><PieChart size={19}/> Por categoría</h3>
          {porCategoria.length?porCategoria.map(([nombre,importe],i)=><div className="investV1-allocation" key={nombre}>
            <div><span><i style={{background:colores[i%colores.length]}}/>{nombre}</span><strong>{peso(importe)}</strong></div>
            <div className="investV1-progress"><span style={{width:(capital?importe/capital*100:0)+"%",background:colores[i%colores.length]}}/></div>
          </div>):<p className="investV1-muted">Las inversiones confirmadas aparecerán aquí agrupadas por categoría.</p>}
        </section>
        <section className="investV1-note"><Wallet size={21}/><h3>Cómo se calcula el balance</h3><p>Disponible = ingresos − gastos − inversiones confirmadas. Los aportes se registran por su importe, sin calcular rendimientos ni valor de mercado.</p><button type="button" onClick={onAgregar}>Registrar un aporte <ArrowRight size={16}/></button></section>
      </aside>
    </div>
  </div>;
}
