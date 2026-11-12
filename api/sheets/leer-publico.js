// Lectura puntual de una pestaña de Google Sheets accesible sin autenticación.
// No recibe ni almacena tokens OAuth ni enlaces arbitrarios; el destino de red es fijo.
const SHEET_ID = /^[A-Za-z0-9_-]{20,160}$/;
const GID = /^\d{1,12}$/;
const MAX_CSV_BYTES = 2_000_000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' });

  const sheetId = String(req.query.sheetId || '');
  const gid = String(req.query.gid ?? '0');
  if (!SHEET_ID.test(sheetId) || !GID.test(gid)) {
    return res.status(400).json({ error: 'Enlace de Google Sheets inválido. Pega el enlace original de la hoja.' });
  }

  try {
    // Se construye la URL exclusivamente con identificadores validados.
    // Los archivos privados siguen siendo privados; no se intentan eludir permisos.
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const response = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: { Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.1' }
    });

    if (!response.ok) {
      return res.status(403).json({ error: 'Google no permitió acceder a esta hoja. Puedes copiar sus celdas y pegarlas directamente en TripLogix sin cambiar los permisos.' });
    }
    const kind = String(response.headers.get('content-type') || '').toLowerCase();
    if (kind.includes('text/html') || kind.includes('application/json')) {
      return res.status(403).json({ error: 'La hoja requiere acceso privado. Copia las celdas desde tu cuenta y pégalas en TripLogix; no necesitas hacerla pública.' });
    }
    const expectedSize = Number(response.headers.get('content-length') || 0);
    if (expectedSize > MAX_CSV_BYTES) {
      return res.status(413).json({ error: 'La hoja supera el límite de 2 MB. Divide el contenido por día o grupo.' });
    }

    const reader = response.body?.getReader();
    if (!reader) return res.status(502).json({ error: 'Google no devolvió datos de la hoja.' });
    const chunks = [];
    let byteCount = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > MAX_CSV_BYTES) {
        await reader.cancel();
        return res.status(413).json({ error: 'La hoja supera el límite de 2 MB.' });
      }
      chunks.push(value);
    }

    const buffer = new Uint8Array(byteCount);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const csv = new TextDecoder('utf-8').decode(buffer);
    if (!csv.trim() || /^\s*<(?:!doctype|html)/i.test(csv)) {
      return res.status(403).json({ error: 'No recibimos un CSV válido. Usa una hoja accesible con el enlace o pega las celdas directamente.' });
    }
    return res.status(200).json({ csv });
  } catch (error) {
    if (error?.name === 'TimeoutError') return res.status(504).json({ error: 'Google tardó demasiado en responder. Intenta nuevamente o pega las celdas.' });
    return res.status(502).json({ error: 'No se pudo leer la hoja de Google. Prueba pegando los datos directamente.' });
  }
}
