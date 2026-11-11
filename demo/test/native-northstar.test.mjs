import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemo} from '../server.mjs';
import {pair,signed,defaultAlgorithmPolicies,random64} from './native-support.mjs';
import {issueEnrollmentCertificate} from '../native-runtime/packages/identity-protocol/provider-enrollment.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const thirds=new Map();const thirdFor=user=>{if(!thirds.has(user.key.keyID))thirds.set(user.key.keyID,pair('independent',user.privateKey.asymmetricKeyType));return thirds.get(user.key.keyID);};
const origin='https://demo.passli.app',issuer='https://api.passli.app';
async function fixture(t,{root=pair('provider','ml-dsa-87'),database=':memory:'}={}){
 const assuranceFor=op=>({schema:'passli:loa:four:v1',requiredLevel:op==='unlink'?4:1,achievedLevel:op==='unlink'?4:1,factors:op==='unlink'?['mobile-approval','fresh-biometric','security-key']:['registered-device'],policyRevision:'1'});
 const server=createDemo({origin,mode:'real',database,nativeIdentity:{path:database,provider:{issuer,roots:[root.key]},cookieKey:Buffer.alloc(32,7),algorithmPolicies:defaultAlgorithmPolicies,assuranceFor,requireThreeKeys:true,signerPolicyFor:()=>({user:{minimum:2,revision:'0'},rp:{minimum:2,revision:'0'}})}});
 const close=async()=>{if(server.listening){server.closeAllConnections();await new Promise(r=>server.close(r));}};
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(close);const base='http://127.0.0.1:'+server.address().port;
 function client(){const cookies=new Map();let csrf;return {async request(path,body){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...(body?{'Content-Type':'application/json',Origin:origin,'X-Demo-CSRF':csrf||''}:{})},...(body?{body:JSON.stringify(body)}:{})});for(const value of response.headers.getSetCookie()){const [k,v]=value.split(';')[0].split('=');cookies.set(k,v);}const data=await response.json();if(data.csrf)csrf=data.csrf;return {status:response.status,data};},async state(){return (await this.request('/api/northstar/state')).data;},async action(action,extra={}){const result=await this.request('/api/northstar/action',{action,...extra});assert.equal(result.status,200,JSON.stringify(result.data));return result.data;}};}
 async function begin(c,operation,subject,user,cloud){await c.request('/api/identity/context');const h=await c.request('/api/identity/handoff',{operation});assert.equal(h.status,200,JSON.stringify(h.data));const path='/api/identity/handoff/'+h.data.ticket;const p=await c.request(path+'/propose',{userIdentifier:subject,pub1:user.key,pub2:cloud.key,pub3:thirdFor(user).key,independentProvider:{identity:issuer,uri:issuer,seedVersion:'0'}});return {path,proposal:p,t:p.data.transaction};}
 function packet(t,user,cloud){return {response:signed(t,[user,cloud,...(t.context.signerPolicy.requiredRoles.includes('independent')?[thirdFor(user)]:[])]),newKeyProofs:[],enrollmentCertificate:['link','create_account'].includes(t.operation)?issueEnrollmentCertificate(t,{issuer,key:root.key,privateKey:root.privateKey,now:Math.floor(Date.now()/1000)}):null};}
 async function finish(c,h,user,cloud){assert.equal(h.proposal.status,200,JSON.stringify(h.proposal.data));assert.equal((await c.request(h.path+'/submit',packet(h.t,user,cloud))).status,200);const r=await c.request(h.path+'/finish',{});assert.equal(r.status,200,JSON.stringify(r.data));return r;}
 return {client,begin,packet,finish,close};
}
for(const algorithm of ['ed25519','ml-dsa-44','ml-dsa-65','ml-dsa-87'])test('native Northstar link/login/unlink with '+algorithm,async t=>{
 const f=await fixture(t),c=f.client(),other=f.client(),user=pair('user',algorithm),cloud=pair('cloud',algorithm),subject=random64(16);await c.state();
 const initial=await c.action('password-login',{email:'native@example.test',password:'demo'}),id=initial.account.id;await c.action('notes-save',{notes:'Preserve this note'});
 const link=await f.begin(c,'link',subject,user,cloud);assert.equal(link.t.operation,'link');assert.equal(link.t.context.localAccountID,id);
 await other.state();await other.request('/api/identity/context');assert.equal((await other.request(link.path+'/finish',{})).status,400);
 const bad=f.packet(link.t,user,cloud);bad.response.signatures.pop();assert.equal((await c.request(link.path+'/submit',bad)).status,400);assert.equal((await c.state()).account.linked,false);
 await f.finish(c,link,user,cloud);assert.equal((await c.state()).account.linked,true);
 await c.action('logout');const login=await f.begin(c,'discover',subject,user,cloud);assert.equal(login.t.operation,'login');await f.finish(c,login,user,cloud);assert.equal((await c.state()).account.id,id);
 const unlink=await f.begin(c,'unlink',subject,user,cloud);assert.equal(unlink.t.assurance.requiredLevel,4);assert.equal(unlink.t.context.bindingID,link.t.context.bindingID);
 const wrong=f.packet(unlink.t,pair('user',algorithm),cloud);assert.equal((await c.request(unlink.path+'/submit',wrong)).status,400);
 await f.finish(c,unlink,user,cloud);assert.equal((await c.state()).account,null);
 const back=await c.action('password-login',{email:'native@example.test',password:'demo'});assert.equal(back.account.id,id);assert.equal(back.account.notes,'Preserve this note');assert.equal(back.account.linked,false);
 assert.equal((await c.request(link.path+'/finish',{})).status,400,'old link cannot revive the binding');
});
test('native account, keyset and notes survive server restart and a new browser',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'northstar-native-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const config={database:join(directory,'demo.sqlite'),root:pair('provider','ml-dsa-87')};let f=await fixture(t,config),c=f.client();const user=pair('user'),cloud=pair('cloud'),subject=random64(16);
 await c.state();await c.action('password-login',{email:'persistent@example.test',password:'demo'});await c.action('notes-save',{notes:'Survives restart'});const link=await f.begin(c,'link',subject,user,cloud);await f.finish(c,link,user,cloud);const id=(await c.state()).account.id;await f.close();
 f=await fixture(t,config);c=f.client();await c.state();const login=await f.begin(c,'discover',subject,user,cloud);await f.finish(c,login,user,cloud);assert.equal((await c.state()).account.id,id);assert.equal((await c.state()).account.notes,'Survives restart');await f.close();
});
test('first Passli visit creates one native account; the old callback cannot authenticate',async t=>{
 const f=await fixture(t),c=f.client(),user=pair('user'),cloud=pair('cloud'),subject=random64(16);await c.state();const h=await f.begin(c,'discover',subject,user,cloud);assert.equal(h.t.operation,'create_account');await f.finish(c,h,user,cloud);assert.equal((await c.state()).account.linked,true);assert.equal((await c.request('/auth/passli/callback?code=old-token')).status,410);
 const created=(await c.state()).account;assert.match(created.email,/^passli-[a-z0-9_-]+@example\.test$/);
 await c.action('notes-save',{notes:'Created using Passli'});const unlink=await f.begin(c,'unlink',subject,user,cloud);await f.finish(c,unlink,user,cloud);
 const local=await c.action('password-login',{email:created.email,password:'demo'});assert.equal(local.account.id,created.id);assert.equal(local.account.notes,'Created using Passli');assert.equal(local.account.linked,false);
 const relink=await f.begin(c,'link',subject,user,cloud);await f.finish(c,relink,user,cloud);assert.equal((await c.state()).account.id,created.id);
});
test('cancellation and account switching fence a signed link; one account per identity',async t=>{
 const f=await fixture(t),c=f.client(),user=pair('user'),cloud=pair('cloud'),subject=random64(16);await c.state();await c.action('password-login',{email:'first@example.test',password:'demo'});
 const link=await f.begin(c,'link',subject,user,cloud);assert.equal((await c.request(link.path+'/submit',f.packet(link.t,user,cloud))).status,200);await c.action('cancel');assert.equal((await c.request(link.path+'/finish',{})).status,400);assert.equal((await c.state()).account.linked,false);
 const good=await f.begin(c,'link',subject,user,cloud);await f.finish(c,good,user,cloud);await c.action('logout');await c.action('password-login',{email:'second@example.test',password:'demo'});
 const duplicate=await f.begin(c,'link',subject,user,cloud);assert.equal(duplicate.proposal.status,400);assert.equal((await c.state()).account.linked,false);
});
