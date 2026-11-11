import {fields,reject,site} from './encoding.mjs';
import {validateTransaction} from './schema.mjs';
import {digest64,signProof,verifyProof,validateDescriptor} from './crypto.node.mjs';

function enrollment(t){validateTransaction(t);if(!['create_account','link'].includes(t.operation))reject('IDENTITY_ENROLLMENT_CERTIFICATE_INVALID');}
function root(key){validateDescriptor(key,'provider');if(key.algorithm!=='ML-DSA-87-pure-over-SHA256')reject('IDENTITY_ENROLLMENT_ROOT_INVALID');}
// Issuer calls this only AFTER current control, A_RP, device and policy checks.
// This authenticates initial cloud-key origin; it never replaces either RP proof.
export function issueEnrollmentCertificate(transaction,{issuer,key,privateKey,now}){
  enrollment(transaction);site(issuer);root(key);
  if(!Number.isSafeInteger(now)||now<transaction.issuedAt||now>=transaction.expiresAt)reject('IDENTITY_EXPIRED');
  const statement={domain:'passli:provider-enrollment:v1',issuer,transactionDigest:digest64(transaction),issuedAt:now,expiresAt:transaction.expiresAt};
  return {statement,proof:signProof(statement,privateKey,key)};
}
export function verifyEnrollmentCertificate(transaction,certificate,{issuer,roots,now}){
  enrollment(transaction);site(issuer);fields(certificate,['statement','proof']);
  const s=certificate.statement;fields(s,['domain','issuer','transactionDigest','issuedAt','expiresAt']);
  if(s.domain!=='passli:provider-enrollment:v1'||s.issuer!==issuer||s.transactionDigest!==digest64(transaction)||!Number.isSafeInteger(s.issuedAt)||s.issuedAt<transaction.issuedAt||s.expiresAt!==transaction.expiresAt||!Number.isSafeInteger(now)||now<s.issuedAt||now>=s.expiresAt)reject('IDENTITY_ENROLLMENT_CERTIFICATE_INVALID');
  if(!Array.isArray(roots)||!roots.length||new Set(roots.map(k=>k.keyID)).size!==roots.length)reject('IDENTITY_ENROLLMENT_ROOT_INVALID');roots.forEach(root);
  const selected=roots.find(k=>k.keyID===certificate.proof?.keyID);if(!selected)reject('IDENTITY_ENROLLMENT_ROOT_INVALID');
  verifyProof(s,certificate.proof,selected);return true;
}
