import React, { useState, useEffect } from 'react';
import { Users, Building, MapPin, Plus, Trash2, Save, X, User, Phone, Mail, Layout, Loader2, Filter, Pencil } from 'lucide-react';

// FIREBASE
import { db } from './firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy, updateDoc } from 'firebase/firestore';

// Componente Autocomplete (Se mantiene igual)
const AddressAutocomplete = ({ value, onSelect, placeholder }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [inputValue, setInputValue] = useState(value || '');

    // Sincronizar input cuando editamos
    useEffect(() => { setInputValue(value || ''); }, [value]);

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
  const [loading, setLoading] = useState(true);
  
  // Lista de Clientes
  const [clients, setClients] = useState([]);
  const [filterType, setFilterType] = useState('Todos'); 

  // Estado para Edición
  const [editingId, setEditingId] = useState(null);

  // Formulario
  const [newClient, setNewClient] = useState({
      name: '', type: 'Empresa', phone: '', email: '',
      users: [], 
      locations: [] 
  });

  const [tempUser, setTempUser] = useState({ name: '', email: '', role: 'Encargado' });
  const [tempLoc, setTempLoc] = useState({ alias: '', address: '', lat: null, lon: null, assignedTo: 'General' });

  // === 1. LEER CLIENTES ===
  useEffect(() => {
    const q = query(collection(db, "clientes"), orderBy("created", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setClients(docs);
        setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // === 2. GUARDAR (CREAR O EDITAR) ===
  const handleSaveClient = async () => {
      if(!newClient.name) return alert("El nombre es obligatorio");

      try {
          if (editingId) {
              // === MODO EDICIÓN ===
              const clientRef = doc(db, "clientes", editingId);
              await updateDoc(clientRef, {
                  ...newClient,
                  // No actualizamos 'created' ni 'joined' para mantener la fecha original
              });
          } else {
              // === MODO CREACIÓN ===
              const clientToSave = {
                  ...newClient,
                  created: new Date().toISOString(),
                  joined: new Date().toLocaleDateString()
              };
              await addDoc(collection(db, "clientes"), clientToSave);
          }
          
          setShowModal(false);
          resetForm();
      } catch (error) {
          console.error("Error:", error);
          alert("Error al guardar cliente");
      }
  };

  // === 3. PREPARAR EDICIÓN ===
  const handleEdit = (client) => {
      setEditingId(client.id);
      setNewClient({
          name: client.name,
          type: client.type,
          phone: client.phone || '',
          email: client.email || '',
          users: client.users || [],
          locations: client.locations || []
      });
      setShowModal(true);
  };

  const resetForm = () => {
      setNewClient({ name: '', type: 'Empresa', phone: '', email: '', users: [], locations: [] });
      setTempUser({ name: '', email: '', role: 'Encargado' });
      setTempLoc({ alias: '', address: '', lat: null, lon: null, assignedTo: 'General' });
      setEditingId(null); // Importante: Limpiar ID de edición
  };

  const handleDelete = async (id) => {
      if(confirm("¿Eliminar cliente de la base de datos?")) {
          await deleteDoc(doc(db, "clientes", id));
      }
  };

  const addUser = () => {
      if(!tempUser.name) return;
      setNewClient({...newClient, users: [...newClient.users, tempUser]});
      setTempUser({ name: '', email: '', role: 'Encargado' });
  };

  const addLocation = () => {
      if(!tempLoc.alias || !tempLoc.address) return alert("Define un alias y dirección");
      setNewClient({...newClient, locations: [...newClient.locations, tempLoc]});
      setTempLoc({ alias: '', address: '', lat: null, lon: null, assignedTo: 'General' });
  };

  const filteredClients = filterType === 'Todos' ? clients : clients.filter(c => c.type === filterType);

  return (
    <div className="flex-1 p-8 bg-slate-50 overflow-y-auto h-full">
      <div className="flex justify-between items-center mb-6">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Cartera de Clientes</h2>
            <p className="text-slate-500">{clients.length} registrados en Nube</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:scale-105 transition shadow-lg">
            <Plus className="w-4 h-4" /> Nuevo Cliente
        </button>
      </div>

      {/* FILTROS */}
      <div className="flex gap-2 mb-6 bg-white p-2 rounded-lg border border-slate-200 w-fit shadow-sm">
          <button onClick={() => setFilterType('Todos')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition ${filterType === 'Todos' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Todos</button>
          <button onClick={() => setFilterType('Empresa')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-2 ${filterType === 'Empresa' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}><Building className="w-3 h-3"/> Empresas</button>
          <button onClick={() => setFilterType('Individual')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-2 ${filterType === 'Individual' ? 'bg-purple-100 text-purple-700' : 'text-slate-500 hover:bg-slate-50'}`}><User className="w-3 h-3"/> Individuales</button>
      </div>

      {loading && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400"/></div>}

      {/* GRID DE CLIENTES */}
      {!loading && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClients.map(client => (
              <div key={client.id} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition group">
                  <div className="flex justify-between items-start mb-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${client.type === 'Empresa' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                          {client.type === 'Empresa' ? <Building className="w-5 h-5"/> : <User className="w-5 h-5"/>}
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                          {/* BOTÓN EDITAR RESTAURADO */}
                          <button onClick={() => handleEdit(client)} className="text-slate-400 hover:text-blue-600 bg-slate-50 p-1.5 rounded hover:bg-blue-50 transition"><Pencil className="w-4 h-4"/></button>
                          <button onClick={() => handleDelete(client.id)} className="text-slate-400 hover:text-red-500 bg-slate-50 p-1.5 rounded hover:bg-red-50 transition"><Trash2 className="w-4 h-4"/></button>
                      </div>
                  </div>
                  <h3 className="font-bold text-slate-800">{client.name}</h3>
                  <p className="text-xs text-slate-500 mb-4">{client.type} • ...{client.id.slice(-4)}</p>
                  
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
      )}

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800">{editingId ? 'Editar Cliente' : 'Alta de Cliente'}</h3>
                    <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-slate-400 hover:text-red-500"/></button>
                </div>
                
                <div className="flex-1 flex overflow-hidden">
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
                            <div><label className="block text-xs font-bold text-slate-600 mb-1">Nombre / Razón Social *</label><input className="w-full border border-slate-300 rounded p-2 text-sm" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} /></div>
                            <div><label className="block text-xs font-bold text-slate-600 mb-1">Teléfono</label><input className="w-full border border-slate-300 rounded p-2 text-sm" value={newClient.phone} onChange={e => setNewClient({...newClient, phone: e.target.value})} /></div>
                            <div><label className="block text-xs font-bold text-slate-600 mb-1">Email Principal</label><input className="w-full border border-slate-300 rounded p-2 text-sm" value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} /></div>
                        </div>
                    </div>

                    <div className="flex-1 p-6 overflow-y-auto">
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

                        <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2"><MapPin className="w-4 h-4"/> Ubicaciones Frecuentes</h4>
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-3">
                                <div className="space-y-2 mb-2">
                                    <div className="flex gap-2">
                                        <input placeholder="Alias (Ej. Bodega Norte)" className="text-xs p-2 rounded border flex-1" value={tempLoc.alias} onChange={e => setTempLoc({...tempLoc, alias: e.target.value})} />
                                        {newClient.type === 'Empresa' && (
                                            <select className="text-xs p-2 rounded border w-1/3 text-slate-600 outline-none" value={tempLoc.assignedTo} onChange={e => setTempLoc({...tempLoc, assignedTo: e.target.value})}>
                                                <option value="General">🏢 General (Empresa)</option>
                                                {newClient.users.map((u, i) => (<option key={i} value={u.name}>👤 {u.name}</option>))}
                                            </select>
                                        )}
                                    </div>
                                    <AddressAutocomplete placeholder="Buscar dirección..." value={tempLoc.address} onSelect={(item) => setTempLoc({...tempLoc, address: item.display_name, lat: item.lat, lon: item.lon})} />
                                </div>
                                <button onClick={addLocation} className="w-full py-1.5 bg-blue-600 text-white text-xs rounded font-bold hover:bg-blue-700">Guardar Ubicación</button>
                                <div className="space-y-2 mt-3">
                                    {newClient.locations.map((l, i) => (
                                        <div key={i} className="flex justify-between items-center text-xs bg-white p-2 rounded border border-blue-100">
                                            <div>
                                                <p className="font-bold text-slate-800 flex items-center gap-2">{l.alias} {l.assignedTo && l.assignedTo !== 'General' ? <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 rounded-full">👤 {l.assignedTo}</span> : <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 rounded-full">🏢 General</span>}</p>
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
                <div className="p-4 border-t border-slate-100 flex justify-end gap-3"><button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded">Cancelar</button><button onClick={handleSaveClient} className="px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2"><Save className="w-4 h-4"/> {editingId ? 'Actualizar' : 'Guardar'}</button></div>
            </div>
        </div>
      )}
    </div>
  );
}