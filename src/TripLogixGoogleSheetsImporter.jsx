import React, { useState } from 'react';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = 'https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/spreadsheets.readonly';
const clean = (value) => String(value || '').trim();
const sheetIdFromLink = (value) => {
  const matched = clean(value).match(/\/spreadsheets\/d\/([\w-]+)/);
  return matched?.[1] || (/^[\w-]{20,}$/.test(clean(value)) ? clean(value) : '');
};

const googleFetch = async (url, token) => {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || 'No se pudo consultar Google Drive/Sheets.');
  return payload;
};

const loadIdentity = () => new Promise((resolve, reject) => {
  if (window.google?.accounts?.oauth2) return resolve();
  const old = document.querySelector('script[data-triplogix-gis]');
  const script = old || document.createElement('script');
  if (!old) {
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.dataset.triplogixGis = 'true';
    document.head.appendChild(script);
  }
  if (window.google?.accounts?.oauth2) return resolve();
  script.addEventListener('load', resolve, { once: true });
  script.addEventListener('error', () => reject(new Error('No fue posible cargar Google Identity Services.')), { once: true });
});

export default function TripLogixGoogleSheetsImporter({ onImportRows, busy }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [items, setItems] = useState([]);
  const [sheetId, setSheetId] = useState('');
  const [tabs, setTabs] = useState([]);
  const [tabTitle, setTabTitle] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const connect = async () => {
    if (!CLIENT_ID) return setMessage('Configura VITE_GOOGLE_CLIENT_ID en Vercel para habilitar el acceso a Drive.');
    setLoading(true); setMessage('');
    try {
      await loadIdentity();
      const accessToken = await new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: result => result.error ? reject(new Error(result.error_description || result.error)) : resolve(result.access_token),
          error_callback: error => reject(new Error(error.message || 'Se cerró o rechazó la autorización de Google.'))
        });
        client.requestAccessToken({ prompt: 'consent' });
      });
      setToken(accessToken);
      const params = new URLSearchParams({
        q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
        fields: 'nextPageToken,files(id,name,modifiedTime,webViewLink)',
        orderBy: 'modifiedTime desc',
        page_size: '100'
      });
      const data = await googleFetch('https://www.googleapis.com/drive/v3/files?' + params.toString(), accessToken);
      setItems(data.files || []);
      setMessage(`Conectado: ${(data.files || []).length} hoja(s) disponibles (hasta 100).`);
    } catch (error) { setMessage(error.message); } finally { setLoading(false); }
  };

  const chooseSheet = async (value, suppliedToken = token) => {
    const id = sheetIdFromLink(value);
    if (!id) return setMessage('Pega el enlace completo de Google Sheets o selecciona un archivo de Drive.');
    if (!suppliedToken) return setMessage('Primero conecta tu cuenta de Google.');
    setLoading(true); setMessage('');
    try {
      const data = await googleFetch('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(id) + '?fields=spreadsheetId,properties(title),sheets(properties(title,gridProperties(rowCount)))', suppliedToken);
      const titles = (data.sheets || []).map(s => s.properties?.title).filter(Boolean);
      if (!titles.length) throw new Error('Este archivo no contiene pestañas.');
      setSheetId(id); setTabs(titles); setTabTitle(titles[0]);
      setMessage(`Hoja lista: ${data.properties?.title || id}. Selecciona la pestaña correcta.`);
    } catch(error) { setMessage(error.message); } finally { setLoading(false); }
  };

  const importSelected = async () => {
    if (!sheetId || !tabTitle || !token) return;
    setLoading(true); setMessage('');
    try {
      const safeTab = "'" + tabTitle.replace(/'/g, "''") + "'";
      const data = await googleFetch('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(sheetId) + '/values/' + encodeURIComponent(safeTab + '!A1:AZ5000'), token);
      const values = data.values || [];
      const headers = values[0] || [];
      if (values.length < 2) throw new Error('La pestaña está vacía o sólo tiene encabezados.');
      const rows = values.slice(1).filter(cells => cells.some(value => clean(value))).map(cells =>
        Object.fromEntries(headers.map((header, i) => [clean(header), cells[i] ?? '']))
      );
      await onImportRows(rows, { source: 'google_sheets', sheetId, tabTitle });
      setOpen(false);
    } catch(error) { setMessage(error.message); } finally { setLoading(false); }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-2 rounded-lg text-xs font-bold hover:bg-blue-100">
        Importar Google Sheets
      </button>
      {open && (
        <div className="fixed inset-0 z-[10000] bg-slate-950/60 flex items-center justify-center p-3" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl bg-white rounded-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4" onClick={event => event.stopPropagation()}>
            <div className="flex justify-between items-center gap-3">
              <div><h3 className="font-black text-lg text-slate-900">Importar rutas desde Google Drive</h3><p className="text-xs text-slate-500">Usa la misma plantilla y validaciones del Excel. Acceso de sólo lectura a tus documentos.</p></div>
              <button type="button" onClick={() => setOpen(false)} className="text-xl text-slate-500" aria-label="Cerrar">×</button>
            </div>
            <button type="button" disabled={loading || busy} onClick={connect} className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-lg disabled:opacity-50">Conectar cuenta Google / Ver mis Sheets</button>
            <div className="flex gap-2">
              <input className="min-w-0 flex-1 p-3 border border-slate-200 rounded-lg text-xs" placeholder="Pega aquí un enlace de Google Sheets..." value={sheetId} onChange={event => setSheetId(event.target.value)} />
              <button type="button" className="bg-slate-800 text-white text-xs font-bold rounded-lg px-3" onClick={() => chooseSheet(sheetId)} disabled={loading || busy}>Abrir hoja</button>
            </div>
            {items.length > 0 && <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
              {items.map(item => <button type="button" key={item.id} className="block w-full text-left p-3 text-xs hover:bg-blue-50" onClick={() => chooseSheet(item.id)}>{item.name}</button>)}
            </div>}
            {tabs.length > 0 && <div className="space-y-2"><label className="block text-xs font-bold text-slate-700">Pestaña de rutas</label><select className="w-full p-3 border rounded-lg text-sm" value={tabTitle} onChange={event => setTabTitle(event.target.value)}>{tabs.map(t => <option key={t} value={t}>{t}</option>)}</select>
              <button type="button" disabled={loading || busy} onClick={importSelected} className="bg-emerald-600 text-white font-bold text-xs px-4 py-3 rounded-lg disabled:opacity-50">{loading || busy ? 'Procesando...' : 'Importar rutas de esta pestaña'}</button></div>}
            {message && <p role="status" className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg">{message}</p>}
            <p className="text-[11px] text-amber-700 bg-amber-50 p-3 rounded-lg">Al importar se crearán rutas nuevas: revisa el contenido antes de confirmar para evitar duplicados. No se modificarán las rutas anteriores.</p>
          </div>
        </div>
      )}
    </>
  );
}
