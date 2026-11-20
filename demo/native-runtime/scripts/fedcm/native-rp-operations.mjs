import {assertPersonalInformation} from '../../packages/identity-protocol/personal-information.mjs';
import {measureRP} from './native-rp-timing.mjs';
import {assertLoginChallenge} from '../../packages/identity-protocol/fast-login.mjs';
import {digest64} from '../../packages/identity-protocol/crypto.node.mjs';
import {signerPolicy} from '../../packages/identity-protocol/signer-policy.mjs';
import {requestedAssurance} from '../../packages/identity-protocol/assurance-policy.mjs';
import {randomBytes} from 'node:crypto';
import {canonical,decode64,fields,nextRevision,reject,site} from '../../packages/identity-protocol/encoding.mjs';
import {protocol,validateAssurance,validateTransaction} from '../../packages/identity-protocol/schema.mjs';
import {algorithmBinding,profileAlgorithms} from '../../packages/identity-protocol/algorithm-policy.mjs';

// The RP creates all challenge fields. The browser supplies only the selected
// site subject and proposed enrollment/rekey public keys, never an expected
// transaction, a local account ID, or a policy revision.
export function createNativeRPOperations({ledger,origin,algorithmPolicies,assuranceFor,signerPolicyFor,requireThreeKeys=false,authorizeLocalLink,now=()=>Math.floor(Date.now()/1000)}){
 site(origin);
 if(!ledger||typeof algorithmPolicies!=='function'||typeof assuranceFor!=='function')throw Error('RP authority configuration required.');
 const random=n=>randomBytes(n).toString('base64url');
 const api={
  prepare(input,sessionBinding,localSession=null,requestedLevel=1,requestedKeyCount=2,personalInformationDigest){
   decode64(sessionBinding,32);
   const operation=input?.operation,enroll=['create_account','link'].includes(operation),newKeys=enroll||operation==='rekey';
   if(!['create_account','link','login','unlink','rekey','resume'].includes(operation))reject('IDENTITY_OPERATION_UNSUPPORTED');
   fields(input,['operation','userIdentifier',...(newKeys?['pub1','pub2',...(input.pub3?['pub3','independentProvider']:[])]:[])]);decode64(input.userIdentifier,16);
   const binding=ledger.bindingForSubject(input.userIdentifier);
   if(requireThreeKeys&&(newKeys?!input.pub3:binding?.keys.length!==3))reject('IDENTITY_THREE_KEYS_REQUIRED');
   if(enroll?binding!==null:!binding)reject('IDENTITY_BINDING_INVALID');
   let localAccountID=binding?.localAccountID;
   if(operation==='create_account')localAccountID=random(16);
   if(operation==='link'){
    if(typeof authorizeLocalLink!=='function')reject('IDENTITY_LINK_AUTHORITY_REQUIRED');
    localAccountID=authorizeLocalLink(localSession);
    if(typeof localAccountID!=='string'||!localAccountID)reject('IDENTITY_LINK_AUTHORITY_REQUIRED');
   }
   const policies=algorithmPolicies(input.userIdentifier),keys=newKeys?[input.pub1,input.pub2,input.pub3].filter(Boolean):binding.keys,algorithm=keys.length===3?Object.fromEntries(keys.map(k=>[k.role,k.algorithm])):keys[0]?.algorithm;
   const policy=operation==='unlink'?binding.algorithmPolicy:algorithmBinding(algorithm,policies),assurance=requestedAssurance(assuranceFor(operation,input.userIdentifier),requestedLevel);validateAssurance(assurance);
   const issuedAt=now(),parameters=newKeys?{pub1:input.pub1,pub2:input.pub2,...(input.pub3?{pub3:input.pub3}:{})}:{};
   if(operation==='rekey'){parameters.nextKeysetVersion=nextRevision(binding.keysetVersion);parameters.nextControlEpoch=nextRevision(binding.controlEpoch);}
   if(operation==='resume')parameters.nextControlEpoch=nextRevision(binding.controlEpoch);
   const three=!!(input.pub3||binding?.keys.length===3),minimum=three?signerPolicyFor(input.userIdentifier):null;
   const policyBinding=three?signerPolicy(operation,{user:minimum.user,rp:{...minimum.rp,minimum:Math.max(minimum.rp.minimum,requestedKeyCount)}}):null;
   const transaction=validateTransaction({protocol,operation,audience:origin,requestID:random(16),nonce:random(32),issuedAt,expiresAt:issuedAt+(['create_account','link','rekey','resume'].includes(operation)?1800:60),
    context:{site:origin,origin,userIdentifier:input.userIdentifier,localAccountID,bindingID:binding?.bindingID||random(16),keysetVersion:binding?.keysetVersion||'1',controlEpoch:binding?.controlEpoch||'0',sessionBinding,completionEndpoint:origin+'/api/identity/complete',algorithmPolicy:policy,...(personalInformationDigest?{personalInformationDigest}:{}),...(three?{signerPolicy:policyBinding,independentProvider:binding?.independentProvider||input.independentProvider}:{})},parameters,assurance});
   return ledger.prepare(JSON.parse(canonical(transaction)),sessionBinding);
  },
  complete:(packet,sessionBinding)=>ledger.complete(packet,sessionBinding),
  fastComplete(packet,challenge,sessionBinding){
   const t=assertLoginChallenge(packet?.response?.transaction,challenge);
   if(t.context.sessionBinding!==sessionBinding)reject('IDENTITY_SESSION_MISMATCH');
   // The caller verified the RP-sealed challenge. Only login can enter here;
   // registration and key transitions retain their explicit authorization path.
   return measureRP('ledger',()=>ledger.complete(packet,sessionBinding,undefined,{prepareLogin:true}));
  },
  completion:requestID=>ledger.completion(requestID),
  deletion:(bindingID,options)=>ledger.deletion(bindingID,options),
  session:token=>ledger.session(token),logout:token=>ledger.logout(token),
  deleteAccount:token=>ledger.deleteAccount(token),
  startHandoff(sessionBinding,input={},localSession=null){
   fields(input,[...(Object.hasOwn(input,'operation')?['operation']:[]),...(Object.hasOwn(input,'requestedLevel')?['requestedLevel']:[]),...(Object.hasOwn(input,'requestedKeyCount')?['requestedKeyCount']:[]),...(Object.hasOwn(input,'requestedAlgorithm')?['requestedAlgorithm']:[]),...(input.requestedAlgorithms?['requestedAlgorithms']:[]),...(Object.hasOwn(input,'requestPersonalInformation')?['requestPersonalInformation']:[])]);const operation=input.operation||'discover';if(input.requestPersonalInformation!==undefined&&typeof input.requestPersonalInformation!=='boolean')reject();if(input.requestPersonalInformation&&!['discover','link'].includes(operation))reject('IDENTITY_DISCLOSURE_UNREQUESTED');
   if(input.requestedKeyCount!==undefined&&![1,2,3].includes(input.requestedKeyCount))reject('IDENTITY_SIGNER_PROFILE_UNSUPPORTED');
   if(input.requestedAlgorithms){fields(input.requestedAlgorithms,['user','cloud','independent']);if(Object.values(input.requestedAlgorithms).some(a=>a!==null&&!Object.values(profileAlgorithms).includes(a)))reject('IDENTITY_ALGORITHM_UNSUPPORTED');}
   if(input.requestedAlgorithm!==undefined&&!Object.values(profileAlgorithms).includes(input.requestedAlgorithm))reject('IDENTITY_ALGORITHM_UNSUPPORTED');
   if(!['discover','link','unlink','rekey'].includes(operation))reject('IDENTITY_OPERATION_UNSUPPORTED');
   if(operation==='link'){if(typeof authorizeLocalLink!=='function')reject('IDENTITY_LINK_AUTHORITY_REQUIRED');authorizeLocalLink(localSession);}
   else if(operation!=='discover'&&!localSession?.userIdentifier)reject('IDENTITY_LOCAL_SESSION_REQUIRED');
   return ledger.createHandoff(sessionBinding,{requestedOperation:operation,requestPersonalInformation:input.requestPersonalInformation===true,userIdentifier:['discover','link'].includes(operation)?null:localSession.userIdentifier,requestedLevel:input.requestedLevel??1,requestedKeyCount:input.requestedKeyCount??2,requestedAlgorithm:operation==='unlink'?null:input.requestedAlgorithm??null,requestedAlgorithms:operation==='unlink'?null:input.requestedAlgorithms??null,localSession:operation==='link'?localSession:null});
  },
  handoff:(ticket,sessionBinding)=>ledger.handoff(ticket,sessionBinding),
  proposeHandoff(ticket,input){
   fields(input,['userIdentifier',...(input.pub1?['pub1','pub2']:[]),...(input.registration!==undefined?['registration']:[]),...(input.personalInformationDigest?['personalInformationDigest']:[]),...(input.pub3?['pub3','independentProvider']:[])]);const pending=ledger.handoff(ticket);
   if(input.registration!==undefined&&typeof input.registration!=='boolean')reject();
   if(input.registration===true&&ledger.bindingForSubject(input.userIdentifier))reject('IDENTITY_SITE_ID_TAKEN');
   if(pending.stage!=='waiting'){
    if(!pending.proposal||canonical(pending.proposal)!==canonical(input)||pending.stage==='cancelled')reject('IDENTITY_HANDOFF_CHANGED');return pending.transaction;
   }
   if(pending.requestPersonalInformation){decode64(input.personalInformationDigest,32);}else if(input.personalInformationDigest)reject('IDENTITY_DISCLOSURE_UNREQUESTED');
   if(pending.userIdentifier&&pending.userIdentifier!==input.userIdentifier)reject('IDENTITY_ACCOUNT_CHANGED');
   const operation=pending.requestedOperation==='discover'?(ledger.bindingForSubject(input.userIdentifier)?'login':'create_account'):pending.requestedOperation;
   if(operation==='create_account'&&!input.pub1)reject('IDENTITY_BINDING_UNKNOWN');
   const algorithm=operation==='login'?ledger.bindingForSubject(input.userIdentifier)?.keys[0].algorithm:input.pub1?.algorithm;
   if(pending.requestedAlgorithm&&algorithm!==pending.requestedAlgorithm)reject('IDENTITY_REKEY_REQUIRED');
   const proposed=operation==='login'?ledger.bindingForSubject(input.userIdentifier)?.keys:[input.pub1,input.pub2,input.pub3];if(pending.requestedAlgorithms)for(const k of proposed.filter(Boolean)){const requested=pending.requestedAlgorithms[k.role];if(requested&&requested!==k.algorithm)reject('IDENTITY_REKEY_REQUIRED');}
   const t=api.prepare({operation,userIdentifier:input.userIdentifier,...(['create_account','link','rekey'].includes(operation)?{pub1:input.pub1,pub2:input.pub2,...(input.pub3?{pub3:input.pub3,independentProvider:input.independentProvider}:{})}:{})},pending.sessionBinding,pending.localSession,pending.requestedLevel??1,pending.requestedKeyCount??2,input.personalInformationDigest);
   ledger.updateHandoff(ticket,'waiting',{stage:'prepared',transaction:t,proposal:JSON.parse(canonical(input)),packet:null});return t;
  },
  discloseHandoff(ticket,value){const pending=ledger.handoff(ticket);if(pending.stage!=='prepared')reject('IDENTITY_HANDOFF_CHANGED');assertPersonalInformation(pending.transaction,value,digest64);if(pending.disclosure&&canonical(pending.disclosure)!==canonical(value))reject('IDENTITY_REQUEST_CONFLICT');ledger.updateHandoff(ticket,'prepared',{disclosure:JSON.parse(canonical(value))});return {accepted:true};},
  submitHandoff(ticket,packet){
   const pending=ledger.handoff(ticket);
   if(canonical(packet?.response?.transaction)!==canonical(pending.transaction))reject('IDENTITY_TRANSACTION_MISMATCH');
   if(pending.stage==='proof'){if(canonical(pending.packet)!==canonical(packet))reject('IDENTITY_REQUEST_CONFLICT');return {submitted:true};}
   if(pending.stage!=='prepared')reject('IDENTITY_HANDOFF_CHANGED');
   if(pending.transaction.operation==='create_account'&&ledger.bindingForSubject(pending.transaction.context.userIdentifier))reject('IDENTITY_SITE_ID_TAKEN');
   ledger.verifyPending(packet,pending.sessionBinding);
   ledger.updateHandoff(ticket,'prepared',{stage:'proof',transaction:pending.transaction,proposal:pending.proposal,packet:JSON.parse(canonical(packet))});return {submitted:true};
  },
  finishHandoff(ticket,sessionBinding,{createAccount=false}={}){
   const pending=ledger.handoff(ticket,sessionBinding);if(!['proof','complete'].includes(pending.stage))reject('IDENTITY_HANDOFF_CHANGED');
   // Only the RP's cookie-bound completion endpoint accepts enrollment consent.
   // Uploading Passli's public-key authorization never creates a site account.
   if(pending.stage!=='complete'&&pending.transaction.operation==='create_account'&&createAccount!==true)reject('IDENTITY_REGISTRATION_CONFIRMATION_REQUIRED');
   const result=ledger.complete(pending.packet,sessionBinding,pending.disclosure);
   if(pending.stage==='proof')ledger.updateHandoff(ticket,'proof',{stage:'complete',transaction:pending.transaction,proposal:pending.proposal,packet:pending.packet,disclosure:null});
   return result;
  },
  cancelHandoff(ticket,sessionBinding){const pending=ledger.handoff(ticket,sessionBinding);if(pending.stage==='complete')reject('IDENTITY_HANDOFF_CHANGED');if(pending.stage!=='cancelled')ledger.updateHandoff(ticket,pending.stage,{stage:'cancelled',transaction:null,packet:null,disclosure:null});return {cancelled:true};},
 };
 return api;
}
