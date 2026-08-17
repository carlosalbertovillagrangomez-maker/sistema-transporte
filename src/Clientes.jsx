import React, { useState, useEffect, useRef } from 'react';
import { Users, Building, MapPin, Plus, Trash2, Save, X, User, Phone, Mail, Layout, Loader2, Filter, Pencil, Clock, Upload, Download, Search, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';

// FIREBASE
import { db } from './firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';

// GOOGLE MAPS
import { useJsApiLoader, Autocomplete } from '@react-google-maps/api';
import * as XLSX from 'xlsx';

// === CLAVE DE API ===
const GOOGLE_MAPS_API_KEY = "AIzaSyA-t6YcuPK1PdOoHZJOyOsw6PK0tCDJrn0";
const libraries = ['places', 'geometry'];

// === NUEVO COMPONENTE AUTOCOMPLETE (GOOGLE) ===
const AddressAutocomplete = ({ value, onSelect, placeholder }) => {
    const [inputValue, setInputValue] = useState(value || '');
    const autocompleteRef = useRef(null);

    useEffect(() => { setInputValue(value || ''); }, [value]);

    const options = {
        fields: ["address_components", "geometry", "formatted_address"],
    };

    const handlePlaceChanged = () => {
        if (autocompleteRef.current !== null) {
            const place = autocompleteRef.current.getPlace();
            if (place.geometry && place.geometry.location) {
                const address = place.formatted_address;
                const lat = place.geometry.location.lat();
                const lng = place.geometry.location.lng();
                
                setInputValue(address);
                onSelect({ address, lat, lon: lng }); // Google usa 'lng', tu código usa 'lon'
            }
        }
    };

    return (
        <Autocomplete
            onLoad={(ref) => (autocompleteRef.current = ref)}
            onPlaceChanged={handlePlaceChanged}
            options={options}
        >
            <input 
                type="text" 
                placeholder={placeholder} 
                className="w-full bg-white border border-slate-300 text-xs rounded p-2 outline-none focus:border-blue-500 transition"
                value={inputValue} 
                onChange={(e) => setInputValue(e.target.value)} 
            />
        </Autocomplete>
    );
};


const normalizeText = (value = '') => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const normalizePhone = (value = '') => String(value || '').replace(/\D/g, '');
const compareNamesAZ = (a, b) => normalizeText(a?.name || a?.assignedTo || '').localeCompare(normalizeText(b?.name || b?.assignedTo || ''), 'es', { sensitivity: 'base' });
const sortUsersAZ = (users = []) => [...users].sort(compareNamesAZ);

const getRowValue = (row, aliases = []) => {
    const normalizedEntries = Object.entries(row || {}).map(([key, value]) => [
        normalizeText(key).toLowerCase().replace(/\s+/g, '_'),
        value
    ]);

    for (const alias of aliases) {
        const normalizedAlias = normalizeText(alias).toLowerCase().replace(/\s+/g, '_');
        const found = normalizedEntries.find(([key]) => key === normalizedAlias);
        if (found) return found[1];
    }

    return '';
};

const parseBulkRow = (row, index) => {
    const name = normalizeText(getRowValue(row, ['nombre', 'nombre_completo', 'usuario', 'empleado']));
    const phone = normalizePhone(getRowValue(row, ['telefono', 'teléfono', 'whatsapp', 'celular', 'movil', 'móvil']));
    const email = normalizeText(getRowValue(row, ['correo', 'email', 'correo_electronico']));
    const address = normalizeText(getRowValue(row, ['direccion', 'dirección', 'domicilio', 'ubicacion', 'ubicación']));
    const entrada = normalizeText(getRowValue(row, ['entrada', 'hora_entrada', 'horario_entrada'])) || '08:00';
    const salida = normalizeText(getRowValue(row, ['salida', 'hora_salida', 'horario_salida'])) || '17:00';
    const role = normalizeText(getRowValue(row, ['rol', 'puesto', 'cargo'])) || 'Usuario';
    const latRaw = getRowValue(row, ['lat', 'latitud']);
    const lonRaw = getRowValue(row, ['lon', 'lng', 'longitud']);
    const lat = String(latRaw).trim() ? Number(latRaw) : NaN;
    const lon = String(lonRaw).trim() ? Number(lonRaw) : NaN;
    const alias = normalizeText(getRowValue(row, ['alias', 'nombre_ubicacion', 'punto'])) || name;

    return {
        rowNumber: index + 2,
        name,
        phone,
        email,
        address,
        entrada,
        salida,
        role,
        alias,
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
        valid: Boolean(name && (phone || email)),
        error: !name ? 'Falta nombre' : (!phone && !email ? 'Falta teléfono o correo' : '')
    };
};

export default function Clientes() {
  // Cargar Google Maps (Usamos el mismo ID que en App.jsx para evitar errores)
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: GOOGLE_MAPS_API_KEY, libraries, language: 'es' });

  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Lista de Clientes
  const [clients, setClients] = useState([]);
  const [filterType, setFilterType] = useState('Todos'); 
  const [searchTerm, setSearchTerm] = useState('');

  // Estado para Edición
  const [editingId, setEditingId] = useState(null);
  const [editingUserIndex, setEditingUserIndex] = useState(null);
  const [editingLocationIndex, setEditingLocationIndex] = useState(null);

  // Carga masiva
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkClientId, setBulkClientId] = useState('');
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const bulkFileRef = useRef(null);

  // Formulario
  const [newClient, setNewClient] = useState({
      name: '', type: 'Empresa', phone: '', email: '',
      users: [], 
      locations: [] 
  });

  // CAMBIO: Añadimos entrada y salida al estado temporal del usuario
  const [tempUser, setTempUser] = useState({ name: '', phone: '', email: '', role: 'Encargado', entrada: '08:00', salida: '17:00' });
  const [tempLoc, setTempLoc] = useState({ alias: '', address: '', lat: null, lon: null, assignedTo: 'General' });

  // === 1. LEER CLIENTES ===
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'clientes'),
      snapshot => {
        const docs = snapshot.docs
          .map(clientDoc => {
              const data = clientDoc.data();
              return { id: clientDoc.id, ...data, users: sortUsersAZ(data.users || []) };
          })
          .sort(compareNamesAZ);
        setClients(docs);
        setLoading(false);
      },
      error => {
        console.error('No se pudieron cargar los clientes:', error);
        setLoading(false);
      }
    );
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
                  users: sortUsersAZ(newClient.users || []),
              });
          } else {
              // === MODO CREACIÓN ===
              const clientToSave = {
                  ...newClient,
                  users: sortUsersAZ(newClient.users || []),
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
          users: sortUsersAZ(client.users || []),
          locations: client.locations || []
      });
      setShowModal(true);
  };

  const resetForm = () => {
      setNewClient({ name: '', type: 'Empresa', phone: '', email: '', users: [], locations: [] });
      setTempUser({ name: '', phone: '', email: '', role: 'Encargado', entrada: '08:00', salida: '17:00' }); 
      setEditingUserIndex(null);
      setEditingLocationIndex(null);
      setTempLoc({ alias: '', address: '', lat: null, lon: null, assignedTo: 'General' });
      setEditingId(null);
  };

  const handleDelete = async (id) => {
      if(confirm("¿Eliminar cliente de la base de datos?")) {
          await deleteDoc(doc(db, "clientes", id));
      }
  };

  const persistClientArrays = async (users, locations) => {
      if (!editingId) return;
      await updateDoc(doc(db, 'clientes', editingId), {
          users,
          locations,
          updatedAt: new Date().toISOString()
      });
  };

  const addUser = async () => {
      if(!tempUser.name || (!tempUser.phone && !tempUser.email)) {
          return alert("Ingresa el nombre y al menos teléfono o correo");
      }

      const normalizedPhone = normalizePhone(tempUser.phone);
      const normalizedName = normalizeText(tempUser.name).toLowerCase();
      const normalizedEmail = normalizeText(tempUser.email).toLowerCase();

      const globalDuplicate = clients
          .flatMap(client => (client.users || []).map((user, userIndex) => ({ client, user, userIndex })))
          .find(({ client, user, userIndex }) => {
              const isSameRecord = client.id === editingId && userIndex === editingUserIndex;
              if (isSameRecord) return false;
              const phoneMatch = Boolean(
                  normalizedPhone &&
                  normalizePhone(user.phone) &&
                  normalizePhone(user.phone) === normalizedPhone
              );
              const emailMatch = Boolean(
                  normalizedEmail &&
                  normalizeText(user.email).toLowerCase() === normalizedEmail
              );
              return phoneMatch || emailMatch;
          });

      if (globalDuplicate && globalDuplicate.client.id !== editingId) {
          alert(
              `Este usuario ya existe en la cuenta "${globalDuplicate.client.name}" ` +
              `como "${globalDuplicate.user.name}". Revisa el registro antes de crear un duplicado.`
          );
          return;
      }

      const duplicateIndex = newClient.users.findIndex((item, index) => {
          if (index === editingUserIndex) return false;
          const samePhone = Boolean(
              normalizedPhone &&
              normalizePhone(item.phone) &&
              normalizePhone(item.phone) === normalizedPhone
          );
          const sameEmail = Boolean(
              normalizedEmail &&
              normalizeText(item.email).toLowerCase() === normalizedEmail
          );
          const sameName = Boolean(
              normalizedName &&
              normalizeText(item.name).toLowerCase() === normalizedName
          );
          return samePhone || sameEmail || sameName;
      });

      if (duplicateIndex >= 0) {
          const existing = newClient.users[duplicateIndex];
          setEditingUserIndex(duplicateIndex);
          setTempUser({
              name: existing?.name || '',
              phone: existing?.phone || '',
              email: existing?.email || '',
              role: existing?.role || 'Usuario',
              entrada: existing?.entrada || '08:00',
              salida: existing?.salida || '17:00'
          });
          alert(
              `Este usuario ya existe como "${existing?.name || 'usuario registrado'}". ` +
              'Se cargó su registro para que lo edites en lugar de duplicarlo.'
          );
          return;
      }

      const users = [...newClient.users];
      const previousName = editingUserIndex !== null ? users[editingUserIndex]?.name : '';
      const userToSave = { ...tempUser, phone: normalizedPhone || tempUser.phone };

      if (editingUserIndex !== null) {
          users[editingUserIndex] = userToSave;
      } else {
          users.push(userToSave);
      }
      const sortedUsers = sortUsersAZ(users);

      const locations = previousName && previousName !== userToSave.name
          ? newClient.locations.map(location =>
              location.assignedTo === previousName
                  ? { ...location, assignedTo: userToSave.name }
                  : location
            )
          : newClient.locations;

      setNewClient({...newClient, users: sortedUsers, locations});
      try {
          await persistClientArrays(sortedUsers, locations);
          if (editingId) alert(editingUserIndex !== null ? 'Usuario actualizado correctamente.' : 'Usuario agregado correctamente.');
      } catch (error) {
          console.error('No se pudo guardar el usuario:', error);
          return alert('No fue posible guardar el usuario en la base de datos.');
      }
      setTempUser({ name: '', phone: '', email: '', role: 'Encargado', entrada: '08:00', salida: '17:00' }); 
      setEditingUserIndex(null);
  };

  const editUser = (index) => {
      const user = newClient.users[index];
      setTempUser({
          name: user?.name || '',
          phone: user?.phone || '',
          email: user?.email || '',
          role: user?.role || 'Usuario',
          entrada: user?.entrada || '08:00',
          salida: user?.salida || '17:00'
      });
      setEditingUserIndex(index);
  };

  const addLocation = async () => {
      if(!tempLoc.alias || !tempLoc.address) return alert("Define un alias y dirección");
      const locations = [...newClient.locations];
      if (editingLocationIndex !== null) locations[editingLocationIndex] = tempLoc;
      else locations.push(tempLoc);
      setNewClient({...newClient, locations});
      try {
          await persistClientArrays(newClient.users, locations);
          if (editingId) alert(editingLocationIndex !== null ? 'Ubicación actualizada correctamente.' : 'Ubicación agregada correctamente.');
      } catch (error) {
          console.error('No se pudo guardar la ubicación:', error);
          return alert('No fue posible guardar la ubicación en la base de datos.');
      }
      setTempLoc({ alias: '', address: '', lat: null, lon: null, assignedTo: 'General' });
      setEditingLocationIndex(null);
  };

  const editLocation = (index) => {
      setTempLoc({ ...newClient.locations[index] });
      setEditingLocationIndex(index);
  };

  const deleteUser = async (index) => {
      const user = newClient.users[index];
      if (!confirm(`¿Eliminar a ${user?.name || 'este usuario'}?`)) return;
      const users = newClient.users.filter((_, itemIndex) => itemIndex !== index);
      const locations = newClient.locations.filter(location => location.assignedTo !== user?.name);
      setNewClient({ ...newClient, users, locations });
      try {
          await persistClientArrays(users, locations);
      } catch (error) {
          console.error('No se pudo eliminar el usuario:', error);
          alert('No fue posible eliminar el usuario de la base de datos.');
      }
  };

  const deleteLocation = async (index) => {
      const locations = newClient.locations.filter((_, itemIndex) => itemIndex !== index);
      setNewClient({ ...newClient, locations });
      try {
          await persistClientArrays(newClient.users, locations);
      } catch (error) {
          console.error('No se pudo eliminar la ubicación:', error);
          alert('No fue posible eliminar la ubicación de la base de datos.');
      }
  };

  const downloadBulkTemplate = () => {
      const rows = [
          {
              Nombre: 'Ejemplo Usuario',
              Telefono: '6141234567',
              Correo: 'usuario@empresa.com',
              Direccion: 'Av. Ejemplo 123, Chihuahua, Chih.',
              Entrada: '08:00',
              Salida: '17:00',
              Rol: 'Empleado',
              Alias: 'Casa Ejemplo',
              Latitud: '',
              Longitud: ''
          }
      ];
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Usuarios');
      XLSX.writeFile(workbook, 'Plantilla_Usuarios_TripLogix.xlsx');
  };

  const readBulkFile = async (file) => {
      if (!file) return;
      try {
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
          const parsedRows = rawRows.map(parseBulkRow);
          setBulkRows(parsedRows);
          setBulkResult(null);
      } catch (error) {
          console.error(error);
          alert('No se pudo leer el archivo. Usa XLSX, XLS o CSV.');
      }
  };

  const geocodeAddress = async (address) => {
      if (!address || !window.google?.maps?.Geocoder) return null;
      try {
          const geocoder = new window.google.maps.Geocoder();
          const response = await geocoder.geocode({ address });
          const location = response?.results?.[0]?.geometry?.location;
          if (!location) return null;
          return { lat: location.lat(), lon: location.lng() };
      } catch {
          return null;
      }
  };

  const executeBulkImport = async () => {
      const client = clients.find(item => item.id === bulkClientId);
      if (!client) return alert('Selecciona la empresa que recibirá los usuarios.');

      const validRows = bulkRows.filter(row => row.valid);
      if (!validRows.length) return alert('No hay registros válidos para importar.');

      setBulkLoading(true);
      setBulkResult(null);

      try {
          const users = [...(client.users || [])];
          const locations = [...(client.locations || [])];
          let created = 0;
          let updated = 0;
          let locationsAdded = 0;

          for (const row of validRows) {
              const phone = normalizePhone(row.phone);
              const existingIndex = users.findIndex(item =>
                  (phone && normalizePhone(item.phone) === phone) ||
                  normalizeText(item.name).toLowerCase() === normalizeText(row.name).toLowerCase()
              );

              const userData = {
                  ...(existingIndex >= 0 ? users[existingIndex] : {}),
                  name: row.name,
                  phone,
                  email: row.email,
                  role: row.role,
                  entrada: row.entrada,
                  salida: row.salida
              };

              if (existingIndex >= 0) {
                  const previousName = users[existingIndex]?.name;
                  users[existingIndex] = userData;
                  if (previousName && previousName !== row.name) {
                      for (let i = 0; i < locations.length; i += 1) {
                          if (locations[i].assignedTo === previousName) {
                              locations[i] = { ...locations[i], assignedTo: row.name };
                          }
                      }
                  }
                  updated += 1;
              } else {
                  users.push(userData);
                  created += 1;
              }

              if (row.address) {
                  let coordinates = row.lat !== null && row.lon !== null
                      ? { lat: row.lat, lon: row.lon }
                      : await geocodeAddress(row.address);

                  const locationIndex = locations.findIndex(location =>
                      location.assignedTo === row.name ||
                      (
                          normalizeText(location.address).toLowerCase() === normalizeText(row.address).toLowerCase() &&
                          location.assignedTo !== 'General'
                      )
                  );

                  const locationData = {
                      ...(locationIndex >= 0 ? locations[locationIndex] : {}),
                      alias: row.alias || row.name,
                      address: row.address,
                      lat: coordinates?.lat ?? null,
                      lon: coordinates?.lon ?? null,
                      assignedTo: row.name
                  };

                  if (locationIndex >= 0) locations[locationIndex] = locationData;
                  else {
                      locations.push(locationData);
                      locationsAdded += 1;
                  }
              }
          }

          await updateDoc(doc(db, 'clientes', client.id), {
              users: sortUsersAZ(users),
              locations,
              updatedAt: new Date().toISOString()
          });

          setBulkResult({ created, updated, locationsAdded, skipped: bulkRows.length - validRows.length });
      } catch (error) {
          console.error(error);
          alert('No se pudo completar la carga masiva.');
      } finally {
          setBulkLoading(false);
      }
  };

  const filteredClients = clients.filter(client => {
      const matchesType = filterType === 'Todos' || client.type === filterType;
      const term = normalizeText(searchTerm).toLowerCase();
      if (!matchesType) return false;
      if (!term) return true;
      return [
          client.name,
          client.phone,
          client.email,
          ...(client.users || []).flatMap(user => [user.name, user.phone, user.email])
      ].some(value => normalizeText(value).toLowerCase().includes(term));
  }).sort(compareNamesAZ);

  if (!isLoaded) return <div className="flex items-center justify-center h-full text-slate-400">Cargando módulos...</div>;

  return (
    <div className="flex-1 p-8 bg-slate-50 overflow-y-auto h-full relative">
      <div className="flex justify-between items-center mb-6">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Cartera de Clientes</h2>
            <p className="text-slate-500">{clients.length} registrados en Nube</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => { setShowBulkModal(true); setBulkRows([]); setBulkResult(null); }} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-emerald-700 transition shadow-lg">
                <Upload className="w-4 h-4" /> Carga masiva
            </button>
            <button onClick={() => { resetForm(); setShowModal(true); }} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:scale-105 transition shadow-lg">
                <Plus className="w-4 h-4" /> Nuevo Cliente
            </button>
        </div>
      </div>

      {/* FILTROS */}
      <div className="flex flex-col xl:flex-row gap-3 mb-6">
          <div className="flex gap-2 bg-white p-2 rounded-lg border border-slate-200 w-fit shadow-sm">
              <button onClick={() => setFilterType('Todos')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition ${filterType === 'Todos' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Todos</button>
              <button onClick={() => setFilterType('Empresa')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-2 ${filterType === 'Empresa' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}><Building className="w-3 h-3"/> Empresas</button>
              <button onClick={() => setFilterType('Individual')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-2 ${filterType === 'Individual' ? 'bg-purple-100 text-purple-700' : 'text-slate-500 hover:bg-slate-50'}`}><User className="w-3 h-3"/> Individuales</button>
          </div>
          <div className="relative flex-1 max-w-xl">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar empresa, usuario, teléfono o correo..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 shadow-sm"
              />
          </div>
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
            <div className="bg-white w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800">{editingId ? 'Editar Cliente' : 'Alta de Cliente'}</h3>
                    <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-slate-400 hover:text-red-500"/></button>
                </div>
                
                <div className="flex-1 flex overflow-hidden">
                    {/* COLUMNA IZQUIERDA */}
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

                    {/* COLUMNA DERECHA */}
                    <div className="flex-1 p-6 overflow-y-auto">
                        {/* SECCIÓN USUARIOS (SOLO EMPRESAS) */}
                        {newClient.type === 'Empresa' && (
                            <div className="mb-8">
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2"><Users className="w-4 h-4"/> Usuarios Autorizados</h4>
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-3">
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-2">
                                        <input placeholder="Nombre" className="text-xs p-2 rounded border outline-none focus:border-blue-500 md:col-span-3" value={tempUser.name} onChange={e => setTempUser({...tempUser, name: e.target.value})} />
                                        <input type="tel" placeholder="Teléfono" className="text-xs p-2 rounded border outline-none focus:border-blue-500 md:col-span-2" value={tempUser.phone} onChange={e => setTempUser({...tempUser, phone: e.target.value})} />
                                        <input type="email" placeholder="Correo" className="text-xs p-2 rounded border outline-none focus:border-blue-500 md:col-span-3" value={tempUser.email || ''} onChange={e => setTempUser({...tempUser, email: e.target.value})} />
                                        
                                        <div className="flex items-center gap-1 md:col-span-1" title="Hora de Entrada">
                                            <span className="text-[9px] font-bold text-slate-400">ENT:</span>
                                            <input type="time" className="text-xs p-2 rounded border w-full outline-none focus:border-blue-500" value={tempUser.entrada} onChange={e => setTempUser({...tempUser, entrada: e.target.value})} />
                                        </div>
                                        <div className="flex items-center gap-1 md:col-span-1" title="Hora de Salida">
                                            <span className="text-[9px] font-bold text-slate-400">SAL:</span>
                                            <input type="time" className="text-xs p-2 rounded border w-full outline-none focus:border-blue-500" value={tempUser.salida} onChange={e => setTempUser({...tempUser, salida: e.target.value})} />
                                        </div>

                                        <button type="button" onClick={addUser} className="bg-slate-800 text-white text-xs rounded font-bold hover:bg-slate-700 transition md:col-span-2">{editingUserIndex !== null ? 'Actualizar' : 'Agregar'}</button>
                                    </div>
                                    <div className="space-y-2 mt-4">
                                        {newClient.users.map((u, i) => (
                                            <div key={i} className="flex justify-between items-center text-xs bg-white p-3 rounded border border-slate-100 shadow-sm">
                                                <span className="flex items-center flex-wrap gap-2">
                                                    <span className="font-bold text-slate-700">{u.name}</span> 
                                                    <span className="text-slate-400">({u.phone || u.email || 'Sin contacto'})</span>
                                                    {u.entrada && u.salida && (
                                                        <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-bold flex items-center gap-1">
                                                            <Clock className="w-3 h-3"/> {u.entrada} a {u.salida}
                                                        </span>
                                                    )}
                                                </span>
                                                <div className="flex gap-1">
                                                    <button type="button" onClick={() => editUser(i)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded transition" title="Editar usuario"><Pencil className="w-3.5 h-3.5"/></button>
                                                    <button type="button" onClick={() => deleteUser(i)} className="text-red-400 hover:bg-red-50 p-1.5 rounded transition" title="Eliminar usuario"><Trash2 className="w-3.5 h-3.5"/></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SECCIÓN UBICACIONES */}
                        <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2"><MapPin className="w-4 h-4"/> Ubicaciones Frecuentes</h4>
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-3">
                                <div className="space-y-2 mb-2">
                                    <div className="flex gap-2">
                                        <input placeholder="Alias (Ej. Bodega Norte)" className="text-xs p-2 rounded border flex-1 outline-none focus:border-blue-500" value={tempLoc.alias} onChange={e => setTempLoc({...tempLoc, alias: e.target.value})} />
                                        
                                        {newClient.type === 'Empresa' && (
                                            <select 
                                                className="text-xs p-2 rounded border w-1/3 text-slate-600 outline-none bg-white focus:border-blue-500" 
                                                value={tempLoc.assignedTo} 
                                                onChange={e => setTempLoc({...tempLoc, assignedTo: e.target.value})}
                                            >
                                                <option value="General">🏢 General (Empresa)</option>
                                                {newClient.users.map((u, i) => (
                                                    <option key={i} value={u.name}>👤 {u.name}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                    
                                    {/* Componente Google Autocomplete */}
                                    <AddressAutocomplete 
                                        placeholder="Buscar dirección en Google Maps..." 
                                        value={tempLoc.address} 
                                        onSelect={(item) => setTempLoc({...tempLoc, address: item.address, lat: item.lat, lon: item.lon})} 
                                    />
                                </div>
                                <button type="button" onClick={addLocation} className="w-full py-2 bg-blue-600 text-white text-xs rounded font-bold hover:bg-blue-700 transition shadow-sm">{editingLocationIndex !== null ? 'Actualizar ubicación' : 'Guardar ubicación'}</button>
                                
                                <div className="space-y-2 mt-4">
                                    {newClient.locations.map((l, i) => (
                                        <div key={i} className="flex justify-between items-center text-xs bg-white p-2 rounded border border-blue-100 shadow-sm">
                                            <div className="flex-1 mr-4">
                                                <p className="font-bold text-slate-800 flex items-center gap-2 mb-1">
                                                    {l.alias} 
                                                    {l.assignedTo && l.assignedTo !== 'General' ? 
                                                        <span className="text-[9px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">👤 {l.assignedTo}</span> 
                                                        : 
                                                        <span className="text-[9px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">🏢 General</span>
                                                    }
                                                </p>
                                                <p className="text-slate-500 truncate">{l.address}</p>
                                            </div>
                                            <div className="flex gap-1 shrink-0">
                                                <button type="button" onClick={() => editLocation(i)} className="text-blue-500 hover:bg-blue-50 p-1 rounded transition" title="Editar ubicación"><Pencil className="w-3 h-3"/></button>
                                                <button type="button" onClick={() => deleteLocation(i)} className="text-red-400 hover:bg-red-50 p-1 rounded transition" title="Eliminar ubicación"><Trash2 className="w-3 h-3"/></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
                <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
                    <button onClick={() => setShowModal(false)} className="px-5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded transition">Cancelar</button>
                    <button onClick={handleSaveClient} className="px-6 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2 shadow-lg shadow-blue-500/30 transition">
                        <Save className="w-4 h-4"/> {editingId ? 'Actualizar Cliente' : 'Guardar Cliente'}
                    </button>
                </div>
            </div>
        </div>
      )}


      {showBulkModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white w-full max-w-5xl h-[88vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                      <div>
                          <h3 className="font-black text-slate-800 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-600"/> Carga masiva de usuarios</h3>
                          <p className="text-xs text-slate-500 mt-1">Importa usuarios, horarios y direcciones desde Excel o CSV.</p>
                      </div>
                      <button onClick={() => setShowBulkModal(false)} className="p-2 text-slate-400 hover:text-red-500"><X className="w-5 h-5"/></button>
                  </div>

                  <div className="p-6 border-b border-slate-100 grid grid-cols-1 lg:grid-cols-3 gap-4">
                      <div>
                          <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Empresa destino</label>
                          <select value={bulkClientId} onChange={event => setBulkClientId(event.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-emerald-500">
                              <option value="">Selecciona una empresa...</option>
                              {clients.filter(client => client.type === 'Empresa').map(client => (
                                  <option key={client.id} value={client.id}>{client.name}</option>
                              ))}
                          </select>
                      </div>
                      <div className="flex items-end">
                          <input
                              ref={bulkFileRef}
                              type="file"
                              accept=".xlsx,.xls,.csv"
                              className="hidden"
                              onChange={event => readBulkFile(event.target.files?.[0])}
                          />
                          <button onClick={() => bulkFileRef.current?.click()} className="w-full px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-emerald-700">
                              <Upload className="w-4 h-4"/> Seleccionar Excel o CSV
                          </button>
                      </div>
                      <div className="flex items-end">
                          <button onClick={downloadBulkTemplate} className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-50">
                              <Download className="w-4 h-4"/> Descargar plantilla
                          </button>
                      </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6">
                      {bulkRows.length === 0 ? (
                          <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center text-slate-400">
                              <FileSpreadsheet className="w-12 h-12 mb-3 text-slate-300"/>
                              <p className="font-bold text-slate-600">Aún no se ha seleccionado un archivo</p>
                              <p className="text-xs mt-2 max-w-xl">Columnas recomendadas: Nombre, Teléfono, Correo, Dirección, Entrada, Salida, Rol, Alias, Latitud y Longitud.</p>
                          </div>
                      ) : (
                          <div className="space-y-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  <div className="rounded-xl border border-slate-200 p-3"><p className="text-[10px] uppercase font-black text-slate-400">Registros</p><p className="text-xl font-black text-slate-800">{bulkRows.length}</p></div>
                                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-[10px] uppercase font-black text-emerald-600">Válidos</p><p className="text-xl font-black text-emerald-700">{bulkRows.filter(row => row.valid).length}</p></div>
                                  <div className="rounded-xl border border-red-200 bg-red-50 p-3"><p className="text-[10px] uppercase font-black text-red-500">Con errores</p><p className="text-xl font-black text-red-600">{bulkRows.filter(row => !row.valid).length}</p></div>
                                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3"><p className="text-[10px] uppercase font-black text-blue-500">Direcciones</p><p className="text-xl font-black text-blue-700">{bulkRows.filter(row => row.address).length}</p></div>
                              </div>

                              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                                  <table className="w-full min-w-[900px] text-xs">
                                      <thead className="bg-slate-100 text-slate-500 uppercase">
                                          <tr>
                                              <th className="text-left p-3">Fila</th>
                                              <th className="text-left p-3">Estado</th>
                                              <th className="text-left p-3">Nombre</th>
                                              <th className="text-left p-3">Teléfono</th>
                                              <th className="text-left p-3">Correo</th>
                                              <th className="text-left p-3">Entrada</th>
                                              <th className="text-left p-3">Salida</th>
                                              <th className="text-left p-3">Dirección</th>
                                          </tr>
                                      </thead>
                                      <tbody>
                                          {bulkRows.map((row, index) => (
                                              <tr key={`${row.rowNumber}-${index}`} className="border-t border-slate-100">
                                                  <td className="p-3 font-mono">{row.rowNumber}</td>
                                                  <td className="p-3">
                                                      {row.valid
                                                          ? <span className="inline-flex items-center gap-1 text-emerald-700 font-bold"><CheckCircle2 className="w-3.5 h-3.5"/> Válido</span>
                                                          : <span className="inline-flex items-center gap-1 text-red-600 font-bold" title={row.error}><AlertTriangle className="w-3.5 h-3.5"/> {row.error}</span>}
                                                  </td>
                                                  <td className="p-3 font-bold text-slate-800">{row.name || '-'}</td>
                                                  <td className="p-3">{row.phone || '-'}</td>
                                                  <td className="p-3">{row.email || '-'}</td>
                                                  <td className="p-3">{row.entrada}</td>
                                                  <td className="p-3">{row.salida}</td>
                                                  <td className="p-3 max-w-[300px] truncate" title={row.address}>{row.address || '-'}</td>
                                              </tr>
                                          ))}
                                      </tbody>
                                  </table>
                              </div>

                              {bulkResult && (
                                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                                      <p className="font-black">Carga terminada</p>
                                      <p className="mt-1">Nuevos: {bulkResult.created} · Actualizados: {bulkResult.updated} · Ubicaciones nuevas: {bulkResult.locationsAdded} · Omitidos: {bulkResult.skipped}</p>
                                  </div>
                              )}
                          </div>
                      )}
                  </div>

                  <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3">
                      <button onClick={() => setShowBulkModal(false)} className="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100">Cerrar</button>
                      <button
                          onClick={executeBulkImport}
                          disabled={bulkLoading || !bulkClientId || bulkRows.filter(row => row.valid).length === 0}
                          className="px-6 py-2.5 rounded-lg text-sm font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-2"
                      >
                          {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
                          {bulkLoading ? 'Importando...' : 'Importar y actualizar'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* ESTILOS PARA QUE GOOGLE NO QUEDE OCULTO */}
      <style>{`
        .pac-container {
          z-index: 20000 !important;
          border-radius: 8px;
          margin-top: 5px;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
          font-family: inherit;
        }
        .pac-item {
          padding: 8px 12px;
          font-size: 12px;
          cursor: pointer;
        }
        .pac-item:hover {
          background-color: #f1f5f9;
        }
      `}</style>
    </div>
  );
}