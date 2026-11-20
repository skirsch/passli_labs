import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {canonical,decode64,parseWire,site,reject} from '../../packages/identity-protocol/encoding.mjs';
import {validateLoginChallenge} from '../../packages/identity-protocol/fast-login.mjs';
import QRCode from 'qrcode';
import {captureRPTiming} from './native-rp-timing.mjs';

// Same-origin browser completion. A valid proof packet alone cannot log a
// different browser in: its server-issued HttpOnly cookie must bind the signed
// transaction. The caller installs this handler before any legacy login routes.
export function createNativeRPHttp({operations,origin,cookieKey,localSessionFor}){
 site(origin);const key=Buffer.from(cookieKey||[]);if(key.length!==32)throw Error('A persistent 32-byte RP cookie key is required.');
 const contextCookie='__Host-passli-context',sessionCookie='__Host-passli-session';
 const cookie=(req,name)=>{const values=String(req.headers.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));return values.length===1?values[0].slice(name.length+1):null;};
 const mac=value=>createHmac('sha256',key).update('passli:rp-browser-context:v1\0'+value).digest();
 const context=req=>{try{const raw=cookie(req,contextCookie),parts=raw?.split('.');if(parts?.length!==2)return null;const [value,signature]=parts;decode64(value,32);const supplied=Buffer.from(decode64(signature,32));return timingSafeEqual(mac(value),supplied)?value:null;}catch{return null;}};
 const header=(name,value,maxAge)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
 const challengeMac=value=>createHmac('sha256',key).update('passli:fast-login-challenge:v1\0'+canonical(value)).digest();
 function bootstrap(req,res){
  const value=context(req)||randomBytes(32).toString('base64url'),issuedAt=Math.floor(Date.now()/1000);
  res.setHeader('Set-Cookie',header(contextCookie,value+'.'+mac(value).toString('base64url'),3600));
  const c={domain:'passli:fast-login-challenge:v1',site:origin,requestID:randomBytes(16).toString('base64url'),nonce:randomBytes(32).toString('base64url'),sessionBinding:value,issuedAt,expiresAt:issuedAt+600};
  return {...c,seal:challengeMac(c).toString('base64url')};
 }
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(value));};
 async function body(req){if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw Error('CONTENT_TYPE');let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>262144)throw Error('BODY_LIMIT');chunks.push(chunk);}return parseWire(Buffer.concat(chunks).toString('utf8'));}
 const waiters=new Map();
 const notify=ticket=>{for(const done of waiters.get(ticket)||[])done();};
 const wait=(ticket,stage,req)=>new Promise(resolve=>{
  if(operations.handoff(ticket).stage!==stage){resolve();return;}
  const pending=waiters.get(ticket)||new Set();if(pending.size>=4)throw Error('WAIT_LIMIT');waiters.set(ticket,pending);
  const done=()=>{clearTimeout(timer);req.off('aborted',done);pending.delete(done);if(!pending.size)waiters.delete(ticket);resolve();};
  const timer=setTimeout(done,55000);timer.unref?.();pending.add(done);req.once('aborted',done);
 });
 return {
  bootstrap,
  close:()=>{key.fill(0);for(const ticket of waiters.keys())notify(ticket);},
  async handle(req,res){
   const requestStarted=performance.now();
   const url=new URL(req.url,origin),path=url.pathname;
   const handoff=/^\/api\/identity\/handoff(?:\/([A-Za-z0-9_-]{43})(?:\/(propose|disclose|submit|finish|cancel))?)?$/.exec(path);
   const receipt=/^\/api\/identity\/completion\/([A-Za-z0-9_-]{22})$/.exec(path);
   const deletion=/^\/api\/identity\/deletion\/([A-Za-z0-9_-]{22})$/.exec(path);
   const demoDelete=path==='/api/identity/delete-account'&&['https://rp1.passli.app','https://rp2.passli.app'].includes(origin);
   if(!handoff&&!receipt&&!deletion&&!demoDelete&&!['/api/identity/context','/api/identity/challenge','/api/identity/complete','/api/identity/fast-complete','/api/identity/session','/api/identity/logout'].includes(path))return false;
   try{
    if(handoff){
     const [,ticket,action]=handoff;
     // Passli may read/propose/submit a ticket directly, without RP cookies.
     // Finishing a session remains same-origin and browser-cookie bound.
     // The disclosure endpoint is separately write-only.
     // It uses the unguessable handoff ticket and a digest bound by all signatures,
     // never browser cookies; values are not readable through this endpoint.
     const browserHandoff=ticket&&(!action||['propose','submit'].includes(action))&&req.headers.origin==='https://passli.app';
     if(browserHandoff){res.setHeader('Access-Control-Allow-Origin','https://passli.app');res.setHeader('Vary','Origin');if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET, POST');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Max-Age','600');res.writeHead(204);res.end();return true;}}
     if(ticket&&action==='disclose'){
      res.setHeader('Access-Control-Allow-Origin','*');
      if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.writeHead(204);res.end();return true;}
     }else if(!browserHandoff&&req.headers.origin&&req.headers.origin!==origin){json(res,403,{error:'IDENTITY_ORIGIN_DENIED'});return true;}
     if(req.method==='GET'&&ticket&&!action){
      const pending=operations.handoff(ticket);const stage=url.searchParams.get('wait');
      if(stage&&pending.stage===stage)await wait(ticket,stage,req);
      if(!res.destroyed){const current=operations.handoff(ticket);json(res,200,{origin,stage:current.stage,expires:current.expires,transaction:current.transaction,requestedOperation:current.requestedOperation,userIdentifier:current.userIdentifier,requestedKeyCount:current.requestedKeyCount??2,requestedAlgorithms:current.requestedAlgorithms??null,requestPersonalInformation:current.requestPersonalInformation===true,requestedAlgorithm:current.requestedAlgorithm??null});}return true;
     }
     if(req.method!=='POST'){json(res,405,{error:'METHOD_NOT_ALLOWED'});return true;}
     const input=await body(req);
     if(!ticket){const binding=context(req);if(req.headers.origin!==origin||!binding){json(res,403,{error:'IDENTITY_BROWSER_CONTEXT_REQUIRED'});return true;}const sessionToken=cookie(req,sessionCookie);let localSession=null;if(sessionToken)try{localSession=operations.session(sessionToken);}catch{}if(localSessionFor)localSession=localSessionFor(req,binding);const started=operations.startHandoff(binding,input,localSession),link='passli://rp-login?'+new URLSearchParams({origin,ticket:started.ticket});json(res,200,{...started,link,qr:await QRCode.toDataURL(link,{width:320,margin:4})});return true;}
     if(action==='propose'){json(res,200,{transaction:await operations.proposeHandoff(ticket,input)});notify(ticket);return true;}
     if(action==='disclose'){json(res,200,operations.discloseHandoff(ticket,input));return true;}
     if(action==='submit'){json(res,200,await operations.submitHandoff(ticket,input));notify(ticket);return true;}
     const binding=context(req);if(req.headers.origin!==origin||!binding){json(res,403,{error:'IDENTITY_BROWSER_CONTEXT_REQUIRED'});return true;}
     if(action==='finish'){
      const result=await operations.finishHandoff(ticket,binding,{createAccount:input.createAccount===true});if(result.sessionToken)res.setHeader('Set-Cookie',header(sessionCookie,result.sessionToken,3600));else res.setHeader('Set-Cookie',header(sessionCookie,'',0));
      json(res,200,{binding:result.binding,sessionEstablished:!!result.sessionToken,session:result.sessionToken?operations.session(result.sessionToken):null});notify(ticket);return true;
     }
     if(action==='cancel'){json(res,200,operations.cancelHandoff(ticket,binding));notify(ticket);return true;}
     json(res,405,{error:'METHOD_NOT_ALLOWED'});return true;
    }
    if(req.method==='GET'&&receipt){const result=operations.completion(receipt[1]);json(res,result?200:404,result||{error:'IDENTITY_COMPLETION_PENDING'});return true;}
    if(req.method==='GET'&&deletion){json(res,200,operations.deletion(deletion[1],{includeRegistration:url.searchParams.get('includeRegistration')==='true'}));return true;}
    if(req.method==='GET'&&path==='/api/identity/context'){
     if(req.headers['sec-fetch-site']==='cross-site'){json(res,403,{error:'IDENTITY_ORIGIN_DENIED'});return true;}
     // Do not rotate an existing context: parallel tabs may have pending proofs.
     const value=context(req)||randomBytes(32).toString('base64url');
     res.setHeader('Set-Cookie',header(contextCookie,value+'.'+mac(value).toString('base64url'),3600));json(res,200,{sessionBinding:value});return true;
    }
    if(req.method==='GET'&&path==='/api/identity/session'){
     if(req.headers['sec-fetch-site']!=='cross-site'&&!context(req)){const value=randomBytes(32).toString('base64url');res.setHeader('Set-Cookie',header(contextCookie,value+'.'+mac(value).toString('base64url'),3600));}
     const token=cookie(req,sessionCookie);let session=null;if(token)try{session=operations.session(token);}catch{}
     const fastChallenge=req.headers['sec-fetch-site']!=='cross-site'?bootstrap(req,res):null;
     json(res,200,{session,...(fastChallenge?{fastChallenge}:{})});return true;
    }
    if(req.method!=='POST'||req.headers.origin!==origin){json(res,403,{error:'IDENTITY_ORIGIN_DENIED'});return true;}
    const binding=context(req);if(!binding){json(res,403,{error:'IDENTITY_BROWSER_CONTEXT_REQUIRED'});return true;}
    const bodyStarted=performance.now(),input=await body(req),bodyFinished=performance.now();
    if(path==='/api/identity/fast-complete'){
     const c=validateLoginChallenge(input.challenge,Math.floor(Date.now()/1000)),{seal,...value}=c;
     if(c.site!==origin||c.sessionBinding!==binding||!timingSafeEqual(challengeMac(value),Buffer.from(decode64(seal,32)))){json(res,403,{error:'IDENTITY_CHALLENGE_INVALID'});return true;}
     const requested=input.requestedKeyCount??2,t=input.packet?.response?.transaction;
     if(![1,2,3].includes(requested)||!t?.context?.signerPolicy||t.context.signerPolicy.requiredRoles.length<requested)reject('IDENTITY_SIGNER_POLICY_INVALID');
     if(input.requestedAlgorithms){for(const role of t.context.signerPolicy.requiredRoles){const selected=input.requestedAlgorithms[role],actual=t.context.algorithmPolicy.selectedAlgorithms?.[role]??t.context.algorithmPolicy.selectedAlgorithm;if(!selected||selected!==actual)reject('IDENTITY_ALGORITHM_MISMATCH');}}
     const operationStarted=performance.now();
     const {value:result,spans}=await captureRPTiming(()=>operations.fastComplete(input.packet,c,binding));
     const operationFinished=performance.now();
     if(result.sessionToken)res.setHeader('Set-Cookie',header(sessionCookie,result.sessionToken,3600));
     const session=result.sessionToken?operations.session(result.sessionToken):null,finished=performance.now();
     const timing={total:finished-requestStarted,body:bodyFinished-bodyStarted,challenge:operationStarted-bodyFinished,completion:operationFinished-operationStarted,session:finished-operationFinished,...spans};
     const reference=randomBytes(16).toString('hex');
     res.setHeader('X-Passli-RP-Request-ID',reference);
     res.setHeader('Server-Timing',Object.entries(timing).map(([name,value])=>name+';dur='+value.toFixed(3)).join(', '));
     console.info(JSON.stringify({event:'rp.fast-complete.timing',reference,timingsMs:timing}));
     json(res,200,{session,...(result.registrationRequired?{registrationRequired:true}:{})});return true;
    }
    if(demoDelete){
     const token=cookie(req,sessionCookie);if(!token||!operations.session(token)){json(res,401,{error:'IDENTITY_LOCAL_SESSION_REQUIRED'});return true;}
     if(input.confirm!==true||Object.keys(input).length!==1){json(res,400,{error:'IDENTITY_CONFIRMATION_REQUIRED'});return true;}
     const result=operations.deleteAccount(token);res.setHeader('Set-Cookie',header(sessionCookie,'',0));json(res,200,result);return true;
    }
    if(path==='/api/identity/challenge'){
     const token=cookie(req,sessionCookie);let localSession=null;if(token)try{localSession=operations.session(token);}catch{}
     json(res,200,{transaction:await operations.prepare(input,binding,localSession)});return true;
    }
    if(path==='/api/identity/complete'){
     const result=await operations.complete(input,binding);
     if(result.sessionToken)res.setHeader('Set-Cookie',header(sessionCookie,result.sessionToken,3600));
     else if(['unlink','rekey','resume'].includes(input.response?.transaction?.operation))res.setHeader('Set-Cookie',header(sessionCookie,'',0));
     // Session bearer secrets never appear in response JSON or app handoffs.
     json(res,200,{binding:result.binding,sessionEstablished:!!result.sessionToken});return true;
    }
    if(path==='/api/identity/logout'){
     const token=cookie(req,sessionCookie);if(token)try{operations.logout(token);}catch{}
     res.setHeader('Set-Cookie',header(sessionCookie,'',0));json(res,200,{loggedOut:true});return true;
    }
    json(res,405,{error:'METHOD_NOT_ALLOWED'});return true;
   }catch(error){json(res,['IDENTITY_RP_ACCOUNT_DELETED','IDENTITY_RP_REQUEST_CANCELLED'].includes(error?.code)?410:400,{error:/^IDENTITY_[A-Z_]+$/.test(error?.code||'')?error.code:'IDENTITY_REQUEST_INVALID'});return true;}
  },
 };
}
