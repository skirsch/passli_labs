import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createPublicKey,createHash} from 'node:crypto';
import {createPassli,verifyAssertion} from '../passli.mjs';

const {privateKey}=generateKeyPairSync('ed25519');
const jwks={keys:[{...createPublicKey(privateKey).export({format:'jwk'}),kid:'passli-fedcm-v1'}]};
const base={iss:'https://api.passli.app',aud:'demo',sub:Buffer.alloc(32,1).toString('base64url'),nonce:'expected-nonce',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+60,requiredLoA:1,achievedLoA:2,gid:'primary.'+'a'.repeat(88)+'.'+'b'.repeat(43),sid:'primary.'+'c'.repeat(88)+'.'+'d'.repeat(43)};
function token(claims={},header={}) {const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),data=encode({alg:'EdDSA',kid:'passli-fedcm-v1',typ:'JWT',...header})+'.'+encode({...base,...claims});return data+'.'+sign(null,Buffer.from(data),privateKey).toString('base64url');}
const options={issuer:base.iss,clientId:'demo',nonce:base.nonce};
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
