import {roleAlgorithm} from './algorithm-policy.mjs';
import {validateSignerPolicy,validateIndependentProvider,validateSignerMinimum} from './signer-policy.mjs';
import {accountID,canonical,decode64,fields,reject,revision,site,text,nextRevision} from './encoding.mjs';
import {validateAlgorithmBinding,validateAlgorithmPolicy} from './algorithm-policy.mjs';
import {pairingSchemas} from './device-key-schema.mjs';
export const protocol='passli:identity-operations:v1';
export const algorithms=Object.freeze({'Ed25519-over-SHA256':32,'ML-DSA-44-pure-over-SHA256':1312,'ML-DSA-65-pure-over-SHA256':1952,'ML-DSA-87-pure-over-SHA256':2592});
const nonempty=v=>{text(v,1024);if(!v)reject();};
const b16=v=>decode64(v,16),b32=v=>decode64(v,32);
export function descriptor(value,role){fields(value,['role','algorithm','publicKey','keyID']);if(value.role!==role||!Object.hasOwn(algorithms,value.algorithm))reject();decode64(value.publicKey,algorithms[value.algorithm]);b32(value.keyID);return value;}
const controlKeys=value=>{if(!Array.isArray(value)||value.length!==3)reject();value.forEach((k,i)=>{descriptor(k,'control'+(i+1));if(k.algorithm!=='ML-DSA-87-pure-over-SHA256')reject();});if(new Set(value.map(k=>k.publicKey)).size!==3)reject();};
const threshold=v=>{if(v!==2)reject();};
const user=v=>descriptor(v,'user'),cloud=v=>descriptor(v,'cloud');
const rules={
  login:{rp:true,params:{}},
  create_account:{rp:true,ttl:1800,params:{pub1:user,pub2:cloud}},
  link:{rp:true,ttl:1800,params:{pub1:user,pub2:cloud}},
  unlink:{rp:true,params:{}},
  rekey:{rp:true,ttl:1800,params:{pub1:user,pub2:cloud,nextKeysetVersion:revision,nextControlEpoch:revision}},
  suspend:{rp:true,params:{incidentID:nonempty}},
  resume:{rp:true,ttl:1800,params:{nextControlEpoch:revision}},
  account_create:{ttl:1800,params:{controlKeys,threshold,registrationChallenge:b32}},
  control_keys_replace:{ttl:1800,params:{currentKeysetDigest:b32,controlKeys,threshold,nextControlVersion:revision}},
  device_add:{ttl:1800,params:{deviceID:nonempty,authorizationPublicKey:'device-key',encryptionPublicKey:'encryption-key',pairingID:b16,pairingCommitment:b32}},
  device_recover:{ttl:300,params:{deviceID:nonempty,authorizationPublicKey:'device-key',biometricPublicKey:'device-key',encryptionPublicKey:'encryption-key',vaultKeyDigest:b32,recoveryBundleDigest:b32,pairingID:b16,pairingCommitment:b32}},
  device_remove:{params:{deviceID:nonempty,deviceKeyID:b32,deviceRevision:revision}},
  device_disable:{params:{deviceID:nonempty,deviceKeyID:b32,deviceRevision:revision,reason:nonempty}},
  device_enable:{params:{deviceID:nonempty,deviceKeyID:b32,deviceRevision:revision,reason:nonempty}},
  security_key_add:{ttl:300,params:{credentialID:nonempty,registrationDigest:b32,name:nonempty}},
  security_key_remove:{params:{credentialID:nonempty,registrationDigest:b32,name:nonempty}},
  signing_lock:{params:{lockRevision:revision,nextLockRevision:revision}},
  signing_unlock:{params:{lockRevision:revision,nextLockRevision:revision}},
  policy_update:{params:{policyID:nonempty,currentRevision:revision,nextRevision:revision,policy:'policy'}},
  recovery_update:{params:{recoveryRevision:revision,nextRecoveryRevision:revision,recoveryManifest:'recovery-manifest'}},
  provider_transfer:{ttl:1800,params:{sourceProvider:site,destinationProvider:site,destinationEnclavePolicy:'enclave-policy',ownerEpoch:revision,nextOwnerEpoch:revision,recordsDigest:b32,policyRevision:revision}},
  passkey_share_grant:{ttl:1800,params:{grantID:b16,grantRevision:revision,credentialID:nonempty,rpId:nonempty,shareEpoch:revision,ownerAccountID:accountID,recipientAccountID:accountID,recipientControlVersion:revision,recipientDeviceKeyID:b32,recipientEncryptionKey:'encryption-key',recipientEncryptionKeyID:b32,policy:'passkey-share-policy',validFrom:timestamp,validUntil:timestamp}},
  passkey_share_accept:{ttl:1800,params:{grantID:b16,grantRevision:revision,credentialID:nonempty,rpId:nonempty,shareEpoch:revision,ownerAccountID:accountID,recipientAccountID:accountID,deliveryDigest:b32,recipientDeviceKeyID:b32,recipientEncryptionKeyID:b32}},
  passkey_share_revoke:{ttl:1800,params:{grantID:b16,currentRevision:revision,nextRevision:revision,credentialID:nonempty,rpId:nonempty,shareEpoch:revision,recipientAccountID:accountID}},
};
export const operationNames=Object.freeze(Object.keys(rules));
function timestamp(v){if(!Number.isSafeInteger(v)||v<0)reject();}
function step(a,b){if(nextRevision(a)!==b)reject('IDENTITY_VERSION_INVALID');}
export function validateAssurance(a){
  fields(a,['schema','requiredLevel','achievedLevel','factors','policyRevision']);
  if(a.schema!=='passli:loa:four:v1'||!Number.isInteger(a.requiredLevel)||a.requiredLevel<1||a.requiredLevel>4||!Number.isInteger(a.achievedLevel)||a.achievedLevel<a.requiredLevel||a.achievedLevel>4)reject();revision(a.policyRevision);
  const allowed=['registered-device','security-key','mobile-approval','fresh-biometric','additional-method'];
  if(!Array.isArray(a.factors)||!a.factors.length||new Set(a.factors).size!==a.factors.length||a.factors.some(f=>!allowed.includes(f)))reject();
  const has=f=>a.factors.includes(f),level=a.achievedLevel;
  if(level===1&&!has('registered-device')||level===2&&!has('security-key')||level>=3&&!has('mobile-approval')||level===4&&(!has('fresh-biometric')||!has('security-key')&&!has('additional-method')))reject();
}
export const factorPolicyOperations=Object.freeze(['account_create','control_keys_replace','device_add','login','create_account','link','unlink','rekey','resume','device_disable','device_enable','device_remove','signing_lock','signing_unlock','policy_update','security_key_add','security_key_remove']);
export function defaultIdentityAssurance(operation){
  if(!factorPolicyOperations.includes(operation))reject('IDENTITY_OPERATION_UNSUPPORTED');
  if(['login','create_account','link'].includes(operation))return {schema:'passli:loa:four:v1',requiredLevel:1,achievedLevel:1,factors:['registered-device'],policyRevision:'0'};
  const recoveryControl=['device_add','policy_update','signing_lock','signing_unlock','security_key_add','security_key_remove'].includes(operation),level=recoveryControl?3:4;
  return {schema:'passli:loa:four:v1',requiredLevel:level,achievedLevel:level,factors:recoveryControl?['mobile-approval','fresh-biometric']:['mobile-approval','fresh-biometric','security-key'],policyRevision:'0'};
}
export function validateIdentityPolicy(value){
  if(value?.kind==='algorithm'){
    fields(value,['kind','minimumProfile','allowedAlgorithms','revision',...(value.roles?['roles']:[])]);
    const {kind,...policy}=value;validateAlgorithmPolicy(policy);
  }else if(value?.kind==='signers'){fields(value,['kind','minimum','revision']);const {kind,...minimum}=value;validateSignerMinimum(minimum);
  }else if(value?.kind==='factors'){
    fields(value,['kind','revision','operations']);revision(value.revision);fields(value.operations,factorPolicyOperations);
    for(const policy of Object.values(value.operations)){validateAssurance(policy);if(policy.policyRevision!==value.revision||policy.requiredLevel!==policy.achievedLevel||policy.factors.includes('additional-method'))reject('IDENTITY_POLICY_INVALID');}
  }else reject('IDENTITY_POLICY_INVALID');
  return true;
}
// Extensions are trusted application validators, never request-supplied callbacks.
// Missing nested provider schemas fail closed; arbitrary JSON is not authorization.
export function validateTransaction(t,{schemas={}}={}){
  canonical(t);fields(t,['protocol','operation','audience','requestID','nonce','issuedAt','expiresAt','context','assurance','parameters']);
  if(t.protocol!==protocol||!Object.hasOwn(rules,t.operation))reject('IDENTITY_OPERATION_UNSUPPORTED');
  const r=rules[t.operation];site(t.audience);b16(t.requestID);b32(t.nonce);timestamp(t.issuedAt);timestamp(t.expiresAt);
  if(t.expiresAt<=t.issuedAt||t.expiresAt-t.issuedAt>(r.ttl||60))reject('IDENTITY_EXPIRY_INVALID');
  const c=t.context;
  if(r.rp){
    fields(c,['site','origin','userIdentifier','localAccountID','bindingID','keysetVersion','controlEpoch','sessionBinding','completionEndpoint','algorithmPolicy',...(c.signerPolicy?['signerPolicy','independentProvider']:[])]);if(c.signerPolicy){validateSignerPolicy(c.signerPolicy,t.operation);validateIndependentProvider(c.independentProvider);}validateAlgorithmBinding(c.algorithmPolicy);site(c.site);site(c.origin);if(t.audience!==c.origin)reject();b16(c.userIdentifier);nonempty(c.localAccountID);b16(c.bindingID);revision(c.keysetVersion);revision(c.controlEpoch);if(c.keysetVersion==='0')reject();
    if(t.operation==='suspend'){if(c.sessionBinding!==null||c.completionEndpoint!==null||t.assurance!==null)reject();}
    else {b32(c.sessionBinding);text(c.completionEndpoint);let u;try{u=new URL(c.completionEndpoint);}catch{reject();}if(u.origin!==c.origin||u.username||u.password||u.hash||u.href!==c.completionEndpoint)reject();}
  }else if(t.operation==='device_add'){fields(c,['accountID','authorizationGeneration','sessionBinding']);accountID(c.accountID);revision(c.authorizationGeneration);if(c.authorizationGeneration==='0')reject();b32(c.sessionBinding);
  }else{fields(c,['accountID','controlVersion','sessionBinding']);accountID(c.accountID);revision(c.controlVersion);b32(c.sessionBinding);if((t.operation==='account_create')!==(c.controlVersion==='0'))reject();}
  if(t.operation==='device_recover'){if(t.assurance!==null)reject();}
  else if(t.operation!=='suspend')validateAssurance(t.assurance);
  fields(t.parameters,[...Object.keys(r.params),...(r.params.pub1&&c.signerPolicy?['pub3']:[])]);if(r.params.pub1&&c.signerPolicy)descriptor(t.parameters.pub3,'independent');for(const [k,v]of Object.entries(r.params)){
    if(typeof v==='function')v(t.parameters[k]);
    else {const validator=pairingSchemas[v]||(v==='policy'?validateIdentityPolicy:schemas[v]);if(typeof validator!=='function'||validator(t.parameters[k])!==true)reject('IDENTITY_SCHEMA_UNSUPPORTED');}
  }
  const p=t.parameters;
  if(p.pub3&&(p.pub3.algorithm!==roleAlgorithm(c.algorithmPolicy,'independent')||new Set([p.pub1.publicKey,p.pub2.publicKey,p.pub3.publicKey]).size!==3))reject();
  if(p.pub1){if(p.pub2.algorithm!==roleAlgorithm(c.algorithmPolicy,'cloud')||p.pub1.publicKey===p.pub2.publicKey||p.pub1.algorithm!==roleAlgorithm(c.algorithmPolicy,'user'))reject();}
  if(['link','create_account'].includes(t.operation)&&(c.keysetVersion!=='1'||c.controlEpoch!=='0'))reject();
  if(t.operation==='rekey')step(c.keysetVersion,p.nextKeysetVersion);
  if(['rekey','resume'].includes(t.operation))step(c.controlEpoch,p.nextControlEpoch);
  if(t.operation==='control_keys_replace')step(c.controlVersion,p.nextControlVersion);
  if(t.operation==='policy_update'&&(p.policyID!==p.policy.kind||p.policy.revision!==p.nextRevision))reject('IDENTITY_POLICY_INVALID');
  for(const [a,b]of [['lockRevision','nextLockRevision'],['currentRevision','nextRevision'],['recoveryRevision','nextRecoveryRevision'],['ownerEpoch','nextOwnerEpoch']])if(p[a]!==undefined&&p[b]!==undefined)step(p[a],p[b]);
  if(t.operation==='passkey_share_grant'&&(p.ownerAccountID!==c.accountID||p.validUntil<=p.validFrom))reject();
  if(t.operation==='passkey_share_accept'&&p.recipientAccountID!==c.accountID)reject();
  return t;
}
export function operationScope(name){if(!Object.hasOwn(rules,name))reject();return rules[name].rp?'rp':'control';}
