import {assertPersonalInformation} from '../../packages/identity-protocol/personal-information.mjs';
import {measureRP} from './native-rp-timing.mjs';
import {assertCurrentSignerPolicy} from '../../packages/identity-protocol/signer-policy.mjs';
import {validateRequestedAssurance} from '../../packages/identity-protocol/assurance-policy.mjs';
import {DatabaseSync} from 'node:sqlite';
import {rpSlotBinding} from '../../packages/identity-protocol/rp-slot-storage.mjs';
import {randomBytes,createHash} from 'node:crypto';
import {canonical,decode64,reject} from '../../packages/identity-protocol/encoding.mjs';
import {validateTransaction} from '../../packages/identity-protocol/schema.mjs';
import {digest64} from '../../packages/identity-protocol/crypto.node.mjs';
import {verifyRPTransition} from '../../packages/identity-protocol/rp-verifier.node.mjs';
import {assertCurrentAlgorithmPolicy} from '../../packages/identity-protocol/algorithm-policy.mjs';

// RP1/RP2 local durable ledger, one database per RP. This is not Passli account
// storage. A caller must authenticate the browser cookie before passing its
// sessionBinding; neither it nor expected transactions come from completion JSON.
export function createNativeRPLedger({path,database,onTransition,beforeTransition,site,origin,provider,algorithmPolicies,assuranceFor,signerPolicyFor,requireThreeKeys=false,now=()=>Math.floor(Date.now()/1000),sessionLifetime=3600}){
  if(typeof path!=='string'||!path||typeof algorithmPolicies!=='function'||!Number.isSafeInteger(sessionLifetime)||sessionLifetime<1)throw Error('Durable RP configuration required.');
  const db=database||new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS native_challenges (id TEXT PRIMARY KEY, transaction_json TEXT NOT NULL, packet_digest TEXT, result_json TEXT);
    CREATE TABLE IF NOT EXISTS native_deleted_completions (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS native_deleted_bindings (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS native_cancelled_completions (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS native_bindings (id TEXT PRIMARY KEY, subject TEXT NOT NULL, local_id TEXT NOT NULL, active INTEGER NOT NULL, value_json TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS native_active_subject ON native_bindings(subject) WHERE active=1;
    CREATE UNIQUE INDEX IF NOT EXISTS native_active_local ON native_bindings(local_id) WHERE active=1;
    CREATE TABLE IF NOT EXISTS native_session_information (token_hash TEXT PRIMARY KEY, value_json TEXT NOT NULL, FOREIGN KEY(token_hash) REFERENCES native_sessions(token_hash) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS native_sessions (token_hash TEXT PRIMARY KEY, binding_id TEXT NOT NULL, generation TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS native_policy_tickets (subject TEXT NOT NULL, cloud_key TEXT NOT NULL, ticket TEXT NOT NULL, PRIMARY KEY(subject,cloud_key));
    CREATE TABLE IF NOT EXISTS native_visits (local_id TEXT PRIMARY KEY, count INTEGER NOT NULL, first_at INTEGER NOT NULL, last_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS native_handoffs (token_hash TEXT PRIMARY KEY, browser TEXT NOT NULL, expires INTEGER NOT NULL, value_json TEXT NOT NULL);
    INSERT OR IGNORE INTO native_visits
      SELECT json_extract(result_json,'$.binding.localAccountID'),count(*),
             min(json_extract(result_json,'$.committedAt')),max(json_extract(result_json,'$.committedAt'))
      FROM native_challenges WHERE result_json IS NOT NULL
        AND json_extract(result_json,'$.sessionToken') IS NOT NULL
      GROUP BY json_extract(result_json,'$.binding.localAccountID');
  `);
  // Explicitly authorized demo cutover: retire only two-key bindings. Preserve
  // their rows/visit history for review; no Passli identity or vault is touched.
  if(requireThreeKeys){db.exec(`BEGIN IMMEDIATE;
    UPDATE native_bindings SET active=0 WHERE active=1 AND (json_array_length(value_json,'$.keys')=2 OR json_extract(value_json,'$.algorithmPolicy.selectedAlgorithms') IS NULL);
    DELETE FROM native_sessions WHERE binding_id IN (SELECT id FROM native_bindings WHERE active=0);
    COMMIT;`);}
  // Convert only current registration descriptors. Signed challenges and
  // durable completion receipts retain their original bytes.
  atomic(()=>{
    for(const row of db.prepare('SELECT id,value_json FROM native_bindings').all()){
      const binding=JSON.parse(row.value_json),next=rpSlotBinding(binding);
      if(canonical(next)!==canonical(binding))db.prepare('UPDATE native_bindings SET value_json=? WHERE id=?').run(canonical(next),row.id);
    }
  });
  const getBinding=id=>{const row=db.prepare('SELECT value_json FROM native_bindings WHERE id=?').get(id);return row?JSON.parse(row.value_json):null;};
  function atomic(fn){measureRP('sqlBegin',()=>db.exec('BEGIN IMMEDIATE'));try{const result=measureRP('sqlWork',fn);measureRP('sqlCommit',()=>db.exec('COMMIT'));return result;}catch(error){db.exec('ROLLBACK');throw error;}}
  const tokenHash=token=>createHash('sha256').update(token).digest('hex');
  function validateChallenge(transaction,sessionBinding){
    const t=JSON.parse(canonical(validateTransaction(transaction)));
    if(requireThreeKeys&&(!t.context.signerPolicy||!t.context.algorithmPolicy.selectedAlgorithms))reject('IDENTITY_THREE_KEYS_REQUIRED');
    if(t.context.site!==site||t.context.origin!==origin||now()<t.issuedAt||now()>=t.expiresAt)reject('IDENTITY_CHALLENGE_INVALID');
    if(t.operation==='suspend'?sessionBinding!==null:sessionBinding!==t.context.sessionBinding)reject('IDENTITY_SESSION_MISMATCH');
    return t;
  }
  function insertChallenge(t){
    const old=db.prepare('SELECT transaction_json,result_json FROM native_challenges WHERE id=?').get(t.requestID);
    if(old){if(old.transaction_json!==canonical(t)||old.result_json!==null)reject('IDENTITY_CHALLENGE_CONFLICT');return t;}
    db.prepare('INSERT INTO native_challenges(id,transaction_json) VALUES(?,?)').run(t.requestID,canonical(t));return t;
  }
  return {
    close:()=>{if(!database)db.close();},
    setPolicyTicket(subject,ticket){decode64(subject,16);if(typeof ticket!=='string'||ticket.length>2048)reject();db.prepare('INSERT INTO native_policy_tickets VALUES(?,?,?) ON CONFLICT(subject,cloud_key) DO UPDATE SET ticket=excluded.ticket').run(subject,'2',ticket);},
    policyTicket(subject){return db.prepare('SELECT ticket FROM native_policy_tickets WHERE subject=? AND cloud_key=?').get(subject,'2')?.ticket;},
    createHandoff(sessionBinding,{requestedOperation='discover',requestPersonalInformation=false,userIdentifier=null,requestedLevel=1,requestedKeyCount=2,requestedAlgorithm=null,requestedAlgorithms=null,localSession=null}={}){
      if(!Number.isInteger(requestedLevel)||requestedLevel<1||requestedLevel>4)reject('IDENTITY_POLICY_INVALID');
      if(!['discover','link','unlink','rekey'].includes(requestedOperation)||requestedOperation==='discover'&&userIdentifier!==null)reject();if(userIdentifier!==null)decode64(userIdentifier,16);
      decode64(sessionBinding,32);const ticket=randomBytes(32).toString('base64url'),expires=now()+600;
      atomic(()=>{
        db.prepare('DELETE FROM native_handoffs WHERE expires<=?').run(now());
        db.prepare('DELETE FROM native_sessions WHERE expires<=?').run(now());
        // Terminal handoffs need no new approval capacity. Their durable RP
        // receipts remain available to a phone reconciling a lost acknowledgment.
        // A new deliberate sign-in replaces this browser's unfinished handoff.
        // Revoke its unused challenge as well: hiding an old QR must not leave
        // a previously signed packet usable through the direct completion API.
        for(const previous of db.prepare('SELECT token_hash,value_json FROM native_handoffs WHERE browser=?').all(sessionBinding)){
          const value=JSON.parse(previous.value_json);
          if(['complete','cancelled'].includes(value.stage))continue;
          if(value.transaction){db.prepare('INSERT OR IGNORE INTO native_cancelled_completions VALUES(?)').run(value.transaction.requestID);db.prepare('DELETE FROM native_challenges WHERE id=? AND result_json IS NULL').run(value.transaction.requestID);}
          db.prepare('UPDATE native_handoffs SET value_json=? WHERE token_hash=?').run(canonical({...value,stage:'cancelled',transaction:null,packet:null,disclosure:null}),previous.token_hash);
        }
        if(db.prepare('SELECT count(*) AS total FROM native_handoffs WHERE json_extract(value_json,\'$.stage\') NOT IN (\'complete\',\'cancelled\')').get().total>=1000)reject('IDENTITY_SERVICE_BUSY');
        db.prepare('INSERT INTO native_handoffs VALUES(?,?,?,?)').run(tokenHash(ticket),sessionBinding,expires,canonical({stage:'waiting',transaction:null,packet:null,requestedOperation,requestPersonalInformation,userIdentifier,requestedLevel,requestedKeyCount,requestedAlgorithm,requestedAlgorithms,localSession}));
      });return {ticket,expires};
    },
    handoff(ticket,sessionBinding){
      decode64(ticket,32);const row=db.prepare('SELECT * FROM native_handoffs WHERE token_hash=?').get(tokenHash(ticket));
      if(!row||now()>=row.expires)reject('IDENTITY_HANDOFF_EXPIRED');
      if(sessionBinding!==undefined&&row.browser!==sessionBinding)reject('IDENTITY_SESSION_MISMATCH');
      return {...JSON.parse(row.value_json),sessionBinding:row.browser,expires:row.expires};
    },
    updateHandoff(ticket,expectedStage,value){
      return atomic(()=>{const prior=this.handoff(ticket);if(prior.stage!==expectedStage)reject('IDENTITY_HANDOFF_CHANGED');const {sessionBinding,expires,...state}=prior;
        if(value.stage==='cancelled'&&prior.transaction){db.prepare('INSERT OR IGNORE INTO native_cancelled_completions VALUES(?)').run(prior.transaction.requestID);db.prepare('DELETE FROM native_challenges WHERE id=? AND result_json IS NULL').run(prior.transaction.requestID);}
        db.prepare('UPDATE native_handoffs SET value_json=? WHERE token_hash=?').run(canonical({...state,...value,requestPersonalInformation:prior.requestPersonalInformation===true,requestedOperation:prior.requestedOperation,userIdentifier:prior.userIdentifier,requestedLevel:prior.requestedLevel??1,requestedKeyCount:prior.requestedKeyCount??2,requestedAlgorithm:prior.requestedAlgorithm??null,requestedAlgorithms:prior.requestedAlgorithms??null,localSession:prior.localSession??null}),tokenHash(ticket));return this.handoff(ticket);});
    },
    binding:getBinding,
    bindingForSubject(subject){decode64(subject,16);const row=db.prepare('SELECT value_json FROM native_bindings WHERE subject=? AND active=1').get(subject);return row?JSON.parse(row.value_json):null;},
    completion(requestID){
      if(db.prepare('SELECT id FROM native_cancelled_completions WHERE id=?').get(requestID))reject('IDENTITY_RP_REQUEST_CANCELLED');
      if(db.prepare('SELECT id FROM native_deleted_completions WHERE id=?').get(requestID))reject('IDENTITY_RP_ACCOUNT_DELETED');
      decode64(requestID,16);const row=db.prepare('SELECT transaction_json,result_json FROM native_challenges WHERE id=?').get(requestID);
      if(!row?.result_json)return null;
      const result=JSON.parse(row.result_json),transaction=JSON.parse(row.transaction_json),binding=getBinding(result.binding.bindingID);
      if(canonical(binding)!==canonical(result.binding))reject('IDENTITY_RECEIPT_SUPERSEDED');
      return {transactionDigest:digest64(transaction),binding:result.binding,committedAt:result.committedAt};
    },
    prepare(transaction,sessionBinding){
      const t=validateChallenge(transaction,sessionBinding);
      return atomic(()=>insertChallenge(t));
    },
    verifyPending(packet,sessionBinding){
      const id=packet?.response?.transaction?.requestID;decode64(id,16);
      const row=db.prepare('SELECT transaction_json FROM native_challenges WHERE id=?').get(id);if(!row)reject('IDENTITY_CHALLENGE_INVALID');
      const expected=JSON.parse(row.transaction_json);if(requireThreeKeys&&(!expected.context.signerPolicy||!expected.context.algorithmPolicy.selectedAlgorithms))reject('IDENTITY_THREE_KEYS_REQUIRED');if(expected.context.sessionBinding!==sessionBinding)reject('IDENTITY_SESSION_MISMATCH');
      if(assuranceFor&&expected.operation!=='suspend')validateRequestedAssurance(assuranceFor(expected.operation,expected.context.userIdentifier),expected.assurance);
      if(expected.context.signerPolicy)assertCurrentSignerPolicy(expected.context.signerPolicy,expected.operation,signerPolicyFor(expected.context.userIdentifier));
      verifyRPTransition(packet,{expected,binding:getBinding(expected.context.bindingID),site,origin,provider,algorithmPolicies:algorithmPolicies(expected.context.userIdentifier),now:now()});
      return true;
    },
    complete(packet,sessionBinding,disclosure,{prepareLogin=false}={}){
      const input=JSON.parse(canonical(packet)),id=input.response?.transaction?.requestID;decode64(id,16);
      // The HTTP fast path authenticates the RP-sealed challenge first. Keep its
      // insertion, proof verification, single-use receipt and session in ONE
      // durable transaction; a rejected proof leaves no pending challenge row.
      const fast=prepareLogin?validateChallenge(input.response.transaction,sessionBinding):null;
      if(fast&&fast.operation!=='login')reject('IDENTITY_OPERATION_UNSUPPORTED');
      return atomic(()=>{
        if(fast)measureRP('prepare',()=>insertChallenge(fast));
        const challenge=db.prepare('SELECT * FROM native_challenges WHERE id=?').get(id);if(!challenge)reject('IDENTITY_CHALLENGE_INVALID');
        const expected=JSON.parse(challenge.transaction_json),c=expected.context,time=now();if(challenge.result_json===null||disclosure!=null)assertPersonalInformation(expected,disclosure,digest64);
        if(requireThreeKeys&&(!c.signerPolicy||!c.algorithmPolicy.selectedAlgorithms))reject('IDENTITY_THREE_KEYS_REQUIRED');
        if(time<expected.issuedAt||time>=expected.expiresAt)reject('IDENTITY_EXPIRED');
        if(expected.operation==='suspend'?sessionBinding!==null:sessionBinding!==c.sessionBinding)reject('IDENTITY_SESSION_MISMATCH');
        if(assuranceFor&&expected.operation!=='suspend')validateRequestedAssurance(assuranceFor(expected.operation,c.userIdentifier),expected.assurance);
        if(c.signerPolicy)assertCurrentSignerPolicy(c.signerPolicy,expected.operation,signerPolicyFor(c.userIdentifier));
        const policies=algorithmPolicies(c.userIdentifier);if(policies?.then)throw Error('RP policy snapshot must be synchronous inside the transaction.');
        if(!['suspend','unlink'].includes(expected.operation))assertCurrentAlgorithmPolicy(c.algorithmPolicy,policies);
        const binding=getBinding(c.bindingID),inputDigest=digest64(input);
        if(challenge.result_json!==null){
          if(challenge.packet_digest!==inputDigest)reject('IDENTITY_REQUEST_CONFLICT');
          const result=JSON.parse(challenge.result_json);
          if(!binding||canonical(binding)!==canonical(result.binding))reject('IDENTITY_RECEIPT_SUPERSEDED');
          // Historical result does not mint another session or restore a logout.
          if(result.sessionToken&&!this.session(result.sessionToken))reject('IDENTITY_RECEIPT_SUPERSEDED');
          return result;
        }
        if(expected.operation==='create_account'&&this.bindingForSubject(c.userIdentifier))reject('IDENTITY_SITE_ID_TAKEN');
        const transition=measureRP('verify',()=>verifyRPTransition(input,{expected,binding,site,origin,provider,algorithmPolicies:policies,now:time})),next=transition.binding;
        if(beforeTransition){const value=beforeTransition({transaction:expected});if(value?.then)throw Error('RP validation hook must be synchronous.');}
        db.prepare('INSERT INTO native_bindings(id,subject,local_id,active,value_json) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET active=excluded.active,value_json=excluded.value_json').run(next.bindingID,next.userIdentifier,next.localAccountID,next.state==='unlinked'?0:1,canonical(next));
        if(binding&&binding.sessionGeneration!==next.sessionGeneration)db.prepare('DELETE FROM native_sessions WHERE binding_id=?').run(next.bindingID);
        let sessionToken=null;
        if(transition.establishSession){sessionToken=randomBytes(32).toString('base64url');db.prepare('INSERT INTO native_sessions VALUES(?,?,?,?)').run(tokenHash(sessionToken),next.bindingID,next.sessionGeneration,time+sessionLifetime);
          if(disclosure)db.prepare('INSERT INTO native_session_information VALUES(?,?)').run(tokenHash(sessionToken),canonical(disclosure.values));
          db.prepare('INSERT INTO native_visits VALUES(?,1,?,?) ON CONFLICT(local_id) DO UPDATE SET count=count+1,last_at=excluded.last_at').run(next.localAccountID,time,time);
        }
        const result={binding:next,sessionToken,committedAt:time};
        // Integrators may commit their local account/link/session change in this
        // same SQLite transaction. Throwing rolls back the proof and all writes.
        if(onTransition){const value=onTransition({transaction:expected,result});if(value?.then)throw Error('RP transition hook must be synchronous.');}
        db.prepare('UPDATE native_challenges SET packet_digest=?,result_json=? WHERE id=?').run(inputDigest,canonical(result),id);
        return result;
      });
    },
    session(token){
      decode64(token,32);const row=db.prepare('SELECT * FROM native_sessions WHERE token_hash=?').get(tokenHash(token));
      if(!row)return null;
      if(now()>=row.expires){db.prepare('DELETE FROM native_sessions WHERE token_hash=?').run(tokenHash(token));return null;}
      const binding=getBinding(row.binding_id);if(!binding||binding.state!=='active'||binding.sessionGeneration!==row.generation)return null;
      const visits=db.prepare('SELECT count,first_at,last_at FROM native_visits WHERE local_id=?').get(binding.localAccountID);
      const information=db.prepare('SELECT value_json FROM native_session_information WHERE token_hash=?').get(tokenHash(token));
      return {...(information?{personalInformation:JSON.parse(information.value_json)}:{}),userIdentifier:binding.userIdentifier,localAccountID:binding.localAccountID,bindingID:binding.bindingID,registeredKeys:binding.keys.map(({role,algorithm,publicKey})=>({role,algorithm,publicKey})),keysetVersion:binding.keysetVersion,visitCount:visits?.count??0,firstVisitAt:visits?.first_at??null,lastVisitAt:visits?.last_at??null};
    },
    logout(token){decode64(token,32);db.prepare('DELETE FROM native_sessions WHERE token_hash=?').run(tokenHash(token));},
    deletion(bindingID,{includeRegistration=false}={}){decode64(bindingID,16);return {deleted:!!db.prepare('SELECT id FROM native_deleted_bindings WHERE id=?').get(bindingID),...(includeRegistration?{registered:!!db.prepare('SELECT id FROM native_bindings WHERE id=? AND active=1').get(bindingID)}:{})};},
    deleteAccount(token){
      return atomic(()=>{
        const session=this.session(token);if(!session)reject('IDENTITY_LOCAL_SESSION_REQUIRED');
        const ids=db.prepare('SELECT id FROM native_bindings WHERE local_id=?').all(session.localAccountID).map(row=>row.id);
        for(const id of ids){
          db.prepare('INSERT OR IGNORE INTO native_deleted_bindings VALUES(?)').run(id);
          db.prepare('DELETE FROM native_sessions WHERE binding_id=?').run(id);
          db.prepare("INSERT OR IGNORE INTO native_deleted_completions SELECT id FROM native_challenges WHERE json_extract(transaction_json,'$.context.bindingID')=?").run(id);
          db.prepare("DELETE FROM native_challenges WHERE json_extract(transaction_json,'$.context.bindingID')=?").run(id);
        }
        db.prepare("DELETE FROM native_handoffs WHERE json_extract(value_json,'$.transaction.context.localAccountID')=? OR json_extract(value_json,'$.transaction.context.userIdentifier')=?").run(session.localAccountID,session.userIdentifier);
        db.prepare('DELETE FROM native_bindings WHERE local_id=?').run(session.localAccountID);
        db.prepare('DELETE FROM native_visits WHERE local_id=?').run(session.localAccountID);
        db.prepare('DELETE FROM native_policy_tickets WHERE subject=?').run(session.userIdentifier);
        return {deleted:true};
      });
    },
  };
}
