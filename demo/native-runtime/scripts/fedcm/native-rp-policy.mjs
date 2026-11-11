import {AsyncLocalStorage} from 'node:async_hooks';
import {randomBytes} from 'node:crypto';
import {canonical,fields,parseWire,reject,site} from '../../packages/identity-protocol/encoding.mjs';
import {validateAlgorithmPolicies} from '../../packages/identity-protocol/algorithm-policy.mjs';
import {validateAssurance} from '../../packages/identity-protocol/schema.mjs';

// Fetch outside SQLite's transaction, then hold a request-local immutable policy
// snapshot during its synchronous verification/commit. No cross-user cache.
export function createNativeRPPolicy({origin,providerOrigin,rpPolicy,rpAssuranceFor,fetch:request=fetch}){
 site(origin);site(providerOrigin);if(typeof rpAssuranceFor!=='function')throw Error('RP minimum assurance required.');
 const state=new AsyncLocalStorage();
 const current=subject=>{const value=state.getStore();if(!value||value.userIdentifier!==subject)reject('IDENTITY_POLICY_UNAVAILABLE');return value;};
 async function load(ticket,userIdentifier,cloudKeyID){
  if(typeof ticket!=='string'||ticket.length>2048)reject('IDENTITY_POLICY_TICKET_INVALID');
  const response=await request(providerOrigin+'/api/identity/rp-policy',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({ticket,site:origin,userIdentifier,cloudKeyID,requestID:randomBytes(16).toString('base64url')}),signal:AbortSignal.timeout(5000)});
  if(!response.ok||!response.body)reject('IDENTITY_POLICY_UNAVAILABLE');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768)reject('IDENTITY_POLICY_INVALID');chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const value=parseWire(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  fields(value,['site','userIdentifier','cloudKeyID','policies','assurance']);
  if(value.site!==origin||value.userIdentifier!==userIdentifier||value.cloudKeyID!==cloudKeyID)reject('IDENTITY_POLICY_INVALID');
  validateAlgorithmPolicies(value.policies);if(canonical(value.policies.rp)!==canonical(rpPolicy))reject('IDENTITY_POLICY_CHANGED');
  fields(value.assurance,['login','create_account','link','unlink','rekey','resume']);
  for(const [operation,assurance]of Object.entries(value.assurance)){validateAssurance(assurance);const minimum=rpAssuranceFor(operation);validateAssurance(minimum);if(assurance.requiredLevel<minimum.requiredLevel||minimum.factors.some(f=>!assurance.factors.includes(f)))reject('IDENTITY_POLICY_INVALID');}
  return value;
 }
 return {
  algorithmPolicies:subject=>current(subject).policies,
  assuranceFor:(operation,subject)=>current(subject).assurance[operation],
  bind(ledger,operations){
   async function withPolicy(subject,keyID,ticket,run){const snapshot=await load(ticket,subject,keyID);return state.run(snapshot,run);}
   async function packetPolicy(packet,run){
    const t=packet?.response?.transaction,proofs=packet?.response?.signatures?.filter(p=>p.role==='cloud');
    if(!t||proofs?.length!==1)reject('IDENTITY_SIGNATURE_INVALID');
    // A completed rekey receipt was signed by the old cloud key. Keep its scope
    // for receipt replay; the ledger still verifies the exact pinned transition.
    const subject=t.context.userIdentifier,keyID=proofs[0].keyID;
    return withPolicy(subject,keyID,ledger.policyTicket(subject,keyID),run);
   }
   return {...operations,
    async proposeHandoff(ticket,input){
     fields(input,['userIdentifier','pub1','pub2','policyTicket']);const binding=ledger.bindingForSubject(input.userIdentifier),key=binding?.keys[1]||input.pub2;
     return withPolicy(input.userIdentifier,key.keyID,input.policyTicket,()=>{ledger.setPolicyTicket(input.userIdentifier,key.keyID,input.policyTicket);const {policyTicket,...proposal}=input;return operations.proposeHandoff(ticket,proposal);});
    },
    async prepare(input,browser,session){const {policyTicket,...proposal}=input,key=ledger.bindingForSubject(input.userIdentifier)?.keys[1]||input.pub2;return withPolicy(input.userIdentifier,key?.keyID,policyTicket,()=>{ledger.setPolicyTicket(input.userIdentifier,key.keyID,policyTicket);return operations.prepare(proposal,browser,session);});},
    submitHandoff:(ticket,packet)=>packetPolicy(packet,()=>operations.submitHandoff(ticket,packet)),
    finishHandoff:(ticket,browser)=>packetPolicy(ledger.handoff(ticket,browser).packet,()=>operations.finishHandoff(ticket,browser)),
    complete:(packet,browser)=>packetPolicy(packet,()=>operations.complete(packet,browser)),
   };
  },
 };
}
