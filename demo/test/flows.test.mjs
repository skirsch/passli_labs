import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';
import {createDemo} from '../server.mjs';

async function fixture(t,{database=':memory:',mode='walkthrough',provider,cleanupInterval=15000}={}) {
  let clock=Date.now();
  const origin='http://127.0.0.1:18766',server=createDemo({origin,database,now:()=>clock,mode,provider,cleanupInterval});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>server.listening ? new Promise(resolve=>server.close(resolve)) : undefined);
  const base=`http://127.0.0.1:${server.address().port}`;
  function client(initialCookie='') {
    let cookie=initialCookie,state;
    const request=async(path,options={})=>{
      const response=await fetch(base+path,{...options,headers:{Cookie:cookie,...options.headers}});
      if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
      const body=response.status===303?{}:await response.json();if(body.state)state=body.state;else if(path==='/api/state')state=body;
      return {response,body};
    };
    return {get state(){return state;},get cookie(){return cookie;},request,init:()=>request('/api/state'),
      async action(action,extra={}) {return request('/api/action',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Demo-CSRF':state.csrf},body:JSON.stringify({action,transaction:state.transaction,...extra})});},
      async ok(action,extra={}){const r=await this.action(action,extra);assert.equal(r.response.status,200,JSON.stringify(r.body));return r.body;},
      callback(state,code='valid-code'){return request('/auth/passli/callback?'+new URLSearchParams({state,code}),{redirect:'manual'}).catch(error=>{throw error;});},
      approve(identity='demo-alice'){return this.ok('approve',{identity,achievedLoA:4});},
      login(){return this.ok('login',{username:'avery@example.test',password:'demo'});}
    };
  }
  const c=client();await c.init();return {c,client,server,advance(ms){clock+=ms;}};
}

test('notes belong to the authenticated account, survive logout, and neither change expiry nor accept stale-account writes',async t=>{
 const f=await fixture(t),{c}=f;await c.login();const id=c.state.account.id,deadline=c.state.account.expiresAt;
 const note='Context: <b>plain text</b>\nNext visit: resume here ✓';
 await c.ok('notes-save',{accountId:id,notes:note});assert.equal(c.state.account.notes,note);assert.equal((await c.request('/api/private')).body.notes,note);
 await c.ok('logout');assert.equal(c.state.account,null);assert.ok(!JSON.stringify(c.state).includes(note));assert.equal((await c.action('notes-save',{accountId:id,notes:'unauthorized'})).response.status,409);
 await c.ok('login',{username:'other@example.test',password:'demo'});assert.equal(c.state.account.notes,'');assert.equal((await c.action('notes-save',{accountId:id,notes:'wrong account'})).response.status,409);
 await c.ok('logout');await c.login();assert.equal(c.state.account.notes,note);
 for(const value of [null,123,'x'.repeat(2001)])assert.equal((await c.action('notes-save',{accountId:id,notes:value})).response.status,409);
 f.advance(29*60000);await c.ok('notes-save',{accountId:id,notes:'last saved context'});assert.equal(c.state.account.expiresAt,deadline);
 f.advance(60000);await c.init();assert.equal(c.state.account,null);assert.equal((await c.request('/api/private')).response.status,401);
 await c.login();assert.notEqual(c.state.account.id,id);assert.equal(c.state.account.notes,'');
});

test('real Passli restores account notes in another browser and SQLite restart; deletion removes that context',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'passli-notes-')),database=join(directory,'demo.sqlite');
 const identity='n'.repeat(43),provider={begin(proof){proof.state=proof.id;return 'https://provider.example/?state='+proof.id;},async complete(){return {identity,unlinkVerified:true,association:{subject:identity}};},async status(){return 'active';}};
 const f=await fixture(t,{mode:'real',provider,database}),{c}=f;
 const complete=async(who,action)=>{const result=await who.ok(action);await who.callback(new URL(result.redirect).searchParams.get('state'));await who.init();};
 await c.login();await c.ok('notes-save',{accountId:c.state.account.id,notes:'Account context survives returning login'});await c.ok('settings');await complete(c,'settings-link');await c.ok('logout');
 const other=f.client();await other.init();assert.equal(other.state.account,null);await other.ok('installation',{installed:true});await complete(other,'passli-start');assert.equal(other.state.account.notes,'Account context survives returning login');const cookie=other.cookie;
 await new Promise(resolve=>f.server.close(resolve));const restored=await fixture(t,{mode:'real',provider,database});t.after(()=>rmSync(directory,{recursive:true,force:true}));const browser=restored.client(cookie);await browser.init();assert.equal(browser.state.account.notes,'Account context survives returning login');
 await browser.ok('settings');await complete(browser,'delete-account-start');await browser.ok('delete-account-confirm');assert.equal(browser.state.account,null);
 const db=new DatabaseSync(database);try{assert.ok(db.prepare('SELECT state FROM visitors').all().every(row=>!row.state.includes('Account context survives returning login')));}finally{db.close();}
});

test('deleting an unlinked account removes only that account, signs out, rotates the cookie and rejects replay',async t=>{
 const {c}=await fixture(t);await c.ok('login',{username:'other@example.test',password:'demo'});await c.ok('logout');await c.login();const oldCookie=c.cookie;
 assert.equal((await c.action('delete-account-confirm')).response.status,409);
 await c.ok('settings');await c.ok('delete-account-start');assert.equal(c.state.screen,'delete-confirm');
 await c.ok('cancel');assert.equal(c.state.account.email,'avery@example.test');
 await c.ok('delete-account-start');await c.ok('delete-account-confirm');
 assert.equal(c.state.screen,'login');assert.equal(c.state.account,null);assert.equal(c.state.demoAccounts.length,1);assert.equal(c.state.demoAccounts[0].email,'other@example.test');assert.notEqual(c.cookie,oldCookie);
 assert.equal((await c.request('/api/private')).response.status,401);assert.equal((await c.action('delete-account-confirm')).response.status,409);
 await c.login();assert.equal(c.state.account.linked,false);
});

test('linked deletion requires fresh LoA4 unlink, then explicit bounded deletion confirmation; cancelled approval keeps account/link',async t=>{
 const f=await fixture(t),{c}=f;await c.login();await c.ok('settings');await c.ok('settings-link');await c.approve();
 await c.ok('delete-account-start');assert.equal(c.state.pendingAction,'unlink');assert.equal(c.state.account.linked,true);
 assert.equal((await c.action('delete-account-confirm',{achievedLoA:4})).response.status,409);
 await c.ok('cancel');assert.equal(c.state.account.linked,true);
 await c.ok('delete-account-start');assert.equal((await c.action('approve',{identity:'demo-alice',achievedLoA:3})).response.status,409);assert.equal(c.state.account.linked,true);
 await c.ok('delete-account-start');await c.approve();assert.equal(c.state.screen,'delete-confirm');assert.equal(c.state.account.linked,false);assert.equal(c.state.demoAccounts.length,1);
 f.advance(61000);assert.equal((await c.action('delete-account-confirm')).response.status,409);assert.equal(c.state.demoAccounts.length,1);
 await c.ok('delete-account-start');await c.ok('delete-account-confirm');assert.equal(c.state.demoAccounts.length,0);
});

test('Passli-session deletion uses restricted confirmation after unlink and deletes persistent global binding; later identity starts unbound',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'passli-delete-')),database=join(directory,'demo.sqlite');
 const identity='x'.repeat(43);const provider={begin(proof){proof.state=proof.id;return 'https://provider.example/?state='+proof.id;},async complete(){return {identity,unlinkVerified:true,association:{subject:identity}};},async status(){return 'active';}};
 const {c,client}=await fixture(t,{mode:'real',provider,database});t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const complete=async(who,action)=>{const result=await who.ok(action);await who.callback(new URL(result.redirect).searchParams.get('state'));await who.init();};
 await c.login();await c.ok('settings');await complete(c,'settings-link');await c.ok('logout');await c.ok('installation',{installed:true});await complete(c,'passli-start');await c.ok('settings');
 await complete(c,'delete-account-start');assert.equal(c.state.screen,'delete-confirm');assert.equal(c.state.account,null);assert.equal(c.state.deletion.email,'avery@example.test');assert.equal((await c.request('/api/private')).response.status,401);
 const db=new DatabaseSync(database);try{assert.equal(db.prepare('SELECT count(*) AS n FROM bindings').get().n,0);}finally{db.close();}
 await c.ok('delete-account-confirm');assert.equal(c.state.deletion,null);assert.equal(c.state.demoAccounts.length,0);
 const other=client();await other.init();await other.ok('installation',{installed:true});await complete(other,'passli-start');assert.equal(other.state.screen,'setup');
});

for(const inline of [false,true])test((inline?'inline ':'legacy ')+'registration requests Passli PII and creates nothing until authorized device delivery; cancellation and replay fail closed',async t=>{
  const identity='z'.repeat(43),origin='http://127.0.0.1:18766';let authorized=true,releaseNumber=0;
  const provider={begin(proof){proof.state=proof.id;return 'https://provider.example/?state='+proof.id;},async complete(){return {identity,association:{subject:identity},piiRelease:{id:'release-'+(++releaseNumber),challenge:'challenge',deliveryToken:'secret-token',siteOrigin:origin,callback:origin+'/api/pii-release',expires:Date.now()+120000,fields:inline?[]:['name','email','phone'].map(output=>({output,recordId:output,field:output})),...(inline?{requestedFields:['name','email','phone']}: {})}};},async authorizeDisclosure(){return inline?{active:authorized,outputs:['name','email','phone']}:authorized;},async status(){return 'active';}};
  const {c}=await fixture(t,{mode:'real',provider});
  const start=async()=>{await c.ok('register-local');const response=await c.ok('register');await c.callback(new URL(response.redirect).searchParams.get('state'));await c.init();assert.equal(c.state.screen,'profile-sharing');assert.equal(c.state.account,null);return c.state.piiRequest.id;};
  const deliver=(id,extra={})=>c.request('/api/pii-release',{method:'POST',headers:{Origin:'https://passli.app','Content-Type':'application/json'},body:JSON.stringify({id,deliveryToken:'secret-token',values:{name:'Provided name',email:'provided@example.test',phone:'+15555550123'},...extra})});
  const first=await start();assert.equal((await c.request('/api/private')).response.status,401);
  const challenge=await c.request('/api/pii-challenge?id='+first);assert.equal(challenge.body.deliveryToken,undefined);
  assert.equal((await deliver(first,{deliveryToken:'wrong'})).response.status,409);
  assert.equal((await deliver(first,{values:{name:'Missing phone'}})).response.status,409);
  authorized=false;assert.equal((await deliver(first)).response.status,409);authorized=true;
  const cancelled=await c.request('/auth/passli/pii-return?'+new URLSearchParams({id:first,outcome:'cancelled'}),{redirect:'manual'});assert.equal(cancelled.response.status,303);await c.init();assert.equal((await deliver(first)).response.status,409);
  const second=await start();assert.equal((await deliver(second)).response.status,200);await c.init();
  assert.equal(c.state.account.name,'Provided name');assert.equal(c.state.account.email,'provided@example.test');assert.equal(c.state.account.phone,'+15555550123');assert.equal(c.state.account.linked,true);
  assert.equal((await deliver(second)).response.status,409);
});

test('first-use linking preserves account and returning login bypasses chooser',async t=>{
  const {c}=await fixture(t);await c.ok('passli-start');await c.approve();assert.equal(c.state.screen,'setup');
  assert.equal((await c.request('/api/private')).response.status,401);
  await c.ok('choose-link');await c.ok('link-login',{username:'avery@example.test',password:'demo'});
  assert.equal(c.state.screen,'link-confirm');const before=(await c.request('/api/private')).body;
  await c.ok('confirm-link');await c.approve();assert.equal(c.state.account.linked,true);
  await c.ok('logout');await c.ok('passli-start');await c.approve();assert.equal(c.state.screen,'home');
  const after=(await c.request('/api/private')).body;assert.deepEqual(after,before);
});

test('real mode uses provider callbacks, persists cross-browser bindings and rejects simulated approval',async t=>{
  const identity='x'.repeat(43);let providerStatus='active',calls=0;
  const provider={begin(proof){proof.state='state-'+proof.id;return 'https://provider.example/login?state='+proof.state;},async complete(){calls++;return {identity,unlinkVerified:true,association:{subject:identity,grantId:'grant',sessionId:'provider-session',clientId:'demo'}};},async status(){return providerStatus;}};
  const {c,client}=await fixture(t,{mode:'real',provider});
  assert.equal(c.state.mode,'real');assert.equal(c.state.installed,false);
  assert.equal((await c.action('approve',{identity:'demo-alice'})).response.status,403);
  await c.ok('installation',{installed:true});
  const complete=async(c,action)=>{const begin=await c.ok(action);if(action==='unlink'){assert.equal(c.state.screen,'approval');assert.equal(c.state.account.linked,true);assert.match(begin.redirect,/^https:\/\/provider.example\/login/);}const state=new URL(begin.redirect).searchParams.get('state');assert.equal((await c.callback(state)).response.status,303);await c.init();};
  await complete(c,'passli-start');assert.equal(c.state.screen,'setup');
  await c.ok('choose-link');await c.ok('link-login',{username:'avery@example.test',password:'demo'});
  await complete(c,'confirm-link');assert.equal(c.state.account.linked,true);
  const account=(await c.request('/api/private')).body.accountId;
  await c.ok('logout');const other=client();await other.init();await other.ok('installation',{installed:true});await complete(other,'passli-start');
  assert.equal(other.state.screen,'home');assert.equal((await other.request('/api/private')).body.accountId,account);
  providerStatus='suspended';const blocked=await other.action('notes-save',{notes:'must not save'});assert.ok(blocked.response.status>=400);assert.equal(other.state.screen,'suspended');assert.equal((await other.action('resume-start')).response.status,423);await other.init();assert.equal(other.state.screen,'suspended');assert.equal((await other.request('/api/private')).response.status,401);
  providerStatus='active';await other.init();assert.equal(other.state.screen,'home');
  await other.ok('settings');await complete(other,'unlink');
  await complete(other,'passli-start');assert.equal(other.state.screen,'setup');assert.equal(calls,5);
});
test('cancelled setup reappears; registration binds a separate account atomically',async t=>{
  const {c}=await fixture(t);await c.login();const original=(await c.request('/api/private')).body.accountId;await c.ok('logout');
  await c.ok('passli-start');await c.approve();await c.ok('choose-create');await c.ok('cancel');
  assert.equal((await c.request('/api/private')).response.status,401);
  await c.ok('passli-start');await c.approve();assert.equal(c.state.screen,'setup');await c.ok('choose-create');await c.ok('register');
  const transaction=c.state.transaction;await c.approve();assert.equal(c.state.account.name,'Jordan Morgan');
  assert.notEqual((await c.request('/api/private')).body.accountId,original);
  assert.equal((await c.action('approve',{identity:'demo-alice',transaction})).response.status,409);
  assert.equal(c.state.demoAccounts.length,2);
});
test('settings linking adds the same identity to multiple accounts and returning login requires an explicit account choice',async t=>{
  const {c}=await fixture(t);await c.ok('passli-start');await c.approve();await c.ok('choose-create');await c.ok('register');await c.approve();
  const first=c.state.account.id;
  await c.ok('logout');await c.login();await c.ok('settings');await c.ok('settings-link');
  assert.equal(c.state.screen,'approval');assert.equal(c.state.pendingAction,'link');assert.equal(c.state.account.linked,false);
  await c.approve();assert.equal(c.state.account.linked,true);const second=c.state.account.id;
  await c.ok('settings-link');await c.approve();assert.equal(c.state.account.id,second);
  await c.ok('logout');await c.ok('passli-start');await c.approve();assert.equal(c.state.screen,'account-choice');assert.equal(c.state.account,null);assert.deepEqual(new Set(c.state.accountChoices.map(account=>account.id)),new Set([first,second]));
  assert.equal((await c.request('/api/private')).response.status,401);assert.equal((await c.action('select-account',{accountId:'forged'})).response.status,409);
  await c.ok('select-account',{accountId:second});assert.equal(c.state.account.id,second);
  await c.ok('logout');await c.ok('passli-start');await c.approve();await c.ok('select-account',{accountId:first});assert.equal(c.state.account.id,first);
});
const multiProvider=()=>({begin(proof){proof.state=proof.id;return 'https://provider.example/?state='+proof.state;},async complete(){return {identity:'m'.repeat(43),unlinkVerified:true,association:{subject:'m'.repeat(43)}};},async status(){return 'active';}});
async function realComplete(client,action){const result=await client.ok(action);assert.equal((await client.callback(new URL(result.redirect).searchParams.get('state'))).response.status,303);await client.init();}
async function linkedClient(f,email,notes=''){
 const client=f.client();await client.init();await client.ok('login',{username:email,password:'demo'});
 if(notes)await client.ok('notes-save',{accountId:client.state.account.id,notes});
 await client.ok('settings');await realComplete(client,'settings-link');return client;
}
async function realChooser(f){const client=f.client();await client.init();await client.ok('installation',{installed:true});await realComplete(client,'passli-start');assert.equal(client.state.screen,'account-choice');return client;}

test('real multi-account login lists only current linked accounts across browsers, checks membership and preserves each account context',async t=>{
 const f=await fixture(t,{mode:'real',provider:multiProvider()});
 const first=await linkedClient(f,'first@example.test','Private first account note'),firstId=first.state.account.id;
 const second=await linkedClient(f,'second@example.test','Private second account note'),secondId=second.state.account.id;
 await realComplete(second,'settings-link');assert.equal(second.state.account.id,secondId,'same-pair linking is idempotent');
 const foreign=f.client();await foreign.init();await foreign.ok('login',{username:'unlinked@example.test',password:'demo'});const foreignId=foreign.state.account.id;await foreign.ok('logout');
 const picker=await realChooser(f),transaction=picker.state.transaction,choices=picker.state.accountChoices;
 assert.deepEqual(new Set(choices.map(account=>account.id)),new Set([firstId,secondId]));assert.ok(choices.every(account=>Object.keys(account).sort().join(',')==='email,id,name'));
 assert.ok(!JSON.stringify(picker.state).includes('Private'));assert.equal(picker.state.account,null);assert.equal((await picker.request('/api/private')).response.status,401);
 assert.equal((await picker.action('select-account',{accountId:foreignId})).response.status,409);
 assert.equal((await foreign.action('select-account',{accountId:firstId,transaction})).response.status,409);
 const before=picker.cookie;await picker.ok('select-account',{accountId:secondId});assert.notEqual(picker.cookie,before);assert.equal(picker.state.account.notes,'Private second account note');
 await picker.ok('logout');assert.equal((await picker.action('select-account',{accountId:firstId,transaction})).response.status,409);
 await realComplete(picker,'passli-start');await picker.ok('select-account',{accountId:firstId});assert.equal(picker.state.account.notes,'Private first account note');
 await picker.ok('settings');await realComplete(picker,'unlink');assert.equal(picker.state.account,null);
 await realComplete(picker,'passli-start');assert.equal(picker.state.screen,'home');assert.equal(picker.state.account.id,secondId,'unlink removes only the selected account link');
});

test('account picker cancellation, original deadline and provider suspension grant no session',async t=>{
 let providerStatus='active';const provider=multiProvider();provider.status=async()=>providerStatus;
 const f=await fixture(t,{mode:'real',provider});await linkedClient(f,'one@example.test');await linkedClient(f,'two@example.test');
 const c=await realChooser(f),accountId=c.state.accountChoices[0].id,transaction=c.state.transaction;
 await c.ok('cancel');assert.equal(c.state.screen,'login');assert.equal(c.state.accountChoices.length,0);assert.equal((await c.action('select-account',{accountId,transaction})).response.status,409);
 await realComplete(c,'passli-start');providerStatus='suspended';assert.equal((await c.action('select-account',{accountId})).response.status,409);assert.equal((await c.request('/api/private')).response.status,401);
 providerStatus='active';await c.ok('cancel');await realComplete(c,'passli-start');f.advance(61000);assert.equal((await c.action('select-account',{accountId})).response.status,409);assert.equal(c.state.account,null);
});

test('selection rechecks unlink/deletion and concurrent cancellation after provider authorization begins',async t=>{
 let pause=false,release,started;const provider=multiProvider();provider.status=async()=>{if(pause){pause=false;started?.();await new Promise(resolve=>release=resolve);}return 'active';};
 const f=await fixture(t,{mode:'real',provider}),first=await linkedClient(f,'one@example.test'),second=await linkedClient(f,'two@example.test');
 const picker=await realChooser(f),firstId=first.state.account.id;
 await realComplete(first,'unlink');assert.equal((await picker.action('select-account',{accountId:firstId})).response.status,409);assert.equal((await picker.request('/api/private')).response.status,401);
 const secondId=second.state.account.id;await realComplete(second,'delete-account-start');await second.ok('delete-account-confirm');assert.equal((await picker.action('select-account',{accountId:secondId})).response.status,409);
 await linkedClient(f,'third@example.test');await linkedClient(f,'fourth@example.test');await picker.ok('cancel');await realComplete(picker,'passli-start');
 const target=picker.state.accountChoices[0].id,transaction=picker.state.transaction,entered=new Promise(resolve=>started=resolve);pause=true;
 const selecting=picker.action('select-account',{accountId:target});await entered;await picker.ok('cancel');release();assert.equal((await selecting).response.status,409);
 assert.equal((await picker.request('/api/private')).response.status,401);assert.equal((await picker.action('select-account',{accountId:target,transaction})).response.status,409);
});

test('legacy single-account SQLite bindings migrate without losing notes; multi-account choice survives restart and expires accounts independently',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'passli-multiple-')),database=join(directory,'demo.sqlite');
 const provider=multiProvider(),old=await fixture(t,{mode:'real',provider,database}),first=await linkedClient(old,'legacy@example.test','Retained through migration'),firstId=first.state.account.id;
 await new Promise(resolve=>old.server.close(resolve));
 const db=new DatabaseSync(database);try{db.exec('ALTER TABLE bindings RENAME TO modern_bindings; CREATE TABLE bindings (subject TEXT PRIMARY KEY,visitor TEXT NOT NULL,account TEXT NOT NULL); INSERT INTO bindings SELECT subject,visitor,account FROM modern_bindings; DROP TABLE modern_bindings;');}finally{db.close();}
 const migrated=await fixture(t,{mode:'real',provider,database});migrated.advance(10000);const second=await linkedClient(migrated,'second@example.test'),secondId=second.state.account.id,picker=await realChooser(migrated),cookie=picker.cookie;
 assert.equal(picker.state.accountChoices.length,2);await new Promise(resolve=>migrated.server.close(resolve));
 const restored=await fixture(t,{mode:'real',provider,database}),browser=restored.client(cookie);t.after(()=>rmSync(directory,{recursive:true,force:true}));await browser.init();assert.equal(browser.state.screen,'account-choice');
 await browser.ok('select-account',{accountId:firstId});assert.equal(browser.state.account.notes,'Retained through migration');
 await browser.ok('logout');await realComplete(browser,'passli-start');restored.advance(30*60000);assert.equal((await browser.action('select-account',{accountId:firstId})).response.status,409);
 await browser.ok('installation',{installed:true});await realComplete(browser,'passli-start');assert.equal(browser.state.screen,'home');assert.equal(browser.state.account.id,secondId);
});

test('simultaneous account selections consume the login once without resurrecting a stale browser continuation',async t=>{
 let hold=false,releases=[],entered;const provider=multiProvider();provider.status=async()=>{if(hold){await new Promise(resolve=>{releases.push(resolve);if(releases.length===2)entered();});}return 'active';};
 const f=await fixture(t,{mode:'real',provider});await linkedClient(f,'one@example.test');await linkedClient(f,'two@example.test');
 const first=await realChooser(f),second=f.client(first.cookie);await second.init();const [one,two]=first.state.accountChoices,transaction=first.state.transaction;
 const both=new Promise(resolve=>entered=resolve);hold=true;const a=first.action('select-account',{accountId:one.id}),b=second.action('select-account',{accountId:two.id});await both;hold=false;releases.forEach(resolve=>resolve());
 const results=await Promise.all([a,b]);assert.deepEqual(results.map(result=>result.response.status).sort(),[200,409]);
 const loser=results[0].response.status===409?first:second;await loser.init();assert.equal(loser.state.account,null);assert.equal(loser.state.accountChoices.length,0);assert.equal((await loser.action('select-account',{accountId:one.id,transaction})).response.status,409);
});

test('unlink preserves account, invalidates Passli session and never restores binding automatically',async t=>{
  const {c}=await fixture(t);await c.login();const before=(await c.request('/api/private')).body;
  await c.ok('settings-link');await c.approve();await c.ok('logout');await c.ok('passli-start');await c.approve();
  await c.ok('settings');await c.ok('unlink');await c.approve();
  assert.equal(c.state.screen,'login');assert.equal((await c.request('/api/private')).response.status,401);
  await c.login();assert.deepEqual((await c.request('/api/private')).body,before);assert.equal(c.state.account.linked,false);
  await c.ok('logout');await c.ok('passli-start');await c.approve();assert.equal(c.state.screen,'setup');
});
test('suspension denies APIs, wrong identity cannot resume, original deadline survives resume',async t=>{
  const f=await fixture(t),{c}=f;await c.ok('passli-start');await c.approve();await c.ok('choose-create');await c.ok('register');await c.approve();
  const before=(await c.request('/api/private')).body;await c.ok('suspend');assert.equal(c.state.account,null);assert.equal((await c.request('/api/private')).response.status,401);
  await c.ok('resume-start');assert.equal((await c.action('approve',{identity:'demo-bob'})).response.status,409);assert.equal(c.state.screen,'suspended');
  f.advance(25*60000);await c.ok('resume-start');await c.approve();assert.deepEqual((await c.request('/api/private')).body,before);
  f.advance(6*60000);await c.init();assert.equal(c.state.screen,'login');assert.equal((await c.request('/api/private')).response.status,401);
});
test('expiry, identity switch, CSRF, installation controls and visitor isolation fail closed',async t=>{
  const f=await fixture(t),{c}=f;
  await c.ok('installation',{installed:false});assert.equal((await c.action('passli-start')).response.status,409);
  await c.ok('installation',{installed:true});await c.ok('passli-start');f.advance(61000);assert.equal((await c.action('approve',{identity:'demo-alice'})).response.status,409);
  await c.ok('passli-start');await c.approve();await c.ok('choose-link');await c.ok('link-login',{username:'avery@example.test',password:'demo'});await c.ok('confirm-link');
  assert.equal((await c.action('approve',{identity:'demo-bob'})).response.status,409);assert.equal(c.state.account.linked,false);
  const stranger=f.client();await stranger.init();assert.equal((await stranger.request('/api/private')).response.status,401);assert.equal(stranger.state.account,null);
  const csrf=await c.request('/api/action',{method:'POST',headers:{Origin:'https://attacker.invalid','Content-Type':'application/json','X-Demo-CSRF':c.state.csrf},body:JSON.stringify({action:'logout'})});assert.equal(csrf.response.status,403);
  await c.ok('logout');await c.ok('passli-start');await c.approve();f.advance(301000);assert.equal((await c.action('choose-create')).response.status,409);
});
test('termination/provider failure deny access while keeping bindings',async t=>{
  const {c}=await fixture(t);await c.login();await c.ok('settings-link');await c.approve();await c.ok('logout');
  for(const end of ['terminate','provider-error']) {await c.ok('passli-start');await c.approve();await c.ok(end);assert.equal((await c.request('/api/private')).response.status,401);}
  await c.login();assert.equal(c.state.account.linked,true);
});
test('concurrent replay commits a registration once; SQLite persists visitor bindings',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'passli-demo-'));
  const first=await fixture(t,{database:join(directory,'demo.sqlite')}),{c,client}=first;
  await c.ok('passli-start');await c.approve();await c.ok('choose-create');await c.ok('register');
  const other=client(c.cookie);await other.init();const transaction=c.state.transaction;
  const replies=await Promise.all([c.action('approve',{transaction,identity:'demo-alice'}),other.action('approve',{transaction,identity:'demo-alice'})]);
  assert.equal(replies.filter(r=>r.response.status===200).length,1);
  assert.ok(replies.some(r=>[403,409].includes(r.response.status)));
  const winningCookie=replies[0].response.status===200?c.cookie:other.cookie;
  const reloaded=client(winningCookie);await reloaded.init();assert.equal(reloaded.state.demoAccounts.length,2);assert.equal(reloaded.state.account.linked,true);
  await new Promise(resolve=>first.server.close(resolve));
  const second=await fixture(t,{database:join(directory,'demo.sqlite')}),restored=second.client(winningCookie);await restored.init();
  assert.equal(restored.state.demoAccounts.length,2);assert.equal(restored.state.account.linked,true);
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
});


test('any email with demo can link and unlink; invalid credentials create nothing',async t=>{
  const {c}=await fixture(t);await c.ok('passli-start');await c.approve();await c.ok('choose-link');
  for(const [username,password] of [['someone@example.org','wrong'],['bad address','demo']]) {
    assert.equal((await c.action('link-login',{username,password})).response.status,409);
    assert.equal(c.state.demoAccounts.length,1);
  }
  await c.ok('link-login',{username:'  Any.Person@Example.org  ',password:'demo'});
  assert.equal(c.state.account.email,'any.person@example.org');assert.equal(c.state.screen,'link-confirm');
  const before=(await c.request('/api/private')).body;
  await c.ok('confirm-link');await c.approve();assert.equal(c.state.account.linked,true);
  await c.ok('unlink');await c.approve();
  assert.equal(c.state.account.linked,false);assert.deepEqual((await c.request('/api/private')).body,before);
});

test('fixed account lifetime survives activity and relogin; only expired accounts are forgotten',async t=>{
  const f=await fixture(t),{c}=f;await c.login();const first=(await c.request('/api/private')).body.accountId,deadline=c.state.account.expiresAt;
  f.advance(20*60000);await c.ok('logout');await c.login();assert.equal(c.state.account.expiresAt,deadline);
  await c.ok('logout');await c.ok('login',{username:'later@example.org',password:'demo'});
  f.advance(10*60000);await c.init();assert.equal(c.state.account.email,'later@example.org');assert.equal(c.state.demoAccounts.length,1);
  await c.ok('logout');await c.login();assert.notEqual((await c.request('/api/private')).body.accountId,first);assert.ok(c.state.account.expiresAt>deadline);
});

test('idle cleanup deletes registered accounts and real bindings; returning identity starts setup again',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'passli-expiry-')),database=join(directory,'demo.sqlite');
  const identity='x'.repeat(43),provider={begin(proof){proof.state=proof.id;return 'https://provider.example/?state='+proof.state;},async complete(){return {identity,association:{subject:identity},personalInformation:{name:'Jordan Morgan',email:'jordan@example.test',phone:'+15555550123'}};},async status(){return 'active';}};
  const f=await fixture(t,{mode:'real',provider,database,cleanupInterval:10}),{c}=f;
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const complete=async(client,action)=>{const r=await client.ok(action);assert.equal((await client.callback(new URL(r.redirect).searchParams.get('state'))).response.status,303);await client.init();};
  await c.ok('installation',{installed:true});await complete(c,'passli-start');await c.ok('choose-create');await complete(c,'register');
  assert.equal(c.state.account.linked,true);const deadline=c.state.account.expiresAt;
  f.advance(29*60000);await c.ok('logout');await complete(c,'passli-start');assert.equal(c.state.account.expiresAt,deadline);
  f.advance(60000);await delay(40);
  const db=new DatabaseSync(database);t.after(()=>{try{db.close();}catch{}});assert.equal(db.prepare('SELECT count(*) AS n FROM bindings').get().n,0);
  const rows=db.prepare('SELECT state FROM visitors').all();assert.ok(rows.every(row=>!row.state.includes('Jordan Morgan')&&!row.state.includes(identity)));db.close();
  assert.equal((await c.request('/api/private')).response.status,401);await c.init();assert.equal(c.state.account,null);assert.equal(c.state.demoAccounts.length,0);
  const other=f.client();await other.init();await other.ok('installation',{installed:true});await complete(other,'passli-start');assert.equal(other.state.screen,'setup');
});


test('unlink has no password bypass and needs a fresh same-identity LoA4 proof; cancellation and expiry preserve binding',async t=>{
 const f=await fixture(t),{c}=f;await c.login();await c.ok('settings-link');await c.approve();
 assert.equal((await c.action('unlink',{username:'avery@example.test',password:'demo'})).response.status,200);assert.equal(c.state.screen,'approval');assert.equal(c.state.account.linked,true);await c.ok('cancel');
 await c.ok('unlink');assert.equal(c.state.screen,'approval');
 assert.equal((await c.action('approve',{identity:'demo-alice',achievedLoA:3})).response.status,409);assert.equal(c.state.account.linked,true);
 await c.ok('unlink');assert.equal((await c.action('approve',{identity:'demo-bob',achievedLoA:4})).response.status,409);assert.equal(c.state.account.linked,true);
 await c.ok('unlink');const old=c.state.transaction;await c.ok('cancel');assert.equal(c.state.account.linked,true);
 await c.ok('unlink');assert.equal((await c.action('approve',{identity:'demo-alice',achievedLoA:4,transaction:old})).response.status,409);assert.equal(c.state.account.linked,true);
 await c.ok('unlink');f.advance(61000);assert.equal((await c.action('approve',{identity:'demo-alice',achievedLoA:4})).response.status,409);assert.equal(c.state.account.linked,true);
 await c.ok('unlink');await c.approve();assert.equal(c.state.account.linked,false);
});

test('account deletion cannot remove additional bindings without their own unlink approvals or follow a changed session',async t=>{
 const {c}=await fixture(t);await c.login();await c.ok('settings');await c.ok('settings-link');await c.approve();await c.ok('settings-link');await c.approve('demo-bob');
 await c.ok('delete-account-start');await c.approve();assert.equal(c.state.screen,'settings');assert.equal(c.state.account.linked,true);assert.equal((await c.action('delete-account-confirm')).response.status,409);
 await c.ok('delete-account-start');await c.approve('demo-bob');assert.equal(c.state.screen,'delete-confirm');assert.equal(c.state.account.linked,false);
 await c.ok('logout');await c.ok('login',{username:'other@example.test',password:'demo'});assert.equal((await c.action('delete-account-confirm')).response.status,409);assert.equal(c.state.demoAccounts.length,2);
});


test('provider cancellation returns to settings after approval expiry and never consumes a newer transaction',async t=>{
 let exchanges=0;const provider={begin(proof){proof.state=proof.id;return 'https://provider.example/?state='+proof.state;},async complete(){exchanges++;return {identity:'cancel-fixture',association:{subject:'cancel-fixture'}};},async status(){return 'active';}};
 const f=await fixture(t,{mode:'real',provider}),{c}=f;await c.login();
 const link=await c.ok('settings-link');await c.callback(new URL(link.redirect).searchParams.get('state'));await c.init();await c.ok('settings');assert.equal(c.state.account.linked,true);
 const accountId=c.state.account.id,accountExpiry=c.state.account.expiresAt;
 const cancel=state=>c.request('/auth/passli/callback?'+new URLSearchParams({error:'access_denied',state}),{redirect:'manual'});
 let begin=await c.ok('unlink'),state=new URL(begin.redirect).searchParams.get('state');
 let result=await cancel(state);assert.equal(result.response.status,303);assert.equal(result.response.headers.get('location'),'/');await c.init();assert.equal(c.state.screen,'settings');assert.equal(c.state.account.linked,true);assert.match(c.state.message,/Unlink cancelled/);
 begin=await c.ok('unlink');const expired=new URL(begin.redirect).searchParams.get('state');f.advance(61000);await c.init();assert.equal(c.state.transaction,null);
 result=await cancel(expired);assert.equal(result.response.status,303);await c.init();assert.equal(c.state.screen,'settings');assert.equal(c.state.account.id,accountId);assert.equal(c.state.account.linked,true);assert.equal(c.state.account.expiresAt,accountExpiry);
 begin=await c.ok('unlink');const current=c.state.transaction;await cancel(expired);await c.init();assert.equal(c.state.transaction,current,'old cancel cannot consume a newer request');assert.equal(c.state.screen,'approval');assert.equal(c.state.account.linked,true);
 const other=f.client();await other.init();assert.equal((await other.request('/auth/passli/callback?'+new URLSearchParams({error:'access_denied',state:current}),{redirect:'manual'})).response.status,303);await c.init();assert.equal(c.state.transaction,current,'other browser cannot cancel this request');
 assert.equal(exchanges,1,'no cancellation redeems a code or verifies an unlink');
 await cancel(current);await c.init();assert.equal(c.state.screen,'settings');assert.equal(c.state.account.linked,true);
});


test('late callback returns a timeout on the site without redeeming or consuming a newer request',async t=>{
 let exchanges=0;const provider={begin(proof){proof.state=proof.id;return 'https://provider.example/?state='+proof.state;},async complete(){exchanges++;return {identity:'timeout-fixture',association:{subject:'timeout-fixture'}};},async status(){return 'active';}};
 const f=await fixture(t,{mode:'real',provider}),{c}=f;await c.login();const original=c.state.account.id,expiry=c.state.account.expiresAt;
 const begin=await c.ok('settings-link'),old=new URL(begin.redirect).searchParams.get('state');f.advance(61000);
 const late=await c.callback(old);assert.equal(late.response.status,303);assert.equal(late.response.headers.get('location'),'/');await c.init();assert.equal(c.state.message,'Your request timed out. Please try again.');assert.equal(c.state.account.id,original);assert.equal(c.state.account.expiresAt,expiry);assert.equal(c.state.account.linked,false);assert.equal(exchanges,0);
 const current=await c.ok('settings-link'),state=new URL(current.redirect).searchParams.get('state');await c.callback(old);await c.init();assert.equal(c.state.transaction,state);assert.equal(exchanges,0);
 const stranger=f.client();await stranger.init();assert.equal((await stranger.callback(state)).response.status,303);await c.init();assert.equal(c.state.transaction,state);assert.equal(exchanges,0);
 await c.callback(state);await c.init();assert.equal(c.state.account.linked,true);assert.equal(exchanges,1);
 const replay=await c.callback(state);assert.equal(replay.response.status,303);await c.init();assert.equal(c.state.message,'Your request timed out. Please try again.');assert.equal(c.state.account.linked,true);assert.equal(exchanges,1);
});

 test('real Passli session without a provider association fails closed on state and protected writes',async t=>{
 const identity='missing-association',provider={begin(proof){proof.state=proof.id;return 'https://provider.example/?state='+proof.state;},async complete(){return {identity};},async status(){throw Error('Missing association must never be checked as active.');}};
 const {c}=await fixture(t,{mode:'real',provider});
 await c.ok('installation',{installed:true});
 async function complete(action){const begin=await c.ok(action),state=new URL(begin.redirect).searchParams.get('state');assert.equal((await c.callback(state)).response.status,303);await c.init();}
 await complete('passli-start');await c.ok('choose-link');await c.ok('link-login',{username:'missing@example.test',password:'demo'});await complete('confirm-link');await c.ok('logout');await complete('passli-start');
 assert.equal(c.state.screen,'login');assert.equal((await c.request('/api/private')).response.status,401);assert.ok((await c.action('notes-save',{notes:'must not write'})).response.status>=400);
 });


test('real checkout checks current provider session and cart after asynchronous approval; cancellation wins',async t=>{
 let complete=false,waiting,release;
 const selection={card:{recordId:'c',label:'My AMEX',last4:'1009'},address:{recordId:'a',label:'My home',street:'50 Example Street',city:'Example City',region:'CA',postalCode:'94000',country:'US'}};
 const provider={begin(proof){proof.state=proof.id;return 'https://provider.example/?state='+proof.id;},async complete(){return {identity:'q'.repeat(43),association:{subject:'q'.repeat(43)}};},async status(){return 'active';},async createCheckout(_,order){return {order,requestId:'r'.repeat(43),approvalUrl:'https://passli.app/?signatureRequest='+'r'.repeat(43),resultSecret:'private-result-secret',expiresAt:Math.floor(Date.now()/1000)+600};},async checkoutResult(){if(waiting){waiting();await new Promise(resolve=>release=resolve);}return complete?{fields:{selection,requiredLoA:4,achievedLoA:4}}:{pending:true};}};
 const {c}=await fixture(t,{mode:'real',provider});await c.ok('installation',{installed:true});await c.ok('passli-start');await c.callback(c.state.transaction);await c.init();await c.ok('choose-link');await c.ok('link-login',{username:'qa@example.test',password:'demo'});await c.ok('confirm-link');await c.callback(c.state.transaction);await c.init();await c.ok('logout');await c.ok('passli-start');await c.callback(c.state.transaction);await c.init();
 await c.ok('cart');await c.ok('cart-add');const started=await c.ok('checkout-start');assert.match(started.popupUrl,/signatureRequest/);assert.ok(!JSON.stringify(started.state).includes('private-result-secret'));
 let id=c.state.cart.approval.id;await c.ok('checkout-status',{checkoutId:id});assert.equal(c.state.screen,'checkout-wait');assert.equal((await c.action('checkout-demo-approve',{checkoutId:id})).response.status,409);
 complete=true;await c.ok('checkout-status',{checkoutId:id});assert.equal(c.state.screen,'checkout-confirm');assert.equal(c.state.cart.approval.achievedLoA,4);await c.ok('purchase',{checkoutId:id});assert.equal(c.state.cart.purchasedCents,5000);assert.equal((await c.action('purchase',{checkoutId:id})).response.status,409);
 await c.ok('cart-add');await c.ok('checkout-start');id=c.state.cart.approval.id;
 const startedWaiting=new Promise(resolve=>waiting=resolve),poll=c.action('checkout-status',{checkoutId:id});await startedWaiting;await c.ok('checkout-cancel');release();assert.equal((await poll).response.status,400);await c.init();assert.equal(c.state.cart.approval,null);assert.equal(c.state.screen,'cart');assert.equal(c.state.cart.purchasedCents,5000);
});
