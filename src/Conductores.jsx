import React, { useState, useEffect } from 'react';
import { 
  Phone, Truck, Plus, X, User, FileText, MapPin, Save, Mail, 
  Trash2, Loader2, ShieldCheck, Clock, Eye, Lock, Heart, ShieldAlert 
} from 'lucide-react';

// FIREBASE
import { db } from './firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy, updateDoc } from 'firebase/firestore';

export default function Conductores() {
  const [showNewDriverModal, setShowNewDriverModal] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('Todos');
  const [viewDoc, setViewDoc] = useState(null);

  // === ESTADO MAESTRO CON TODOS LOS CAMPOS ===
  const [newDriver, setNewDriver] = useState({
    name: '', rfc: '', phone: '', email: '', password: '', address: '',
    licenseNumber: '', licenseType: 'Federal Tipo B', licenseExp: '', bloodType: 'O+',
    emergencyContact: '', vehicleModel: '', vehiclePlate: '', vehicleType: 'Caja Seca',
    fotoPerfil: '', identificacion: ''
  });

  const [driversList, setDriversList] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "conductores"), orderBy("created", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDriversList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      await updateDoc(doc(db, "conductores", id), { status: newStatus });
    } catch (error) { alert("Error: " + error.message); }
  };

  const handleSaveDriver = async () => {
    if (!newDriver.name || !newDriver.phone || !newDriver.email || !newDriver.password) {
        return alert("Campos obligatorios faltantes (Nombre, Teléfono, Email, Contraseña)");
    }
    
    const vehiculoFinal = (newDriver.vehicleModel && newDriver.vehiclePlate) 
        ? `${newDriver.vehicleModel} (${newDriver.vehiclePlate})` 
        : 'Sin Asignar';

    const nuevoConductor = {
        ...newDriver,
        email: newDriver.email.trim().toLowerCase(),
        initials: newDriver.name.substring(0, 2).toUpperCase(),
        status: 'Pendiente',
        vehicle: vehiculoFinal,
        rating: 5, trips: 0,
        joined: new Date().toLocaleDateString(),
        created: new Date().toISOString()
    };

    try {
        await addDoc(collection(db, "conductores"), nuevoConductor);
        setShowNewDriverModal(false);
        // Resetear todos los campos
        setNewDriver({
            name: '', rfc: '', phone: '', email: '', password: '', address: '',
            licenseNumber: '', licenseType: 'Federal Tipo B', licenseExp: '', bloodType: 'O+',
            emergencyContact: '', vehicleModel: '', vehiclePlate: '', vehicleType: 'Caja Seca',
            fotoPerfil: '', identificacion: ''
        });
    } catch (error) { alert("Error: " + error.message); }
  };

  const handleDelete = async (id) => {
    if(confirm("¿Eliminar expediente permanentemente?")) {
        await deleteDoc(doc(db, "conductores", id));
        setSelectedDriver(null);
    }
  };

  const filteredList = driversList.filter(d => filterStatus === 'Todos' || d.status === filterStatus);

  return (
    <div className="flex-1 p-8 bg-slate-50 overflow-y-auto h-full relative font-sans">
      
      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <div>
            <h2 className="text-3xl font-black text-slate-800 tracking-tight">Control de Operadores</h2>
            <p className="text-slate-500 text-sm">Base de datos centralizada de flota</p>
        </div>
        <div className="flex gap-3">
            <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                {['Todos', 'Pendiente', 'Aprobado'].map((s) => (
                    <button key={s} onClick={() => setFilterStatus(s)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${filterStatus === s ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>{s}</button>
                ))}
            </div>
            <button onClick={() => setShowNewDriverModal(true)} className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-lg shadow-blue-200">
                <Plus className="w-4 h-4" /> Nuevo Conductor
            </button>
        </div>
      </div>

      {loading && <div className="flex justify-center h-64 items-center gap-2 text-slate-400"><Loader2 className="animate-spin"/> Sincronizando...</div>}

      {/* GRID DE TARJETAS */}
      {!loading && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredList.map((driver) => (
            <div key={driver.id} className={`bg-white rounded-2xl p-6 border-2 transition-all group relative ${driver.status === 'Pendiente' ? 'border-orange-100' : 'border-transparent shadow-sm hover:shadow-md'}`}>
                <div className="flex justify-between items-start mb-4">
                    <div className="relative">
                        {driver.fotoPerfil ? (
                            <img src={driver.fotoPerfil} className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-100 shadow-sm" />
                        ) : (
                            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center font-bold text-xl text-slate-400 border border-slate-200 uppercase">{driver.initials}</div>
                        )}
                        <div className={`absolute -bottom-1 -right-1 p-1 rounded-full border-2 border-white shadow-sm ${driver.status === 'Aprobado' ? 'bg-green-500' : 'bg-orange-500'}`}>
                            {driver.status === 'Aprobado' ? <ShieldCheck className="w-3 h-3 text-white"/> : <Clock className="w-3 h-3 text-white"/>}
                        </div>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className={`text-[10px] px-2 py-1 rounded-lg font-black uppercase tracking-widest mb-2 ${driver.status === 'Aprobado' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{driver.status}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                            <button onClick={() => setViewDoc(driver.identificacion)} className="p-1.5 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-lg border border-slate-100"><Eye className="w-4 h-4"/></button>
                            <button onClick={() => handleDelete(driver.id)} className="p-1.5 bg-slate-50 text-slate-400 hover:text-red-600 rounded-lg border border-slate-100"><Trash2 className="w-4 h-4"/></button>
                        </div>
                    </div>
                </div>
                <div>
                    <h3 className="text-lg font-black text-slate-800 mb-1">{driver.name}</h3>
                    <div className="space-y-1.5 text-xs text-slate-500 mb-6">
                        <div className="flex items-center gap-2"><Truck className="w-3.5 h-3.5" /> <span className="font-medium text-slate-700">{driver.vehicle}</span></div>
                        <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> <span>{driver.email}</span></div>
                    </div>
                </div>
                <div className="pt-4 border-t border-slate-50 flex gap-2">
                    {driver.status === 'Pendiente' ? (
                        <button onClick={() => handleUpdateStatus(driver.id, 'Aprobado')} className="w-full py-2.5 bg-green-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-600 transition">Aprobar Acceso</button>
                    ) : (
                        <button onClick={() => setSelectedDriver(driver)} className="flex-1 py-2.5 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 transition shadow-lg shadow-slate-200">Ver Expediente</button>
                    )}
                </div>
            </div>
        ))}
      </div>
      )}

      {/* ================= MODAL DE REGISTRO COMPLETO ================= */}
      {showNewDriverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                <div className="px-8 py-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-black text-slate-800">Alta de Conductor Seguro</h3>
                        <p className="text-xs text-slate-500">Credenciales de acceso y datos de identidad.</p>
                    </div>
                    <button onClick={() => setShowNewDriverModal(false)} className="bg-white p-2 rounded-full border border-slate-200 text-slate-400 hover:text-red-500 transition shadow-sm"><X className="w-5 h-5" /></button>
                </div>
                
                <div className="p-8 overflow-y-auto">
                    {/* ACCESO */}
                    <div className="mb-8">
                        <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <Lock className="w-4 h-4" /> Credenciales de Aplicación
                        </h4>
                        <div className="grid grid-cols-2 gap-4 bg-blue-50/50 p-5 rounded-2xl border border-blue-100">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Email *</label>
                                <input type="email" className="w-full bg-white border border-blue-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" 
                                    value={newDriver.email} onChange={e => setNewDriver({...newDriver, email: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Contraseña *</label>
                                <input type="text" className="w-full bg-white border border-blue-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono" 
                                    value={newDriver.password} onChange={e => setNewDriver({...newDriver, password: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    {/* DATOS PERSONALES */}
                    <div className="mb-8">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <User className="w-4 h-4" /> Información Personal
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Nombre Completo *</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" 
                                    value={newDriver.name} onChange={e => setNewDriver({...newDriver, name: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">RFC / ID Fiscal</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm uppercase" 
                                    value={newDriver.rfc} onChange={e => setNewDriver({...newDriver, rfc: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">WhatsApp *</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" 
                                    value={newDriver.phone} onChange={e => setNewDriver({...newDriver, phone: e.target.value})} />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Dirección de Domicilio</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" 
                                    value={newDriver.address} onChange={e => setNewDriver({...newDriver, address: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    {/* VEHÍCULO */}
                    <div className="mb-8">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <Truck className="w-4 h-4" /> Unidad Asignada
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Modelo (Ej. Ford)</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm"
                                    value={newDriver.vehicleModel} onChange={e => setNewDriver({...newDriver, vehicleModel: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Placas</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm uppercase"
                                    value={newDriver.vehiclePlate} onChange={e => setNewDriver({...newDriver, vehiclePlate: e.target.value})} />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Tipo de Vehículo</label>
                                <input type="text" placeholder="Ej. Caja Seca, Plataforma" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm"
                                    value={newDriver.vehicleType} onChange={e => setNewDriver({...newDriver, vehicleType: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    {/* DOCUMENTOS Y SALUD */}
                    <div className="mb-6">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <FileText className="w-4 h-4" /> Documentación y Salud
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">No. Licencia</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" 
                                    value={newDriver.licenseNumber} onChange={e => setNewDriver({...newDriver, licenseNumber: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Tipo Licencia</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" 
                                    value={newDriver.licenseType} onChange={e => setNewDriver({...newDriver, licenseType: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Expira (DD/MM/AAAA)</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" 
                                    value={newDriver.licenseExp} onChange={e => setNewDriver({...newDriver, licenseExp: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Tipo de Sangre</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm uppercase" 
                                    value={newDriver.bloodType} onChange={e => setNewDriver({...newDriver, bloodType: e.target.value})} />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Contacto de Emergencia</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" 
                                    value={newDriver.emergencyContact} onChange={e => setNewDriver({...newDriver, emergencyContact: e.target.value})} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={() => setShowNewDriverModal(false)} className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition">Cancelar</button>
                    <button onClick={handleSaveDriver} className="px-8 py-3 text-xs font-black text-white bg-slate-800 rounded-2xl hover:bg-slate-900 shadow-xl transition flex items-center gap-2 uppercase tracking-widest">
                        <Save className="w-4 h-4" /> Registrar Conductor
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* MODAL VER DOCUMENTO */}
      {viewDoc && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-10" onClick={() => setViewDoc(null)}>
            <div className="relative max-w-4xl w-full flex flex-col items-center">
                <button className="mb-4 text-white/50 hover:text-white flex items-center gap-2 font-bold uppercase text-[10px] tracking-[0.3em]"><X/> Cerrar Visor</button>
                {viewDoc ? (
                    <img src={viewDoc} className="max-h-[80vh] w-auto rounded-3xl shadow-2xl border border-white/10" />
                ) : (
                    <div className="bg-slate-900 p-20 rounded-[3rem] border border-slate-800 text-center">
                        <FileText className="w-20 h-20 text-slate-800 mx-auto mb-4" />
                        <p className="text-slate-500 font-bold uppercase text-xs">El conductor aún no ha subido su identificación</p>
                    </div>
                )}
            </div>
        </div>
      )}

      {/* ================= VISOR DE EXPEDIENTE COMPLETO ================= */}
      {selectedDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header Expediente */}
                <div className="relative h-44 bg-slate-900">
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                    <button onClick={() => setSelectedDriver(null)} className="absolute top-8 right-8 bg-white/10 text-white hover:bg-white/20 p-2 rounded-full transition z-10"><X/></button>
                    
                    <div className="absolute -bottom-10 left-12 flex items-end gap-6">
                         <div className="w-36 h-36 bg-white rounded-[2.5rem] p-2 shadow-2xl">
                            {selectedDriver.fotoPerfil ? (
                                <img src={selectedDriver.fotoPerfil} className="w-full h-full object-cover rounded-[2rem]" />
                            ) : (
                                <div className="w-full h-full bg-slate-100 rounded-[2rem] flex items-center justify-center text-4xl font-black text-slate-300">{selectedDriver.initials}</div>
                            )}
                         </div>
                         <div className="mb-6">
                            <h2 className="text-4xl font-black text-white tracking-tight">{selectedDriver.name}</h2>
                            <p className="text-blue-400 text-xs font-black uppercase tracking-[0.3em]">{selectedDriver.status} • OPERADOR ID: {selectedDriver.id.slice(0,8)}</p>
                         </div>
                    </div>
                </div>

                {/* Contenido del Expediente */}
                <div className="mt-16 p-12 overflow-y-auto">
                    <div className="grid grid-cols-3 gap-12">
                        
                        {/* COLUMNA 1: IDENTIDAD */}
                        <div className="space-y-6">
                            <h4 className="text-[10px] font-black text-blue-500 uppercase tracking-widest border-b border-blue-50 pb-2 flex items-center gap-2"><User className="w-3 h-3"/> Identidad</h4>
                            <div className="space-y-5">
                                <div className="text-sm"><p className="text-[10px] text-slate-400 uppercase font-bold mb-1">RFC / ID Fiscal</p><p className="font-bold text-slate-700">{selectedDriver.rfc || 'No registrado'}</p></div>
                                <div className="text-sm"><p className="text-[10px] text-slate-400 uppercase font-bold mb-1">WhatsApp</p><p className="font-bold text-slate-700">{selectedDriver.phone}</p></div>
                                <div className="text-sm"><p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Correo Electrónico</p><p className="font-bold text-slate-700">{selectedDriver.email}</p></div>
                                <div className="text-sm"><p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Domicilio</p><p className="font-bold text-slate-700 leading-relaxed">{selectedDriver.address || 'No registrado'}</p></div>
                            </div>
                        </div>

                        {/* COLUMNA 2: UNIDAD Y LICENCIA */}
                        <div className="space-y-6">
                            <h4 className="text-[10px] font-black text-orange-500 uppercase tracking-widest border-b border-orange-50 pb-2 flex items-center gap-2"><Truck className="w-3 h-3"/> Flota y Tránsito</h4>
                            <div className="space-y-5">
                                <div className="text-sm"><p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Vehículo Asignado</p><p className="font-bold text-slate-700">{selectedDriver.vehicleModel} ({selectedDriver.vehiclePlate})</p></div>
                                <div className="text-sm"><p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Tipo de Unidad</p><p className="font-bold text-slate-700">{selectedDriver.vehicleType || 'No registrado'}</p></div>
                                <div className="text-sm"><p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Licencia {selectedDriver.licenseType}</p><p className="font-bold text-slate-700">{selectedDriver.licenseNumber}</p></div>
                                <div className="text-sm"><p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Vigencia Licencia</p><p className="font-bold text-red-500">{selectedDriver.licenseExp || 'Pendiente'}</p></div>
                            </div>
                        </div>

                        {/* COLUMNA 3: SALUD Y SEGURIDAD */}
                        <div className="space-y-6">
                            <h4 className="text-[10px] font-black text-red-500 uppercase tracking-widest border-b border-red-50 pb-2 flex items-center gap-2"><Heart className="w-3 h-3"/> Salud y Emergencia</h4>
                            <div className="space-y-5">
                                <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                                    <p className="text-[9px] text-red-400 uppercase font-black mb-1">Tipo de Sangre</p>
                                    <p className="text-2xl font-black text-red-600">{selectedDriver.bloodType || 'No reg.'}</p>
                                </div>
                                <div className="text-sm">
                                    <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Contacto de Emergencia</p>
                                    <div className="flex items-center gap-2 font-bold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <ShieldAlert className="w-4 h-4 text-red-500"/>
                                        {selectedDriver.emergencyContact || 'Sin asignar'}
                                    </div>
                                </div>
                                <div className="pt-4">
                                    <button onClick={() => setViewDoc(selectedDriver.identificacion)} className="w-full py-3 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-blue-100 hover:bg-blue-100 transition flex items-center justify-center gap-2">
                                        <Eye className="w-4 h-4"/> Ver Identificación
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Footer */}
                <div className="p-10 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                    <button onClick={() => handleDelete(selectedDriver.id)} className="px-6 py-3 text-red-400 font-bold text-xs uppercase hover:text-red-600 transition">Borrar del Sistema</button>
                    <button onClick={() => setSelectedDriver(null)} className="px-10 py-4 bg-slate-900 text-white font-black text-xs uppercase rounded-2xl shadow-2xl hover:bg-black transition tracking-[0.2em]">Cerrar Expediente</button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
}s