import React, { useEffect, useMemo, useState } from 'react';
import { Building2, KeyRound, Plus, Trash2, RefreshCw, ShieldCheck, Eye, EyeOff, Loader2 } from 'lucide-react';
import { db } from './firebase';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';

const bytesToHex = (bytes) => Array.from(bytes).map(value => value.toString(16).padStart(2, '0')).join('');

const sha256 = async (value) => {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hash));
};

const buildPasswordRecord = async (password) => {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const passwordSalt = bytesToHex(saltBytes);
  const passwordHash = await sha256(`${passwordSalt}:${password}`);
  return { passwordSalt, passwordHash };
};

export default function AccesosEmpresas() {
  const [clients, setClients] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const unsubClients = onSnapshot(collection(db, 'clientes'), snap => {
      setClients(snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es')));
    });
    const unsubAccounts = onSnapshot(collection(db, 'administradores'), snap => {
      setAccounts(
        snap.docs
          .map(item => ({ id: item.id, ...item.data() }))
          .filter(item => item.role === 'EmpresaMonitor')
          .sort((a, b) => String(a.companyName || '').localeCompare(String(b.companyName || ''), 'es'))
      );
    });
    return () => { unsubClients(); unsubAccounts(); };
  }, []);

  const selectedClient = useMemo(() => clients.find(client => client.id === companyId) || null, [clients, companyId]);

  const createAccount = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    if (!selectedClient) return setMessage('Selecciona una empresa.');
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return setMessage('Escribe un correo válido.');
    if (cleanPassword.length < 8) return setMessage('La contraseña debe tener al menos 8 caracteres.');
    if (accounts.some(account => String(account.email || '').toLowerCase() === cleanEmail)) return setMessage('Ese correo ya tiene un acceso de empresa.');

    setSaving(true);
    setMessage('');
    try {
      const passwordRecord = await buildPasswordRecord(cleanPassword);
      await addDoc(collection(db, 'administradores'), {
        name: name.trim() || selectedClient.name,
        email: cleanEmail,
        ...passwordRecord,
        role: 'EmpresaMonitor',
        companyId: selectedClient.id,
        companyName: selectedClient.name,
        permissions: ['monitor:read'],
        status: 'Activo',
        createdAt: new Date().toISOString()
      });
      setEmail('');
      setName('');
      setPassword('');
      setCompanyId('');
      setMessage('Acceso creado correctamente. La contraseña no se guarda en texto plano.');
    } catch (error) {
      setMessage(error.message || 'No se pudo crear el acceso.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (account) => {
    await updateDoc(doc(db, 'administradores', account.id), {
      status: account.status === 'Inactivo' ? 'Activo' : 'Inactivo',
      updatedAt: new Date().toISOString()
    });
  };

  const resetPassword = async (account) => {
    const nextPassword = window.prompt(`Nueva contraseña para ${account.email} (mínimo 8 caracteres):`);
    if (nextPassword === null) return;
    if (String(nextPassword).trim().length < 8) return alert('La contraseña debe tener al menos 8 caracteres.');
    const passwordRecord = await buildPasswordRecord(String(nextPassword).trim());
    await updateDoc(doc(db, 'administradores', account.id), {
      ...passwordRecord,
      password: null,
      passwordUpdatedAt: new Date().toISOString()
    });
    alert('Contraseña actualizada.');
  };

  const removeAccount = async (account) => {
    if (!window.confirm(`¿Eliminar el acceso ${account.email}?`)) return;
    await deleteDoc(doc(db, 'administradores', account.id));
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y bg-slate-50 p-4 md:p-6 xl:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-black text-orange-500">Acceso empresarial</p>
          <h2 className="text-2xl md:text-3xl font-black text-slate-800">Monitoreo por empresa</h2>
          <p className="text-sm text-slate-500 mt-1">Crea correo y contraseña para que cada cliente vea únicamente su monitor de rutas en modo solo lectura.</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 h-fit">
            <div className="flex items-center gap-2 mb-4"><Plus className="w-5 h-5 text-orange-500"/><h3 className="font-black text-slate-800">Nuevo acceso</h3></div>
            <div className="space-y-3">
              <label className="block text-[10px] uppercase font-black text-slate-500">Empresa
                <select value={companyId} onChange={event => setCompanyId(event.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-white outline-none focus:border-orange-400">
                  <option value="">Seleccionar empresa...</option>
                  {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
              </label>
              <label className="block text-[10px] uppercase font-black text-slate-500">Nombre de contacto / etiqueta
                <input value={name} onChange={event => setName(event.target.value)} placeholder={selectedClient?.name || 'Ej. Mauricio Calderón'} className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 text-sm outline-none focus:border-orange-400"/>
              </label>
              <label className="block text-[10px] uppercase font-black text-slate-500">Correo
                <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="monitor@empresa.com" className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 text-sm outline-none focus:border-orange-400"/>
              </label>
              <label className="block text-[10px] uppercase font-black text-slate-500">Contraseña
                <div className="relative mt-1">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" className="w-full border border-slate-200 rounded-xl p-2.5 pr-10 text-sm outline-none focus:border-orange-400"/>
                  <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400">{showPassword ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}</button>
                </div>
              </label>
              <button type="button" disabled={saving} onClick={createAccount} className="w-full rounded-xl bg-slate-900 hover:bg-slate-800 text-white py-3 font-black text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <KeyRound className="w-4 h-4"/>} Crear acceso
              </button>
              {message && <p className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">{message}</p>}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 flex gap-3">
              <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0"/>
              <div><p className="font-black text-blue-900 text-sm">Modo solo lectura</p><p className="text-xs text-blue-800/70 mt-1">Las cuentas EmpresaMonitor abren una pantalla separada y no reciben menús de planificación, clientes, conductores, reportes ni controles para iniciar/cancelar/finalizar viajes.</p></div>
            </div>

            {accounts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-400"><Building2 className="w-10 h-10 mx-auto mb-3 opacity-30"/><p className="font-black text-sm">Aún no hay accesos empresariales</p></div>
            ) : accounts.map(account => (
              <div key={account.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-orange-500"/><p className="font-black text-slate-800 truncate">{account.companyName || 'Empresa'}</p></div>
                  <p className="text-xs font-bold text-slate-500 mt-1">{account.email}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{account.name || 'Contacto'} · {account.status || 'Activo'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => toggleStatus(account)} className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase ${account.status === 'Inactivo' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>{account.status === 'Inactivo' ? 'Activar' : 'Suspender'}</button>
                  <button type="button" onClick={() => resetPassword(account)} className="px-3 py-2 rounded-lg text-[10px] font-black uppercase bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1"><RefreshCw className="w-3 h-3"/> Contraseña</button>
                  <button type="button" onClick={() => removeAccount(account)} className="px-3 py-2 rounded-lg text-[10px] font-black uppercase bg-red-50 text-red-700 border border-red-200 flex items-center gap-1"><Trash2 className="w-3 h-3"/> Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
