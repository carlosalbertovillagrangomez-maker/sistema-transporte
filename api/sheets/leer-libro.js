// Lectura de libros Google Sheets con permiso público de acceso por enlace.
// No modifica permisos, no guarda datos y no intenta leer documentos privados.
const SHEET_ID=/^[A-Za-z0-9_-]{20,160}$/;
const MAX_BYTES=8_000_000;
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET')return res.status(405).json({error:'Método no permitido.'});
  const sheetId=String(req.query?.sheetId||'');
  if(!SHEET_ID.test(sheetId))return res.status(400).json({error:'Enlace de Google Sheets inválido.'});
  try {
    const response=await fetch('https://docs.google.com/spreadsheets/d/'+sheetId+'/export?format=xlsx',{
      cache:'no-store',redirect:'follow',signal:AbortSignal.timeout(20000),
      headers:{Accept:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream'}
    });
    if(!response.ok)return res.status(403).json({error:'Este archivo no permite exportación por enlace. Si es privado, conecta tu cuenta Google en la opción avanzada, o pega los datos sin cambiar sus permisos.'});
    if(Number(response.headers.get('content-length')||0)>MAX_BYTES)return res.status(413).json({error:'La semana excede el límite de 8 MB. Selecciona un archivo más pequeño.'});
    const contentType=String(response.headers.get('content-type')||'').toLowerCase();
    if(contentType.includes('text/html')||contentType.includes('application/json'))return res.status(403).json({error:'Google requiere autorización. Utiliza Conectar Google (OAuth) sin hacer pública la información de pasajeros.'});
    const reader=response.body?.getReader();
    if(!reader)return res.status(502).json({error:'Google no proporcionó contenido del libro.'});
    let count=0;
    const chunks=[];
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      count+=value.byteLength;
      if(count>MAX_BYTES){await reader.cancel();return res.status(413).json({error:'Libro demasiado grande (máximo 8 MB).'});}
      chunks.push(Buffer.from(value));
    }
    const buffer=Buffer.concat(chunks);
    // XLSX es ZIP; rechazar HTML / portales de login aunque content-type sea ambiguo.
    if(buffer.length<4||buffer[0]!==0x50||buffer[1]!==0x4b)return res.status(403).json({error:'Google no devolvió un Excel válido. Abre el enlace con una cuenta autorizada o utiliza la opción privada.'});
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.status(200).send(buffer);
  }catch(error){
    if(error?.name==='TimeoutError')return res.status(504).json({error:'Google tardó demasiado. Reintenta o utiliza el importador de Excel.'});
    return res.status(502).json({error:'No se pudo obtener el libro de Google Sheets. Revisa el enlace y sus permisos.'});
  }
}
