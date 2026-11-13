import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { parseOperationalClipboard } from './triplogixWorkbook';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = 'https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/spreadsheets.readonly';
const clean = value => String(value ?? '').trim();
const normalize = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, '_');

const referenceFromLink = raw => {
  const value = clean(raw);
  let url;
  try { url = new URL(value); } catch { throw new Error('Pega un enlace completo de Google Sheets (https://...).'); }
  if (url.protocol !== 'https:' || !['docs.google.com', 'drive.google.com'].includes(url.hostname)) {
    throw new Error('Solamente se aceptan enlaces originales de Google Sheets o Drive.');
  }
  const sheetMatch = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,160})(?:\/|$)/);
  const driveMatch = url.hostname === 'drive.google.com' ? url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{20,160})(?:\/|$)/) : null;
  const id = sheetMatch?.[1] || driveMatch?.[1] || (
    url.hostname === 'drive.google.com' && url.pathname === '/open'
      ? url.searchParams.get('id') : ''
  );
  if (!/^[A-Za-z0-9_-]{20,160}$/.test(id || '')) {
    throw new Error('El enlace no corresponde a una hoja de cálculo de Google válida.');
  }
  const hashGid = url.hash.match(/(?:^#|[&#])gid=(\d+)/)?.[1];
  const gid = url.searchParams.get('gid') || hashGid || '0';
  if (!/^\d{1,12}$/.test(gid)) throw new Error('El identificador de pestaña (gid) no es válido.');
  return { id, gid };
};

const parseDelimitedRows = (value, isPaste = false) => {
  const text = String(value || '').replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('No hay datos para importar.');
  let rows;
  if (isPaste && text.includes('\t')) {
    const lines = text.replace(/\r\n/g, '\n').split('\n').filter(line => line.trim());
    const [headers, ...body] = lines.map(line => line.split('\t').map(cell => cell.replace(/^"|"$/g, '').replace(/""/g, '"')));
    rows = body.map(cells => Object.fromEntries(headers.map((head, i) => [clean(head), cells[i] ?? ''])));
  } else {
    const workbook = XLSX.read(text, { type: 'string', raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = sheet ? XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }) : [];
  }
  if (!rows.length) throw new Error('La hoja debe incluir encabezados y al menos una fila.');
  const keys = Object.keys(rows[0]).map(normalize);
  const includesOne = aliases => aliases.some(alias => keys.includes(normalize(alias)));
  if (!includesOne(['FECHA', 'FECHA_SERVICIO']) || !includesOne(['HORA_OBJETIVO', 'HORA', 'HORA_LLEGADA']) || !includesOne(['DIRECCION', 'DOMICILIO'])) {
    throw new Error('Faltan columnas FECHA, HORA_OBJETIVO o DIRECCION. Usa la plantilla TripLogix.');
  }
  if (rows.length > 4500) throw new Error('El límite es de 4500 filas por importación.');
  return rows;
};

const googleFetch = async (url, token) => {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'No se pudo consultar Google Sheets.');
  return data;
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
  script.addEventListener('error', () => reject(new Error('No se pudo cargar el acceso de Google.')), { once: true });
});

export default function TripLogixGoogleSheetsImporter({ onImportRows, onOperationalWorkbook, busy }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState([{ key: 1, url: '' }]);
  const [nextKey, setNextKey] = useState(2);
  const [pastedText, setPastedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');
  const [items, setItems] = useState([]);
  const [privateLink, setPrivateLink] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [tabs, setTabs] = useState([]);
  const [tabTitle, setTabTitle] = useState('');

  const updateLink = (key, url) => setLinks(prev => prev.map(link => link.key === key ? { ...link, url } : link));
  const addLink = () => {
    if (links.length >= 15) return setMessage('Puedes importar hasta 15 enlaces en una operación.');
    setLinks(prev => [...prev, { key: nextKey, url: '' }]);
    setNextKey(prev => prev + 1);
  };

  const importLinks = async () => {
    setLoading(true); setMessage('');
    try {
      const entries = links.map(link => link.url).filter(url => clean(url));
      if (!entries.length) throw new Error('Pega al menos un enlace de Google Sheets.');
      const parsed = entries.map(referenceFromLink);
      const unique = new Set(parsed.map(item => item.id + ':' + item.gid));
      if (unique.size !== parsed.length) throw new Error('Hay enlaces repetidos a la misma pestaña. Elimina los duplicados.');
      const allRows = [];
      for (let i = 0; i < parsed.length; i += 1) {
        setMessage(`Leyendo archivo ${i + 1} de ${parsed.length}...`);
        const { id, gid } = parsed[i];
        const response = await fetch(`/api/sheets/leer-publico?sheetId=${encodeURIComponent(id)}&gid=${encodeURIComponent(gid)}`, { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(`Enlace ${i + 1}: ${data.error || 'No se pudo abrir la pestaña.'}`);
        const recognized = parseOperationalClipboard(data.csv);
        if (recognized) {
          if (parsed.length > 1) throw new Error('Para el formato Programación/BD importa un enlace por vez, porque cada archivo puede corresponder a otra fecha. Para varios días usa los enlaces con la plantilla normal que incluye FECHA.');
          if (!onOperationalWorkbook) throw new Error('No se pudo abrir la planificación empresarial.');
          onOperationalWorkbook({ ...recognized, importKey: String(Date.now()) });
          setOpen(false);
          return;
        }
        const rows = parseDelimitedRows(data.csv);
        rows.forEach(row => allRows.push({ ...row, __triplogix_sheet_source: id + ':' + gid, __triplogix_sheet_id: id, __triplogix_sheet_tab: gid }));
      }
      if (allRows.length > 4500) throw new Error('Los enlaces contienen más de 4500 filas en total; importa en grupos más pequeños.');
      const result = await onImportRows(allRows, { source: 'google_sheets', sheetCount: parsed.length });
      if (result !== false) { setMessage('Rutas procesadas.'); setOpen(false); }
      else setMessage('Importación cancelada. No se creó ninguna ruta.');
    } catch (error) { setMessage(error.message); } finally { setLoading(false); }
  };

  const importPasted = async () => {
    setLoading(true); setMessage('');
    try {
      const recognized = parseOperationalClipboard(pastedText);
      if (recognized) {
        if (!onOperationalWorkbook) throw new Error('No se pudo abrir la planificación empresarial.');
        onOperationalWorkbook({ ...recognized, importKey: String(Date.now()) });
        setOpen(false);
        setPastedText('');
        return;
      }
      const rows = parseDelimitedRows(pastedText, true);
      const result = await onImportRows(rows, { source: 'google_sheets', importMethod: 'clipboard' });
      if (result !== false) { setOpen(false); setPastedText(''); }
      else setMessage('Importación cancelada. No se creó ninguna ruta.');
    } catch (error) { setMessage(error.message); } finally { setLoading(false); }
  };

  const connect = async () => {
    if (!CLIENT_ID) return setMessage('Este acceso avanzado requiere configurar OAuth. La importación por enlaces o pegar datos funciona sin esa configuración.');
    setLoading(true); setMessage('');
    try {
      await loadIdentity();
      const accessToken = await new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID, scope: SCOPES,
          callback: value => value.error ? reject(new Error(value.error_description || value.error)) : resolve(value.access_token),
          error_callback: value => reject(new Error(value.message || 'Autorización cancelada.'))
        });
        client.requestAccessToken({ prompt: 'consent' });
      });
      setToken(accessToken);
      const params = new URLSearchParams({
        q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
        fields: 'nextPageToken,files(id,name,modifiedTime,webViewLink)', orderBy: 'modifiedTime desc', pageSize: '100'
      });
      const data = await googleFetch('https://www.googleapis.com/drive/v3/files?' + params, accessToken);
      setItems(data.files || []);
      setMessage(`Google conectado: ${(data.files || []).length} hoja(s) disponibles.`);
    } catch(error) { setMessage(error.message); } finally { setLoading(false); }
  };

  const chooseSheet = async (value) => {
    if (!token) return setMessage('Conecta tu cuenta de Google primero.');
    setLoading(true); setMessage('');
    try {
      const { id } = value.startsWith('https:') ? referenceFromLink(value) : { id: value };
      if (!/^[A-Za-z0-9_-]{20,160}$/.test(id)) throw new Error('Enlace o identificador inválido.');
      const data = await googleFetch('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(id) + '?fields=spreadsheetId,properties(title),sheets(properties(title))', token);
      const available = (data.sheets || []).map(item => item.properties?.title).filter(Boolean);
      if (!available.length) throw new Error('El archivo no contiene pestañas.');
      setSelectedId(id); setTabs(available); setTabTitle(available[0]);
      setMessage(`Hoja lista: ${data.properties?.title || id}.`);
    } catch(error) { setMessage(error.message); } finally { setLoading(false); }
  };

  const importPrivate = async () => {
    if (!selectedId || !tabTitle || !token) return;
    setLoading(true); setMessage('');
    try {
      const tab = "'" + tabTitle.replace(/'/g, "''") + "'";
      const data = await googleFetch('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(selectedId) + '/values/' + encodeURIComponent(tab + '!A1:AZ5000'), token);
      const values = data.values || [];
      const headers = values[0] || [];
      const rows = values.slice(1).filter(cells => cells.some(clean)).map(cells =>
        Object.fromEntries(headers.map((head, i) => [clean(head), cells[i] ?? '']))
      );
      if (!rows.length) throw new Error('La pestaña está vacía.');
      const result = await onImportRows(rows, { source: 'google_sheets', sheetId: selectedId, tabTitle });
      if (result !== false) setOpen(false);
      else setMessage('Importación cancelada.');
    } catch(error) { setMessage(error.message); } finally { setLoading(false); }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-2 rounded-lg text-xs font-bold hover:bg-blue-100">Importar Google Sheets</button>
      {open && (
        <div className="fixed inset-0 z-[10000] bg-slate-950/60 flex items-center justify-center p-3" onClick={() => setOpen(false)}>
          <div className="w-full max-w-3xl bg-white rounded-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto space-y-5" onClick={event => event.stopPropagation()}>
            <div className="flex justify-between items-center gap-3">
              <div><h3 className="font-black text-lg text-slate-900">Importar rutas de Google Sheets</h3><p className="text-xs text-slate-500">Cualquier archivo y cualquier día. No depende de una cuenta ni de un Drive fijo.</p></div>
              <button type="button" onClick={() => setOpen(false)} className="text-xl text-slate-500" aria-label="Cerrar">×</button>
            </div>

            <section className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-3">
              <h4 className="font-black text-emerald-900 text-sm">Opción rápida y privada · copiar y pegar</h4>
              <p className="text-xs text-emerald-900">En cualquier Google Sheets (aunque sea privado), copia el rango con sus encabezados y pégalo aquí (Ctrl+C / Ctrl+V). TripLogix reconoce automáticamente la hoja Programación, BD, Directorio o la plantilla normal de rutas. No necesitas Google Cloud.</p>
              <textarea rows={4} className="w-full bg-white border border-emerald-200 rounded-lg p-3 text-xs" placeholder="Pega aquí las filas y encabezados de Programación, BD o de la plantilla normal..." value={pastedText} onChange={event => setPastedText(event.target.value)} />
              <button type="button" onClick={importPasted} disabled={loading || busy || !pastedText.trim()} className="bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-xs font-black disabled:opacity-50">Importar datos pegados</button>
            </section>

            <section className="border border-slate-200 rounded-xl p-4 space-y-3">
              <h4 className="font-black text-slate-800 text-sm">Importar uno o varios enlaces de Google Sheets</h4>
              <p className="text-xs text-slate-600">Puedes agregar enlaces de distintos archivos, cuentas y días. Se leerá la pestaña seleccionada en cada enlace (gid). No se guardan ni vinculan a una cuenta fija.</p>
              {links.map((link, i) => (
                <div key={link.key} className="flex gap-2 items-center">
                  <label htmlFor={'triplogix-sheet-link-' + link.key} className="text-[11px] font-bold text-slate-500 w-6 shrink-0">{i + 1}.</label>
                  <input id={'triplogix-sheet-link-' + link.key} type="url" className="min-w-0 flex-1 border border-slate-200 rounded-lg p-3 text-xs" placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0" value={link.url} onChange={event => updateLink(link.key, event.target.value)} />
                  {links.length > 1 && <button type="button" onClick={() => setLinks(prev => prev.filter(item => item.key !== link.key))} className="px-2.5 text-red-600 text-xs font-bold" aria-label={'Quitar enlace ' + (i + 1)}>Quitar</button>}
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={addLink} className="px-3 py-2 bg-slate-100 border text-slate-700 font-bold rounded-lg text-xs">+ Agregar otro enlace</button>
                <button type="button" onClick={importLinks} disabled={loading || busy || !links.some(item => clean(item.url))} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-black text-xs disabled:opacity-50">Importar enlaces</button>
              </div>
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3">Los enlaces se pueden importar sin OAuth sólo si Google permite su lectura sin iniciar sesión. <strong>No hagas públicos datos personales de pasajeros</strong>: para una plantilla con cuatro pestañas, utiliza el botón Importar Excel / Plantilla empresa y selecciona el archivo completo; también puedes copiar y pegar el rango de Programación.</p>
            </section>

            <details className="border border-slate-200 rounded-xl p-4">
              <summary className="cursor-pointer text-sm font-bold text-slate-700">Acceso avanzado a Google Drive (opcional, para hojas privadas con OAuth)</summary>
              <div className="mt-3 space-y-3">
                {!CLIENT_ID && <p className="text-xs text-slate-500">No está configurado el OAuth avanzado; los otros dos métodos funcionan sin VITE_GOOGLE_CLIENT_ID.</p>}
                <button type="button" onClick={connect} disabled={loading || busy || !CLIENT_ID} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-40">Conectar cuenta Google / Ver mis Sheets</button>
                <div className="flex gap-2"><input className="min-w-0 flex-1 border rounded-lg p-2 text-xs" placeholder="Pega un enlace privado de Sheets" value={privateLink} onChange={event=>setPrivateLink(event.target.value)} /><button type="button" disabled={!token || loading} onClick={() => chooseSheet(privateLink)} className="bg-blue-700 text-white rounded-lg p-2 text-xs disabled:opacity-40">Abrir hoja</button></div>
                {items.length > 0 && <div className="border rounded-lg divide-y max-h-44 overflow-y-auto">{items.map(item => <button type="button" className="block w-full text-left p-2 text-xs hover:bg-blue-50" key={item.id} onClick={() => chooseSheet(item.id)}>{item.name}</button>)}</div>}
                {tabs.length > 0 && <><select className="w-full border rounded-lg p-2 text-sm" value={tabTitle} onChange={event=>setTabTitle(event.target.value)}>{tabs.map(title=><option key={title} value={title}>{title}</option>)}</select><button type="button" onClick={importPrivate} disabled={loading || busy} className="bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-black disabled:opacity-50">Importar pestaña privada</button></>}
              </div>
            </details>

            {message && <p role="status" className="bg-slate-50 border border-slate-100 p-3 rounded-lg text-xs text-slate-700">{message}</p>}
            <p className="text-[11px] text-slate-500">Todas las opciones usan la misma validación del Excel y crean rutas nuevas. Antes de guardar, TripLogix solicita confirmación. Revisa fechas y posibles duplicados.</p>
          </div>
        </div>
      )}
    </>
  );
}
