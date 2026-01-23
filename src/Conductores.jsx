import React, { useState } from 'react';
import { Phone, Star, Truck, ShieldCheck, MoreHorizontal, Plus, X, User, FileText, MapPin, Calendar, Save, Search, Mail, Heart, AlertCircle, Briefcase } from 'lucide-react';

export default function Conductores() {
  // Estado para controlar el Modal de Nuevo Conductor
  const [showNewDriverModal, setShowNewDriverModal] = useState(false);
  
  // Estado para controlar qué conductor se está viendo (Perfil)
  const [selectedDriver, setSelectedDriver] = useState(null);

  // === BASE DE DATOS SIMULADA (Ahora con MÁS datos) ===
  const driversList = [
      { 
          id: 'DRV-001', 
          name: 'Juan Pérez', 
          rfc: 'PEPJ850101Hom',
          initials: 'JP', 
          email: 'juan.perez@logistica.com',
          status: 'En Ruta', 
          statusColor: 'green',
          vehicle: 'Hino 300 (Refrigerado)', 
          phone: '+52 55 1234 5678', 
          rating: 4.9, 
          trips: 150,
          licenseNumber: 'A-12345678',
          licenseType: 'Federal Tipo B',
          licenseExp: '12/2026',
          bloodType: 'O+',
          emergencyContact: 'María Pérez (Esposa) - 55 1122 3344',
          address: 'Av. Central 45, Col. Industrial',
          joined: 'Marzo 2021'
      },
      { 
          id: 'DRV-002', 
          name: 'Carlos Ruiz', 
          rfc: 'RUIC900505H2A',
          initials: 'CR', 
          email: 'carlos.ruiz@logistica.com',
          status: 'En Ruta', 
          statusColor: 'green',
          vehicle: 'Nissan NV (Express)', 
          phone: '+52 55 9876 5432', 
          rating: 4.7, 
          trips: 98,
          licenseNumber: 'B-98765432',
          licenseType: 'Estatal Tipo A',
          licenseExp: '05/2025',
          bloodType: 'A-',
          emergencyContact: 'Pedro Ruiz (Hermano) - 55 9988 7766',
          address: 'Calle 10 #20, Centro Histórico',
          joined: 'Enero 2023'
      },
      { 
          id: 'DRV-003', 
          name: 'Mario Rosas', 
          rfc: 'ROSM820808H3B',
          initials: 'MR', 
          email: 'mario.rosas@logistica.com',
          status: 'Descanso', 
          statusColor: 'gray',
          vehicle: 'Sin Asignar', 
          phone: '+52 55 5555 0000', 
          rating: 5.0, 
          trips: 210,
          licenseNumber: 'C-56781234',
          licenseType: 'Federal Tipo C',
          licenseExp: '08/2024',
          bloodType: 'B+',
          emergencyContact: 'Ana López (Madre) - 55 4433 2211',
          address: 'Blvd. Aeropuerto 100, Base Central',
          joined: 'Junio 2020'
      }
  ];

  return (
    <div className="flex-1 p-8 bg-slate-50 overflow-y-auto h-full relative">
      
      {/* === HEADER === */}
      <div className="flex justify-between items-center mb-8">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Gestión de Conductores</h2>
            <p className="text-slate-500">Administración completa de perfiles y documentación.</p>
        </div>
        <div className="flex gap-2">
            <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Buscar por nombre o ID..." className="bg-white border border-slate-300 text-sm rounded-lg pl-10 pr-4 py-2 w-64 shadow-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button 
                onClick={() => setShowNewDriverModal(true)}
                className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-900 transition flex items-center gap-2 shadow-lg shadow-slate-800/20"
            >
                <Plus className="w-4 h-4" /> Nuevo Conductor
            </button>
        </div>
      </div>

      {/* === GRID DE TARJETAS (VISTA RESUMIDA) === */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {driversList.map((driver) => (
            <div key={driver.id} className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition group relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                
                <div className="flex justify-between items-start mb-4 pl-2">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg border ${driver.statusColor === 'green' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {driver.initials}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-bold flex items-center gap-1 ${driver.statusColor === 'green' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${driver.statusColor === 'green' ? 'bg-green-500' : 'bg-gray-400'}`}></span> 
                        {driver.status}
                    </span>
                </div>
                
                <div className="pl-2">
                    <h3 className="text-lg font-bold text-slate-800">{driver.name}</h3>
                    <p className="text-xs text-slate-500 mb-4 font-mono">{driver.id}</p>
                    
                    <div className="space-y-2 text-sm text-slate-600 mb-6">
                        <div className="flex items-center gap-2">
                            <Truck className="w-4 h-4 text-slate-400" />
                            <span className="truncate">{driver.vehicle}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-slate-400" />
                            <span>{driver.phone}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Star className="w-4 h-4 text-yellow-500" />
                            <span className="font-bold text-slate-800">{driver.rating}</span>
                        </div>
                    </div>
                </div>
                
                <div className="pt-4 border-t border-slate-100 flex gap-2 pl-2">
                    <button 
                        onClick={() => setSelectedDriver(driver)}
                        className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition font-medium"
                    >
                        Ver Perfil Completo
                    </button>
                </div>
            </div>
        ))}
      </div>

      {/* ================= MODAL 1: FORMULARIO COMPLETO NUEVO CONDUCTOR ================= */}
      {showNewDriverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Alta de Conductor</h3>
                        <p className="text-xs text-slate-500">Complete todos los campos requeridos para el expediente.</p>
                    </div>
                    <button onClick={() => setShowNewDriverModal(false)} className="text-slate-400 hover:text-red-500 transition"><X className="w-5 h-5" /></button>
                </div>
                
                {/* Body con Scroll */}
                <div className="p-6 overflow-y-auto">
                    
                    {/* SECCIÓN 1: DATOS PERSONALES */}
                    <div className="mb-6">
                        <h4 className="text-xs font-bold text-blue-600 uppercase mb-3 flex items-center gap-2">
                            <User className="w-4 h-4" /> Datos Personales
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Nombre Completo *</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" placeholder="Nombre(s) y Apellidos" />
                            </div>
                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-xs font-medium text-slate-700 mb-1">RFC / ID Oficial *</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" placeholder="Clave única" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Teléfono Móvil *</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" placeholder="+52 00 0000 0000" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Correo Electrónico</label>
                                <input type="email" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" placeholder="correo@empresa.com" />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Domicilio Actual</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" placeholder="Calle, Número, Colonia, Ciudad" />
                            </div>
                        </div>
                    </div>

                    <hr className="border-slate-100 my-4" />

                    {/* SECCIÓN 2: LICENCIA Y SALUD */}
                    <div className="mb-6">
                        <h4 className="text-xs font-bold text-blue-600 uppercase mb-3 flex items-center gap-2">
                            <FileText className="w-4 h-4" /> Licencia y Salud
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Número de Licencia *</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Tipo de Licencia</label>
                                <select className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500">
                                    <option>Federal Tipo B</option>
                                    <option>Federal Tipo C</option>
                                    <option>Estatal Tipo A</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Vigencia Hasta *</label>
                                <input type="date" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Tipo de Sangre</label>
                                <select className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500">
                                    <option>O+</option>
                                    <option>O-</option>
                                    <option>A+</option>
                                    <option>A-</option>
                                    <option>B+</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <hr className="border-slate-100 my-4" />

                    {/* SECCIÓN 3: EMERGENCIA Y ASIGNACIÓN */}
                    <div>
                        <h4 className="text-xs font-bold text-blue-600 uppercase mb-3 flex items-center gap-2">
                            <Heart className="w-4 h-4" /> Emergencia y Asignación
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Contacto de Emergencia *</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" placeholder="Nombre y Parentesco" />
                            </div>
                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Teléfono de Emergencia *</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Asignar Vehículo Inicial</label>
                                <select className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500">
                                    <option>-- Dejar Pendiente --</option>
                                    <option>Hino 300 - Disponible</option>
                                    <option>Nissan NV - Disponible</option>
                                </select>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                    <button onClick={() => setShowNewDriverModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-white border border-transparent hover:border-slate-300 rounded-lg transition">Cancelar</button>
                    <button onClick={() => setShowNewDriverModal(false)} className="px-6 py-2 text-sm text-white bg-slate-800 hover:bg-slate-900 rounded-lg flex items-center gap-2 shadow-lg shadow-slate-500/30 transition">
                        <Save className="w-4 h-4" /> Guardar Expediente
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* ================= MODAL 2: PERFIL DETALLADO (Ahora con toda la info) ================= */}
      {selectedDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header Perfil */}
                <div className="relative h-32 bg-slate-800 shrink-0">
                    <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '15px 15px' }}></div>
                    <button onClick={() => setSelectedDriver(null)} className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/20 hover:bg-black/40 rounded-full p-1.5 transition z-10">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Info Principal */}
                <div className="px-8 pb-8 flex-1 overflow-y-auto">
                    
                    {/* Foto y Nombre */}
                    <div className="flex justify-between items-end -mt-12 mb-8 relative">
                        <div className="flex items-end gap-5">
                            <div className="w-24 h-24 rounded-full bg-white p-1.5 shadow-xl">
                                <div className="w-full h-full rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-3xl border border-slate-200">
                                    {selectedDriver.initials}
                                </div>
                            </div>
                            <div className="mb-2">
                                <h2 className="text-3xl font-bold text-slate-800">{selectedDriver.name}</h2>
                                <p className="text-sm text-slate-500 flex items-center gap-2">
                                    <Briefcase className="w-3 h-3"/> {selectedDriver.id} • Alta: {selectedDriver.joined}
                                </p>
                            </div>
                        </div>
                        <div className="mb-4">
                             <span className={`px-4 py-1.5 rounded-full text-sm font-bold border flex items-center gap-2 shadow-sm ${selectedDriver.statusColor === 'green' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                <span className={`w-2 h-2 rounded-full ${selectedDriver.statusColor === 'green' ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                                {selectedDriver.status}
                             </span>
                        </div>
                    </div>

                    {/* GRID DE INFORMACIÓN DETALLADA */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                        
                        {/* COLUMNA 1: CONTACTO Y PERSONAL */}
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">Información de Contacto</h4>
                                <ul className="space-y-3">
                                    <li className="flex items-center gap-3 text-sm text-slate-700">
                                        <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400"><Phone className="w-4 h-4"/></div>
                                        <div>
                                            <p className="text-xs text-slate-400">Teléfono</p>
                                            <p className="font-medium">{selectedDriver.phone}</p>
                                        </div>
                                    </li>
                                    <li className="flex items-center gap-3 text-sm text-slate-700">
                                        <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400"><Mail className="w-4 h-4"/></div>
                                        <div>
                                            <p className="text-xs text-slate-400">Email</p>
                                            <p className="font-medium">{selectedDriver.email}</p>
                                        </div>
                                    </li>
                                    <li className="flex items-center gap-3 text-sm text-slate-700">
                                        <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400"><MapPin className="w-4 h-4"/></div>
                                        <div>
                                            <p className="text-xs text-slate-400">Domicilio</p>
                                            <p className="font-medium">{selectedDriver.address}</p>
                                        </div>
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

                        {/* COLUMNA 2: LABORAL Y MÉTRICAS */}
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">Datos Operativos</h4>
                                <ul className="space-y-3">
                                    <li className="flex items-center gap-3 text-sm text-slate-700">
                                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500"><Truck className="w-4 h-4"/></div>
                                        <div>
                                            <p className="text-xs text-slate-400">Vehículo Actual</p>
                                            <p className="font-medium">{selectedDriver.vehicle}</p>
                                        </div>
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

                            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Rendimiento Global</h4>
                                
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-medium text-slate-700">Calificación del Cliente</span>
                                    <span className="flex items-center gap-1 font-bold text-slate-800 text-lg">
                                        <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" /> {selectedDriver.rating}
                                    </span>
                                </div>
                                <div className="w-full bg-white rounded-full h-2 mb-6 border border-slate-200">
                                    <div className="bg-yellow-400 h-2 rounded-full shadow-sm" style={{ width: `${(selectedDriver.rating / 5) * 100}%` }}></div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white p-3 rounded-lg border border-slate-100 text-center shadow-sm">
                                        <p className="text-2xl font-bold text-slate-800">{selectedDriver.trips}</p>
                                        <p className="text-xs text-slate-400">Viajes Totales</p>
                                    </div>
                                    <div className="bg-white p-3 rounded-lg border border-slate-100 text-center shadow-sm">
                                        <p className="text-2xl font-bold text-green-600">98%</p>
                                        <p className="text-xs text-slate-400">Puntualidad</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                </div>
                
                {/* Footer Perfil */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
                    <button className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-100 font-medium transition shadow-sm">
                        Descargar Expediente PDF
                    </button>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-medium shadow-lg shadow-blue-500/20 transition">
                        Editar Información
                    </button>
                </div>

            </div>
        </div>
      )}

    </div>
  );
}