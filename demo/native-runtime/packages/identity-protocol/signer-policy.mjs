import {canonical,fields,reject,revision,site} from './encoding.mjs';

export const registeredSignerRoles=Object.freeze(['user','cloud','independent']);
const count=n=>{if(n!==2&&n!==3)reject('IDENTITY_SIGNER_POLICY_INVALID');};
export function validateSignerMinimum(p){
 fields(p,['minimum','revision']);count(p.minimum);revision(p.revision);return p;
}
export function signerPolicy(operation,{user,rp}){
 validateSignerMinimum(user);validateSignerMinimum(rp);
 // Unlink must not provide a two-signature bypass around protected rekeying.
 const required=['create_account','link','rekey','unlink','resume'].includes(operation)?3:Math.max(user.minimum,rp.minimum);
 return {user:{...user},rp:{...rp},requiredRoles:registeredSignerRoles.slice(0,required)};
}
export function validateSignerPolicy(p,operation){
 fields(p,['user','rp','requiredRoles']);
 if(canonical(p)!==canonical(signerPolicy(operation,p)))reject('IDENTITY_SIGNER_POLICY_INVALID');
 return p;
}
export function assertCurrentSignerPolicy(p,operation,current){
 validateSignerPolicy(p,operation);
 const selected={user:current.user,rp:{...current.rp,minimum:Math.max(current.rp.minimum,p.rp.minimum)}};
 if(canonical(p)!==canonical(signerPolicy(operation,selected)))reject('IDENTITY_SIGNER_POLICY_CHANGED');
}
export function validateIndependentProvider(p){
 fields(p,['identity','uri','seedVersion']);site(p.identity);site(p.uri);revision(p.seedVersion);return p;
}
