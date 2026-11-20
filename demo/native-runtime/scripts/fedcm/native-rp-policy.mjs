import {validateSignerMinimum} from '../../packages/identity-protocol/signer-policy.mjs';
import {measureRP} from './native-rp-timing.mjs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomBytes} from 'node:crypto';
import {canonical,fields,parseWire,reject,site} from '../../packages/identity-protocol/encoding.mjs';
import {validateAlgorithmPolicies} from '../../packages/identity-protocol/algorithm-policy.mjs';
import {validateAssurance} from '../../packages/identity-protocol/schema.mjs';
import {verifyProof} from '../../packages/identity-protocol/crypto.node.mjs';
import {assertLoginChallenge} from '../../packages/identity-protocol/fast-login.mjs';

// Fetch outside SQLite's transaction, then hold a request-local immutable policy
// snapshot during its synchronous verification/commit. No cross-user cache.
export function createNativeRPPolicy({origin,providerOrigin,rpPolicy,rpAssuranceFor,rpSignerPolicyFor=()=>({minimum:1,revision:'0'}),fetch:request=fetch}){
 site(origin);site(providerOrigin);if(typeof rpAssuranceFor!=='function')throw Error('RP minimum assurance required.');
 const state=new AsyncLocalStorage();
 const current=subject=>{const value=state.getStore();if(!value||value.userIdentifier!==subject)reject('IDENTITY_POLICY_UNAVAILABLE');return value;};
 async function load(ticket,userIdentifier){
  if(typeof ticket!=='string'||ticket.length>2048)reject('IDENTITY_POLICY_TICKET_INVALID');
  const response=await request(providerOrigin+'/api/identity/rp-policy',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({ticket,site:origin,userIdentifier,requestID:randomBytes(16).toString('base64url')}),signal:AbortSignal.timeout(5000)});
  if(!response.ok||!response.body)reject('IDENTITY_POLICY_UNAVAILABLE');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768)reject('IDENTITY_POLICY_INVALID');chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const value=parseWire(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  fields(value,['site','userIdentifier','policies','assurance',...(value.signers?['signers']:[])]);if(value.signers)validateSignerMinimum(value.signers);
  if(value.site!==origin||value.userIdentifier!==userIdentifier)reject('IDENTITY_POLICY_INVALID');
  validateAlgorithmPolicies(value.policies);if(canonical(value.policies.rp)!==canonical(rpPolicy))reject('IDENTITY_POLICY_CHANGED');
  fields(value.assurance,['login','create_account','link','unlink','rekey','resume']);
  for(const [operation,assurance]of Object.entries(value.assurance)){validateAssurance(assurance);const minimum=rpAssuranceFor(operation);validateAssurance(minimum);if(assurance.requiredLevel<minimum.requiredLevel||minimum.factors.some(f=>!assurance.factors.includes(f)))reject('IDENTITY_POLICY_INVALID');}
  return value;
 }
 return {
  algorithmPolicies:subject=>current(subject).policies,
  signerPolicyFor:subject=>({user:current(subject).signers||{minimum:2,revision:'0'},rp:validateSignerMinimum(rpSignerPolicyFor(subject))}),
  assuranceFor:(operation,subject)=>current(subject).assurance[operation],
  bind(ledger,operations){
   async function withPolicy(subject,ticket,run){const snapshot=await load(ticket,subject);return state.run(snapshot,run);}
   async function packetPolicy(packet,run){
    const t=packet?.response?.transaction,proofs=packet?.response?.signatures?.filter(p=>p.role==='cloud');
    const registration=t?.operation==='create_account'&&packet.response.signatures?.length===0;
    if(!t||!registration&&!(t.operation==='login'&&t.context.signerPolicy?.requiredRoles.length===1)&&proofs?.length!==1)reject('IDENTITY_SIGNATURE_INVALID');
    // Policy tickets authorize site policy reads. Key authority remains in the ledger.
    const subject=t.context.userIdentifier;
    return withPolicy(subject,ledger.policyTicket(subject),run);
   }
   return {...operations,
    fastComplete(packet,challenge,browser){
     const t=assertLoginChallenge(packet?.response?.transaction,challenge),subject=t.context.userIdentifier,binding=ledger.bindingForSubject(subject);
     if(!binding)return {registrationRequired:true};
     if(binding.state!=='active')reject('IDENTITY_BINDING_UNKNOWN');
     if(t.context.signerPolicy?.requiredRoles.length===1){
      const proofs=packet.response.signatures;if(proofs?.length!==1||proofs[0].role!=='user')reject('IDENTITY_SIGNATURE_INVALID');
      verifyProof(t,proofs[0],binding.keys[0]);
      return withPolicy(subject,ledger.policyTicket(subject),()=>operations.fastComplete(packet,challenge,browser));
     }
     const cloud=packet.response.signatures?.filter(p=>p.role==='cloud');
     if(cloud?.length!==1)reject('IDENTITY_SIGNATURE_INVALID');
     measureRP('policyProof',()=>verifyProof(t,cloud[0],binding.keys[1]));
     // A fresh pinned-cloud signature carries the user's authorization snapshot.
     // Enforce RP-owned policy locally; never fetch it back from Passli here.
     const policies=validateAlgorithmPolicies(t.context.algorithmPolicy.policies);
     if(canonical(policies.rp)!==canonical(rpPolicy))reject('IDENTITY_POLICY_CHANGED');
     const minimum=rpAssuranceFor('login');validateAssurance(minimum);
     if(t.assurance.requiredLevel<minimum.requiredLevel||minimum.factors.some(f=>!t.assurance.factors.includes(f)))reject('IDENTITY_POLICY_CHANGED');
     const snapshot={userIdentifier:subject,policies,assurance:{login:t.assurance},signers:t.context.signerPolicy.user};
     return state.run(snapshot,()=>operations.fastComplete(packet,challenge,browser));
    },
    async proposeHandoff(ticket,input){
     fields(input,['userIdentifier','policyTicket',...(input.pub1?['pub1','pub2']:[]),...(input.registration!==undefined?['registration']:[]),...(input.personalInformationDigest?['personalInformationDigest']:[]),...(input.pub3?['pub3','independentProvider']:[])]);const binding=ledger.bindingForSubject(input.userIdentifier);
     if(input.registration===true&&binding)reject('IDENTITY_SITE_ID_TAKEN');
     const key=binding?.keys[1]||input.pub2;
     if(!key)reject('IDENTITY_BINDING_UNKNOWN');
     return withPolicy(input.userIdentifier,input.policyTicket,()=>{ledger.setPolicyTicket(input.userIdentifier,input.policyTicket);const {policyTicket,...proposal}=input;return operations.proposeHandoff(ticket,proposal);});
    },
    async prepare(input,browser,session){const {policyTicket,...proposal}=input,key=ledger.bindingForSubject(input.userIdentifier)?.keys[1]||input.pub2;return withPolicy(input.userIdentifier,policyTicket,()=>{ledger.setPolicyTicket(input.userIdentifier,policyTicket);return operations.prepare(proposal,browser,session);});},
    submitHandoff:async(ticket,packet)=>{
     const expected=ledger.handoff(ticket).transaction;
     if(expected?.operation==='login'){
      // Proof upload does not establish a session. Verify against the exact
      // server-stored proposal here; finishHandoff re-reads current policy and
      // repeats validation before issuing the browser's session cookie.
      // Never take this snapshot from the caller's packet.
      const snapshot={userIdentifier:expected.context.userIdentifier,policies:expected.context.algorithmPolicy.policies,assurance:{login:expected.assurance},...(expected.context.signerPolicy?{signers:expected.context.signerPolicy.user}:{})};
      return state.run(snapshot,()=>operations.submitHandoff(ticket,packet));
     }
     return packetPolicy(packet,()=>operations.submitHandoff(ticket,packet));
    },
    finishHandoff:(ticket,browser,consent)=>packetPolicy(ledger.handoff(ticket,browser).packet,()=>operations.finishHandoff(ticket,browser,consent)),
    complete:(packet,browser)=>packetPolicy(packet,()=>operations.complete(packet,browser)),
   };
  },
 };
}
