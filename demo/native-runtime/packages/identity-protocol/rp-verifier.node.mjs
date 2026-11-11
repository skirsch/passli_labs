import {canonical,fields,reject,site,nextRevision} from './encoding.mjs';
import {validateTransaction} from './schema.mjs';
import {verifyTransactionSignatures,verifyKeyPossession} from './crypto.node.mjs';
import {assertCurrentAlgorithmPolicy} from './algorithm-policy.mjs';
import {verifyEnrollmentCertificate} from './provider-enrollment.mjs';

const copy=value=>JSON.parse(canonical(value));
// Pure RP transition. The caller supplies its own stored challenge, binding and
// policy, then atomically consumes the challenge and commits this transition.
// No request-supplied public key is trusted for an existing binding.
export function verifyRPTransition(packet,{expected,binding,site:registeredSite,origin,provider,algorithmPolicies,now}){
  fields(packet,['response','newKeyProofs','enrollmentCertificate']);
  const t=validateTransaction(expected),c=t.context;
  site(registeredSite);site(origin);
  if(!['create_account','link','login','unlink','rekey','suspend','resume'].includes(t.operation)||c.site!==registeredSite||c.origin!==origin)reject('IDENTITY_RP_MISMATCH');
  if(!Number.isSafeInteger(now)||now<t.issuedAt||now>=t.expiresAt)reject('IDENTITY_EXPIRED');
  const enroll=['create_account','link'].includes(t.operation);
  let keys;
  if(enroll){
    if(binding!==null)reject('IDENTITY_ALREADY_LINKED');
    verifyEnrollmentCertificate(t,packet.enrollmentCertificate,{...provider,now});
    keys=[t.parameters.pub1,t.parameters.pub2];
  }else{
    if(packet.enrollmentCertificate!==null||!binding||binding.state==='unlinked')reject('IDENTITY_BINDING_INVALID');
    for(const field of ['site','origin','userIdentifier','localAccountID','bindingID','keysetVersion','controlEpoch'])if(binding[field]!==c[field])reject('IDENTITY_BINDING_CHANGED');
    if(!Array.isArray(binding.keys)||binding.keys.length!==2||binding.keys[0].role!=='user'||binding.keys[1].role!=='cloud')reject('IDENTITY_KEY_INVALID');
    if(t.operation==='login'&&binding.state!=='active')reject('IDENTITY_BINDING_SUSPENDED');
    if(t.operation==='resume'&&binding.state!=='emergency_suspended')reject('IDENTITY_BINDING_NOT_SUSPENDED');
    keys=t.operation==='suspend'?[binding.keys[1]]:binding.keys;
  }
  if(!['suspend','unlink'].includes(t.operation))assertCurrentAlgorithmPolicy(c.algorithmPolicy,algorithmPolicies);
  verifyTransactionSignatures(packet.response,{expected:t,keys,now});
  if(!Array.isArray(packet.newKeyProofs))reject();
  const next=enroll?{...copy(c),keys:copy(keys),state:'active',sessionGeneration:'1'}:copy(binding);
  delete next.sessionBinding;delete next.completionEndpoint;
  if(t.operation==='rekey'){
    const proposed=[t.parameters.pub1,t.parameters.pub2];verifyKeyPossession(t,packet.newKeyProofs,proposed,'passli:new-key-possession:v1');
    next.keys=copy(proposed);next.keysetVersion=t.parameters.nextKeysetVersion;next.controlEpoch=t.parameters.nextControlEpoch;next.algorithmPolicy=copy(c.algorithmPolicy);next.state='active';
  }else if(packet.newKeyProofs.length)reject();
  if(t.operation==='suspend')next.state='emergency_suspended';
  if(t.operation==='resume'){next.state='active';next.controlEpoch=t.parameters.nextControlEpoch;}
  if(t.operation==='unlink'){next.state='unlinked';next.keys=[];}
  if(['suspend','resume','unlink','rekey'].includes(t.operation))next.sessionGeneration=nextRevision(next.sessionGeneration);
  return {binding:next,establishSession:['login','create_account','link'].includes(t.operation)};
}
