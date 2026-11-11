import {validateRequestedAssurance} from '../../packages/identity-protocol/assurance-policy.mjs';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
import {canonical,decode64,reject} from '../../packages/identity-protocol/encoding.mjs';
import {validateTransaction} from '../../packages/identity-protocol/schema.mjs';
import {digest64} from '../../packages/identity-protocol/crypto.node.mjs';
import {verifyRPTransition} from '../../packages/identity-protocol/rp-verifier.node.mjs';
import {assertCurrentAlgorithmPolicy} from '../../packages/identity-protocol/algorithm-policy.mjs';

// RP1/RP2 local durable ledger, one database per RP. This is not Passli account
// storage. A caller must authenticate the browser cookie before passing its
// sessionBinding; neither it nor expected transactions come from completion JSON.
export function createNativeRPLedger({path,database,onTransition,beforeTransition,site,origin,provider,algorithmPolicies,assuranceFor,now=()=>Math.floor(Date.now()/1000),sessionLifetime=3600}){
  if(typeof path!=='string'||!path||typeof algorithmPolicies!=='function'||!Number.isSafeInteger(sessionLifetime)||sessionLifetime<1)throw Error('Durable RP configuration required.');
  const db=database||new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS native_challenges (id TEXT PRIMARY KEY, transaction_json TEXT NOT NULL, packet_digest TEXT, result_json TEXT);
    CREATE TABLE IF NOT EXISTS native_bindings (id TEXT PRIMARY KEY, subject TEXT NOT NULL, local_id TEXT NOT NULL, active INTEGER NOT NULL, value_json TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS native_active_subject ON native_bindings(subject) WHERE active=1;
    CREATE UNIQUE INDEX IF NOT EXISTS native_active_local ON native_bindings(local_id) WHERE active=1;
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
  const getBinding=id=>{const row=db.prepare('SELECT value_json FROM native_bindings WHERE id=?').get(id);return row?JSON.parse(row.value_json):null;};
  function atomic(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
  const tokenHash=token=>createHash('sha256').update(token).digest('hex');
  return {
    close:()=>{if(!database)db.close();},
    setPolicyTicket(subject,keyID,ticket){decode64(subject,16);decode64(keyID,32);if(typeof ticket!=='string'||ticket.length>2048)reject();db.prepare('INSERT INTO native_policy_tickets VALUES(?,?,?) ON CONFLICT(subject,cloud_key) DO UPDATE SET ticket=excluded.ticket').run(subject,keyID,ticket);},
    policyTicket(subject,keyID){return db.prepare('SELECT ticket FROM native_policy_tickets WHERE subject=? AND cloud_key=?').get(subject,keyID)?.ticket;},
    createHandoff(sessionBinding,{requestedOperation='discover',userIdentifier=null,requestedLevel=1,requestedAlgorithm=null,localSession=null}={}){
      if(!Number.isInteger(requestedLevel)||requestedLevel<1||requestedLevel>4)reject('IDENTITY_POLICY_INVALID');
      if(!['discover','link','unlink','rekey'].includes(requestedOperation)||requestedOperation==='discover'&&userIdentifier!==null)reject();if(userIdentifier!==null)decode64(userIdentifier,16);
      decode64(sessionBinding,32);const ticket=randomBytes(32).toString('base64url'),expires=now()+600;
      atomic(()=>{
        db.prepare('DELETE FROM native_handoffs WHERE expires<=?').run(now());
        // Terminal handoffs need no new approval capacity. Their durable RP
        // receipts remain available to a phone reconciling a lost acknowledgment.
        db.prepare("DELETE FROM native_handoffs WHERE browser=? AND json_extract(value_json,'$.stage') IN ('complete','cancelled')").run(sessionBinding);
        if(db.prepare('SELECT count(*) AS total FROM native_handoffs WHERE browser=?').get(sessionBinding).total>=4||db.prepare('SELECT count(*) AS total FROM native_handoffs').get().total>=1000)reject('IDENTITY_PENDING_LIMIT');
        db.prepare('INSERT INTO native_handoffs VALUES(?,?,?,?)').run(tokenHash(ticket),sessionBinding,expires,canonical({stage:'waiting',transaction:null,packet:null,requestedOperation,userIdentifier,requestedLevel,requestedAlgorithm,localSession}));
      });return {ticket,expires};
    },
    handoff(ticket,sessionBinding){
      decode64(ticket,32);const row=db.prepare('SELECT * FROM native_handoffs WHERE token_hash=?').get(tokenHash(ticket));
      if(!row||now()>=row.expires)reject('IDENTITY_HANDOFF_EXPIRED');
      if(sessionBinding!==undefined&&row.browser!==sessionBinding)reject('IDENTITY_SESSION_MISMATCH');
      return {...JSON.parse(row.value_json),sessionBinding:row.browser,expires:row.expires};
    },
    updateHandoff(ticket,expectedStage,value){
      return atomic(()=>{const prior=this.handoff(ticket);if(prior.stage!==expectedStage)reject('IDENTITY_HANDOFF_CHANGED');
        db.prepare('UPDATE native_handoffs SET value_json=? WHERE token_hash=?').run(canonical({...value,requestedOperation:prior.requestedOperation,userIdentifier:prior.userIdentifier,requestedLevel:prior.requestedLevel??1,requestedAlgorithm:prior.requestedAlgorithm??null,localSession:prior.localSession??null}),tokenHash(ticket));return this.handoff(ticket);});
    },
    binding:getBinding,
    bindingForSubject(subject){decode64(subject,16);const row=db.prepare('SELECT value_json FROM native_bindings WHERE subject=? AND active=1').get(subject);return row?JSON.parse(row.value_json):null;},
    completion(requestID){
      decode64(requestID,16);const row=db.prepare('SELECT transaction_json,result_json FROM native_challenges WHERE id=?').get(requestID);
      if(!row?.result_json)return null;
      const result=JSON.parse(row.result_json),transaction=JSON.parse(row.transaction_json),binding=getBinding(result.binding.bindingID);
      if(canonical(binding)!==canonical(result.binding))reject('IDENTITY_RECEIPT_SUPERSEDED');
      return {transactionDigest:digest64(transaction),binding:result.binding,committedAt:result.committedAt};
    },
    prepare(transaction,sessionBinding){
      const t=JSON.parse(canonical(validateTransaction(transaction)));
      if(t.context.site!==site||t.context.origin!==origin||now()<t.issuedAt||now()>=t.expiresAt)reject('IDENTITY_CHALLENGE_INVALID');
      if(t.operation==='suspend'?sessionBinding!==null:sessionBinding!==t.context.sessionBinding)reject('IDENTITY_SESSION_MISMATCH');
      return atomic(()=>{
        const old=db.prepare('SELECT transaction_json,result_json FROM native_challenges WHERE id=?').get(t.requestID);
        if(old){if(old.transaction_json!==canonical(t)||old.result_json!==null)reject('IDENTITY_CHALLENGE_CONFLICT');return t;}
        db.prepare('INSERT INTO native_challenges(id,transaction_json) VALUES(?,?)').run(t.requestID,canonical(t));return t;
      });
    },
    verifyPending(packet,sessionBinding){
      const id=packet?.response?.transaction?.requestID;decode64(id,16);
      const row=db.prepare('SELECT transaction_json FROM native_challenges WHERE id=?').get(id);if(!row)reject('IDENTITY_CHALLENGE_INVALID');
      const expected=JSON.parse(row.transaction_json);if(expected.context.sessionBinding!==sessionBinding)reject('IDENTITY_SESSION_MISMATCH');
      if(assuranceFor&&expected.operation!=='suspend')validateRequestedAssurance(assuranceFor(expected.operation,expected.context.userIdentifier),expected.assurance);
      verifyRPTransition(packet,{expected,binding:getBinding(expected.context.bindingID),site,origin,provider,algorithmPolicies:algorithmPolicies(expected.context.userIdentifier),now:now()});
      return true;
    },
    complete(packet,sessionBinding){
      const input=JSON.parse(canonical(packet)),id=input.response?.transaction?.requestID;decode64(id,16);
      return atomic(()=>{
        const challenge=db.prepare('SELECT * FROM native_challenges WHERE id=?').get(id);if(!challenge)reject('IDENTITY_CHALLENGE_INVALID');
        const expected=JSON.parse(challenge.transaction_json),c=expected.context,time=now();
        if(time<expected.issuedAt||time>=expected.expiresAt)reject('IDENTITY_EXPIRED');
        if(expected.operation==='suspend'?sessionBinding!==null:sessionBinding!==c.sessionBinding)reject('IDENTITY_SESSION_MISMATCH');
        if(assuranceFor&&expected.operation!=='suspend')validateRequestedAssurance(assuranceFor(expected.operation,c.userIdentifier),expected.assurance);
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
        const transition=verifyRPTransition(input,{expected,binding,site,origin,provider,algorithmPolicies:policies,now:time}),next=transition.binding;
        if(beforeTransition){const value=beforeTransition({transaction:expected});if(value?.then)throw Error('RP validation hook must be synchronous.');}
        db.prepare('INSERT INTO native_bindings(id,subject,local_id,active,value_json) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET active=excluded.active,value_json=excluded.value_json').run(next.bindingID,next.userIdentifier,next.localAccountID,next.state==='unlinked'?0:1,canonical(next));
        if(binding&&binding.sessionGeneration!==next.sessionGeneration)db.prepare('DELETE FROM native_sessions WHERE binding_id=?').run(next.bindingID);
        let sessionToken=null;
        if(transition.establishSession){sessionToken=randomBytes(32).toString('base64url');db.prepare('INSERT INTO native_sessions VALUES(?,?,?,?)').run(tokenHash(sessionToken),next.bindingID,next.sessionGeneration,time+sessionLifetime);
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
      if(!row||now()>=row.expires)return null;
      const binding=getBinding(row.binding_id);if(!binding||binding.state!=='active'||binding.sessionGeneration!==row.generation)return null;
      const visits=db.prepare('SELECT count,first_at,last_at FROM native_visits WHERE local_id=?').get(binding.localAccountID);
      return {userIdentifier:binding.userIdentifier,localAccountID:binding.localAccountID,bindingID:binding.bindingID,visitCount:visits?.count??0,firstVisitAt:visits?.first_at??null,lastVisitAt:visits?.last_at??null};
    },
    logout(token){decode64(token,32);db.prepare('DELETE FROM native_sessions WHERE token_hash=?').run(tokenHash(token));},
  };
}
