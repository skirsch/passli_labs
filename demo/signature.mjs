// Independent RP verifier: exact fields, pairwise identity signature and provider attestation.
import {createHash,createPublicKey,verify} from 'node:crypto';
import {canonical} from './unlink.mjs';
export function verifyDemoSignature(result,jwks,expected,now=Math.floor(Date.now()/1000)){
 const f=result?.fields,fail=()=>{throw Error('Passli signature does not match this demo request.');};
 if(!f||f.domain!=='passli:text-approval:v1'||f.contentType!=='text/plain;charset=utf-8')fail();
 for(const name of ['text','nonce','subject','requestId','requestedAt','expiresAt'])if(f[name]!==expected[name])fail();
 if(f.audience!==expected.origin||f.requestedLoA!==expected.requiredLoA||canonical(f.json??null)!==canonical(expected.json??null)||(f.verificationCode??null)!==(expected.verificationCode??null)||f.checkout)fail();
 if(!Number.isInteger(f.issuedAt)||f.issuedAt<f.requestedAt||f.issuedAt>now+30||f.expiresAt<=now||f.expiresAt-f.requestedAt!==600||!Number.isInteger(f.requiredLoA)||!Number.isInteger(f.achievedLoA)||f.requiredLoA<expected.requiredLoA||f.achievedLoA<f.requiredLoA||f.achievedLoA>5)fail();
 const hash=createHash('sha256').update(canonical(f)).digest('hex');
 if(result.encoding!=='passli-sorted-json-utf8-v1'||result.hashAlgorithm!=='SHA-256'||result.signatureAlgorithm!=='Ed25519-over-SHA256'||result.hash!==hash||result.publicKey?.x!==expected.subject||result.publicKey.kty!=='OKP'||result.publicKey.crv!=='Ed25519'||result.publicKey.d||result.keyId!==createHash('sha256').update(canonical(result.publicKey)).digest('hex'))fail();
 if(!verify(null,Buffer.from(hash,'hex'),createPublicKey({key:result.publicKey,format:'jwk'}),Buffer.from(result.userSignature,'base64url')))fail();
 const parts=result.attestation?.split('.');if(parts?.length!==3)fail();
 const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url')),key=jwks.keys?.find(k=>k.kid==='passli-fedcm-v1'&&k.kty==='OKP'&&k.crv==='Ed25519');
 if(!key||header.alg!=='EdDSA'||header.typ!=='JWT'||header.kid!==key.kid||!verify(null,Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')))fail();
 for(const [name,value]of Object.entries({iss:'https://api.passli.app',aud:'demo',sub:f.subject,nonce:f.nonce,iat:f.issuedAt,exp:f.expiresAt,kind:f.domain,requestId:f.requestId,hash,keyId:result.keyId,userSignature:result.userSignature,requiredLoA:f.requiredLoA,achievedLoA:f.achievedLoA}))if(claims[name]!==value)fail();
 if(canonical(claims.publicKey)!==canonical(result.publicKey))fail();return f;
}
