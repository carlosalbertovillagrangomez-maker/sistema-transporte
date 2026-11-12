import crypto from 'node:crypto';

// Proceso exclusivo del servidor: Meta token y clave privada nunca se envían al navegador.
// Sólo el cron autorizado con CRON_SECRET puede activar envíos.
const needed = ['WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','FIREBASE_SERVICE_ACCOUNT_JSON','CRON_SECRET'];
const configured = () => needed.every(key => Boolean(process.env[key]));

const decode = value => {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key,val])=>[key,decode(val)]));
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  return null;
};
const fields = payload => Object.fromEntries(Object.entries(payload.fields || {}).map(([key,value])=>[key,decode(value)]));
const stringField = value => ({ stringValue: String(value) });
const rsaToken = async service => {
  const now = Math.floor(Date.now()/1000);
  const enc = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const assertion = enc({ alg:'RS256',typ:'JWT' }) + '.' + enc({
    iss:service.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',
    iat:now,exp:now+3000
  });
  const signature = crypto.createSign('RSA-SHA256').update(assertion).sign(service.private_key,'base64url');
  const response = await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:assertion+'.'+signature})
  });
  const data=await response.json();
  if(!response.ok||!data.access_token)throw new Error('Firebase OAuth rechazó las credenciales del servicio.');
  return data.access_token;
};
const firestoreRequest = async (url, token, options = {}) => {
  const response=await fetch(url,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.error?.message||'Error al leer Firestore.');error.code=response.status;throw error;}
  return data;
};
const digits = value => String(value || '').replace(/\D/g, '');
const normalizePhone = (raw,country) => {
  let number=digits(raw);
  if(number.startsWith('00')) number=number.slice(2);
  if(number.length===10) number=(country==='CO'?'57':'52')+number;
  return /^\d{11,15}$/.test(number) ? number : '';
};
const countryFor = route => {
  const country=String(route.serviceCountry||route.country||'').toLowerCase();
  return country.includes('colom')||country==='co'?'CO':'MX';
};
const contactsFor = route => {
  const result = new Map();
  const push = person => {
    const name=String(person?.passengerName||person?.name||person?.contact||'').trim();
    const phone=normalizePhone(person?.phone||person?.whatsapp||person?.contactPhone,countryFor(route));
    if(!name||!phone||person.whatsappOptIn!==true) return;
    if(/oficina central|destino final/i.test(name))return;
    if(!result.has(phone))result.set(phone,{name,phone,plannedTime:person.plannedTime||person.pickupTime||person.dropoffTime||''});
  };
  (Array.isArray(route.passengerSchedule)?route.passengerSchedule:[]).forEach(push);
  [route.startCoords,...(Array.isArray(route.waypointsData)?route.waypointsData:[]),route.endCoords].filter(Boolean).forEach(point=>{
    push(point);
    (point.passengersSchedule||[]).forEach(push);
  });
  return [...result.values()];
};
const recentAssigned = route => {
  if(!['Aceptada','En Ruta'].includes(route.status)||!route.driver||!route.driverId||route.driverQuickRegistration) return false;
  const date = new Date(route.assignedAt||route.assignmentRequestedAt||route.createdDate||0).getTime();
  if(!Number.isFinite(date)||Date.now()-date>7*86400000||date>Date.now()+600000) return false;
  const scheduled = route.scheduledDate||route.finalDate||'';
  if(/^\d{4}-\d{2}-\d{2}$/.test(scheduled)){
    const day=new Date(scheduled+'T23:59:59Z').getTime();
    if(day < Date.now()-86400000)return false;
  }
  return true;
};

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Método no permitido'});
  if(req.query?.check==='1') return res.status(200).json({configured:configured(),automaticConfigured:configured()});
  if(!process.env.CRON_SECRET||req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`)return res.status(401).json({error:'No autorizado'});
  if(!configured())return res.status(503).json({error:'Falta configurar WhatsApp y Firebase en Vercel.'});
  let service;
  try {service=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);}catch(_){return res.status(503).json({error:'FIREBASE_SERVICE_ACCOUNT_JSON inválido'});}
  if(!service.project_id||!service.private_key||!service.client_email)return res.status(503).json({error:'Firebase service account incompleto'});
  try{
    const token=await rsaToken(service);
    const root=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(service.project_id)}/databases/(default)/documents`;
    const config=await firestoreRequest(root+'/integraciones/whatsapp',token).catch(e=>e.code===404?{fields:{}}:Promise.reject(e));
    const settings=fields(config);
    if(settings.enabled!==true)return res.status(200).json({status:'disabled',sent:0});
    if(!/^[a-z0-9_]+$/.test(settings.templateName||''))throw new Error('Plantilla WhatsApp no configurada.');
    const snapshot=await firestoreRequest(root+':runQuery',token,{method:'POST',body:JSON.stringify({
      structuredQuery:{from:[{collectionId:'rutas'}],orderBy:[{field:{fieldPath:'createdDate'},direction:'DESCENDING'}],limit:100}
    })});
    let sent=0,skipped=0,failed=0,checked=0;
    for(const item of snapshot){
      const document=item.document;
      if(!document||!recentAssigned(fields(document)))continue;
      const route=fields(document);const routeId=document.name.split('/').pop();
      for(const person of contactsFor(route)){
        if(checked++>=35)break;
        const recipientHash=crypto.createHash('sha256').update(routeId+':'+person.phone).digest('hex').slice(0,35);
        const id='route_'+recipientHash;
        const marker={fields:{
          routeId:stringField(routeId),status:stringField('processing'),createdAt:stringField(new Date().toISOString()),
          recipientSuffix:stringField(person.phone.slice(-4))
        }};
        try{
          // Create only. Existing document (409) means another job already claimed this notification.
          await firestoreRequest(root+'/whatsappEnvios?documentId='+encodeURIComponent(id),token,{method:'POST',body:JSON.stringify(marker)});
        }catch(error){if(error.code===409){skipped++;continue;}throw error;}
        try{
          const url=`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION||'v25.0'}/${encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID)}/messages`;
          const tracking=(settings.clientTrackingUrl||'https://app-cliente-five.vercel.app').replace(/\/$/,'')+'/?trip='+encodeURIComponent(routeId);
          const meta=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+process.env.WHATSAPP_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({
            messaging_product:'whatsapp',to:person.phone,type:'template',
            template:{name:settings.templateName,language:{code:settings.templateLanguage||'es_MX'},
              components:[{type:'body',parameters:[
                {type:'text',text:person.name.slice(0,100)},
                {type:'text',text:String(route.driver).slice(0,100)},
                {type:'text',text:String((route.scheduledDate||'')+' '+(person.plannedTime||route.scheduledTime||'')).trim().slice(0,100)},
                {type:'text',text:tracking}
              ]}]}
          })});
          const response=await meta.json().catch(()=>({}));
          if(!meta.ok)throw new Error('Meta rechazó el mensaje: '+(response.error?.code||meta.status));
          await firestoreRequest(root+'/whatsappEnvios/'+encodeURIComponent(id)+'?updateMask.fieldPaths=status&updateMask.fieldPaths=sentAt',token,{
            method:'PATCH',body:JSON.stringify({fields:{status:stringField('sent'),sentAt:stringField(new Date().toISOString())}})
          });
          sent++;
        }catch(error){
          failed++;
          await firestoreRequest(root+'/whatsappEnvios/'+encodeURIComponent(id)+'?updateMask.fieldPaths=status&updateMask.fieldPaths=error',token,{
            method:'PATCH',body:JSON.stringify({fields:{status:stringField('failed'),error:stringField(String(error.message).slice(0,160))}})
          }).catch(()=>{});
        }
      }
      if(checked>=35)break;
    }
    return res.status(200).json({status:'processed',sent,skipped,failed,checked});
  }catch(error){return res.status(500).json({error:String(error.message||error).slice(0,250)});}
}
