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
  prepare(input,sessionBinding,localSession=null,requestedLevel=1,requestedKeyCount=2){
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
   const policies=algorithmPolicies(input.userIdentifier),algorithm=newKeys?input.pub1?.algorithm:binding.keys[0]?.algorithm;
   const policy=operation==='unlink'?binding.algorithmPolicy:algorithmBinding(algorithm,policies),assurance=requestedAssurance(assuranceFor(operation,input.userIdentifier),requestedLevel);validateAssurance(assurance);
   const issuedAt=now(),parameters=newKeys?{pub1:input.pub1,pub2:input.pub2,...(input.pub3?{pub3:input.pub3}:{})}:{};
   if(operation==='rekey'){parameters.nextKeysetVersion=nextRevision(binding.keysetVersion);parameters.nextControlEpoch=nextRevision(binding.controlEpoch);}
   if(operation==='resume')parameters.nextControlEpoch=nextRevision(binding.controlEpoch);
   const three=!!(input.pub3||binding?.keys.length===3),minimum=three?signerPolicyFor(input.userIdentifier):null;
   const policyBinding=three?signerPolicy(operation,{user:minimum.user,rp:{...minimum.rp,minimum:Math.max(minimum.rp.minimum,requestedKeyCount)}}):null;
   const transaction=validateTransaction({protocol,operation,audience:origin,requestID:random(16),nonce:random(32),issuedAt,expiresAt:issuedAt+(['create_account','link','rekey','resume'].includes(operation)?1800:60),
    context:{site:origin,origin,userIdentifier:input.userIdentifier,localAccountID,bindingID:binding?.bindingID||random(16),keysetVersion:binding?.keysetVersion||'1',controlEpoch:binding?.controlEpoch||'0',sessionBinding,completionEndpoint:origin+'/api/identity/complete',algorithmPolicy:policy,...(three?{signerPolicy:policyBinding,independentProvider:binding?.independentProvider||input.independentProvider}:{})},parameters,assurance});
   return ledger.prepare(JSON.parse(canonical(transaction)),sessionBinding);
  },
  complete:(packet,sessionBinding)=>ledger.complete(packet,sessionBinding),
  completion:requestID=>ledger.completion(requestID),
  session:token=>ledger.session(token),logout:token=>ledger.logout(token),
  startHandoff(sessionBinding,input={},localSession=null){
   fields(input,[...(Object.hasOwn(input,'operation')?['operation']:[]),...(Object.hasOwn(input,'requestedLevel')?['requestedLevel']:[]),...(Object.hasOwn(input,'requestedKeyCount')?['requestedKeyCount']:[]),...(Object.hasOwn(input,'requestedAlgorithm')?['requestedAlgorithm']:[])]);const operation=input.operation||'discover';
   if(input.requestedKeyCount!==undefined&&![2,3].includes(input.requestedKeyCount))reject('IDENTITY_SIGNER_PROFILE_UNSUPPORTED');
   if(input.requestedAlgorithm!==undefined&&!Object.values(profileAlgorithms).includes(input.requestedAlgorithm))reject('IDENTITY_ALGORITHM_UNSUPPORTED');
   if(!['discover','link','unlink','rekey'].includes(operation))reject('IDENTITY_OPERATION_UNSUPPORTED');
   if(operation==='link'){if(typeof authorizeLocalLink!=='function')reject('IDENTITY_LINK_AUTHORITY_REQUIRED');authorizeLocalLink(localSession);}
   else if(operation!=='discover'&&!localSession?.userIdentifier)reject('IDENTITY_LOCAL_SESSION_REQUIRED');
   return ledger.createHandoff(sessionBinding,{requestedOperation:operation,userIdentifier:['discover','link'].includes(operation)?null:localSession.userIdentifier,requestedLevel:input.requestedLevel??1,requestedKeyCount:input.requestedKeyCount??2,requestedAlgorithm:operation==='unlink'?null:input.requestedAlgorithm??null,localSession:operation==='link'?localSession:null});
  },
  handoff:(ticket,sessionBinding)=>ledger.handoff(ticket,sessionBinding),
  proposeHandoff(ticket,input){
   fields(input,['userIdentifier','pub1','pub2',...(input.pub3?['pub3','independentProvider']:[])]);const pending=ledger.handoff(ticket);
   if(pending.stage!=='waiting'){
    if(!pending.proposal||canonical(pending.proposal)!==canonical(input)||pending.stage==='cancelled')reject('IDENTITY_HANDOFF_CHANGED');return pending.transaction;
   }
   if(pending.userIdentifier&&pending.userIdentifier!==input.userIdentifier)reject('IDENTITY_ACCOUNT_CHANGED');
   const operation=pending.requestedOperation==='discover'?(ledger.bindingForSubject(input.userIdentifier)?'login':'create_account'):pending.requestedOperation;
   const algorithm=operation==='login'?ledger.bindingForSubject(input.userIdentifier)?.keys[0].algorithm:input.pub1?.algorithm;
   if(pending.requestedAlgorithm&&algorithm!==pending.requestedAlgorithm)reject('IDENTITY_REKEY_REQUIRED');
   const t=api.prepare({operation,userIdentifier:input.userIdentifier,...(['create_account','link','rekey'].includes(operation)?{pub1:input.pub1,pub2:input.pub2,...(input.pub3?{pub3:input.pub3,independentProvider:input.independentProvider}:{})}:{})},pending.sessionBinding,pending.localSession,pending.requestedLevel??1,pending.requestedKeyCount??2);
   ledger.updateHandoff(ticket,'waiting',{stage:'prepared',transaction:t,proposal:JSON.parse(canonical(input)),packet:null});return t;
  },
  submitHandoff(ticket,packet){
   const pending=ledger.handoff(ticket);
   if(canonical(packet?.response?.transaction)!==canonical(pending.transaction))reject('IDENTITY_TRANSACTION_MISMATCH');
   if(pending.stage==='proof'){if(canonical(pending.packet)!==canonical(packet))reject('IDENTITY_REQUEST_CONFLICT');return {submitted:true};}
   if(pending.stage!=='prepared')reject('IDENTITY_HANDOFF_CHANGED');
   ledger.verifyPending(packet,pending.sessionBinding);
   ledger.updateHandoff(ticket,'prepared',{stage:'proof',transaction:pending.transaction,proposal:pending.proposal,packet:JSON.parse(canonical(packet))});return {submitted:true};
  },
  finishHandoff(ticket,sessionBinding){
   const pending=ledger.handoff(ticket,sessionBinding);if(!['proof','complete'].includes(pending.stage))reject('IDENTITY_HANDOFF_CHANGED');
   const result=ledger.complete(pending.packet,sessionBinding);
   if(pending.stage==='proof')ledger.updateHandoff(ticket,'proof',{stage:'complete',transaction:pending.transaction,proposal:pending.proposal,packet:pending.packet});
   return result;
  },
  cancelHandoff(ticket,sessionBinding){const pending=ledger.handoff(ticket,sessionBinding);if(pending.stage==='complete')reject('IDENTITY_HANDOFF_CHANGED');if(pending.stage!=='cancelled')ledger.updateHandoff(ticket,pending.stage,{stage:'cancelled',transaction:null,packet:null});return {cancelled:true};},
 };
 return api;
}
