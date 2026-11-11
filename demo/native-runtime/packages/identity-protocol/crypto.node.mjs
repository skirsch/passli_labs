// Node verifier adapter. Native/browser custody adapters do not import this file.
import {createHash,createPublicKey,sign,verify} from 'node:crypto';
import {canonical,decode64,fields,reject} from './encoding.mjs';
import {descriptor,operationScope,validateTransaction} from './schema.mjs';
const algorithms={'Ed25519-over-SHA256':{type:'ed25519',jwk:b=>({kty:'OKP',crv:'Ed25519',x:b}),length:64},'ML-DSA-44-pure-over-SHA256':{type:'ml-dsa-44',jwk:b=>({kty:'AKP',alg:'ML-DSA-44',pub:b}),length:2420},'ML-DSA-65-pure-over-SHA256':{type:'ml-dsa-65',jwk:b=>({kty:'AKP',alg:'ML-DSA-65',pub:b}),length:3309},'ML-DSA-87-pure-over-SHA256':{type:'ml-dsa-87',jwk:b=>({kty:'AKP',alg:'ML-DSA-87',pub:b}),length:4627}};
export const digest=value=>createHash('sha256').update(canonical(value)).digest();
export const digest64=value=>digest(value).toString('base64url');
export function publicDescriptor(publicKey,role,algorithm){
  const suite=algorithms[algorithm];if(!suite||publicKey.asymmetricKeyType!==suite.type)reject();
  const jwk=publicKey.export({format:'jwk'}),record={role,algorithm,publicKey:jwk.x||jwk.pub};
  return {...record,keyID:digest64(record)};
}
export function validateDescriptor(record,role=record?.role){
  descriptor(record,role);const {algorithm,publicKey}=record;
  if(digest64({role,algorithm,publicKey})!==record.keyID)reject('IDENTITY_KEY_ID_INVALID');
  try{return createPublicKey({format:'jwk',key:algorithms[algorithm].jwk(publicKey)});}catch{reject('IDENTITY_KEY_INVALID');}
}
export function signProof(value,privateKey,key){validateDescriptor(key);if(privateKey.asymmetricKeyType!==algorithms[key.algorithm].type)reject();const result={role:key.role,keyID:key.keyID,signature:sign(null,digest(value),privateKey).toString('base64url')};verifyProof(value,result,key);return result;}
export function verifyProof(value,proof,key){
  fields(proof,['role','keyID','signature']);const publicKey=validateDescriptor(key);
  if(proof.role!==key.role||proof.keyID!==key.keyID)reject('IDENTITY_SIGNATURE_INVALID');
  const signature=decode64(proof.signature,algorithms[key.algorithm].length);
  if(!verify(null,digest(value),publicKey,signature))reject('IDENTITY_SIGNATURE_INVALID');return true;
}
export function verifyKeyPossession(transaction,proofs,keys,domain){
  if(!['passli:new-key-possession:v1','passli:control-key-possession:v1'].includes(domain)||!Array.isArray(proofs)||proofs.length!==keys.length)reject();
  for(const key of keys){const matches=proofs.filter(p=>p.keyID===key.keyID);if(matches.length!==1)reject();verifyProof({domain,transactionDigest:digest64(transaction),role:key.role,keyID:key.keyID},matches[0],key);}
}
// Signature primitive only. The durable executor additionally checks current
// authority, device/factor evidence, enrollment and one-use challenge state.
export function verifyTransactionSignatures(response,{expected,keys,now,schemas={}}){
  fields(response,['transaction','signatures']);const t=validateTransaction(response.transaction,{schemas});validateTransaction(expected,{schemas});
  if(canonical(t)!==canonical(expected))reject('IDENTITY_TRANSACTION_MISMATCH');
  if(!Number.isSafeInteger(now)||now<t.issuedAt||now>=t.expiresAt)reject('IDENTITY_EXPIRED');
  if(!Array.isArray(keys)||new Set(keys.map(k=>k.publicKey)).size!==keys.length)reject();keys.forEach(k=>validateDescriptor(k));
  const proofs=response.signatures;if(!Array.isArray(proofs)||new Set(proofs.map(p=>p.keyID)).size!==proofs.length)reject('IDENTITY_SIGNATURE_INVALID');
  const rp=operationScope(t.operation)==='rp';
  if(rp&&t.operation!=='rekey'&&keys.some(k=>k.algorithm!==t.context.algorithmPolicy.selectedAlgorithm))reject('IDENTITY_ALGORITHM_MISMATCH');
  if(rp){const roles=t.operation==='suspend'?['cloud']:['user','cloud'];if(keys.length!==roles.length||proofs.length!==roles.length)reject();for(const role of roles){const key=keys.find(k=>k.role===role),proof=proofs.find(p=>p.role===role);if(!key||!proof)reject();verifyProof(t,proof,key);}}
  else {const required=t.operation==='account_create'?3:t.operation==='control_keys_replace'?2:1;
    if(keys.length!==3||proofs.length!==required||keys.some((k,i)=>k.role!=='control'+(i+1)||k.algorithm!=='ML-DSA-87-pure-over-SHA256'))reject();
    if(t.operation==='account_create'){
      if(canonical(keys)!==canonical(t.parameters.controlKeys))reject('IDENTITY_CONTROL_STATE_INVALID');
      verifyKeyPossession(t,proofs,keys,'passli:control-key-possession:v1');return t;
    }
    for(const proof of proofs){const key=keys.find(k=>k.keyID===proof.keyID);if(!key)reject();verifyProof(t,proof,key);}
  }
  return t;
}
