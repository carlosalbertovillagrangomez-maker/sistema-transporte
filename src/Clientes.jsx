import React, { useState, useEffect } from 'react';
import { Users, Building, MapPin, Plus, Search, Trash2, Save, X, User, Phone, Mail, Layout, ChevronRight, Star } from 'lucide-react';
import { Loader2 } from 'lucide-react';

// === AUTOCOMPLETE PARA UBICACIONES FAVORITAS ===
const AddressAutocomplete = ({ value, onSelect, placeholder }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [inputValue, setInputValue] = useState(value || '');

    const handleSearch = async (query) => {
        setInputValue(query);
        if (query.length < 3) { setSuggestions([]); return; }
        setIsLoading(true);
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&countrycodes=mx&limit=5&addressdetails=1`);
            const data = await response.json();
            setSuggestions(data);
        } catch (error) { console.error(error); } finally { setIsLoading(false); }
    };

    return (
        <div className="relative">
            <input type="text" placeholder={placeholder} className="w-full bg-white border border-slate-300 text-xs rounded p-2 outline-none"
                value={inputValue} onChange={(e) => handleSearch(e.target.value)} />
            {isLoading && <Loader2 className="absolute right-2 top-2 w-3 h-3 animate-spin text-slate-400" />}
            {suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded shadow-xl z-50 max-h-40 overflow-y-auto">
                    {suggestions.map((item, idx) => (
                        <li key={idx} onClick={() => { setInputValue(item.display_name); setSuggestions([]); onSelect(item); }} className="px-3 py-2 text-xs hover:bg-blue-50 cursor-pointer border-b border-slate-50 truncate">
                            {item.display_name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default function Clientes() {
  const [showModal, setShowModal] = useState(false);
  
  // Lista de Clientes
  const [clients, setClients] = useState(() => {
      const saved = localStorage.getItem('mis_clientes');
      return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => { localStorage.setItem('mis_clientes', JSON.stringify(clients)); }, [clients]);

  // Estado del Formulario
  const [newClient, setNewClient] = useState({
      id: '', name: '', type: 'Empresa', phone: '', email: '',
      users: [], // Solo para empresas
      locations: [] // Ubicaciones favoritas
  });

  // Estados temporales para agregar sub-items
  const [tempUser, setTempUser] = useState({ name: '', email: '', role: 'Encargado' });
  const [tempLoc, setTempLoc] = useState({ alias: '', address: '', lat: null, lon: null });

  // === HANDLERS ===
  const addUser = () => {
      if(!tempUser.name) return;
      setNewClient({...newClient, users: [...newClient.users, tempUser]});
      setTempUser({ name: '', email: '', role: 'Encargado' });
  };

  const addLocation = () => {
      if(!tempLoc.alias || !tempLoc.address) return alert("Define un nombre (ej. Casa) y busca la dirección");
      setNewClient({...newClient, locations: [...newClient.locations, tempLoc]});
      setTempLoc({ alias: '', address: '', lat: null, lon: null });
  };

  const handleSaveClient = () => {
      if(!newClient.name) return alert("El nombre es obligatorio");
      const clientToSave = {
          ...newClient,
          id: newClient.id || `CLI-${Math.floor(Math.random() * 9000) + 1000}`,
          joined: new Date().toLocaleDateString()
      };
      
      // Si editamos, reemplazamos. Si no, agregamos.
      const exists = clients.find(c => c.id === clientToSave.id);
      if(exists) {
          setClients(clients.map(c => c.id === clientToSave.id ? clientToSave : c));
      } else {
          setClients([...clients, clientToSave]);
      }
      
      setShowModal(false);
      resetForm();
  };

  const resetForm = () => {
      setNewClient({ id: '', name: '', type: 'Empresa', phone: '', email: '', users: [], locations: [] });
      setTempUser({ name: '', email: '', role: 'Encargado' });
      setTempLoc({ alias: '', address: '', lat: null, lon: null });
  };

  const handleDelete = (id) => {
      if(confirm("¿Eliminar cliente?")) setClients(clients.filter(c => c.id !== id));
  };

  const handleEdit = (client) => {
      setNewClient(client);
      setShowModal(true);
  };

  return (
    <div className="flex-1 p-8 bg-slate-50 overflow-y-auto h-full">
      <div className="flex justify-between items-center mb-6">
        <div><h2 className="text-2xl font-bold text-slate-800">Cartera de Clientes</h2><p className="text-slate-500">{clients.length} registrados</p></div>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:scale-105 transition"><Plus className="w-4 h-4" /> Nuevo Cliente</button>
      </div>

      {/* GRID DE CLIENTES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clients.map(client => (
              <div key={client.id} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition group">
                  <div className="flex justify-between items-start mb-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${client.type === 'Empresa' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                          {client.type === 'Empresa' ? <Building className="w-5 h-5"/> : <User className="w-5 h-5"/>}
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                          <button onClick={() => handleEdit(client)} className="text-slate-400 hover:text-blue-600"><Layout className="w-4 h-4"/></button>
                          <button onClick={() => handleDelete(client.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4"/></button>
                      </div>
                  </div>
                  <h3 className="font-bold text-slate-800">{client.name}</h3>
                  <p className="text-xs text-slate-500 mb-4">{client.type} • {client.id}</p>
                  
                  <div className="space-y-2 text-xs text-slate-600 mb-4">
                      {client.phone && <div className="flex items-center gap-2"><Phone className="w-3 h-3 text-slate-400"/> {client.phone}</div>}
                      {client.email && <div className="flex items-center gap-2"><Mail className="w-3 h-3 text-slate-400"/> {client.email}</div>}
                  </div>

                  <div className="border-t border-slate-100 pt-3 flex gap-4">
                      <div className="text-center">
                          <p className="font-bold text-slate-800">{client.users?.length || 0}</p>
                          <p className="text-[10px] text-slate-400">Usuarios</p>
                      </div>
                      <div className="text-center">
                          <p className="font-bold text-slate-800">{client.locations?.length || 0}</p>
                          <p className="text-[10px] text-slate-400">Ubicaciones</p>
                      </div>
                  </div>
              </div>
          ))}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800">Administrar Cliente</h3>
                    <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-slate-400 hover:text-red-500"/></button>
                </div>
                
                <div className="flex-1 flex overflow-hidden">
                    {/* IZQUIERDA: DATOS GENERALES */}
                    <div className="w-1/3 p-6 border-r border-slate-100 overflow-y-auto bg-slate-50/50">
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-4">Información General</h4>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Tipo de Cliente</label>
                                <div className="flex gap-2">
                                    <button onClick={() => setNewClient({...newClient, type: 'Empresa'})} className={`flex-1 py-2 text-xs rounded border ${newClient.type === 'Empresa' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500'}`}>Empresa</button>
                                    <button onClick={() => setNewClient({...newClient, type: 'Individual'})} className={`flex-1 py-2 text-xs rounded border ${newClient.type === 'Individual' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-500'}`}>Individual</button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Nombre / Razón Social *</label>
                                <input className="w-full border border-slate-300 rounded p-2 text-sm" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Teléfono</label>
                                <input className="w-full border border-slate-300 rounded p-2 text-sm" value={newClient.phone} onChange={e => setNewClient({...newClient, phone: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Email Principal</label>
                                <input className="w-full border border-slate-300 rounded p-2 text-sm" value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    {/* DERECHA: USUARIOS Y UBICACIONES */}
                    <div className="flex-1 p-6 overflow-y-auto">
                        
                        {/* 1. USUARIOS (SOLO EMPRESAS) */}
                        {newClient.type === 'Empresa' && (
                            <div className="mb-8">
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2"><Users className="w-4 h-4"/> Usuarios Autorizados</h4>
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-3">
                                    <div className="grid grid-cols-3 gap-2 mb-2">
                                        <input placeholder="Nombre" className="text-xs p-2 rounded border" value={tempUser.name} onChange={e => setTempUser({...tempUser, name: e.target.value})} />
                                        <input placeholder="Email" className="text-xs p-2 rounded border" value={tempUser.email} onChange={e => setTempUser({...tempUser, email: e.target.value})} />
                                        <button onClick={addUser} className="bg-slate-800 text-white text-xs rounded font-bold hover:bg-slate-700">Agregar</button>
                                    </div>
                                    <div className="space-y-2">
                                        {newClient.users.map((u, i) => (
                                            <div key={i} className="flex justify-between items-center text-xs bg-white p-2 rounded border border-slate-100">
                                                <span>{u.name} <span className="text-slate-400">({u.email})</span></span>
                                                <button onClick={() => setNewClient({...newClient, users: newClient.users.filter((_, idx) => idx !== i)})} className="text-red-400"><Trash2 className="w-3 h-3"/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 2. UBICACIONES FAVORITAS */}
                        <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2"><MapPin className="w-4 h-4"/> Ubicaciones Frecuentes</h4>
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-3">
                                <div className="grid grid-cols-3 gap-2 mb-2">
                                    <input placeholder="Alias (Ej. Casa, Bodega)" className="text-xs p-2 rounded border" value={tempLoc.alias} onChange={e => setTempLoc({...tempLoc, alias: e.target.value})} />
                                    <div className="col-span-2">
                                        <AddressAutocomplete placeholder="Buscar dirección..." value={tempLoc.address} onSelect={(item) => setTempLoc({...tempLoc, address: item.display_name, lat: item.lat, lon: item.lon})} />
                                    </div>
                                </div>
                                <button onClick={addLocation} className="w-full py-1.5 bg-blue-600 text-white text-xs rounded font-bold hover:bg-blue-700">Guardar Ubicación</button>
                                
                                <div className="space-y-2 mt-3">
                                    {newClient.locations.map((l, i) => (
                                        <div key={i} className="flex justify-between items-center text-xs bg-white p-2 rounded border border-blue-100">
                                            <div>
                                                <p className="font-bold text-slate-800">{l.alias}</p>
                                                <p className="text-slate-500 truncate w-64">{l.address}</p>
                                            </div>
                                            <button onClick={() => setNewClient({...newClient, locations: newClient.locations.filter((_, idx) => idx !== i)})} className="text-red-400"><Trash2 className="w-3 h-3"/></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                <div className="p-4 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded">Cancelar</button>
                    <button onClick={handleSaveClient} className="px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2"><Save className="w-4 h-4"/> Guardar Cliente</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}