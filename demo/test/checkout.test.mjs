import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createDemo} from '../server.mjs';
import {freshWorld,act} from '../model.mjs';
import {checkoutAction,cartView,verifyCheckout} from '../checkout.mjs';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {canonical} from '../unlink.mjs';

test('server-owned $50 cart, cumulative purchases, one-use confirmation, cancellation, edit, account switch and expiry',()=>{
 const now=Date.now(),w=freshWorld(now);act(w,{action:'login',username:'qa@example.test',password:'demo'},now);
 const run=(action,extra={})=>checkoutAction(w,{action,checkoutId:w.checkout?.id,...extra},now);
 run('cart');assert.throws(()=>run('checkout-start'));
 for(let index=0;index<3;index++){
  run('cart-add');assert.equal(cartView(w).totalCents,5000);run('checkout-start');
  assert.throws(()=>run('purchase'));run('checkout-demo-approve');
  assert.equal(cartView(w).approval.requiredLoA,index===2?4:2);
  run('purchase');assert.equal(cartView(w).purchasedCents,(index+1)*5000);assert.throws(()=>run('purchase'));
 }
 run('cart-add');run('cart-add');assert.equal(cartView(w).totalCents,10000);run('cart-remove');assert.equal(cartView(w).totalCents,5000);
 run('checkout-start');run('checkout-demo-approve');run('cart-add');assert.throws(()=>run('purchase'));
 run('checkout-start');run('checkout-demo-approve');assert.throws(()=>checkoutAction(w,{action:'purchase',checkoutId:w.checkout.id},w.checkout.expires));
 run('checkout-cancel');run('checkout-start');assert.throws(()=>checkoutAction(w,{action:'checkout-demo-approve',checkoutId:w.checkout.id},now,{real:true}));
 const previous=w.checkout.id;act(w,{action:'logout'},now);assert.equal(cartView(w),null);act(w,{action:'login',username:'other@example.test',password:'demo'},now);assert.throws(()=>run('purchase',{checkoutId:previous}));
});

test('HTTP cart uses CSRF and session; real mode cannot simulate or use password-only checkout',async t=>{
 for(const mode of ['walkthrough','real']){
  const origin='http://127.0.0.1:18766',server=createDemo({origin,mode,provider:{status:async()=> 'active'}});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;let cookie='',state;
  const initial=await fetch(base+'/api/state');cookie=initial.headers.get('set-cookie').split(';')[0];state=await initial.json();
  const action=async(action,extra={},headers={})=>{const r=await fetch(base+'/api/action',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-Demo-CSRF':state.csrf,...headers},body:JSON.stringify({action,checkoutId:state.cart?.approval?.id,...extra})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const body=await r.json();state=body.state||state;return {r,body};};
  assert.equal((await action('cart')).r.status,409);assert.equal((await action('login',{username:'qa@example.test',password:'demo'})).r.status,200);
  assert.equal((await action('cart-add',{}, {'X-Demo-CSRF':'wrong'})).r.status,403);
  await action('cart');await action('cart-add');assert.equal(state.cart.totalCents,5000);
  const started=await action('checkout-start',{amount:'0.01',quantity:100});
  if(mode==='real'){assert.equal(started.r.status,409);assert.equal((await action('checkout-demo-approve')).r.status,409);continue;}
  assert.equal(started.r.status,200);await action('checkout-demo-approve');assert.equal(state.screen,'checkout-confirm');
  assert.equal((await action('purchase',{amount:'0.01'})).r.status,200);assert.equal(state.cart.receipt.totalCents,5000);assert.equal((await action('purchase')).r.status,409);
 }
});

function signedFixture(){
 const provider=generateKeyPairSync('ed25519'),user=generateKeyPairSync('ed25519'),publicKey=user.publicKey.export({format:'jwk'}),now=Math.floor(Date.now()/1000);
 const order={version:1,orderId:'order',quantity:1,unitAmount:'50.00',maximumAmount:'50.00',currency:'USD'};
 const expected={subject:publicKey.x,origin:'https://demo.passli.app',nonce:'n'.repeat(43),order,requestId:'r'.repeat(43),requestedAt:now,expiresAt:now+600};
 const selection={card:{recordId:'card',label:'My AMEX',last4:'1009'},address:{recordId:'home',label:'My home',street:'50 Example Street',city:'Example City',region:'CA',postalCode:'94000',country:'US'}};
 const fields={domain:'passli:text-approval:v1',contentType:'text/plain;charset=utf-8',audience:expected.origin,subject:expected.subject,requestId:expected.requestId,nonce:expected.nonce,requestedAt:now,issuedAt:now,expiresAt:now+600,requestedLoA:1,requiredLoA:4,achievedLoA:4,checkout:order,selection,json:{amount:'50.00',currency:'USD'},text:'Generated checkout summary'};
 const hash=createHash('sha256').update(canonical(fields)).digest('hex'),keyId=createHash('sha256').update(canonical(publicKey)).digest('hex'),userSignature=sign(null,Buffer.from(hash,'hex'),user.privateKey).toString('base64url');
 const claims={iss:'https://api.passli.app',aud:'demo',sub:expected.subject,nonce:expected.nonce,kind:fields.domain,requestId:expected.requestId,hash,keyId,userSignature,publicKey,achievedLoA:4,requiredLoA:4,iat:now,exp:now+600};
 const header=Buffer.from(JSON.stringify({alg:'EdDSA',kid:'passli-fedcm-v1',typ:'JWT'})).toString('base64url'),payload=Buffer.from(JSON.stringify(claims)).toString('base64url'),message=header+'.'+payload;
 return {result:{fields,publicKey,hash,keyId,userSignature,attestation:message+'.'+sign(null,Buffer.from(message),provider.privateKey).toString('base64url'),encoding:'passli-sorted-json-utf8-v1',hashAlgorithm:'SHA-256',signatureAlgorithm:'Ed25519-over-SHA256'},jwks:{keys:[{...provider.publicKey.export({format:'jwk'}),kid:'passli-fedcm-v1'}]},expected,now};
}
test('independent merchant verifies user signature, provider attestation, order, identity, selection, expiry and LoA',()=>{
 const f=signedFixture();assert.equal(verifyCheckout(f.result,f.jwks,f.expected,f.now).selection.card.label,'My AMEX');
 for(const changed of [{...f.expected,order:{...f.expected.order,maximumAmount:'0.01'}},{...f.expected,subject:'wrong'},{...f.expected,nonce:'wrong'},{...f.expected,requestId:'wrong'}])assert.throws(()=>verifyCheckout(f.result,f.jwks,changed,f.now));
 for(const patch of [{selection:{...f.result.fields.selection,card:{recordId:'c',label:'Other card',last4:'0000'}}},{achievedLoA:1},{json:{amount:'1.00',currency:'USD'}}])assert.throws(()=>verifyCheckout({...f.result,fields:{...f.result.fields,...patch}},f.jwks,f.expected,f.now));
 assert.throws(()=>verifyCheckout(f.result,f.jwks,f.expected,f.now+601));assert.throws(()=>verifyCheckout({...f.result,userSignature:'bad'},f.jwks,f.expected,f.now));
});
