import React,{useState} from 'react';
import * as XLSX from 'xlsx';
import {Building2,CalendarDays,ChevronRight,FileSpreadsheet,MapPin,Route,X} from 'lucide-react';
import {corporateGroupsForDay,corporateSpreadsheetRows,dailyCorporateRoster,generalSites,validCoords} from './triplogixCorporateSchedule.js';

const todayLocal=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const label='block text-[11px] font-black uppercase tracking-wide text-slate-500 mb-2';

export default function TripLogixCorporatePlanner({companies=[],onGenerate,onClose}){
  const [companyId,setCompanyId]=useState('');
  const [date,setDate]=useState(todayLocal);
  const [mode,setMode]=useState('Ida');
  const [siteIndex,setSiteIndex]=useState(0);
  const [excel,setExcel]=useState(false);
  const [fuelEfficiency,setFuelEfficiency]=useState('');
  const [fuelPrice,setFuelPrice]=useState('');
  const enterprise=companies.filter(c=>c.type==='Empresa');
  const company=enterprise.find(c=>c.id===companyId);
  const sites=generalSites(company);
  const office=sites[siteIndex]||sites[0];
  const program=dailyCorporateRoster(company,date,mode);
  const groups=validCoords(office)?corporateGroupsForDay(program.participants,office,{mode}):[];
  const scheduledCount=program.participants.length+program.missing.length;
  const table=corporateSpreadsheetRows(groups,mode);
  const exportExcel=()=>{
    if(!table.length)return;
    const book=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(table),mode==='Ida'?'Entradas':'Salidas');
    XLSX.writeFile(book,'TripLogix_Planeacion_'+(mode==='Ida'?'Entradas':'Salidas')+'_'+date+'.xlsx');
  };
  const generate=()=>{
    if(!company)return alert('Selecciona una empresa.');
    if(!date||!program.day)return alert('Selecciona una fecha válida.');
    if(!office||!validCoords(office))return alert('La empresa necesita una sede con ubicación de Google Maps verificada.');
    if(program.missing.length)return alert('Corrige primero estos domicilios u horarios en Empresas y turnos: '+
      program.missing.slice(0,10).map(p=>p.name+' ('+p.reason+')').join(', ')+
      (program.missing.length>10?' y '+(program.missing.length-10)+' más':'')+'.');
    if(!groups.length)return alert('No hay empleados con turno marcado para esta fecha. Revisa la plantilla semanal.');
    const selected={...company,locations:[office,...(company.locations||[]).filter(l=>l!==office)]};
    onGenerate({client:selected,date,mode,groups,fuelEfficiency,fuelPrice});
  };
  return <div className="fixed inset-0 z-[10010] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-0 sm:p-4">
    <div className="w-full max-w-7xl h-[100dvh] sm:h-[94vh] bg-slate-50 shadow-2xl rounded-none sm:rounded-3xl overflow-hidden flex flex-col">
      <header className="bg-[#0d2336] text-white p-5 sm:px-7 flex flex-wrap justify-between items-center gap-3 shrink-0">
        <div><span className="text-orange-400 text-[10px] font-black uppercase tracking-[0.2em]">TRIPLOGIX / OPERACIÓN CORPORATIVA</span>
          <h2 className="font-black text-xl sm:text-2xl mt-1">Planeación automática de personal</h2>
          <p className="text-slate-300 text-xs mt-1">Selecciona la empresa y la fecha. Las cuadrillas se proponen automáticamente a partir de los turnos guardados.</p>
        </div><button onClick={onClose} aria-label="Cerrar" className="rounded-xl p-3 bg-white/10 hover:bg-white/20"><X/></button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-5 space-y-4">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5 grid gap-4 grid-cols-1 md:grid-cols-3">
          <div><label className={label}><Building2 className="w-4 h-4 inline mr-1"/> Empresa</label>
            <select value={companyId} onChange={e=>{setCompanyId(e.target.value);setSiteIndex(0);}} className="w-full bg-white border rounded-xl p-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-200">
              <option value="">Seleccionar empresa…</option>
              {enterprise.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div><label className={label}><CalendarDays className="w-4 h-4 inline mr-1"/> Día de servicio</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full border rounded-xl p-3 text-sm font-bold text-slate-800"/></div>
          <div><label className={label}><MapPin className="w-4 h-4 inline mr-1"/> Sede / destino corporativo</label>
            <select value={siteIndex} onChange={e=>setSiteIndex(Number(e.target.value))} className="w-full border rounded-xl p-3 text-sm font-bold text-slate-800">
              {sites.length?sites.map((s,i)=><option key={i} value={i}>{s.alias||'Sede '+(i+1)} · {s.address}</option>):
                <option>Primero registra la sede de la empresa</option>}
            </select></div>
        </div>
        <div className="bg-white border rounded-2xl p-4 flex flex-wrap justify-between items-center gap-3">
          <div className="flex p-1 rounded-xl bg-slate-100 gap-1">
            <button type="button" onClick={()=>setMode('Ida')}
              className={'text-xs font-black rounded-lg py-3 px-5 '+(mode==='Ida'?'bg-orange-500 text-white shadow':'text-slate-600 hover:bg-white')}>
              ENTRADAS · Casa → Empresa
            </button>
            <button type="button" onClick={()=>setMode('Regreso')}
              className={'text-xs font-black rounded-lg py-3 px-5 '+(mode==='Regreso'?'bg-slate-800 text-white shadow':'text-slate-600 hover:bg-white')}>
              SALIDAS · Empresa → Casa
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={()=>setExcel(x=>!x)} className={'flex gap-2 items-center px-3 py-2.5 border rounded-xl text-xs font-black '+(excel?'bg-orange-50 border-orange-300 text-orange-700':'text-slate-700 bg-white')}>
              <FileSpreadsheet size={16}/>{excel?'Ver cuadrillas':'Vista tipo Excel'}
            </button>
            <button onClick={exportExcel} disabled={!table.length} className="flex gap-2 items-center px-3 py-2.5 border rounded-xl text-xs font-black text-slate-700 disabled:opacity-40">
              <FileSpreadsheet size={16}/> Descargar Excel
            </button>
          </div>
        </div>
        {!company?<div className="min-h-[270px] flex flex-col gap-3 items-center justify-center bg-white border-2 border-dashed border-slate-200 rounded-2xl text-slate-500 text-center p-6">
            <Building2 size={37} className="text-orange-400"/>
            <p className="font-black text-slate-800 text-lg">Empieza seleccionando una empresa</p>
            <p className="text-sm max-w-md">Aquí se mostrarán las entradas y salidas registradas en su plantilla semanal, sin importar archivos.</p>
          </div>:<>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {number:scheduledCount,title:'Personas del turno',detail:program.day?.name||''},
              {number:program.participants.length,title:'Domicilios válidos',detail:'Listos para agrupar'},
              {number:groups.length,title:'Cuadrillas propuestas',detail:'Máximo 4 por unidad'},
              {number:program.missing.length,title:'Por corregir',detail:'Sin omisiones silenciosas'}
            ].map(k=><div key={k.title} className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-2xl sm:text-3xl font-black text-slate-900">{k.number}</p>
              <p className="text-xs font-black text-slate-800 mt-1">{k.title}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{k.detail}</p>
            </div>)}
          </div>
          {!!program.missing.length&&<div className="border border-amber-200 bg-amber-50 text-amber-900 rounded-xl p-4 text-xs">
            <b>Empleados que requieren corrección en «Empresa y turnos»:</b>
            <p className="mt-1">{program.missing.map(p=>p.name+' ('+p.reason+')').join(' · ')}</p>
            <p className="mt-2 font-bold">Por seguridad, no se despacharán rutas con direcciones desconocidas.</p>
          </div>}
          {!scheduledCount&&<div className="p-6 border border-dashed rounded-xl text-slate-500 text-sm bg-white">
            No hay personas con el día {program.day?.name||''} marcado en la plantilla de esta empresa. Edita sus turnos desde «Empresas y clientes».</div>}
          {excel?<div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-[920px] w-full text-xs border-collapse">
              <thead className="bg-[#0d2336] text-white"><tr>{['Unidad','Sentido','Hora oficial','Conductor','Pasajero','Nombre','Domicilio','Km reales'].map(col=><th key={col} className="p-3 text-left border-r border-white/10">{col}</th>)}</tr></thead>
              <tbody>{table.map((r,i)=><tr key={i} className={i%2?'bg-slate-50':'bg-white'}>
                {[r.Unidad,r.Sentido,r.HoraOficial,r.Conductor,r.Pasajero,r.Nombre,r.Domicilio,'Pendiente Google Maps'].map((val,j)=><td key={j} className="p-3 border-r border-b border-slate-100">{val}</td>)}
              </tr>)}</tbody>
            </table>
            {!table.length&&<p className="p-6 text-center text-sm text-slate-500">No hay filas programadas.</p>}
          </div>:<div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {groups.map((group,i)=><div key={group.id} className="bg-white border rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-[#0d2336] text-white p-4 flex justify-between items-center">
                <span className="text-sm font-black">Cuadrilla {i+1}</span><span className="text-xs bg-white/10 rounded-lg px-2 py-1">{group.employees.length}/4</span>
              </div>
              <div className="p-4"><p className="text-[11px] text-orange-700 font-black uppercase">{mode==='Ida'?'Entrada a las':'Salida a las'} {group.timeKey}</p>
                <div className="mt-3 space-y-2">{group.employees.map((emp,j)=><div key={j} className="flex gap-2 text-xs">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-50 text-orange-700 text-center leading-5 font-black">{j+1}</span>
                  <div className="min-w-0"><p className="font-bold text-slate-800">{emp.assignedTo}</p>
                    <p className="text-slate-500 truncate" title={emp.address}>{emp.address}</p></div>
                </div>)}</div>
                <p className="mt-4 text-[11px] bg-slate-50 text-slate-600 p-2 rounded-lg">Orden y kilómetros reales se confirmarán con Google Maps antes de asignar chofer.</p>
              </div>
            </div>)}
          </div>}
        </>}
      </div>
      <footer className="bg-white border-t px-5 sm:px-7 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-[11px] text-slate-600 font-bold">Estimación de combustible (opcional):</p>
          <label className="text-[10px] text-slate-500">Rendimiento km/L
            <input type="number" min="0.1" step="0.1" value={fuelEfficiency} onChange={e=>setFuelEfficiency(e.target.value)} placeholder="ej. 10" className="ml-1 border rounded-lg px-2 py-2 w-20 text-xs"/></label>
          <label className="text-[10px] text-slate-500">Precio por litro
            <input type="number" min="0.1" step="0.01" value={fuelPrice} onChange={e=>setFuelPrice(e.target.value)} placeholder="Moneda local" className="ml-1 border rounded-lg px-2 py-2 w-20 text-xs"/></label>
        </div>
        <button type="button" disabled={!groups.length||program.missing.length>0||!validCoords(office)}
          onClick={generate} className="flex items-center justify-center gap-2 px-6 py-3.5 bg-orange-500 rounded-xl text-white text-sm font-black shadow-lg hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none">
          <Route size={19}/> Calcular rutas y asignar conductores <ChevronRight size={17}/>
        </button>
      </footer>
    </div>
  </div>;
}
