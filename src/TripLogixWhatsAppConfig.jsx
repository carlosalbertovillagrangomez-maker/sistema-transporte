import React, { useEffect, useState } from 'react';
import { db } from './firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

const DEFAULTS = {
  enabled: false,
  templateName: 'triplogix_ruta_asignada',
  templateLanguage: 'es_MX',
  requireOptIn: true,
  clientTrackingUrl: 'https://app-cliente-five.vercel.app'
};

export default function TripLogixWhatsAppConfig() {
  const [config, setConfig] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'integraciones', 'whatsapp'), snap => {
      if(snap.exists()) setConfig({ ...DEFAULTS, ...snap.data() });
    }, error => setMessage(error.message));
    fetch('/api/whatsapp/sync?check=1').then(r => r.json()).then(setStatus).catch(() => setStatus(null));
    return unsub;
  }, []);

  const save = async(event) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      if (!/^[a-z0-9_]+$/.test(config.templateName.trim())) throw new Error('La plantilla debe contener sólo letras minúsculas, números y guiones bajos.');
      if (!/^https:\/\//.test(config.clientTrackingUrl)) throw new Error('Usa una URL HTTPS para el seguimiento.');
      await setDoc(doc(db,'integraciones','whatsapp'), {
        enabled: Boolean(config.enabled),
        templateName: config.templateName.trim(),
        templateLanguage: config.templateLanguage.trim() || 'es_MX',
        requireOptIn: true,
        clientTrackingUrl: config.clientTrackingUrl.trim(),
        updatedAt: new Date().toISOString()
      }, { merge:true });
      setMessage('Configuración guardada. Los secretos se establecen exclusivamente en Vercel.');
    } catch(error) { setMessage(error.message); } finally { setSaving(false); }
  };

  return (
    <div className="p-5 md:p-8 bg-slate-50 overflow-y-auto h-full">
      <div className="max-w-3xl mx-auto space-y-5">
        <div><h2 className="text-2xl font-black text-slate-800">Configuración · WhatsApp Cloud API</h2><p className="text-sm text-slate-500 mt-1">Automatización oficial de Meta para avisos de rutas asignadas. Sin credenciales ni contraseñas en el navegador.</p></div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <h3 className="font-black text-slate-800 mb-2">Estado de infraestructura</h3>
          <p className="text-xs text-slate-600">{status ? (status.configured ? '✓ Variables del servidor detectadas.' : '⚠ Faltan variables en Vercel. La automatización permanecerá apagada.') : 'El servidor de WhatsApp aún no está accesible en este entorno.'}</p>
          <p className="text-xs text-slate-500 mt-3">En Vercel → Proyecto Despachador → Settings → Environment Variables registra:</p>
          <code className="text-xs block bg-slate-50 p-3 rounded-xl mt-2 break-all">WHATSAPP_ACCESS_TOKEN · WHATSAPP_PHONE_NUMBER_ID · FIREBASE_SERVICE_ACCOUNT_JSON · CRON_SECRET</code>
          <p className="text-[11px] text-amber-700 mt-2">Nunca pegues el token de Meta ni la clave privada de Firebase en este formulario, Firestore o GitHub.</p>
        </div>
        <form onSubmit={save} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={config.enabled} onChange={event => setConfig(prev=>({...prev,enabled:event.target.checked}))} /> Activar envío automático (cuando el servidor tenga credenciales y haya consentimiento)</label>
          <label className="block text-xs font-bold text-slate-700">Nombre de plantilla aprobada en Meta<input className="mt-1 w-full border rounded-lg p-3" value={config.templateName} onChange={event=>setConfig(prev=>({...prev,templateName:event.target.value}))} required /></label>
          <label className="block text-xs font-bold text-slate-700">Idioma de plantilla<input className="mt-1 w-full border rounded-lg p-3" value={config.templateLanguage} onChange={event=>setConfig(prev=>({...prev,templateLanguage:event.target.value}))} /></label>
          <label className="block text-xs font-bold text-slate-700">URL de seguimiento de clientes<input className="mt-1 w-full border rounded-lg p-3" value={config.clientTrackingUrl} onChange={event=>setConfig(prev=>({...prev,clientTrackingUrl:event.target.value}))} /></label>
          <p className="text-xs bg-amber-50 border border-amber-100 text-amber-800 p-3 rounded-lg">Se exige consentimiento expreso para avisos por WhatsApp. En Excel/Google Sheets usa la columna WHATSAPP_AUTORIZADO=SI en cada pasajero autorizado. Sin consentimiento NO se enviará ningún mensaje.</p>
          <p className="text-xs text-slate-600">Plantilla propuesta con 4 variables, en este orden: nombre del pasajero, conductor, fecha y hora, enlace de seguimiento. Debe estar aprobada por Meta antes de habilitar el sistema.</p>
          <p className="text-xs text-slate-600">En Vercel Hobby el cron automático se ejecuta una vez por día. Para avisos cercanos a la asignación es necesario configurar un plan/scheduler que permita mayor frecuencia. El botón actual de WhatsApp manual permanece disponible.</p>
          <button type="submit" disabled={saving} className="bg-orange-500 text-white text-sm font-black rounded-xl p-3 disabled:opacity-50">{saving?'Guardando...':'Guardar configuración'}</button>
          {message && <p role="status" className="text-xs text-slate-600">{message}</p>}
        </form>
      </div>
    </div>
  );
}
