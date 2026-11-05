import { DatabaseBackup, Download, LockKeyhole, Settings2, ShieldCheck } from "lucide-react";
import GestionCategorias from "./GestionCategorias";
import GestionCuentas from "./GestionCuentas";
import type { Categoria, Cuenta, Movimiento } from "../types";

type Props={userId:string;email:string;categorias:Categoria[];cuentas:Cuenta[];movimientos:Movimiento[];cuentasDisponibles:boolean;onReload:()=>Promise<void>;onError:(v:string)=>void;onNotice:(v:string)=>void;onExportar:()=>void};

export default function AjustesPanel({userId,email,categorias,cuentas,movimientos,cuentasDisponibles,onReload,onError,onNotice,onExportar}:Props){
  return <div className="settingsV2">
    <div className="settingsV2-intro"><span><Settings2 size={20}/></span><div><h2>Personalizá MERCA</h2><p>Administrá tus categorías y consultá los datos de tu cuenta.</p></div></div>
    <GestionCategorias userId={userId} categorias={categorias} onReload={onReload} onError={onError} onNotice={onNotice}/>
    <GestionCuentas userId={userId} cuentas={cuentas} movimientos={movimientos} disponible={cuentasDisponibles} onReload={onReload} onError={onError} onNotice={onNotice}/>
    <section className="settingsV2-panel" aria-labelledby="ajustes-respaldo">
      <header className="settingsV2-panel-header"><span className="settingsV2-panel-icon"><DatabaseBackup size={21}/></span><div><h2 id="ajustes-respaldo">Respaldo y exportación</h2><p>Descargá los movimientos consultados en CSV</p></div></header>
      <div className="settingsV2-backup-body"><div><p>Exportá fechas, importes, categorías, destinatarios y estados en un archivo compatible con Excel.</p><small>La exportación incluye el historial recuperado de movimientos, incluidas las billeteras asociadas. No sustituye un respaldo integral de Supabase.</small></div><button type="button" className="settingsV2-export" onClick={onExportar}><Download size={18}/> Exportar CSV</button></div>
    </section>
    <section className="settingsV2-panel" aria-labelledby="ajustes-seguridad">
      <header className="settingsV2-panel-header"><span className="settingsV2-panel-icon"><ShieldCheck size={21}/></span><div><h2 id="ajustes-seguridad">Sesión y privacidad</h2><p>Tu información personal permanece en Supabase</p></div></header>
      <div className="settingsV2-session"><LockKeyhole size={18}/><div><small>Sesión iniciada</small><strong>{email}</strong></div></div>
      <p className="settingsV2-footnote">MERCA guarda movimientos estructurados. No almacena imágenes ni archivos de comprobantes en el historial.</p>
    </section>
  </div>;
}
