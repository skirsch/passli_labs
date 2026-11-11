import {accountID,decode64,fields,reject,revision,text} from './encoding.mjs';
export const pairingSuite='XWing-draft06-HKDF-SHA256-AES256GCM';
export function deviceAuthorizationKey(k){
  fields(k,['algorithm','publicKey','keyID']);
  if(k.algorithm!=='ECDSA-P256-SHA256'||decode64(k.publicKey,65)[0]!==4)reject();decode64(k.keyID,32);return true;
}
export function deviceEncryptionKey(k){
  fields(k,['algorithm','publicKey','keyID']);
  if(k.algorithm!==pairingSuite)reject();decode64(k.publicKey,1216);decode64(k.keyID,32);return true;
}
export const pairingSchemas=Object.freeze({'device-key':deviceAuthorizationKey,'encryption-key':deviceEncryptionKey});

export function validatePairingTranscript(t){
  fields(t,['format','suite','accountID','pairingID','senderDeviceID','recipientDeviceID','authorizationPublicKey','encryptionPublicKey','purpose','keyEpoch','approvalRevision','issuedAt','expiresAt']);
  if(t.format!=='passli:hybrid-pairing:v1'||t.suite!==pairingSuite)reject('IDENTITY_PAIRING_SUITE_INVALID');
  accountID(t.accountID);decode64(t.pairingID,16);
  for(const id of [t.senderDeviceID,t.recipientDeviceID]){text(id,128);if(!id)reject();}
  if(t.senderDeviceID===t.recipientDeviceID)reject();
  if(decode64(t.authorizationPublicKey,65)[0]!==4)reject();decode64(t.encryptionPublicKey,1216);
  if(!['browser-data-key','mobile-account-bundle'].includes(t.purpose))reject();
  revision(t.keyEpoch);revision(t.approvalRevision);
  if(!Number.isSafeInteger(t.issuedAt)||t.issuedAt<0||!Number.isSafeInteger(t.expiresAt)||t.expiresAt<=t.issuedAt||t.expiresAt-t.issuedAt>300)reject();
  return t;
}
