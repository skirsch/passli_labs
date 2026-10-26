import {createHash,createPublicKey,verify} from 'node:crypto';
import {canonical} from './unlink.mjs';
import {random,authorizedAccount} from './model.mjs';

const fail=message=>{throw Object.assign(Error(message),{status:409});};
export const money=cents=>'$'+(cents/100).toFixed(2);
export function cartView(world){
 const account=authorizedAccount(world);if(!account)return null;
 const cart=account.cart||{quantity:0,revision:0};
 const approval=world.checkout?.accountId===account.id&&world.checkout.sessionId===world.session.id?world.checkout:null;
 return {...cart,totalCents:cart.quantity*5000,purchasedCents:account.purchasedCents||0,approval:approval?{id:approval.id,status:approval.status,expires:approval.expires,approvalUrl:approval.proof?.approvalUrl,requestId:approval.proof?.requestId,selection:approval.selection,requiredLoA:approval.requiredLoA,achievedLoA:approval.achievedLoA}:null,receipt:account.receipt||null};
}
export function checkoutAction(world,body,now,{real=false}={}){
 const account=authorizedAccount(world);if(!account)fail('Sign in before opening your cart.');
 const cart=account.cart??={quantity:0,revision:0};
 if(body.action==='cart'){world.screen='cart';return;}
 if(['cart-add','cart-remove'].includes(body.action)){
  const quantity=cart.quantity+(body.action==='cart-add'?1:-1);if(quantity<0||quantity>100)fail('Choose between 0 and 100 items.');
  cart.quantity=quantity;cart.revision++;world.checkout=null;world.screen='cart';return;
 }
 if(body.action==='checkout-start'){
  if(!cart.quantity)fail('Add an item to your cart first.');
  if(real&&(world.session.method!=='passli'||world.providerStatus!=='active'))fail('Sign in with Passli before checkout.');
  if(world.checkout?.status==='pending'&&world.checkout.expires>now)fail('Finish or cancel your current checkout first.');
  const id=random(),order={version:1,orderId:id,quantity:cart.quantity,unitAmount:'50.00',maximumAmount:(cart.quantity*50).toFixed(2),currency:'USD'};
  world.checkout={id,order,accountId:account.id,sessionId:world.session.id,revision:cart.revision,expires:Math.min(now+600000,account.expiresAt,world.session.expires),status:'pending'};
  world.screen='checkout-wait';return;
 }
 const approval=world.checkout;
 if(body.action==='checkout-cancel'){world.checkout=null;world.screen='cart';return;}
 if(!approval||approval.id!==body.checkoutId||approval.accountId!==account.id||approval.sessionId!==world.session.id||approval.revision!==cart.revision||approval.expires<=now)fail('Checkout changed or expired. Start again from your cart.');
 if(body.action==='checkout-demo-approve'){
  if(real)fail('Simulated checkout approval is unavailable in real mode.');
  if(approval.status!=='pending')fail('Approval already completed.');
  const used=account.demoAuthorizedCents||0,over=used+cart.quantity*5000>10000;
  approval.selection={card:{recordId:'fictional-amex',label:'My AMEX',last4:'1009'},address:{recordId:'fictional-home',label:'My home',street:'50 Example Street',city:'Example City',region:'CA',postalCode:'94000',country:'US'}};
  approval.requiredLoA=over?4:2;approval.achievedLoA=approval.requiredLoA;
  account.demoAuthorizedCents=over?0:used+cart.quantity*5000;
  approval.status='approved';world.screen='checkout-confirm';return;
 }
 if(body.action==='purchase'){
  if(approval.status!=='approved'||!approval.selection)fail('Approve this order in Passli before purchasing.');
  account.purchasedCents=(account.purchasedCents||0)+cart.quantity*5000;
  account.receipt={id:approval.id,totalCents:cart.quantity*5000,quantity:cart.quantity,card:approval.selection.card.label,address:approval.selection.address.label,requiredLoA:approval.requiredLoA,achievedLoA:approval.achievedLoA};
  cart.quantity=0;cart.revision++;world.checkout=null;world.screen='purchase-complete';return;
 }
 if(body.action==='checkout-status')return;
 fail('Unknown checkout action.');
}

// Both the provider attestation and pairwise user signature must bind the exact
// server-owned cart. Popup messages and client supplied amounts grant no authority.
export function verifyCheckout(result,jwks,expected,now=Math.floor(Date.now()/1000)){
 const f=result?.fields,token=result?.attestation;
 if(!f||typeof token!=='string'||token.length>16000)fail('Missing checkout proof.');
 const parts=token.split('.');if(parts.length!==3)fail('Invalid checkout proof.');
 const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
 const key=jwks.keys?.find(k=>k.kid==='passli-fedcm-v1'&&k.kty==='OKP'&&k.crv==='Ed25519');
 if(!key||header.alg!=='EdDSA'||header.typ!=='JWT'||header.kid!==key.kid||!verify(null,Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')))fail('Checkout attestation failed.');
 for(const [name,value]of Object.entries({iss:'https://api.passli.app',aud:'demo',sub:expected.subject,nonce:expected.nonce,kind:'passli:text-approval:v1',requestId:expected.requestId,hash:result.hash,keyId:result.keyId,userSignature:result.userSignature,achievedLoA:f.achievedLoA,requiredLoA:f.requiredLoA,iat:f.issuedAt,exp:f.expiresAt}))if(claims[name]!==value)fail('Checkout attestation changed.');
 if(canonical(claims.publicKey)!==canonical(result.publicKey)||canonical(f.checkout)!==canonical(expected.order)||canonical(f.json)!==canonical({amount:expected.order.maximumAmount,currency:'USD'})||f.contentType!=='text/plain;charset=utf-8'||f.domain!=='passli:text-approval:v1'||f.audience!==expected.origin||f.subject!==expected.subject||f.nonce!==expected.nonce||f.requestId!==expected.requestId||f.requestedLoA!==1||f.requestedAt!==expected.requestedAt||f.expiresAt!==expected.expiresAt||!Number.isInteger(f.issuedAt)||f.issuedAt<f.requestedAt||f.issuedAt>now+30||f.expiresAt<=now||!Number.isInteger(f.requiredLoA)||!Number.isInteger(f.achievedLoA)||f.requiredLoA<1||f.achievedLoA<f.requiredLoA||f.achievedLoA>6)fail('Checkout order, identity, lifetime or LoA changed.');
 const card=f.selection?.card,address=f.selection?.address;
 const readable=v=>typeof v==='string'&&v.trim()&&v.length<=512&&!/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(v);
 if(!card||!address||Object.keys(card).sort().join(',')!=='label,last4,recordId'||Object.keys(address).sort().join(',')!=='city,country,label,postalCode,recordId,region,street'||!readable(card.recordId)||!readable(card.label)||!/^\d{4}$/.test(card.last4)||Object.values(address).some(v=>!readable(v)))fail('Checkout selection is invalid.');
 if(result.publicKey?.x!==expected.subject||result.publicKey.kty!=='OKP'||result.publicKey.crv!=='Ed25519'||result.publicKey.d||result.hashAlgorithm!=='SHA-256'||result.signatureAlgorithm!=='Ed25519-over-SHA256'||result.encoding!=='passli-sorted-json-utf8-v1'||createHash('sha256').update(canonical(f)).digest('hex')!==result.hash||createHash('sha256').update(canonical(result.publicKey)).digest('hex')!==result.keyId||!verify(null,Buffer.from(result.hash,'hex'),createPublicKey({key:result.publicKey,format:'jwk'}),Buffer.from(result.userSignature,'base64url')))fail('Checkout user signature failed.');
 return f;
}
