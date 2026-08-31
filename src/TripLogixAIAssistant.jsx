import React, { useMemo, useRef, useState } from 'react';
import { Sparkles, Upload, X, KeyRound, Loader2, FileSpreadsheet, Image as ImageIcon, FileText, Eye, EyeOff, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';

const GEMINI_KEY_STORAGE = 'triplogix_gemini_api_key';
const GEMINI_MODEL_STORAGE = 'triplogix_gemini_model';
const DEFAULT_MODEL = 'gemini-2.5-flash';

const cleanTime = (value = '') => {
  const raw = String(value || '').trim();
  const match = raw.match(/(\d{1,2})[:.]?(\d{2})/);
  if (!match) return '';
  const h = Math.min(23, Number(match[1]));
  const m = Math.min(59, Number(match[2]));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    resolve(result.includes(',') ? result.split(',')[1] : result);
  };
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const workbookToPromptText = async (file) => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sections = workbook.SheetNames.map((sheetName) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false
    });
    return `HOJA: ${sheetName}\n${rows.map(row => row.map(cell => String(cell ?? '')).join(' | ')).join('\n')}`;
  });
  return sections.join('\n\n').slice(0, 70000);
};

const responseSchema = {
  type: 'OBJECT',
  properties: {
    company: { type: 'STRING' },
    date: { type: 'STRING' },
    mode: { type: 'STRING', enum: ['Ida', 'Regreso'] },
    summary: { type: 'STRING' },
    notes: { type: 'ARRAY', items: { type: 'STRING' } },
    rows: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          time: { type: 'STRING' },
          referenceTime: { type: 'STRING' },
          address: { type: 'STRING' },
          phone: { type: 'STRING' },
          driver: { type: 'STRING' },
          route: { type: 'STRING' },
          order: { type: 'INTEGER' }
        },
        required: ['name', 'time', 'referenceTime', 'address', 'phone', 'driver', 'route', 'order']
      }
    }
  },
  required: ['company', 'date', 'mode', 'summary', 'notes', 'rows']
};

const buildPrompt = (clientNames, userText, operatorContext) => `
Eres el asistente operativo de TripLogix. Tu trabajo es convertir una programación de transporte corporativo desordenada en datos listos para el módulo de carpooling.

DATOS CONFIRMADOS POR EL OPERADOR (SON AUTORITATIVOS):
- Empresa: ${operatorContext.company}
- Fecha del servicio: ${operatorContext.date}
- Tipo: ${operatorContext.mode === 'Regreso' ? 'SALIDA / Regreso' : 'ENTRADA / Ida'}

FUENTES POSIBLES:
- texto pegado por el operador;
- captura/foto de una tabla o programación;
- Excel descargado desde Google Sheets;
- formatos con encabezados distintos, celdas combinadas o varias rutas.

REGLAS CRÍTICAS:
1. NO inventes personas, horarios, domicilios, teléfonos, conductor, ruta ni orden.
2. EMPRESA, FECHA y TIPO ya fueron seleccionados manualmente por el operador. No los cambies ni intentes inferir otros valores. Devuelve exactamente company="${operatorContext.company}", date="${operatorContext.date}" y mode="${operatorContext.mode}".
3. Si algo no está en el archivo, devuelve cadena vacía y agrega una nota.
4. Para ENTRADA/Ida, time es la HORA OFICIAL DE ENTRADA/LLEGADA A LA EMPRESA. Si existe HORA PASO, colócala EXACTAMENTE en referenceTime, sin sumar ni restar minutos.
5. Para SALIDA/Regreso, time es la HORA OFICIAL DE SALIDA DE LA EMPRESA. Si existe hora de paso/entrega, colócala EXACTAMENTE en referenceTime, sin modificarla.
6. Si la fuente asigna una RUTA a cada pasajero, route es AUTORITATIVO: conserva exactamente la ruta de cada persona. Personas de rutas distintas jamás deben intercambiarse. Conserva también el orden original en order.
7. Si la fuente asigna un CONDUCTOR, conserva el nombre exactamente en driver para cada pasajero/ruta. No lo omitas ni lo sustituyas.
8. address debe ser el domicilio o punto de recogida/entrega más completo que aparezca en la fuente. No uses textos genéricos como "PROGRAMAR RUTA" como domicilio.
9. phone debe contener solo el teléfono encontrado, sin inventarlo.
10. Si detectas bloques o columnas que podrían confundirse, prioriza encabezados explícitos como RUTA, CONDUCTOR, HORA PASO, HORA ENTRADA, HORA SALIDA, DOMICILIO y PASAJERO.
11. Si RUTA o CONDUCTOR aparecen una sola vez encabezando un bloque, por celdas combinadas o como dato común de varias filas, propaga ese valor a todas las personas de ese bloque. Eso es lectura estructural del archivo, no invención.
12. Si existen varias rutas, devuelve todas las personas con su route y order originales. TripLogix respetará esos grupos en vez de reoptimizarlos.
13. Catálogo de empresas disponible: ${clientNames.join(', ') || 'sin catálogo disponible'}.
14. Devuelve únicamente JSON válido siguiendo el esquema solicitado.

TEXTO ADICIONAL DEL OPERADOR:
${userText || '(sin texto adicional)'}
`;

export default function TripLogixAIAssistant({ clients = [], onApply }) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(GEMINI_KEY_STORAGE) || '');
  const [model, setModel] = useState(() => localStorage.getItem(GEMINI_MODEL_STORAGE) || DEFAULT_MODEL);
  const [showKey, setShowKey] = useState(false);
  const [userText, setUserText] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedMode, setSelectedMode] = useState('Ida');
  const [applyResult, setApplyResult] = useState(null);
  const fileRef = useRef(null);

  const clientNames = useMemo(() => clients.map(client => client?.name).filter(Boolean), [clients]);

  const saveKey = () => {
    const clean = apiKey.trim();
    if (!clean) return setError('Escribe primero la API key de Gemini.');
    localStorage.setItem(GEMINI_KEY_STORAGE, clean);
    localStorage.setItem(GEMINI_MODEL_STORAGE, model.trim() || DEFAULT_MODEL);
    setError('');
  };

  const forgetKey = () => {
    localStorage.removeItem(GEMINI_KEY_STORAGE);
    localStorage.removeItem(GEMINI_MODEL_STORAGE);
    setApiKey('');
    setModel(DEFAULT_MODEL);
  };

  const analyze = async () => {
    const cleanKey = apiKey.trim();
    if (!cleanKey) return setError('Agrega tu API key de Gemini antes de analizar.');
    if (!selectedCompany) return setError('Selecciona la empresa antes de analizar.');
    if (!selectedDate) return setError('Selecciona la fecha del servicio antes de analizar.');
    if (!userText.trim() && !file) return setError('Pega texto o selecciona una foto/Excel.');

    setLoading(true);
    setError('');
    setResult(null);
    setApplyResult(null);

    try {
      const parts = [{
        text: buildPrompt(clientNames, userText, {
          company: selectedCompany,
          date: selectedDate,
          mode: selectedMode
        })
      }];

      if (file) {
        const lowerName = file.name.toLowerCase();
        const isWorkbook = /\.(xlsx|xls|csv)$/.test(lowerName);
        const isImage = file.type.startsWith('image/') || /\.(png|jpg|jpeg|webp|heic|heif)$/i.test(lowerName);

        if (isWorkbook) {
          const workbookText = await workbookToPromptText(file);
          parts.push({ text: `\nCONTENIDO DEL ARCHIVO ${file.name}:\n${workbookText}` });
        } else if (isImage) {
          const base64 = await fileToBase64(file);
          parts.push({ inlineData: { mimeType: file.type || 'image/jpeg', data: base64 } });
        } else {
          throw new Error('Formato no compatible. Usa Excel, CSV o una imagen.');
        }
      }

      const activeModel = (model || DEFAULT_MODEL).trim();
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModel)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': cleanKey
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            responseSchema
          }
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload?.error?.message || `Gemini respondió HTTP ${response.status}`;
        throw new Error(message);
      }

      const rawText = (payload?.candidates?.[0]?.content?.parts || [])
        .map(part => part?.text || '')
        .join('')
        .trim();
      if (!rawText) throw new Error('Gemini no devolvió una programación reconocible.');

      const parsed = JSON.parse(rawText);
      const cleanRows = (Array.isArray(parsed.rows) ? parsed.rows : [])
        .map((row, index) => ({
          name: String(row?.name || '').trim(),
          time: cleanTime(row?.time),
          referenceTime: cleanTime(row?.referenceTime),
          address: String(row?.address || '').trim(),
          phone: String(row?.phone || '').replace(/[^\d+]/g, ''),
          driver: String(row?.driver || '').trim(),
          route: String(row?.route || '').trim(),
          order: Number.isFinite(Number(row?.order)) ? Number(row.order) : index + 1
        }))
        .filter(row => row.name);

      if (!cleanRows.length) throw new Error('No se detectaron personas en la programación. Revisa la fuente o agrega contexto en texto.');

      const normalizedResult = {
        company: selectedCompany,
        date: selectedDate,
        mode: selectedMode,
        summary: String(parsed.summary || '').trim(),
        notes: Array.isArray(parsed.notes) ? parsed.notes.map(item => String(item || '').trim()).filter(Boolean) : [],
        rows: cleanRows
      };

      setResult(normalizedResult);
      localStorage.setItem(GEMINI_KEY_STORAGE, cleanKey);
      localStorage.setItem(GEMINI_MODEL_STORAGE, activeModel);
    } catch (analysisError) {
      console.error('Gemini schedule analyzer:', analysisError);
      setError(analysisError.message || 'No fue posible analizar la programación.');
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!result) return;
    if (!selectedCompany) return setError('Selecciona la empresa a la que corresponde la programación.');
    if (!selectedDate) return setError('Indica la fecha del servicio antes de enviarlo a Carpooling.');
    setLoading(true);
    setError('');
    try {
      const summary = await onApply?.({
        clientName: selectedCompany,
        date: selectedDate,
        mode: selectedMode,
        rows: result.rows,
        notes: result.notes,
        summary: result.summary
      });
      setApplyResult(summary || { matched: result.rows.length, missing: [] });
      setOpen(false);
    } catch (applyError) {
      setError(applyError.message || 'No fue posible preparar la programación en Carpooling.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-violet-100 text-violet-700 border border-violet-200 px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-violet-200 transition"
      >
        <Sparkles className="w-4 h-4"/> Asistente IA Gemini
      </button>

      {open && (
        <div className="fixed inset-0 z-[12000] bg-slate-950/70 backdrop-blur-sm p-2 sm:p-4 flex items-center justify-center">
          <div className="w-full max-w-6xl h-[94dvh] bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-950 text-white flex items-center justify-between gap-3 shrink-0">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">TripLogix AI</p>
                <h3 className="font-black text-lg sm:text-xl">Asistente de programación con Gemini</h3>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-2 rounded-xl bg-white/10 hover:bg-white/20"><X className="w-5 h-5"/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <div className="flex items-center gap-2 mb-3"><KeyRound className="w-4 h-4 text-violet-600"/><p className="font-black text-sm text-slate-800">API key de Gemini</p></div>
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px_auto_auto] gap-2">
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder="AIza..."
                      className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 pr-10 text-xs font-mono outline-none focus:border-violet-500"
                    />
                    <button type="button" onClick={() => setShowKey(value => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700">
                      {showKey ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                    </button>
                  </div>
                  <input value={model} onChange={event => setModel(event.target.value)} className="rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-xs font-mono outline-none focus:border-violet-500" aria-label="Modelo Gemini"/>
                  <button type="button" onClick={saveKey} className="rounded-xl bg-violet-600 text-white px-4 py-2 text-xs font-black">Guardar local</button>
                  <button type="button" onClick={forgetKey} className="rounded-xl bg-white border border-violet-200 text-violet-700 px-3 py-2 text-xs font-black">Olvidar</button>
                </div>
                <p className="mt-2 text-[10px] font-bold text-slate-500">La llave se guarda únicamente en este navegador/dispositivo mediante localStorage. No se escribe en Firebase ni en GitHub.</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">Datos del servicio</p>
                  <p className="text-xs font-bold text-slate-500 mt-1">Completa estos tres campos antes de analizar. Gemini los tomará como datos confirmados y no los cambiará.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Empresa
                    <select value={selectedCompany} onChange={event => { setSelectedCompany(event.target.value); setResult(null); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-700 outline-none focus:border-violet-500">
                      <option value="">Seleccionar empresa...</option>
                      {clients.map(client => <option key={client.id || client.name} value={client.name}>{client.name}</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Fecha del servicio
                    <input type="date" value={selectedDate} onChange={event => { setSelectedDate(event.target.value); setResult(null); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-700 outline-none focus:border-violet-500"/>
                  </label>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Entrada / Salida
                    <select value={selectedMode} onChange={event => { setSelectedMode(event.target.value); setResult(null); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-700 outline-none focus:border-violet-500">
                      <option value="Ida">ENTRADA / Ida</option>
                      <option value="Regreso">SALIDA / Regreso</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50">
                  <div className="flex items-center gap-2 mb-3"><FileText className="w-4 h-4 text-slate-600"/><p className="font-black text-sm text-slate-800">Texto o instrucciones</p></div>
                  <textarea value={userText} onChange={event => setUserText(event.target.value)} rows={10} placeholder="Pega aquí la programación de WhatsApp, Sheets, observaciones, horarios, etc." className="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-xs outline-none focus:border-violet-500"/>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50">
                  <div className="flex items-center gap-2 mb-3"><Upload className="w-4 h-4 text-slate-600"/><p className="font-black text-sm text-slate-800">Foto, Excel o CSV</p></div>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,image/*" onChange={event => setFile(event.target.files?.[0] || null)} className="hidden"/>
                  <button type="button" onClick={() => fileRef.current?.click()} className="w-full min-h-[180px] rounded-2xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center gap-3 hover:border-violet-400 hover:bg-violet-50 transition">
                    {file ? (
                      <>
                        {/\.(xlsx|xls|csv)$/i.test(file.name) ? <FileSpreadsheet className="w-10 h-10 text-emerald-600"/> : <ImageIcon className="w-10 h-10 text-blue-600"/>}
                        <span className="text-sm font-black text-slate-700 text-center px-4">{file.name}</span>
                        <span className="text-[10px] font-bold text-slate-400">Toca para cambiar el archivo</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-10 h-10 text-slate-300"/>
                        <span className="text-sm font-black text-slate-600">Seleccionar archivo</span>
                        <span className="text-[10px] font-bold text-slate-400">XLSX · XLS · CSV · JPG · PNG · WEBP</span>
                      </>
                    )}
                  </button>
                  {file && <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-red-500"><Trash2 className="w-3 h-3"/> Quitar archivo</button>}
                </div>
              </div>

              <button type="button" disabled={loading} onClick={analyze} className="w-full rounded-2xl bg-violet-600 hover:bg-violet-700 text-white py-3.5 font-black text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {loading ? <><Loader2 className="w-5 h-5 animate-spin"/> Analizando programación...</> : <><Sparkles className="w-5 h-5"/> Analizar con Gemini</>}
              </button>

              {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700 flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/>{error}</div>}

              {result && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600"/><p className="font-black text-emerald-800">Programación identificada</p></div>
                    {result.summary && <p className="text-xs text-emerald-900/70 font-medium mt-2">{result.summary}</p>}
                  </div>

                  {result.notes.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-[10px] font-black uppercase text-amber-700 mb-2">Observaciones de Gemini</p>
                      <ul className="text-xs text-amber-900 space-y-1 list-disc pl-5">{result.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
                    </div>
                  )}

                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="min-w-[900px] w-full text-xs">
                      <thead className="bg-slate-100 text-slate-500 uppercase text-[9px] tracking-wider">
                        <tr><th className="p-3 text-left">#</th><th className="p-3 text-left">Persona</th><th className="p-3 text-left">Hora oficial</th><th className="p-3 text-left">Hora paso/ref.</th><th className="p-3 text-left">Dirección</th><th className="p-3 text-left">Teléfono</th><th className="p-3 text-left">Ruta</th><th className="p-3 text-left">Conductor</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {result.rows.map((row, index) => (
                          <tr key={`${row.name}-${index}`} className="bg-white">
                            <td className="p-3 font-mono text-slate-400">{row.order || index + 1}</td>
                            <td className="p-3 font-black text-slate-800">{row.name}</td>
                            <td className="p-3 font-mono font-bold text-violet-700">{row.time || '--:--'}</td>
                            <td className="p-3 font-mono text-slate-500">{row.referenceTime || '--:--'}</td>
                            <td className="p-3 max-w-[280px]">{row.address || '-'}</td>
                            <td className="p-3">{row.phone || '-'}</td>
                            <td className="p-3">{row.route || '-'}</td>
                            <td className="p-3">{row.driver || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button type="button" disabled={loading} onClick={apply} className="w-full rounded-2xl bg-slate-900 hover:bg-slate-800 text-white py-3.5 font-black text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                    <CheckCircle2 className="w-5 h-5"/> Enviar directamente a Carpooling para revisar
                  </button>
                </div>
              )}

              {applyResult && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700">Programación preparada: {applyResult.matched || 0} personas. Revisa el wizard de Carpooling antes de guardar.</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
