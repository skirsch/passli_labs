import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createDemo} from '../server.mjs';
import {wireDetails} from '../suite.mjs';
import {verifyDemoSignature} from '../signature.mjs';
import {canonical} from '../unlink.mjs';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';

test('wire policy uses exact cent boundaries and rejects invalid amounts',()=>{
 for(const [amount,loa]of [['0.01',3],['999.99',3],['1000',4],['5000.00',4],['5000.01',5]])assert.equal(wireDetails(amount).requiredLoA,loa);
 for(const amount of ['0','-1','1e3','NaN','Infinity','1000.001','1,000',1000])assert.throws(()=>wireDetails(amount));
 assert.equal(wireDetails().json.amount,'1000.00');assert.match(wireDetails().text,/OpenAI.*000000000.*000123456789/);
});

test('suite pages, isolated login, CSRF, signed code request and one-use results',async t=>{
 let clock=Date.now(),count=0,created;
 const provider={begin:proof=>{proof.state='login-state';return 'https://api.passli.app/direct/login?state='+proof.state;},complete:async()=>({association:{subject:'site-identity'}}),status:async()=> 'active',createDemoApproval:async(_,details)=>{created=details;return {...details,requestId:'request-'+ ++count,approvalUrl:'https://passli.app/?signatureRequest=request-'+count,expiresAt:Math.floor(clock/1000)+600};},demoApprovalResult:async proof=>({fields:{...proof,requiredLoA:proof.requiredLoA,achievedLoA:proof.requiredLoA}})};
 const origin='http://localhost:18766',server=createDemo({mode:'real',origin,provider,now:()=>clock});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));const base='http://127.0.0.1:'+server.address().port;
 const home=await(await fetch(base+'/')).text();for(const path of ['northstar','tv','schwab','wire']){assert.match(home,new RegExp('href="/'+path+'/"'));assert.match(await(await fetch(base+'/'+path+'/')).text(),/Passli Demo Home/);}
 let response=await fetch(base+'/api/demo-suite/state'),cookie=response.headers.get('set-cookie').split(';')[0],state=await response.json();
 const post=async(action,extra={},headers={})=>{const response=await fetch(base+'/api/demo-suite/'+action,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json','X-Demo-CSRF':state.csrf,...headers},body:JSON.stringify({demo:'schwab',...extra})});return {response,body:await response.json()};};
 assert.equal((await post('start')).response.status,400);assert.equal((await post('login',{}, {'X-Demo-CSRF':'wrong'})).response.status,403);
 const login=await post('login');assert.match(login.body.redirect,/state=suite.login-state/);
 response=await fetch(base+'/auth/passli/callback?state=suite.login-state&code=code',{headers:{Cookie:cookie},redirect:'manual'});assert.equal(response.headers.get('location'),'/schwab/');
 const started=await post('start');assert.match(started.body.code,/^\d{2}$/);assert.equal(created.requiredLoA,4);assert.equal(created.verificationCode,started.body.code);
 assert.equal((await post('start')).response.status,400);assert.equal((await post('result',{demo:'wire',requestId:'request-1'})).response.status,400);
 const completed=await post('result',{requestId:'request-1'});assert.equal(completed.body.verified,true);assert.equal((await post('result',{requestId:'request-1'})).response.status,400);
 assert.equal((await post('start',{demo:'wire',amount:'5000.01',requiredLoA:1})).response.status,200);assert.equal(created.requiredLoA,5);assert.equal(created.json.amount,'5000.01');
 clock+=1800001;assert.equal((await post('result',{demo:'wire',requestId:'request-2'})).response.status,403);
});

test('independent verifier rejects code, wire, identity, LoA and attestation changes',()=>{
 const user=generateKeyPairSync('ed25519'),provider=generateKeyPairSync('ed25519'),publicKey=user.publicKey.export({format:'jwk'}),providerJwk={...provider.publicKey.export({format:'jwk'}),kid:'passli-fedcm-v1'},now=Math.floor(Date.now()/1000);
 const expected={text:'Verify this call only.',nonce:'n'.repeat(43),subject:publicKey.x,requestId:'request',requestedAt:now,expiresAt:now+600,origin:'https://demo.passli.app',requiredLoA:4,verificationCode:'07'};
 const fields={...expected,audience:expected.origin,domain:'passli:text-approval:v1',contentType:'text/plain;charset=utf-8',requestedLoA:4,achievedLoA:4,issuedAt:now};delete fields.origin;
 const hash=createHash('sha256').update(canonical(fields)).digest('hex'),keyId=createHash('sha256').update(canonical(publicKey)).digest('hex'),userSignature=sign(null,Buffer.from(hash,'hex'),user.privateKey).toString('base64url');
 const claims={iss:'https://api.passli.app',aud:'demo',sub:fields.subject,nonce:fields.nonce,iat:now,exp:now+600,kind:fields.domain,requestId:fields.requestId,hash,keyId,userSignature,requiredLoA:4,achievedLoA:4,publicKey};
 const token=[{alg:'EdDSA',typ:'JWT',kid:'passli-fedcm-v1'},claims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
 const result={fields,hash,keyId,publicKey,userSignature,attestation:token+'.'+sign(null,Buffer.from(token),provider.privateKey).toString('base64url'),encoding:'passli-sorted-json-utf8-v1',hashAlgorithm:'SHA-256',signatureAlgorithm:'Ed25519-over-SHA256'};
 assert.equal(verifyDemoSignature(result,{keys:[providerJwk]},expected).verificationCode,'07');
 for(const change of [{verificationCode:'08'},{subject:'other'},{text:'Approve wire'},{requiredLoA:3},{json:{amount:'1000',currency:'USD'}},{expiresAt:now}])assert.throws(()=>verifyDemoSignature({...result,fields:{...fields,...change}},{keys:[providerJwk]},expected));
 assert.throws(()=>verifyDemoSignature({...result,attestation:token+'.AA'},{keys:[providerJwk]},expected));
});
