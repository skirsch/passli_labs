import {verifyCheckout} from './checkout.mjs';
import {verifyUnlink} from './unlink.mjs';
import {verifyDemoSignature} from './signature.mjs';
import https from 'node:https';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {random} from './model.mjs';
import {validatePiiRelease} from './pii.mjs';

export function providerRequest(url,{method='GET',body,timeout=5000}={}) {
  const target=new URL(url);if(target.protocol!=='https:')throw Error('Passli requires HTTPS.');
  return new Promise((resolve,reject)=>{
    const request=https.request(target,{method,agent:false,ALPNProtocols:['http/1.1'],headers:{Connection:'close','Accept-Encoding':'identity',...(body?{'Content-Type':'application/json'}:{})},signal:AbortSignal.timeout(timeout)},response=>{
      const chunks=[];let size=0;
      response.on('data',chunk=>{size+=chunk.length;if(size>131072)request.destroy(Error('Provider response too large.'));else chunks.push(chunk);});
      response.on('error',reject);response.on('end',()=>{try{const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(response.statusCode<200||response.statusCode>=300)throw Error('Passli could not authorize this request.');resolve(data);}catch(error){reject(error);}finally{request.destroy();}});
    });request.on('error',reject);request.end(body?JSON.stringify(body):undefined);
  });
}
export function verifyAssertion(token,jwks,{issuer,clientId,nonce,requiredLoA=1,now=Math.floor(Date.now()/1000)}) {
  if(typeof token!=='string'||token.length>12000)throw Error('Invalid Passli assertion.');
  const parts=token.split('.');if(parts.length!==3)throw Error('Invalid Passli assertion.');
  const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
  const key=jwks.keys?.find(k=>k.kid==='passli-fedcm-v1'&&k.kty==='OKP'&&k.crv==='Ed25519');
  if(!key||header.alg!=='EdDSA'||header.kid!=='passli-fedcm-v1'||header.typ!=='JWT'||!verify(null,Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw Error('Passli signature verification failed.');
  if(claims.iss!==issuer||claims.aud!==clientId||claims.nonce!==nonce||typeof claims.sub!=='string'||Buffer.from(claims.sub,'base64url').length!==32||Buffer.from(claims.sub,'base64url').toString('base64url')!==claims.sub)throw Error('Passli assertion does not match this login.');
  if(!Number.isInteger(claims.exp)||!Number.isInteger(claims.iat)||claims.exp<=now||claims.iat>now+30||claims.exp-claims.iat<=0||claims.exp-claims.iat>3600)throw Error('Passli assertion expired.');
  if(!Number.isInteger(claims.requiredLoA)||!Number.isInteger(claims.achievedLoA)||claims.requiredLoA<requiredLoA||claims.achievedLoA<claims.requiredLoA||claims.achievedLoA>6)throw Error('Passli assurance is insufficient.');
  if(claims.operation==='unlink'||claims.kind==='passli:unlink:v1')throw Error('An unlink proof cannot authorize login.');
  const capability=value=>typeof value==='string'&&/^(?:[A-Za-z0-9_-]{43}|[a-z0-9-]{1,32}\.[A-Za-z0-9_-]{39,220}\.[A-Za-z0-9_-]{43})$/.test(value);
  if(!capability(claims.gid)||!capability(claims.sid))throw Error('Missing Passli grant or session.');
  return claims;
}
export function createPassli({origin,issuer='https://api.passli.app',clientId='demo',request=providerRequest}={}) {
  const redirect=origin+'/auth/passli/callback';
  return {
    begin(proof) {
      if(proof.requiredLoA!==undefined&&![1,2,3,4,5].includes(proof.requiredLoA))throw Error('Invalid login assurance.');
      proof.state=random();proof.nonce=random();proof.verifier=random();
      const parameters=new URLSearchParams({client_id:clientId,redirect_uri:redirect,state:proof.state,nonce:proof.nonce,code_challenge:createHash('sha256').update(proof.verifier).digest('base64url'),code_challenge_method:'S256',required_loa:proof.action==='unlink'?'4':String(proof.requiredLoA??1),request_pii:proof.action==='register'?'true':'false',...(proof.action==='register'?{pii_flow:'inline'}:{}),...(proof.action==='unlink'?{operation:'unlink',unlink_subject:proof.subject,unlink_account:proof.accountId,unlink_binding:proof.bindingId}:{})});
      return issuer+'/direct/login?'+parameters;
    },
    async complete(proof,code) {
      const {token}=await request(issuer+'/direct/token',{method:'POST',body:{code,clientId,redirect,verifier:proof.verifier}});
      const jwks=await request(issuer+'/.well-known/jwks.json');
      if(proof.action==='unlink'){const fields=verifyUnlink(token,jwks,{clientId,nonce:proof.nonce,origin,subject:proof.subject,accountId:proof.accountId,bindingId:proof.bindingId});return {identity:fields.subject,unlinkVerified:true};}
      const claims=verifyAssertion(token,jwks,{issuer,clientId,nonce:proof.nonce,requiredLoA:proof.requiredLoA??1});
      const association={sessionId:claims.sid,clientId,subject:claims.sub,grantId:claims.gid};
      if(proof.action==='register'&&!validatePiiRelease(claims.piiRelease,origin)&&!claims.personalInformation)throw Error('Passli did not authorize personal information.');
      const status=await request(issuer+'/fedcm/session-status',{method:'POST',body:{...association,complete:true},timeout:3000});
      if(status.active!==true)throw Error('Passli authorization is no longer active.');
      return {identity:claims.sub,association,achievedLoA:claims.achievedLoA,...(proof.action==='register'?{personalInformation:claims.personalInformation,piiRelease:claims.piiRelease}:{})};
    },
    async createCheckout(association,order) {
      const nonce=random(),created=await request(issuer+'/fedcm/signatures/create',{method:'POST',body:{...association,checkout:order,json:{amount:order.maximumAmount,currency:'USD'},requiredLoA:1,nonce}});
      if(typeof created.requestId!=='string'||created.approvalUrl!=='https://passli.app/?signatureRequest='+created.requestId||typeof created.resultSecret!=='string'||!Number.isInteger(created.requestedAt)||created.expiresAt!==created.requestedAt+600)throw Error('Invalid checkout response.');
      return {...created,nonce,subject:association.subject,origin,order};
    },
    async createDemoApproval(association,details) {
      const nonce=random(),created=await request(issuer+'/fedcm/signatures/create',{method:'POST',body:{...association,...details,nonce}});
      if(typeof created.requestId!=='string'||created.approvalUrl!=='https://passli.app/?signatureRequest='+created.requestId||typeof created.resultSecret!=='string'||!Number.isInteger(created.requestedAt)||created.expiresAt!==created.requestedAt+600)throw Error('Invalid demo approval response.');
      return {...created,...details,nonce,subject:association.subject,origin};
    },
    async demoApprovalResult(proof) {
      const result=await request(issuer+'/fedcm/signatures/result',{method:'POST',body:{requestId:proof.requestId,resultSecret:proof.resultSecret}});
      if(result.pending||result.cancelled)return result;
      return {fields:verifyDemoSignature(result.result,await request(issuer+'/.well-known/jwks.json'),proof)};
    },
    async checkoutResult(proof) {
      const result=await request(issuer+'/fedcm/signatures/result',{method:'POST',body:{requestId:proof.requestId,resultSecret:proof.resultSecret}});
      if(result.pending||result.cancelled)return result;
      return {fields:verifyCheckout(result.result,await request(issuer+'/.well-known/jwks.json'),proof)};
    },
    async authorizeDisclosure(association,body) {
      const status=await request(issuer+'/fedcm/session-status',{method:'POST',body:{...association,piiRelease:{id:body.id,deliveryToken:body.deliveryToken}},timeout:3000});
      return status;
    },
    async status(association) {
      try {const status=await request(issuer+'/fedcm/session-status',{method:'POST',body:association,timeout:3000});return status.active===true?'active':status.suspended===true?'suspended':'terminated';}
      catch {return 'unavailable';}
    }
  };
}
