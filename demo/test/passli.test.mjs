import {canonical,verifyUnlink} from '../unlink.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createPublicKey,createHash} from 'node:crypto';
import {createPassli,verifyAssertion} from '../passli.mjs';

const {privateKey}=generateKeyPairSync('ed25519');
const jwks={keys:[{...createPublicKey(privateKey).export({format:'jwk'}),kid:'passli-fedcm-v1'}]};
const base={iss:'https://api.passli.app',aud:'demo',sub:Buffer.alloc(32,1).toString('base64url'),nonce:'expected-nonce',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+60,requiredLoA:1,achievedLoA:2,gid:'primary.'+'a'.repeat(88)+'.'+'b'.repeat(43),sid:'primary.'+'c'.repeat(88)+'.'+'d'.repeat(43)};
function token(claims={},header={}) {const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),data=encode({alg:'EdDSA',kid:'passli-fedcm-v1',typ:'JWT',...header})+'.'+encode({...base,...claims});return data+'.'+sign(null,Buffer.from(data),privateKey).toString('base64url');}
const options={issuer:base.iss,clientId:'demo',nonce:base.nonce};
test('only registration requests personal information in the Passli consent UI',()=>{
 const provider=createPassli({origin:'https://demo.passli.app'});
 for(const action of ['login','link','register'])assert.equal(new URL(provider.begin({action})).searchParams.get('request_pii'),action==='register'?'true':'false');
});
test('verifier rejects signature, identity, transaction, lifetime and assurance mismatches',()=>{
  assert.equal(verifyAssertion(token(),jwks,options).sub,base.sub);
  for(const claims of [{iss:'https://evil.test'},{aud:'rp1'},{nonce:'wrong'},{sub:'invalid'},{exp:1},{iat:base.iat+40},{exp:base.iat+3601},{achievedLoA:0},{requiredLoA:3},{gid:''},{sid:'unbounded!'},{gid:'raw-account~'+'x'.repeat(43)},{sid:'primary.short.'+'x'.repeat(43)}])assert.throws(()=>verifyAssertion(token(claims),jwks,options));
  for(const header of [{alg:'none'},{kid:'other'},{typ:'other'}])assert.throws(()=>verifyAssertion(token({},header),jwks,options));
  assert.throws(()=>verifyAssertion(token().slice(0,-10)+'x',jwks,options));
});
test('Direct adapter binds S256 PKCE, exact redirect, nonce and live grant confirmation',async()=>{
  const calls=[],proof={id:'pending'};
  const provider=createPassli({origin:'https://demo.passli.app',request:async(url,options={})=>{
    calls.push({url,...options});
    if(url.endsWith('/direct/token'))return {token:token({nonce:proof.nonce})};
    if(url.endsWith('/jwks.json'))return jwks;
    return {active:true};
  }});
  const url=new URL(provider.begin(proof));assert.equal(url.searchParams.get('client_id'),'demo');assert.equal(url.searchParams.get('redirect_uri'),'https://demo.passli.app/auth/passli/callback');
  assert.equal(url.searchParams.get('code_challenge'),createHash('sha256').update(proof.verifier).digest('base64url'));
  const result=await provider.complete(proof,'one-use-code');assert.equal(result.identity,base.sub);assert.equal(calls.length,3);assert.equal(calls[2].body.complete,true);
  assert.equal(calls[2].body.subject,base.sub);assert.equal(calls[0].body.verifier,proof.verifier);
});


test('unlink verifier requires both signatures, operation and exact binding at LoA4; adapter never treats login as unlink',async()=>{
 const user=generateKeyPairSync('ed25519'),publicKey=user.publicKey.export({format:'jwk'}),origin='https://demo.passli.app';
 const proof={action:'unlink',subject:publicKey.x,accountId:Buffer.alloc(32,2).toString('base64url'),bindingId:Buffer.alloc(32,3).toString('base64url')};
 let supplied;
 const provider=createPassli({origin,request:async url=>url.endsWith('/jwks.json')?jwks:{token:supplied}});
 const url=new URL(provider.begin(proof));assert.equal(url.searchParams.get('operation'),'unlink');assert.equal(url.searchParams.get('required_loa'),'4');assert.equal(url.searchParams.get('unlink_subject'),proof.subject);
 const now=Math.floor(Date.now()/1000),fields={domain:'passli:unlink:v1',operation:'unlink',audience:origin,subject:proof.subject,accountId:proof.accountId,bindingId:proof.bindingId,nonce:proof.nonce,requiredLoA:4,achievedLoA:4,issuedAt:now,expiresAt:now+60};
 const hash=createHash('sha256').update(canonical(fields)).digest('hex'),unlinkProof={fields,hash,hashAlgorithm:'SHA-256',encoding:'passli-sorted-json-utf8-v1',signatureAlgorithm:'Ed25519-over-SHA256',publicKey,keyId:createHash('sha256').update(canonical(publicKey)).digest('hex'),userSignature:sign(null,Buffer.from(hash,'hex'),user.privateKey).toString('base64url')};
 const claims={kind:'passli:unlink:v1',operation:'unlink',sub:proof.subject,nonce:proof.nonce,requiredLoA:4,achievedLoA:4,iat:now,exp:now+60,unlinkProof};
 supplied=token(claims);assert.equal((await provider.complete(proof,'code')).unlinkVerified,true);
 assert.throws(()=>verifyAssertion(supplied,jwks,{...options,nonce:proof.nonce}));
 const expected={clientId:'demo',origin,subject:proof.subject,accountId:proof.accountId,bindingId:proof.bindingId,nonce:proof.nonce};
 for(const [field,value]of Object.entries({clientId:'rp1',origin:'https://evil.test',subject:base.sub,accountId:'other',bindingId:'replacement',nonce:'wrong'}))assert.throws(()=>verifyUnlink(supplied,jwks,{...expected,[field]:value}));
 for(const change of [{kind:'login'},{requiredLoA:3,achievedLoA:3},{unlinkProof:{...unlinkProof,userSignature:'forged'}},{unlinkProof:{...unlinkProof,fields:{...fields,operation:'login'}}},{exp:now-1}])assert.throws(()=>verifyUnlink(token({...claims,...change}),jwks,expected));
 supplied=token({nonce:proof.nonce});await assert.rejects(provider.complete(proof,'login-code'));
});
