import React, { useState, useEffect } from 'react';
import { Phone, Truck, Plus, X, User, FileText, MapPin, Save, Search, Mail, AlertCircle, Briefcase, Trash2, Loader2 } from 'lucide-react';

// IMPORTAMOS LA CONEXIÓN A FIREBASE
import { db } from './firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy } from 'firebase/firestore';

export default function Conductores() {
  const [showNewDriverModal, setShowNewDriverModal] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [loading, setLoading] = useState(true);

  // === ESTADO MAESTRO: TODOS LOS CAMPOS ===
  const [newDriver, setNewDriver] = useState({
    // 1. Personales
    name: '', rfc: '', phone: '', email: '', address: '',
    // 2. Licencia y Salud
    licenseNumber: '', licenseType: 'Federal Tipo B', licenseExp: '', bloodType: 'O+',
    // 3. Emergencia
    emergencyContact: '',
    // 4. Vehículo
    vehicleModel: '', vehiclePlate: '', vehicleType: 'Caja Seca'
  });

  const [driversList, setDriversList] = useState([]);

  // === 1. LEER DATOS EN TIEMPO REAL (REALTIME) DE FIREBASE ===
  useEffect(() => {
    // Escucha la colección "conductores" ordenados por fecha de creación
    const q = query(collection(db, "conductores"), orderBy("created", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const driversArr = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setDriversList(driversArr);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // === FUNCIÓN GUARDAR EN NUBE ===
  const handleSaveDriver = async () => {
    if (!newDriver.name || !newDriver.phone || !newDriver.licenseNumber) return alert("Faltan datos obligatorios (Nombre, Teléfono o Licencia)");

    // Construir string del vehículo
    const vehiculoFinal = (newDriver.vehicleModel && newDriver.vehiclePlate) 
        ? `${newDriver.vehicleModel} (${newDriver.vehiclePlate})` 
        : 'Sin Asignar';

    const nuevoConductor = {
        name: newDriver.name,
        initials: newDriver.name.substring(0, 2).toUpperCase(),
        rfc: newDriver.rfc || 'N/A',
        email: newDriver.email || 'sin@correo.com',
        status: 'Disponible', 
        statusColor: 'gray',
        vehicle: vehiculoFinal, // Guardamos el vehículo combinado
        phone: newDriver.phone,
        address: newDriver.address || 'Sin Domicilio',
        licenseNumber: newDriver.licenseNumber,
        licenseType: newDriver.licenseType,
        licenseExp: newDriver.licenseExp || '2025-01-01',
        bloodType: newDriver.bloodType,
        emergencyContact: newDriver.emergencyContact || 'No registrado',
        rating: 5.0, 
        trips: 0,
        joined: new Date().toLocaleDateString(),
        created: new Date().toISOString() // Para ordenar en Firebase
    };

    try {
        await addDoc(collection(db, "conductores"), nuevoConductor);
        setShowNewDriverModal(false);
        
        // Limpiar formulario completo
        setNewDriver({
            name: '', rfc: '', phone: '', email: '', address: '',
            licenseNumber: '', licenseType: 'Federal Tipo B', licenseExp: '', bloodType: 'O+',
            emergencyContact: '',
            vehicleModel: '', vehiclePlate: '', vehicleType: 'Caja Seca'
        });
    } catch (error) {
        console.error("Error guardando:", error);
        alert("Error al guardar en la nube: " + error.message);
    }
  };

  // === ELIMINAR DE NUBE ===
  const handleDelete = async (id) => {
    if(confirm("¿Estás seguro de eliminar este expediente de la base de datos?")) {
        try {
            await deleteDoc(doc(db, "conductores", id));
            setSelectedDriver(null);
        } catch (error) {
            alert("Error al eliminar: " + error.message);
        }
    }
  };

  return (
    <div className="flex-1 p-8 bg-slate-50 overflow-y-auto h-full relative">
      
      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Gestión de Conductores</h2>
            <p className="text-slate-500">{driversList.length} Expedientes en Nube</p>
        </div>
        <div className="flex gap-2">
            <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Buscar por nombre..." className="bg-white border border-slate-300 text-sm rounded-lg pl-10 pr-4 py-2 w-64 shadow-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={() => setShowNewDriverModal(true)} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-900 transition flex items-center gap-2 shadow-lg">
                <Plus className="w-4 h-4" /> Nuevo Conductor
            </button>
        </div>
      </div>

      {/* LOADER */}
      {loading && <div className="flex justify-center h-64 items-center gap-2 text-slate-500"><Loader2 className="animate-spin"/> Cargando nube...</div>}

      {/* GRID DE TARJETAS */}
      {!loading && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {driversList.map((driver) => (
            <div key={driver.id} className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition group relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1 h-full ${driver.statusColor === 'green' ? 'bg-blue-500' : 'bg-gray-400'}`}></div>
                <div className="flex justify-between items-start mb-4 pl-2">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-lg text-slate-600 border border-slate-200">
                        {driver.initials}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-bold flex items-center gap-1 ${driver.statusColor === 'green' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${driver.statusColor === 'green' ? 'bg-green-500' : 'bg-gray-400'}`}></span> 
                        {driver.status}
                    </span>
                </div>
                <div className="pl-2">
                    <h3 className="text-lg font-bold text-slate-800">{driver.name}</h3>
                    <p className="text-xs text-slate-500 mb-4 font-mono truncate w-40" title={driver.id}>{driver.id}</p>
                    <div className="space-y-2 text-sm text-slate-600 mb-6">
                        <div className="flex items-center gap-2">
                            <Truck className="w-4 h-4 text-slate-400" />
                            <span className="truncate font-medium">{driver.vehicle}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-slate-400" />
                            <span>{driver.phone}</span>
                        </div>
                    </div>
                </div>
                <div className="pt-4 border-t border-slate-100 flex gap-2 pl-2">
                    <button onClick={() => setSelectedDriver(driver)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition font-medium">Ver Expediente</button>
                </div>
            </div>
        ))}
      </div>
      )}

      {/* ================= MODAL DE REGISTRO COMPLETO (TU DISEÑO ORIGINAL) ================= */}
      {showNewDriverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Alta de Conductor</h3>
                        <p className="text-xs text-slate-500">Complete el expediente digital y asigne unidad.</p>
                    </div>
                    <button onClick={() => setShowNewDriverModal(false)} className="text-slate-400 hover:text-red-500 transition"><X className="w-5 h-5" /></button>
                </div>
                
                <div className="p-6 overflow-y-auto">
                    {/* SECCIÓN 1: DATOS PERSONALES */}
                    <div className="mb-6">
                        <h4 className="text-xs font-bold text-blue-600 uppercase mb-3 flex items-center gap-2">
                            <User className="w-4 h-4" /> Datos Personales
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Nombre Completo *</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm" 
                                    value={newDriver.name} onChange={e => setNewDriver({...newDriver, name: e.target.value})} />
                            </div>
                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-xs font-medium text-slate-700 mb-1">RFC / ID Oficial</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm" 
                                    value={newDriver.rfc} onChange={e => setNewDriver({...newDriver, rfc: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Teléfono Móvil *</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm" 
                                    value={newDriver.phone} onChange={e => setNewDriver({...newDriver, phone: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                                <input type="email" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm" 
                                    value={newDriver.email} onChange={e => setNewDriver({...newDriver, email: e.target.value})} />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Domicilio</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm" 
                                    value={newDriver.address} onChange={e => setNewDriver({...newDriver, address: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    <hr className="border-slate-100 my-4" />

                    {/* SECCIÓN 2: DATOS DEL VEHÍCULO */}
                    <div className="mb-6">
                        <h4 className="text-xs font-bold text-blue-600 uppercase mb-3 flex items-center gap-2">
                            <Truck className="w-4 h-4" /> Asignación de Unidad
                        </h4>
                        <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <div className="col-span-3 md:col-span-1">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Modelo de Unidad</label>
                                <input type="text" placeholder="Ej. Nissan NP300" className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm"
                                    value={newDriver.vehicleModel} onChange={e => setNewDriver({...newDriver, vehicleModel: e.target.value})} />
                            </div>
                            <div className="col-span-3 md:col-span-1">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Placas</label>
                                <input type="text" placeholder="Ej. A-123-BC" className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm uppercase"
                                    value={newDriver.vehiclePlate} onChange={e => setNewDriver({...newDriver, vehiclePlate: e.target.value})} />
                            </div>
                            <div className="col-span-3 md:col-span-1">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Tipo de Caja</label>
                                <select className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm"
                                    value={newDriver.vehicleType} onChange={e => setNewDriver({...newDriver, vehicleType: e.target.value})}>
                                    <option>Caja Seca</option>
                                    <option>Refrigerado</option>
                                    <option>Plataforma</option>
                                    <option>Van / Pasajeros</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <hr className="border-slate-100 my-4" />

                    {/* SECCIÓN 3: LICENCIA Y EMERGENCIA */}
                    <div>
                        <h4 className="text-xs font-bold text-blue-600 uppercase mb-3 flex items-center gap-2">
                            <FileText className="w-4 h-4" /> Licencia y Emergencia
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">No. Licencia *</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm" 
                                    value={newDriver.licenseNumber} onChange={e => setNewDriver({...newDriver, licenseNumber: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Tipo Licencia</label>
                                <select className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm"
                                    value={newDriver.licenseType} onChange={e => setNewDriver({...newDriver, licenseType: e.target.value})}>
                                    <option>Federal Tipo B</option>
                                    <option>Federal Tipo C</option>
                                    <option>Estatal Tipo A</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Vigencia</label>
                                <input type="date" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm" 
                                    value={newDriver.licenseExp} onChange={e => setNewDriver({...newDriver, licenseExp: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Tipo Sangre</label>
                                <select className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm"
                                    value={newDriver.bloodType} onChange={e => setNewDriver({...newDriver, bloodType: e.target.value})}>
                                    <option>O+</option> <option>O-</option> <option>A+</option> <option>B+</option> <option>AB+</option>
                                </select>
                            </div>
                            <div className="col-span-2">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Contacto Emergencia</label>
                                <input type="text" placeholder="Nombre y Teléfono" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm"
                                    value={newDriver.emergencyContact} onChange={e => setNewDriver({...newDriver, emergencyContact: e.target.value})} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                    <button onClick={() => setShowNewDriverModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-white border border-transparent hover:border-slate-300 rounded-lg transition">Cancelar</button>
                    <button onClick={handleSaveDriver} className="px-6 py-2 text-sm text-white bg-slate-800 hover:bg-slate-900 rounded-lg flex items-center gap-2 shadow-lg transition">
                        <Save className="w-4 h-4" /> Guardar en Nube
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* ================= MODAL DE PERFIL COMPLETO (TU DISEÑO ORIGINAL) ================= */}
      {selectedDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="relative h-32 bg-slate-800 shrink-0">
                    <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '15px 15px' }}></div>
                    <button onClick={() => setSelectedDriver(null)} className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/20 hover:bg-black/40 rounded-full p-1.5 transition z-10"><X className="w-5 h-5" /></button>
                </div>

                <div className="px-8 pb-8 flex-1 overflow-y-auto">
                    <div className="flex justify-between items-end -mt-12 mb-8 relative">
                        <div className="flex items-end gap-5">
                            <div className="w-24 h-24 rounded-full bg-white p-1.5 shadow-xl">
                                <div className="w-full h-full rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-3xl border border-slate-200">
                                    {selectedDriver.initials}
                                </div>
                            </div>
                            <div className="mb-2">
                                <h2 className="text-3xl font-bold text-slate-800">{selectedDriver.name}</h2>
                                <p className="text-sm text-slate-500 flex items-center gap-2"><Briefcase className="w-3 h-3"/> {selectedDriver.id} • Alta: {selectedDriver.joined}</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">Contacto</h4>
                                <ul className="space-y-3">
                                    <li className="flex items-center gap-3 text-sm text-slate-700">
                                        <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400"><Phone className="w-4 h-4"/></div>
                                        <div><p className="text-xs text-slate-400">Teléfono</p><p className="font-medium">{selectedDriver.phone}</p></div>
                                    </li>
                                    <li className="flex items-center gap-3 text-sm text-slate-700">
                                        <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400"><Mail className="w-4 h-4"/></div>
                                        <div><p className="text-xs text-slate-400">Email</p><p className="font-medium">{selectedDriver.email}</p></div>
                                    </li>
                                    <li className="flex items-center gap-3 text-sm text-slate-700">
                                        <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400"><MapPin className="w-4 h-4"/></div>
                                        <div><p className="text-xs text-slate-400">Domicilio</p><p className="font-medium">{selectedDriver.address}</p></div>
                                    </li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">Emergencia</h4>
                                <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
                                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                                    <div>
                                        <p className="text-xs text-red-400 font-bold uppercase">En caso de accidente:</p>
                                        <p className="text-sm font-bold text-slate-800">{selectedDriver.emergencyContact}</p>
                                        <p className="text-xs text-slate-600">Tipo de Sangre: <strong className="text-slate-900">{selectedDriver.bloodType}</strong></p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">Datos Operativos</h4>
                                <ul className="space-y-3">
                                    <li className="flex items-center gap-3 text-sm text-slate-700">
                                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500"><Truck className="w-4 h-4"/></div>
                                        <div><p className="text-xs text-slate-400">Unidad Asignada</p><p className="font-medium">{selectedDriver.vehicle}</p></div>
                                    </li>
                                    <li className="flex items-center gap-3 text-sm text-slate-700">
                                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500"><FileText className="w-4 h-4"/></div>
                                        <div>
                                            <p className="text-xs text-slate-400">Licencia ({selectedDriver.licenseType})</p>
                                            <p className="font-medium">{selectedDriver.licenseNumber}</p>
                                            <p className="text-[10px] text-green-600 font-bold bg-green-50 inline-block px-1 rounded mt-0.5">Vence: {selectedDriver.licenseExp}</p>
                                        </div>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
                    <button onClick={() => handleDelete(selectedDriver.id)} className="px-4 py-2 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-100 font-medium flex items-center gap-2">
                        <Trash2 className="w-4 h-4"/> Eliminar Expediente
                    </button>
                    <button onClick={() => setSelectedDriver(null)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-medium shadow-lg">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
