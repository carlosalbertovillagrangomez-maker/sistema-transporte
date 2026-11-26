import React, {useRef,useState} from 'react';
import {Autocomplete} from '@react-google-maps/api';
import {addDoc,collection,doc,updateDoc} from 'firebase/firestore';
import {Building2,CalendarDays,Check,ChevronLeft,FileSpreadsheet,MapPin,Maximize2,Minimize2,Plus,Save,Trash2,Users,X} from 'lucide-react';
import {db} from './firebase';
import {WEEK_DAYS,emptyWeeklySchedule,normalizeWeeklySchedule,normalizeShiftLocation,validCoords} from './triplogixCorporateSchedule.js';

const clone = obj => JSON.parse(JSON.stringify(obj));
const blankCompany=()=>({name:'',type:'Empresa',phone:'',email:'',users:[],meetingPoints:[],
  locations:[{alias:'Sede principal',address:'',lat:null,lon:null,assignedTo:'General'}]});
const blankEmployee=()=>({name:'',phone:'',email:'',role:'Empleado',address:'',lat:null,lon:null,
  whatsappOptIn:false,weeklySchedule:emptyWeeklySchedule()});
const norm=value=>String(value||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

function PlaceInput({value,onText,onChoose,placeholder}){
  const ref=useRef(null);
  // Entrada controlada por la ficha: evita desincronizar dirección y GPS.
  return <Autocomplete onLoad={v=>{ref.current=v;}} options={{fields:['formatted_address','geometry']}}
    onPlaceChanged={()=>{
      const place=ref.current?.getPlace();
      if(!place?.geometry?.location)return;
      const chosen={address:place.formatted_address||value,lat:place.geometry.location.lat(),lon:place.geometry.location.lng()};
      onChoose(chosen);
    }}>
    <input className="w-full bg-white rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
      placeholder={placeholder||'Buscar dirección exacta en Google Maps…'} value={value||''}
      onChange={e=>onText(e.target.value)} />
  </Autocomplete>;
}
const dayStyle='border rounded-lg p-2 bg-slate-50 border-slate-200';

export default function TripLogixEnterpriseWorkspace({clients=[],initial=null,onClose}){
  const [companyId,setCompanyId]=useState(initial?.id||'');
  const [company,setCompany]=useState(()=>initial?clone(initial):blankCompany());
  const [tab,setTab]=useState('empresa');
  const [busy,setBusy]=useState(false);
  const [addressIndex,setAddressIndex]=useState(null);
  const [search,setSearch]=useState('');
  const [page,setPage]=useState(0);
  const PAGE_SIZE=25;
  const [showHelp,setShowHelp]=useState(true);
  // Estado visual: no modifica la empresa, los turnos ni las celdas editadas.
  const [expanded,setExpanded]=useState(false);
  const companies=clients.filter(client=>client.type==='Empresa');
  const employees=company.users||[];
  const visibleEmployees=employees.map((user,index)=>({user,index}))
    .filter(({user})=>norm(user.name).includes(norm(search)));
  const totalPages=Math.max(1,Math.ceil(visibleEmployees.length/PAGE_SIZE));
  const currentPage=Math.min(page,totalPages-1);
  const companySites=(company.locations||[]).filter(loc=>loc.assignedTo==='General'||!loc.assignedTo);
  const meetingPoints=Array.isArray(company.meetingPoints)?company.meetingPoints:[];
  const setInfo=(key,value)=>setCompany(prev=>({...prev,[key]:value}));
  const editUser=(i,changes)=>setCompany(prev=>({...prev,users:prev.users.map((u,index)=>
    index===i?{...u,...changes}:u)}));
  const editShift=(i,day,key,value)=>{
    const current=normalizeWeeklySchedule(employees[i]?.weeklySchedule);
    editUser(i,{weeklySchedule:{...current,[day]:{...current[day],[key]:value}}});
  };
  const hasUnsavedChanges=()=>{
    const original=companyId?companies.find(x=>x.id===companyId):blankCompany();
    return JSON.stringify(company)!==JSON.stringify(original||blankCompany());
  };
  const guardedClose=()=>{
    if(hasUnsavedChanges()&&!window.confirm('Tienes cambios sin guardar. ¿Quieres salir y descartarlos?'))return;
    onClose();
  };
  const selectCompany=(id)=>{
    if(hasUnsavedChanges()&&!window.confirm('Hay cambios sin guardar. ¿Cambiar de empresa y descartarlos?'))return;
    const found=companies.find(x=>x.id===id);
    setPage(0);
    setSearch('');
    setCompanyId(id);
    setCompany(found?clone(found):blankCompany());
    setAddressIndex(null);setTab('empresa');
  };
  const editSite=(index,changes)=>setCompany(prev=>{
    const locs=[...(prev.locations||[])],general=locs.map((loc,i)=>({...loc,__index:i}))
      .filter(loc=>loc.assignedTo==='General'||!loc.assignedTo);
    const target=general[index];
    if(!target)return prev;
    locs[target.__index]={...locs[target.__index],...changes,assignedTo:'General'};
    return {...prev,locations:locs};
  });
  const addSite=()=>setCompany(prev=>({...prev,locations:[...(prev.locations||[]),
    {alias:'Otra sede',address:'',lat:null,lon:null,assignedTo:'General'}]}));
  const removeSite=index=>setCompany(prev=>{
    const locs=[...(prev.locations||[])],general=locs.map((loc,i)=>({...loc,__index:i}))
      .filter(loc=>loc.assignedTo==='General'||!loc.assignedTo);
    if(general.length<=1)return prev;
    return {...prev,locations:locs.filter((_,i)=>i!==general[index]?.__index)};
  });
  const addMeetingPoint=()=>setCompany(prev=>({...prev,meetingPoints:[
    ...(prev.meetingPoints||[]),
    {id:'meeting_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),alias:'',address:'',lat:null,lon:null}
  ]}));
  const editMeetingPoint=(id,updates)=>setCompany(prev=>({...prev,meetingPoints:
    (prev.meetingPoints||[]).map(point=>point.id===id?{...point,...updates}:point)}));
  const removeMeetingPoint=id=>{
    const used=(company.users||[]).some(u=>WEEK_DAYS.some(day=>{
      const shift=u.weeklySchedule?.[day.key]||{};
      return [shift.entradaLocation,shift.salidaLocation].some(loc=>
        loc?.type==='meeting'&&loc.meetingPointId===id);
    }));
    if(used)return alert('Este punto está asignado a empleados. Primero cambia sus turnos a Casa o a otro punto.');
    if(!window.confirm('¿Eliminar este punto del catálogo de la empresa?'))return;
    setCompany(prev=>({...prev,meetingPoints:(prev.meetingPoints||[]).filter(p=>p.id!==id)}));
  };
  const shiftPoint=(i,day,key,value)=>{
    const [type,id]=value.startsWith('meeting:')?['meeting',value.slice(8)]:['home',''];
    editShift(i,day,key,{type,meetingPointId:id});
  };
  const pointSelectValue=loc=>{
    const choice=normalizeShiftLocation(loc);
    return choice.type==='meeting'?'meeting:'+choice.meetingPointId:'home';
  };
  const pointAlias=loc=>{
    const choice=normalizeShiftLocation(loc);
    if(choice.type==='home')return 'Casa';
    return meetingPoints.find(p=>p.id===choice.meetingPointId)?.alias||'Punto no disponible';
  };
  const editHome=(index,point)=>{
    editUser(index,{address:point.address,lat:point.lat,lon:point.lon,lng:point.lon});
  };
  const save=async()=>{
    const name=String(company.name||'').trim();
    if(!name)return alert('Indica el nombre de la empresa.');
    if(companies.some(c=>c.id!==companyId&&norm(c.name)===norm(name)))
      return alert('Ya existe otra empresa con ese nombre.');
    if(!companySites.some(loc=>loc.address&&validCoords(loc)))
      return alert('Agrega al menos una sede con dirección seleccionada de Google Maps.');
    const aliases=new Set();
    for(const point of meetingPoints){
      const alias=norm(point.alias);
      if(!alias||!String(point.address||'').trim()||!validCoords(point)){
        return alert('Completa y valida con Google Maps todos los puntos intermedios, o elimina los que no utilizarás.');
      }
      if(aliases.has(alias))return alert('Hay dos puntos intermedios con el mismo nombre: '+point.alias);
      aliases.add(alias);
    }
    const availablePoints=new Set(meetingPoints.map(point=>point.id));
    const names=new Set();
    for(const user of employees){
      const person=norm(user.name);
      if(!person)return alert('Hay empleados sin nombre. Complétalos o elimina las filas vacías.');
      if(names.has(person))return alert('Hay empleados duplicados: '+user.name);
      names.add(person);
      for(const day of WEEK_DAYS){
        const shift=user.weeklySchedule?.[day.key];
        for(const choice of [shift?.entradaLocation,shift?.salidaLocation]){
          if(choice?.type==='meeting'&&!availablePoints.has(choice.meetingPointId))
            return alert('El empleado '+user.name+' tiene asignado un punto intermedio que ya no existe el '+day.name+'.');
        }
        if(shift?.active&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(shift.entrada||'')||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(shift.salida||''))){
          return alert('Corrige horarios de '+user.name+' el '+day.name+'.');
        }
      }
    }
    const oldLocations=(company.locations||[]).filter(loc=>loc.assignedTo!=='General'&&loc.assignedTo);
    const newHomes=employees.filter(u=>u.address&&validCoords(u)).map(u=>({
      alias:'Casa · '+u.name,assignedTo:u.name,address:u.address,
      lat:Number(u.lat),lon:Number(u.lon??u.lng)
    }));
    const extras=oldLocations.filter(loc=>!String(loc.alias||'').startsWith('Casa · ')&&
      employees.some(u=>norm(u.name)===norm(loc.assignedTo)));
    const payload={...company,id:undefined,type:'Empresa',name,users:employees.map(u=>({
      ...u,weeklySchedule:normalizeWeeklySchedule(u.weeklySchedule)
    })),meetingPoints:meetingPoints.map(point=>({...point,alias:String(point.alias).trim(),address:String(point.address).trim()})),locations:[...companySites.map(loc=>({...loc,assignedTo:'General'})),...newHomes,...extras],
      updatedAt:new Date().toISOString()};
    delete payload.id;
    setBusy(true);
    try{
      if(companyId)await updateDoc(doc(db,'clientes',companyId),payload);
      else await addDoc(collection(db,'clientes'),{...payload,created:new Date().toISOString()});
      alert('Empresa, sedes y turnos guardados. Ya puedes planificar sus cuadrillas.');
      onClose();
    }catch(error){console.error('No se guardó el catálogo corporativo',error);
      alert('No fue posible guardar la empresa: '+error.message);
    }finally{setBusy(false);}
  };
  const exported=()=>{
    const rows=employees.flatMap(u=>WEEK_DAYS.map(d=>{
      const shift=normalizeWeeklySchedule(u.weeklySchedule)[d.key];
      return {'Empleado':u.name,'Domicilio':u.address,'Día':d.name,'Trabaja':shift.active?'Sí':'No',
        'Entrada':shift.active?shift.entrada:'','Lugar entrada':shift.active?pointAlias(shift.entradaLocation):'',
        'Salida':shift.active?shift.salida:'','Lugar salida':shift.active?pointAlias(shift.salidaLocation):''};
    }));
    import('xlsx').then(XLSX=>{
      const workbook=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(rows),'Turnos');
      XLSX.writeFile(workbook,'TRIPLOGIX_Empleados_'+(company.name||'Empresa').replace(/[^a-z0-9_-]+/gi,'_')+'.xlsx');
    });
  };
  return <div className={'fixed inset-0 z-[10020] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center '+(expanded?'p-0':'p-0 md:p-5')}>
    <div className={'w-full bg-slate-50 shadow-2xl flex flex-col overflow-hidden '+(expanded
      ?'max-w-none h-[100dvh] rounded-none'
      :'max-w-[1560px] h-[100dvh] md:h-[94vh] rounded-none md:rounded-3xl')}>
      <header className={'bg-[#0d2336] text-white px-5 sm:px-7 flex flex-wrap gap-3 justify-between items-center shrink-0 '+(expanded?'py-3':'py-5')}>
        <div><span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">TRIPLOGIX / EMPRESAS</span>
          <h2 className="font-black text-xl sm:text-2xl mt-1">Empresa y plantilla semanal</h2>
          {!expanded&&<p className="text-xs text-slate-300 mt-1">Un solo catálogo para sedes, empleados y horarios. La planificación toma estos datos automáticamente.</p>}</div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={save} disabled={busy} className="px-4 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-black flex gap-2 items-center"><Save size={17}/>{busy?'Guardando…':'Guardar cambios'}</button>
          <button type="button" onClick={()=>setExpanded(value=>!value)}
            aria-label={expanded?'Restaurar tamaño de la ventana':'Ampliar pantalla para programar turnos'}
            aria-pressed={expanded}
            title={expanded?'Volver a la ventana normal':'Usar toda la pantalla disponible para programar'}
            className="px-3 py-3 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white text-sm font-bold flex items-center justify-center gap-2 transition">
            {expanded?<Minimize2 size={18}/>:<Maximize2 size={18}/>}
            <span className="hidden sm:inline">{expanded?'Restaurar':'Ampliar pantalla'}</span>
          </button>
          <button type="button" onClick={guardedClose} aria-label="Cerrar" className="p-3 bg-white/10 rounded-xl hover:bg-white/20"><X/></button>
        </div>
      </header>
      <div className={'px-5 sm:px-7 bg-white border-b flex flex-col lg:flex-row items-start lg:items-center gap-3 shrink-0 '+(expanded?'py-2':'py-3')}>
        <label className="flex-1 text-xs font-bold text-slate-600 w-full lg:max-w-lg">Empresa
          <select value={companyId} onChange={e=>selectCompany(e.target.value)}
            className="block mt-1 w-full px-3 py-2.5 border border-slate-200 bg-white text-sm rounded-lg font-semibold text-slate-800">
            <option value="">+ Registrar una nueva empresa</option>
            {companies.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="flex p-1 bg-slate-100 rounded-xl gap-1">
          <button type="button" onClick={()=>setTab('empresa')} className={'px-4 py-2.5 rounded-lg text-xs font-black flex items-center gap-2 '+(tab==='empresa'?'bg-slate-800 text-white':'text-slate-600')}><Building2 size={16}/> Empresa y sedes</button>
          <button type="button" onClick={()=>setTab('empleados')} className={'px-4 py-2.5 rounded-lg text-xs font-black flex items-center gap-2 '+(tab==='empleados'?'bg-slate-800 text-white':'text-slate-600')}><Users size={16}/> Empleados y turnos ({employees.length})</button>
        </div>
      </div>
      <main className={'flex-1 min-h-0 '+(expanded&&tab==='empleados'
        ?'overflow-hidden p-3 sm:p-4 flex flex-col'
        :'overflow-auto p-4 sm:p-7')}>
        {tab==='empresa'?<div className="max-w-5xl mx-auto space-y-5">
          <div className="bg-white border rounded-2xl p-5 space-y-4">
            <div><h3 className="font-black text-slate-900">Datos generales de la empresa</h3><p className="text-sm text-slate-500">Estos datos identifican al cliente en toda la operación.</p></div>
            <div className="grid md:grid-cols-2 gap-4">
              <label className="text-xs font-bold text-slate-700">Nombre / razón social *
                <input className="block mt-1 w-full rounded-xl border p-3 text-sm" value={company.name||''} onChange={e=>setInfo('name',e.target.value)} placeholder="Empresa…" />
              </label>
              <label className="text-xs font-bold text-slate-700">Teléfono de contacto
                <input className="block mt-1 w-full rounded-xl border p-3 text-sm" value={company.phone||''} onChange={e=>setInfo('phone',e.target.value)} />
              </label>
              <label className="text-xs font-bold text-slate-700">Correo de contacto
                <input className="block mt-1 w-full rounded-xl border p-3 text-sm" value={company.email||''} onChange={e=>setInfo('email',e.target.value)} />
              </label>
            </div>
          </div>
          <div className="bg-white border rounded-2xl p-5 space-y-4">
            <div className="flex justify-between items-start gap-3 flex-wrap"><div><h3 className="font-black text-slate-900 flex gap-2 items-center"><MapPin size={19} className="text-orange-500"/> Sedes y ubicaciones de la empresa</h3>
              <p className="text-sm text-slate-500">La primera sede es el punto de destino para entradas y origen para salidas. Se pueden registrar otras sedes.</p></div>
              <button type="button" onClick={addSite} className="text-xs font-black text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-4 py-2 flex items-center gap-2"><Plus size={15}/> Agregar sede</button></div>
            {companySites.map((site,index)=><div key={index} className="bg-slate-50 border rounded-xl p-4 space-y-2">
              <div className="flex gap-2 items-end"><label className="flex-1 text-xs font-bold text-slate-700">{index===0?'Sede principal':'Sede '+(index+1)}
                  <input value={site.alias||''} onChange={e=>editSite(index,{alias:e.target.value})} className="mt-1 block w-full border rounded-lg p-2 text-sm bg-white" placeholder="Alias de sede"/></label>
                {index!==0&&<button type="button" aria-label="Eliminar sede" onClick={()=>removeSite(index)} className="p-2.5 rounded-lg text-red-600 bg-white border"><Trash2 size={16}/></button>}</div>
              <PlaceInput value={site.address||''} placeholder="Buscar la sede en Google Maps" onText={address=>editSite(index,{address,lat:null,lon:null})}
                onChoose={chosen=>editSite(index,chosen)} />
              <p className={'text-[11px] '+(validCoords(site)?'text-emerald-700':'text-amber-700')}>{validCoords(site)?'✓ Ubicación validada con Google Maps':'Selecciona una sugerencia de Google Maps para validar esta ubicación'}</p>
            </div>)}
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex justify-between items-start gap-3 flex-wrap">
              <div>
                <h3 className="font-black text-slate-900 flex gap-2 items-center"><MapPin size={19} className="text-orange-500"/> Puntos intermedios de recogida y entrega</h3>
                <p className="text-sm text-slate-500 mt-1">Registra una sola vez lugares como Plaza Vallarta, una recaudación o un supermercado. Estos puntos se podrán elegir por empleado, día, entrada y salida.</p>
              </div>
              <button type="button" onClick={addMeetingPoint} className="px-4 py-2 rounded-lg text-xs font-black bg-orange-50 text-orange-700 border border-orange-200 flex gap-2 items-center"><Plus size={15}/> Nuevo punto intermedio</button>
            </div>
            {meetingPoints.length===0&&<div className="p-4 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500">
              Aún no hay puntos intermedios. Presiona «Nuevo punto intermedio», asígnale un nombre y selecciona su dirección exacta en Google Maps.
            </div>}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {meetingPoints.map((point,index)=><div key={point.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex gap-2 items-end">
                  <label className="flex-1 text-xs font-bold text-slate-700">Nombre del punto {index+1}
                    <input className="block mt-1 w-full bg-white p-2.5 border border-slate-300 rounded-lg text-sm" value={point.alias||''}
                      onChange={e=>editMeetingPoint(point.id,{alias:e.target.value})} placeholder="Ej. Plaza Vallarta"/>
                  </label>
                  <button type="button" aria-label={'Eliminar punto '+(point.alias||index+1)} onClick={()=>removeMeetingPoint(point.id)}
                    className="p-2.5 bg-white border rounded-lg text-red-600 hover:bg-red-50"><Trash2 size={17}/></button>
                </div>
                <PlaceInput value={point.address||''} placeholder="Ubica el punto en Google Maps"
                  onText={address=>editMeetingPoint(point.id,{address,lat:null,lon:null,lng:null})}
                  onChoose={chosen=>editMeetingPoint(point.id,chosen)}/>
                <p className={'text-[11px] font-semibold '+(validCoords(point)?'text-emerald-700':'text-amber-700')}>
                  {validCoords(point)?'✓ Punto ubicado y listo para los turnos':'Selecciona la sugerencia de Maps; no basta con escribir el nombre'}
                </p>
              </div>)}
            </div>
          </div>
          <button type="button" onClick={()=>setTab('empleados')} className="rounded-xl bg-slate-800 text-white px-5 py-3 text-sm font-black flex items-center gap-2">Continuar: empleados y turnos <ChevronLeft size={16} className="rotate-180"/></button>
        </div>:<div className={expanded?'flex-1 min-h-0 flex flex-col gap-3':'space-y-4'}>
          <div className={'bg-white border rounded-2xl flex flex-wrap justify-between gap-3 items-center '+(expanded?'p-2.5 sm:p-3':'p-4 sm:p-5')}>
            <div><h3 className="font-black text-slate-900">Plantilla maestra de empleados</h3>
              {!expanded&&<p className="text-sm text-slate-500 mt-1">Marca los días que trabaja cada persona y define entrada y salida. No es necesario volver a cargar una hoja semanal.</p>}</div>
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={exported} disabled={!employees.length} className="border rounded-xl bg-white px-3 py-2.5 text-xs font-black text-slate-700 flex gap-2 items-center"><FileSpreadsheet size={16}/> Exportar Excel</button>
              <button type="button" onClick={()=>{setPage(Math.floor(employees.length/PAGE_SIZE));setSearch('');setCompany(prev=>({...prev,users:[...(prev.users||[]),blankEmployee()]}));}} className="bg-orange-500 text-white rounded-xl px-4 py-3 text-xs font-black flex gap-2 items-center"><Plus size={16}/> Agregar empleado</button>
            </div>
          </div>
          {showHelp&&!expanded&&<div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 flex gap-3 justify-between">
            <span><b>Uso rápido:</b> marca cada día laboral, define hora de entrada/salida y elige el lugar para cada trayecto: <b>Casa</b> o un punto intermedio guardado en Empresa y sedes. El domicilio personal no se modifica. Sin día marcado no se generan viajes.</span>
            <button type="button" onClick={()=>setShowHelp(false)}><X size={14}/></button></div>}
          {!expanded&&<div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap gap-2 justify-between items-center">
            <p className="text-xs text-slate-600"><b>{meetingPoints.length} puntos intermedios</b> registrados. Cada empleado puede tener un lugar diferente para entrada y salida, cualquier día.</p>
            <button type="button" onClick={()=>setTab('empresa')} className="text-xs font-black px-3 py-2 rounded-lg bg-orange-50 text-orange-700 border border-orange-200">Administrar puntos y sedes</button>
          </div>}
          <div className="flex gap-2 items-center"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}
            className="border border-slate-200 rounded-lg bg-white px-4 py-2.5 text-sm w-full max-w-md" placeholder="Buscar empleado…"/>
            <span className="text-xs text-slate-500">{employees.length} registrados</span></div>
          <div className={expanded
            ?'flex-1 min-h-0 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm'
            :'overflow-x-auto overflow-y-auto max-h-[58vh] rounded-2xl border border-slate-200 bg-white shadow-sm'}>
            <table className="text-xs border-collapse w-full min-w-[2250px]">
              <thead className="sticky top-0 z-20 bg-[#0d2336] text-white">
                <tr><th className="sticky left-0 z-30 bg-[#0d2336] p-3 text-left min-w-[170px] border-r border-white/10">Empleado</th>
                  <th className="p-3 min-w-[235px] text-left">Domicilio</th>
                  <th className="p-3 text-left min-w-[125px]">Teléfono</th>
                  {WEEK_DAYS.map(day=><th key={day.key} className="text-center p-3 border-l border-white/10 min-w-[240px]">{day.name}</th>)}
                  <th className="w-12 p-2"> </th></tr>
              </thead>
              <tbody>
              {visibleEmployees.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE)
                .map(({user,index})=><tr key={index} className={index%2?'bg-slate-50':'bg-white'}>
                  <td className="sticky left-0 z-10 bg-inherit p-2 border-r border-b border-slate-200">
                    <input aria-label={'Nombre empleado '+(index+1)} value={user.name||''} onChange={e=>editUser(index,{name:e.target.value})}
                      className="p-2 rounded-lg border w-full bg-white font-semibold" placeholder="Nombre completo"/></td>
                  <td className="border-b p-2 align-top">
                    <button type="button" onClick={()=>setAddressIndex(index)} className={'w-full text-left border rounded-lg px-3 py-2 min-h-10 '+(validCoords(user)?'bg-emerald-50 text-emerald-800 border-emerald-200':'bg-amber-50 text-amber-800 border-amber-200')}>
                      {user.address||'Seleccionar domicilio'} <MapPin className="inline w-3 h-3 ml-1"/></button></td>
                  <td className="border-b p-2"><input value={user.phone||''} onChange={e=>editUser(index,{phone:e.target.value})} className="p-2 rounded-lg border w-full bg-white" placeholder="Opcional"/></td>
                  {WEEK_DAYS.map(day=>{
                    const shift=normalizeWeeklySchedule(user.weeklySchedule)[day.key];
                    return <td key={day.key} className="border-b border-l p-2">
                      <div className={dayStyle}>
                        <label className="flex gap-2 items-center justify-center text-[11px] font-bold">
                          <input type="checkbox" checked={shift.active} onChange={e=>editShift(index,day.key,'active',e.target.checked)}/>
                          {shift.active?'Trabaja':'Descansa'}</label>
                        <div className="grid grid-cols-2 gap-1 mt-2">
                          <label className="text-[9px] text-slate-500">Entrada
                            <input aria-label={day.name+' entrada de '+user.name} type="time" disabled={!shift.active} value={shift.entrada}
                              onChange={e=>editShift(index,day.key,'entrada',e.target.value)} className="w-full rounded border text-[10px] p-1 bg-white disabled:opacity-40"/></label>
                          <label className="text-[9px] text-slate-500">Salida
                            <input aria-label={day.name+' salida de '+user.name} type="time" disabled={!shift.active} value={shift.salida}
                              onChange={e=>editShift(index,day.key,'salida',e.target.value)} className="w-full rounded border text-[10px] p-1 bg-white disabled:opacity-40"/></label>
                        </div>
                        <div className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
                          <label className="block text-[10px] text-slate-600 font-semibold">Entrada: recoger en
                            <select aria-label={day.name+' lugar de entrada de '+user.name}
                              disabled={!shift.active} value={pointSelectValue(shift.entradaLocation)}
                              onChange={e=>shiftPoint(index,day.key,'entradaLocation',e.target.value)}
                              className="block mt-0.5 w-full bg-white border rounded-md px-1.5 py-1.5 text-[11px] disabled:opacity-40">
                              <option value="home">Casa (domicilio)</option>
                              {shift.entradaLocation?.type==='meeting'&&!meetingPoints.some(point=>point.id===shift.entradaLocation.meetingPointId)&&
                                <option value={'meeting:'+shift.entradaLocation.meetingPointId} disabled>⚠ Punto eliminado</option>}
                              {meetingPoints.map(point=><option key={point.id} value={'meeting:'+point.id}>📍 {point.alias||'Punto sin nombre'}</option>)}
                            </select>
                          </label>
                          <label className="block text-[10px] text-slate-600 font-semibold">Salida: dejar en
                            <select aria-label={day.name+' lugar de salida de '+user.name}
                              disabled={!shift.active} value={pointSelectValue(shift.salidaLocation)}
                              onChange={e=>shiftPoint(index,day.key,'salidaLocation',e.target.value)}
                              className="block mt-0.5 w-full bg-white border rounded-md px-1.5 py-1.5 text-[11px] disabled:opacity-40">
                              <option value="home">Casa (domicilio)</option>
                              {shift.salidaLocation?.type==='meeting'&&!meetingPoints.some(point=>point.id===shift.salidaLocation.meetingPointId)&&
                                <option value={'meeting:'+shift.salidaLocation.meetingPointId} disabled>⚠ Punto eliminado</option>}
                              {meetingPoints.map(point=><option key={point.id} value={'meeting:'+point.id}>📍 {point.alias||'Punto sin nombre'}</option>)}
                            </select>
                          </label>
                        </div>
                      </div>
                    </td>;
                  })}
                  <td className="p-2 border-b"><button type="button" aria-label={'Eliminar '+user.name} onClick={()=>{
                    if(!window.confirm('¿Quitar a este empleado del catálogo?'))return;
                    setCompany(prev=>({...prev,users:prev.users.filter((_,i)=>i!==index)}));
                  }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={15}/></button></td>
                </tr>)}
              </tbody>
            </table>
            {!employees.length&&<p className="p-10 text-sm text-slate-500 text-center">Agrega al primer empleado para comenzar a construir la plantilla.</p>}
          </div>
          {visibleEmployees.length>PAGE_SIZE&&<div className="flex items-center justify-end gap-3 text-xs font-bold text-slate-600">
            <button disabled={currentPage===0} onClick={()=>setPage(Math.max(0,currentPage-1))} className="border rounded-lg px-3 py-2 bg-white disabled:opacity-40">← Anterior</button>
            Página {currentPage+1} de {totalPages} · {visibleEmployees.length} empleados
            <button disabled={currentPage>=totalPages-1} onClick={()=>setPage(Math.min(totalPages-1,currentPage+1))} className="border rounded-lg px-3 py-2 bg-white disabled:opacity-40">Siguiente →</button>
          </div>}
          <div className="flex justify-between flex-wrap gap-3 items-center text-xs text-slate-500">
            {!expanded&&<p>✓ Los cambios se guardan en la empresa al presionar «Guardar cambios». No se crean viajes hasta confirmarlos en Planeación.</p>}
            <button type="button" onClick={save} disabled={busy} className="bg-slate-800 text-white font-black rounded-xl px-5 py-3 flex gap-2 items-center"><Check size={17}/>{busy?'Guardando…':'Guardar plantilla semanal'}</button></div>
        </div>}
      </main>
      {addressIndex!==null&&employees[addressIndex]&&<div className="fixed inset-0 z-[10030] bg-slate-950/60 flex items-center justify-center p-3">
        <div className="bg-white w-full max-w-xl rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex justify-between items-center gap-3"><div><p className="text-xs font-black uppercase text-orange-600">Domicilio de empleado</p>
            <h3 className="font-black text-xl text-slate-800">{employees[addressIndex]?.name||'Nuevo empleado'}</h3></div>
            <button type="button" onClick={()=>setAddressIndex(null)} className="p-2 bg-slate-100 rounded-lg"><X size={18}/></button></div>
          <p className="text-xs text-slate-500">Escribe la dirección y selecciona una sugerencia de Google Maps. No se aceptarán coordenadas inventadas para planificar rutas.</p>
          <PlaceInput value={employees[addressIndex].address||''} onText={address=>editUser(addressIndex,{address,lat:null,lon:null,lng:null})}
            onChoose={loc=>editHome(addressIndex,loc)}/>
          <p className={'text-xs '+(validCoords(employees[addressIndex])?'text-green-700':'text-amber-700')}>
            {validCoords(employees[addressIndex])?'✓ Domicilio validado':'Ubicación pendiente de validar'}</p>
          <div className="flex flex-wrap gap-2">
            {(company.locations||[]).filter(l=>validCoords(l)&&l.assignedTo===employees[addressIndex]?.name).map((loc,i)=>
              <button type="button" key={i} onClick={()=>editHome(addressIndex,loc)} className="px-3 py-2 rounded-lg bg-slate-100 text-xs text-slate-700 font-bold">★ {loc.alias||loc.address}</button>)}
          </div>
          <button type="button" onClick={()=>setAddressIndex(null)} className="w-full py-3 rounded-xl bg-slate-800 text-white font-black text-sm">Volver a la tabla</button>
        </div>
      </div>}
    </div>
  </div>;
}
