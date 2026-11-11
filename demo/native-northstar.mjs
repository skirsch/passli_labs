import {randomBytes} from 'node:crypto';
import {createNativeRPLedger} from './native-runtime/scripts/fedcm/native-rp-ledger.mjs';
import {createNativeRPOperations} from './native-runtime/scripts/fedcm/native-rp-operations.mjs';
import {createNativeRPHttp} from './native-runtime/scripts/fedcm/native-rp-http.mjs';
import {createNativeRPPolicy} from './native-runtime/scripts/fedcm/native-rp-policy.mjs';
import {nativeNorthstarPage} from './native-northstar-page.mjs';

// The account store and cryptographic ledger share a SQLite transaction. Neither
// a provider assertion nor a browser-supplied account ID can establish a link.
export function createNativeNorthstar({db,origin,config,version,now=Date.now}){
 const random=()=>randomBytes(32).toString('base64url'),cookieName='__Host-northstar-native',lifetime=30*60000;
 const fail=()=>{throw Object.assign(Error('Northstar account or approval changed. Start again.'),{code:'IDENTITY_LOCAL_SESSION_REQUIRED'});};
 db.exec('CREATE TABLE IF NOT EXISTS ns_accounts(id TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS ns_browsers(id TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS ns_contexts(id TEXT PRIMARY KEY,browser TEXT NOT NULL);');
 const read=(table,id)=>{const row=db.prepare('SELECT value FROM '+table+' WHERE id=?').get(id);return row?JSON.parse(row.value):null;};
 const write=(table,id,value)=>db.prepare('INSERT INTO '+table+' VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(id,JSON.stringify(value));
 const account=id=>{const a=read('ns_accounts',id);return a&&a.expires>now()?a:null;};
 const browser=req=>{const values=String(req.headers.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(cookieName+'='));return values.length===1?values[0].slice(cookieName.length+1):null;};
 const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 const policy=config.policyProvider?createNativeRPPolicy({origin,...config.policyProvider}):null;
 const settings=policy?{...config,algorithmPolicies:policy.algorithmPolicies,assuranceFor:policy.assuranceFor}:config;
 let operations;
 const ledger=createNativeRPLedger({...settings,path:config.path||':memory:',database:db,site:origin,origin,now:()=>Math.floor(now()/1000),beforeTransition({transaction:t}){
  if(['link','unlink'].includes(t.operation)){const id=db.prepare('SELECT browser FROM ns_contexts WHERE id=?').get(t.context.sessionBinding)?.browser,w=id&&read('ns_browsers',id);if(!validSession(w)||w.session.id!==w.pending?.sessionID)fail();}
 },onTransition({transaction:t,result}){
  const c=t.context,id=db.prepare('SELECT browser FROM ns_contexts WHERE id=?').get(c.sessionBinding)?.browser,w=id&&read('ns_browsers',id),p=w?.pending;
  if(!p||p.expires<=now()||ledger.handoff(p.ticket,c.sessionBinding).transaction?.requestID!==t.requestID)fail();
  if(p.operation==='discover'?!['login','create_account'].includes(t.operation):p.operation!==t.operation)fail();
  let a=account(c.localAccountID);
  if(['link','unlink'].includes(t.operation)){
   if(!a||!w.session||w.session.id!==p.sessionID||w.session.accountID!==c.localAccountID)fail();
  }
  if(t.operation==='create_account'){
   if(a)fail();a={id:c.localAccountID,name:'Passli member',email:null,notes:'',subject:null,created:now(),expires:now()+lifetime};
  }else if(!a)fail();
  if(['create_account','link'].includes(t.operation)){if(a.subject)fail();a.subject=c.userIdentifier;a.bindingID=c.bindingID;}
  else if(a.subject!==c.userIdentifier||a.bindingID!==c.bindingID)fail();
  if(t.operation==='unlink'){
   a.subject=null;a.bindingID=null;
   // The ledger has invalidated every session under this binding. Keep ordinary
   // Northstar password access and account data; never revoke another account.
   if(w.session.method==='passli')w.session=null;
  }else if(result.sessionToken){w.session={id:random(),accountID:a.id,method:'passli',token:result.sessionToken};}
  w.pending=null;write('ns_accounts',a.id,a);write('ns_browsers',id,w);
 }});
 function validSession(w){const a=w?.session&&account(w.session.accountID);if(!a)return null;if(w.session.method==='passli'){const s=ledger.session(w.session.token);if(!s||s.localAccountID!==a.id||s.userIdentifier!==a.subject)return null;}return a;}
 function localLink(s){const w=s&&read('ns_browsers',s.browser),a=validSession(w);if(!a||w.session.id!==s.sessionID||a.id!==s.localAccountID||a.subject)fail();return a.id;}
 const base=createNativeRPOperations({...settings,ledger,origin,now:()=>Math.floor(now()/1000),authorizeLocalLink:localLink});
 operations=policy?policy.bind(ledger,base):base;
 const start=operations.startHandoff;
 operations={...operations,startHandoff(binding,input,s){
  const w=s&&read('ns_browsers',s.browser),operation=input.operation||'discover';if(!w||w.pending)fail();
  if(operation==='discover'){if(validSession(w))fail();}
  else if(!['link','unlink'].includes(operation)||!validSession(w))fail();
  const result=start(binding,operation==='unlink'?{...input,requestedLevel:4}:input,s);w.pending={ticket:result.ticket,operation,expires:result.expires*1000,sessionID:w.session?.id||null};write('ns_browsers',s.browser,w);return result;
 }};
 const http=createNativeRPHttp({origin,cookieKey:config.cookieKey,operations,localSessionFor(req,binding){
  const id=browser(req),w=id&&read('ns_browsers',id);if(!w)fail();const a=validSession(w);
  db.prepare('INSERT INTO ns_contexts VALUES(?,?) ON CONFLICT(id) DO UPDATE SET browser=excluded.browser').run(binding,id);
  return {browser:id,sessionID:w.session?.id||null,localAccountID:a?.id||null,userIdentifier:a?.subject||null};
 }});
 function state(w){const a=validSession(w);return {csrf:w.csrf,account:a?{id:a.id,name:a.name,notes:a.notes,linked:!!a.subject,expires:a.expires}:null,pending:!!w.pending,ticket:w.pending?.ticket||null,protocol:'passli:identity-operations:v1'};}
 function expireAccounts(){
  const expired=db.prepare('SELECT id,value FROM ns_accounts').all().filter(r=>JSON.parse(r.value).expires<=now());
  if(!expired.length)return;
  db.exec('BEGIN IMMEDIATE');try{for(const a of expired){
   for(const row of db.prepare('SELECT id,value_json FROM native_bindings WHERE local_id=? AND active=1').all(a.id)){
    const b=JSON.parse(row.value_json);b.state='unlinked';b.keys=[];b.sessionGeneration=String(BigInt(b.sessionGeneration)+1n);
    db.prepare('UPDATE native_bindings SET active=0,value_json=? WHERE id=?').run(JSON.stringify(b),row.id);db.prepare('DELETE FROM native_sessions WHERE binding_id=?').run(row.id);
   }
   db.prepare('DELETE FROM ns_accounts WHERE id=?').run(a.id);
  }db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 }
 return {close:()=>{http.close();ledger.close();},async handle(req,res,path){
  expireAccounts();
  if(path==='/health'){json(res,200,{version,mode:'real',identityProtocol:'passli:identity-operations:v1'});return true;}
  if(path==='/northstar/'||path==='/northstar'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(nativeNorthstarPage(version));return true;}
  if(path.startsWith('/api/identity/'))return http.handle(req,res);
  if(!path.startsWith('/api/northstar/')){
   // The old Northstar API/callback cannot issue sessions after native cutover.
   if(['/api/state','/api/private','/api/action','/auth/passli/callback','/auth/passli/pii-return'].includes(path)){json(res,410,{error:'Northstar uses native two-key login. Open /northstar/.'});return true;}return false;
  }
  try{
   let id=browser(req),w=id&&read('ns_browsers',id);
   if(!w){id=random();w={csrf:random(),session:null,pending:null};write('ns_browsers',id,w);res.setHeader('Set-Cookie',`${cookieName}=${id}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=1800`);}
   if(req.method==='GET'&&path==='/api/northstar/state'){json(res,200,state(w));return true;}
   if(req.method!=='POST'||path!=='/api/northstar/action'||req.headers.origin!==origin||req.headers['x-demo-csrf']!==w.csrf||!String(req.headers['content-type']).startsWith('application/json'))fail();
   let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>8192)fail();}const body=JSON.parse(text);
   w=read('ns_browsers',id);if(!w||req.headers['x-demo-csrf']!==w.csrf)fail();const a=validSession(w);
   if(body.action==='password-login'){
    if(w.pending||body.password!=='demo'||typeof body.email!=='string'||body.email.length>254||!/^\S+@\S+\.\S+$/.test(body.email))fail();
    const email=body.email.trim().toLowerCase();let target=db.prepare('SELECT value FROM ns_accounts').all().map(r=>JSON.parse(r.value)).find(a=>a.email===email&&a.expires>now());
    if(!target){target={id:random(),name:email,email,notes:'',subject:null,created:now(),expires:now()+lifetime};write('ns_accounts',target.id,target);}
    w.session={id:random(),accountID:target.id,method:'password'};
   }else if(body.action==='notes-save'){if(!a||typeof body.notes!=='string'||body.notes.length>2000)fail();a.notes=body.notes;write('ns_accounts',a.id,a);}
   else if(['logout','cancel'].includes(body.action)){
    if(w.pending){try{const p=ledger.handoff(w.pending.ticket);if(p.stage!=='complete')operations.cancelHandoff(w.pending.ticket,p.sessionBinding);}catch(e){if(e.code!=='IDENTITY_HANDOFF_EXPIRED')throw e;}w.pending=null;}
    if(body.action==='logout'){if(w.session?.method==='passli')ledger.logout(w.session.token);w.session=null;}
   }else fail();
   write('ns_browsers',id,w);json(res,200,state(w));return true;
  }catch(error){json(res,409,{error:error.code||'Northstar request was not completed. Check the account state.'});return true;}
 }};
}
