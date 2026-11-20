import {canonical,decode64,fields,reject,site} from './encoding.mjs';
import {protocol,validateTransaction} from './schema.mjs';

// The RP issues this before the click, bound to its HttpOnly browser context.
// Its opaque seal is checked only by the RP. Passli signs the enclosed values,
// never treats a browser-supplied seal as proof of policy or key ownership.
export function validateLoginChallenge(c,now){
 fields(c,['domain','site','requestID','nonce','sessionBinding','issuedAt','expiresAt','seal']);
 if(c.domain!=='passli:fast-login-challenge:v1')reject('IDENTITY_CHALLENGE_INVALID');
 site(c.site);decode64(c.requestID,16);decode64(c.nonce,32);decode64(c.sessionBinding,32);decode64(c.seal,32);
 if(!Number.isSafeInteger(c.issuedAt)||!Number.isSafeInteger(c.expiresAt)||c.issuedAt<0||c.expiresAt<=c.issuedAt||c.expiresAt-c.issuedAt>600)reject('IDENTITY_EXPIRY_INVALID');
 if(now!==undefined&&(now<c.issuedAt||now>=c.expiresAt))reject('IDENTITY_EXPIRED');
 return c;
}
export function loginTransaction(challenge,{binding,algorithmPolicy,assurance,signerPolicy},now){
 const c=validateLoginChallenge(challenge,now);
 if(!Number.isSafeInteger(now))reject('IDENTITY_CHALLENGE_INVALID');
 if(binding?.site!==c.site||binding.origin!==c.site||binding.state!=='active')reject('IDENTITY_BINDING_INVALID');
 if(assurance?.requiredLevel!==1||assurance.achievedLevel!==1||canonical(assurance.factors)!==canonical(['registered-device']))reject('IDENTITY_PHONE_APPROVAL_REQUIRED');
 const context=Object.fromEntries(['site','origin','userIdentifier','localAccountID','bindingID','keysetVersion','controlEpoch'].map(k=>[k,binding[k]]));
 return validateTransaction({protocol,operation:'login',audience:c.site,requestID:c.requestID,nonce:c.nonce,issuedAt:now,expiresAt:Math.min(now+60,c.expiresAt),
  context:{...context,sessionBinding:c.sessionBinding,completionEndpoint:c.site+'/api/identity/complete',algorithmPolicy,signerPolicy,independentProvider:binding.independentProvider},parameters:{},assurance});
}
export function assertLoginChallenge(transaction,challenge){
 const t=validateTransaction(transaction),c=validateLoginChallenge(challenge);
 if(t.operation!=='login'||t.audience!==c.site||t.context.site!==c.site||t.context.origin!==c.site||t.context.sessionBinding!==c.sessionBinding||t.context.personalInformationDigest)reject('IDENTITY_TRANSACTION_MISMATCH');
 for(const k of ['requestID','nonce'])if(t[k]!==c[k])reject('IDENTITY_TRANSACTION_MISMATCH');
 if(t.issuedAt<c.issuedAt||t.expiresAt>c.expiresAt)reject('IDENTITY_EXPIRY_INVALID');
 return t;
}
