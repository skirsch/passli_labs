import {timingSafeEqual} from 'node:crypto';

export function validatePiiRelease(r,origin) {
  return !!r&&typeof r.id==='string'&&r.id.length<=200&&r.siteOrigin===origin&&r.callback===origin+'/api/pii-release'&&(r.requestedFields===undefined||Array.isArray(r.requestedFields)&&r.requestedFields.length>0&&r.requestedFields.length<=3&&new Set(r.requestedFields).size===r.requestedFields.length&&r.requestedFields.every(f=>['name','email','phone'].includes(f)))&&typeof r.challenge==='string'&&typeof r.deliveryToken==='string'&&Number.isFinite(r.expires)&&Array.isArray(r.fields)&&r.fields.length<=3&&new Set(r.fields.map(f=>f.output)).size===r.fields.length&&r.fields.every(f=>['name','email','phone'].includes(f.output)&&typeof f.recordId==='string'&&typeof f.field==='string');
}
export function publicRelease({deliveryToken,...rest}) {return rest;}
export function validateDelivery(body,release) {
  const a=Buffer.from(typeof body.deliveryToken==='string'?body.deliveryToken:''),b=Buffer.from(release.deliveryToken);
  if(a.length!==b.length||!timingSafeEqual(a,b)||!body.values||Array.isArray(body.values)||typeof body.values!=='object')throw Error('Sharing authorization did not match.');
  const fields=release.requestedFields||release.fields.map(f=>f.output);
  if(Object.keys(body.values).some(key=>!fields.includes(key))||['name','email','phone'].some(key=>!fields.includes(key)||typeof body.values[key]!=='string'||!body.values[key].trim()||body.values[key].length>2048))throw Error('Share name, phone and email in Passli to create this account.');
}
