// Dependency-free site verifier for the public unlink protocol.
import {createPublicKey,verify,createHash} from 'node:crypto';
export const unlinkDomain='passli:unlink:v1';
const fail=message=>Error(message);
export function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';return JSON.stringify(value);}
const signatureHash=fields=>createHash('sha256').update(canonical(fields),'utf8').digest('hex');
function verifyToken(token,jwks,{issuer,audience,nonce,now}){
 if(typeof token!=='string'||token.length>12000)throw fail('Invalid unlink assertion.');
 const parts=token.split('.');if(parts.length!==3)throw fail('Invalid unlink assertion.');
 const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
 const key=jwks.keys?.find(k=>k.kid==='passli-fedcm-v1'&&k.kty==='OKP'&&k.crv==='Ed25519');
 if(!key||header.alg!=='EdDSA'||header.kid!=='passli-fedcm-v1'||header.typ!=='JWT'||!verify(null,Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw fail('Unlink attestation verification failed.');
 if(claims.iss!==issuer||claims.aud!==audience||claims.nonce!==nonce||claims.exp<=now||!Number.isInteger(claims.exp)||!Number.isInteger(claims.iat)||claims.iat>now+30)throw fail('Unlink attestation expired or does not match this request.');
 return claims;
}
export function verifyUnlink(token,key,expected,now=Math.floor(Date.now()/1000)){
 const claims=verifyToken(token,key,{issuer:'https://api.passli.app',audience:expected.clientId,nonce:expected.nonce,now}),result=claims.unlinkProof,f=result?.fields;
 if(claims.kind!==unlinkDomain||claims.operation!=='unlink'||claims.sub!==expected.subject||!f)throw fail('An unlink signature is required.');
 for(const [name,value] of Object.entries({domain:unlinkDomain,operation:'unlink',audience:expected.origin,subject:expected.subject,accountId:expected.accountId,bindingId:expected.bindingId,nonce:expected.nonce}))if(f[name]!==value)throw fail('Unlink signature does not match the current binding.');
 if(!Number.isInteger(f.requiredLoA)||!Number.isInteger(f.achievedLoA)||f.requiredLoA<4||f.achievedLoA<f.requiredLoA||f.achievedLoA>6||claims.requiredLoA!==f.requiredLoA||claims.achievedLoA!==f.achievedLoA||claims.iat!==f.issuedAt||claims.exp!==f.expiresAt||f.expiresAt-f.issuedAt<=0||f.expiresAt-f.issuedAt>60)throw fail('Fresh LoA 4 unlink approval is required.');
 if(result.publicKey?.x!==expected.subject||result.publicKey?.kty!=='OKP'||result.publicKey?.crv!=='Ed25519'||result.publicKey?.d||result.encoding!=='passli-sorted-json-utf8-v1'||result.hashAlgorithm!=='SHA-256'||result.signatureAlgorithm!=='Ed25519-over-SHA256'||signatureHash(f)!==result.hash||createHash('sha256').update(canonical(result.publicKey)).digest('hex')!==result.keyId||!verify(null,Buffer.from(result.hash,'hex'),createPublicKey({key:result.publicKey,format:'jwk'}),Buffer.from(result.userSignature,'base64url')))throw fail('Unlink user signature verification failed.');
 return f;
}
