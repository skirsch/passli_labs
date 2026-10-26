import {cartView,checkoutAction} from './checkout.mjs';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {freshWorld,expire,publicState,act,random,authorizedAccount} from './model.mjs';
import {version} from './version.mjs';
import {createPassli} from './passli.mjs';
import {validatePiiRelease,validateDelivery,publicRelease} from './pii.mjs';

const bodyCheckoutAction=text=>{try{return /^(checkout-|cart|purchase)/.test(JSON.parse(text).action)}catch{return false}};
const here=dirname(fileURLToPath(import.meta.url));
export function createDemo({origin='http://127.0.0.1:18766',database=':memory:',now=Date.now,mode='walkthrough',provider,publicPrefix='',cleanupInterval=15000}={}) {
  if (!['real','walkthrough'].includes(mode)) throw Error('Unknown demo mode.');
  const passli=mode==='real'?(provider || createPassli({origin})):null;
  const secure=new URL(origin).protocol === 'https:',cookieName=(secure?'__Host-':'')+(mode==='real'?'northstar-demo':'northstar-walkthrough');
  if (database !== ':memory:') mkdirSync(dirname(resolve(database)),{recursive:true});
  const db=new DatabaseSync(database);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, state TEXT NOT NULL, updated INTEGER NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS bindings (subject TEXT NOT NULL, visitor TEXT NOT NULL, account TEXT NOT NULL, PRIMARY KEY(subject,account))');
  if(db.prepare('PRAGMA table_info(bindings)').all().filter(column=>column.pk).length===1){
    db.exec('BEGIN IMMEDIATE; ALTER TABLE bindings RENAME TO bindings_single_account; CREATE TABLE bindings (subject TEXT NOT NULL, visitor TEXT NOT NULL, account TEXT NOT NULL, PRIMARY KEY(subject,account)); INSERT INTO bindings SELECT subject,visitor,account FROM bindings_single_account; DROP TABLE bindings_single_account; COMMIT;');
  }
  const load=db.prepare('SELECT state FROM visitors WHERE id=?'),save=db.prepare('INSERT INTO visitors VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,updated=excluded.updated');
  const removeOld=db.prepare('DELETE FROM visitors WHERE updated < ?');
  const bindingFor=db.prepare('SELECT visitor,account FROM bindings WHERE subject=?');
  const linkedAccounts=subject=>bindingFor.all(subject).flatMap(binding=>{
    const row=load.get(binding.visitor);if(!row)return [];
    const linked=JSON.parse(row.state);expire(linked,now());
    const account=linked.accounts.find(account=>account.id===binding.account&&account.identities.includes(subject));
    return account?[{id:account.id,name:account.name,email:account.email,visitor:binding.visitor}]:[];
  });
  const forgetExpired=(id,world)=>{
    expire(world,now());
    for(const binding of db.prepare('SELECT account FROM bindings WHERE visitor=?').all(id))
      if(!world.accounts.some(account=>account.id===binding.account))db.prepare('DELETE FROM bindings WHERE visitor=? AND account=?').run(id,binding.account);
  };
  const sweep=()=>{
    for(const row of db.prepare('SELECT id,state FROM visitors').all()) {
      const world=JSON.parse(row.state);forgetExpired(row.id,world);
      const state=JSON.stringify(world);if(state!==row.state)save.run(row.id,state,now());
    }
    db.prepare('DELETE FROM bindings WHERE visitor IN (SELECT id FROM visitors WHERE updated < ?)').run(now()-86400000);
    removeOld.run(now()-86400000);
  };
  sweep();const cleanup=setInterval(sweep,cleanupInterval);cleanup.unref();
  const view=world=>({...publicState(world),cart:cartView(world),...(mode==='real'?{mode:'real',modeLabel:'Real Passli authentication · Fictional Northstar accounts'}:{})});
  const files=new Map([['/', ['index.html','text/html; charset=utf-8']],['/privacy',['privacy.html','text/html; charset=utf-8']],['/terms',['terms.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']],['/passli-mark.svg',['passli-mark.svg','image/svg+xml']]].map(([url,[file,type]])=>[url,{body:readFileSync(resolve(here,'public',file)),type}]));
  for(const file of files.values())if(file.type.startsWith('text/html'))file.body=Buffer.from(file.body.toString().replaceAll('{{DEMO_VERSION}}',version));
  if(publicPrefix)files.get('/').body=Buffer.from(files.get('/').body.toString().replace('href="/"',`href="${publicPrefix}/"`));
  let swept=0;const rates=new Map(),checkoutJobs=new Set();
  const server=http.createServer(async(req,res)=>{
    const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const path=new URL(req.url,origin).pathname;
    if(mode==='real'&&['/api/pii-challenge','/api/pii-release'].includes(path)) {
      try {
        const caller=req.headers.origin;
        if(caller&&!['https://passli.app','https://dev.passli.app'].includes(caller))throw Error('Unrecognized sharing origin.');
        if(caller){res.setHeader('Access-Control-Allow-Origin',caller);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');}
        if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
        let body={};
        if(req.method==='POST'){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>8192)throw Error('Sharing response too large.');}body=JSON.parse(text);}
        const requestId=path==='/api/pii-challenge'?new URL(req.url,origin).searchParams.get('id'):body.id;
        const row=db.prepare('SELECT id,state FROM visitors').all().find(row=>JSON.parse(row.state).registration?.release.id===requestId);
        if(!row)throw Error('Sharing request expired or was cancelled.');
        let world=JSON.parse(row.state);const registration=world.registration,release=registration.release;
        if(!validatePiiRelease(release,origin)||registration.expires<=now())throw Error('Sharing request expired.');
        if(req.method==='GET'&&path==='/api/pii-challenge')return json(200,publicRelease(release));
        if(req.method!=='POST'||path!=='/api/pii-release')return json(405,{error:'Unsupported sharing method.'});
        validateDelivery(body,release);
        const authorization=await passli.authorizeDisclosure(registration.association,body);if(!(authorization===true||authorization?.active===true)||release.requestedFields&&(!Array.isArray(authorization.outputs)||JSON.stringify([...authorization.outputs].sort())!==JSON.stringify(Object.keys(body.values).sort())))throw Error('Sharing authorization was revoked or changed.');
        // Re-read after authorization: cancellation, another tab and expiry win.
        const current=load.get(row.id);if(!current)throw Error('Registration was cancelled.');world=JSON.parse(current.state);expire(world,now());
        if(world.registration?.release.id!==requestId||world.registration.proof.id!==registration.proof.id||world.screen!=='profile-sharing'||world.session||bindingFor.get(registration.identity))throw Error('Registration changed. Start again.');
        world.pending={...registration.proof,expires:registration.expires};
        act(world,{action:'approve',transaction:registration.proof.id,identity:registration.identity},now(),{verifiedIdentity:registration.identity,personalInformation:body.values});
        world.registration=null;world.providerAssociation=registration.association;
        db.exec('BEGIN IMMEDIATE');try{const account=authorizedAccount(world);db.prepare('INSERT INTO bindings VALUES (?,?,?)').run(registration.identity,row.id,account.id);save.run(row.id,JSON.stringify(world),now());db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
        return json(200,{received:true});
      }catch{return json(409,{error:'Personal information could not be accepted. Restart account creation in Northstar.'});}
    }
    if(mode==='real'&&path==='/walkthrough') {res.writeHead(308,{Location:'/walkthrough/'});res.end();return;}
    if (path==='/health' && req.method==='GET') return json(200,{ok:true,version,mode});
    if (files.has(path) && ['GET','HEAD'].includes(req.method)) {const file=files.get(path);res.writeHead(200,{'Content-Type':file.type});res.end(req.method==='HEAD'?undefined:file.body);return;}
    if (!['/api/state','/api/action','/api/private','/auth/passli/callback','/auth/passli/pii-return'].includes(path)) return json(404,{error:'Not found'});
    if (req.method!==(path==='/api/action'?'POST':'GET')) return json(405,{error:'Method not allowed'});
    const cookies=Object.fromEntries((req.headers.cookie || '').split(';').map(s=>s.trim().split('=')));
    let id=cookies[cookieName];
    if (!/^[A-Za-z0-9_-]{43}$/.test(id || '')) id=undefined;
    let world=id && load.get(id);
    const setCookie=()=>res.setHeader('Set-Cookie',`${cookieName}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure?'; Secure':''}`);
    if (!world) {id=random();world=freshWorld(now());if(mode==='real')world.installed=false;setCookie();}
    else world=JSON.parse(world.state);
    forgetExpired(id,world);
    const persist=()=>{forgetExpired(id,world);save.run(id,JSON.stringify(world),now());};
    const rotate=()=>{const previous=id;id=random();db.prepare('UPDATE bindings SET visitor=? WHERE visitor=?').run(id,previous);db.prepare('DELETE FROM visitors WHERE id=?').run(previous);setCookie();};
    const syncBindings=()=>{
      if(mode!=='real')return;
      db.prepare('DELETE FROM bindings WHERE visitor=?').run(id);
      const insert=db.prepare('INSERT INTO bindings VALUES (?,?,?)');
      for(const account of world.accounts)for(const identity of account.identities)insert.run(identity,id,account.id);
    };
    if (now()-swept>60000) {sweep();swept=now();for (const [key,r] of rates) if (r.until<=now()) rates.delete(key);}
    if(path==='/auth/passli/pii-return'){
      const returned=new URL(req.url,origin);
      if(world.registration?.release.id===returned.searchParams.get('id')){
        if(returned.searchParams.get('outcome')==='cancelled'){act(world,{action:'cancel'},now());world.screen='register';world.message='Personal information sharing cancelled.';}
        else if(world.registration.expires<=now()){world.registration=null;world.screen='register';world.message='Your request timed out. Please try again.';}
        else world.message='Personal information was not received. Please try again.';
        persist();
      }
      res.writeHead(303,{Location:'/'});res.end();return;
    }
    if (path==='/auth/passli/callback') {
      const url=new URL(req.url,origin),proof=world.pending;
      const redirect=()=>{res.writeHead(303,{Location:'/'});res.end();};
      if(mode==='real'&&url.searchParams.has('error')) {
        // Cancellation returns no authority. It must still navigate home after
        // the approval deadline, cleanup, or an already consumed callback.
        // Only a matching live transaction may cancel current site state.
        const matches=proof?.state&&url.searchParams.get('state')===proof.state;
        if(matches)act(world,{action:'cancel'},now());
        world.message=matches&&proof.action==='unlink'?'Unlink cancelled. Passli is still linked.':'Passli request was not completed. Your account and links are unchanged.';
        persist();return redirect();
      }
      if(mode!=='real')return json(400,{error:'Login transaction is unavailable.'});
      if(!proof||!proof.state||url.searchParams.get('state')!==proof.state||proof.expires<=now()) {
        world.message=!proof||proof.expires<=now()?'Your request timed out. Please try again.':'This request could not be verified. Please try again.';
        persist();return redirect();
      }
      world.pending=null;world.inflight=proof.id;persist(); // Reserve once before code exchange; never replay.
      try {
        const result=await passli.complete(proof,url.searchParams.get('code'));
        if(proof.expires<=now())throw Error('Login transaction expired.');
        const reserved=load.get(id);if(!reserved)throw Error('Site transaction cancelled.');world=JSON.parse(reserved.state);forgetExpired(id,world);
        if(world.inflight!==proof.id || world.pending)throw Error('Site transaction changed.');
        world.inflight=null;
        sweep();const matches=linkedAccounts(result.identity),owner=matches[0];
        if(proof.action==='login'&&matches.length===1) {
          const original=load.get(owner.visitor);if(!original)throw Error('Linked account is unavailable.');
          const installed=world.installed;world=JSON.parse(original.state);world.installed=installed;id=owner.visitor;world.session=null;world.setup=null;world.pending=null;
        } else if(proof.action==='register'&&owner) throw Error('This Passli identity was linked while registration was pending. Start a new login.');
        if(['link','register','unlink'].includes(proof.action)) {
          const current=load.get(id);if(!current)throw Error('Site transaction is unavailable.');world=JSON.parse(current.state);expire(world,now());
          if(['link','unlink'].includes(proof.action)&&world.session?.id!==proof.sessionId)throw Error('Site account changed during linking.');
        }
        if(proof.action==='register'&&result.piiRelease) {
          if(!validatePiiRelease(result.piiRelease,origin)||result.piiRelease.expires<=now()||(proof.subject&&proof.subject!==result.identity))throw Error('Invalid personal information release.');
          world.registration={proof,identity:result.identity,association:result.association,release:result.piiRelease,expires:Math.min(result.piiRelease.expires,now()+120000)};
          world.screen='profile-sharing';world.pending=null;rotate();persist();res.writeHead(303,{Location:'https://passli.app/?'+new URLSearchParams({piiRelease:result.piiRelease.id,piiSite:origin})});res.end();return;
        }
        world.pending=proof;
        act(world,{action:'approve',transaction:proof.id,identity:result.identity},now(),{verifiedIdentity:result.identity,verifiedUnlink:result.unlinkVerified===true,personalInformation:result.personalInformation,loginAccounts:matches});
        if(world.accountChoice)world.accountChoice.association=result.association;
        if(world.session?.method==='passli')world.providerAssociation=result.association;
        db.exec('BEGIN IMMEDIATE');try{rotate();syncBindings();persist();db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
        return redirect();
      } catch {const current=load.get(id);if(current)world=JSON.parse(current.state);if(world.inflight===proof.id){world.inflight=null;world.pending=null;world.screen=world.session?'settings':world.setup?'setup':'login';}world.message=proof.expires<=now()?'Your request timed out. Please try again.':'Passli verification failed or the transaction changed. Start again.';persist();return redirect();}
    }
    async function checkProvider(){
      if(mode!=='real'||world.session?.method!=='passli')return;
      const originalSession=world.session.id,association=JSON.stringify(world.providerAssociation);
      const status=world.providerAssociation?await passli.status(world.providerAssociation):'unavailable';
      const current=load.get(id);if(current)world=JSON.parse(current.state);
      if(world.session?.id===originalSession&&JSON.stringify(world.providerAssociation)===association){world.providerStatus=status;expire(world,now());if(status==='active'&&world.screen==='suspended')world.screen='home';}
      else if(world.session?.method==='passli'){world.providerStatus='unavailable';expire(world,now());}
      persist();
    }
    if(path==='/api/state'||path==='/api/private')await checkProvider();
    if(mode==='real'&&path==='/api/state'&&world.accountChoice){
      const current=new Map(linkedAccounts(world.accountChoice.subject).map(account=>[account.id,account]));
      world.accountChoice.accounts=world.accountChoice.accounts.filter(account=>current.has(account.id)).map(account=>{const {id,name,email}=current.get(account.id);return {id,name,email};});
      if(!world.accountChoice.accounts.length){world.accountChoice=null;world.screen='login';world.message='No linked accounts remain. Start a new Passli login.';}
    }
    if (path==='/api/state') {const message=world.message;delete world.message;persist();return json(200,{...view(world),message});}
    if (path==='/api/private') {persist();const account=authorizedAccount(world);return account?json(200,{accountId:account.id,notes:account.notes||'',projects:['Website refresh','Autumn launch','Personal notes']}):json(401,{error:'Current site authorization is required.'});}
    if (req.headers.origin!==origin || req.headers['x-demo-csrf']!==world.csrf || !String(req.headers['content-type']).startsWith('application/json')) return json(403,{error:'Invalid request origin or CSRF proof.'});
    const rate=rates.get(id)||{count:0,until:now()+60000};rates.set(id,rate);if (++rate.count>120) return json(429,{error:'Too many demo actions. Wait a minute.'});
    let text='',selecting=false;
    try {
      for await (const chunk of req) {text+=chunk;if (Buffer.byteLength(text)>16384) throw Object.assign(Error('Request too large.'),{status:413});}
      const body=JSON.parse(text);
      if (!body || Array.isArray(body) || typeof body.action!=='string') throw Object.assign(Error('Invalid action.'),{status:400});
      // Re-read after async body input: a concurrent tab may have consumed proof.
      const current=load.get(id);if (current) world=JSON.parse(current.state);
      await checkProvider();
      expire(world,now());
      if (req.headers['x-demo-csrf']!==world.csrf) return json(403,{error:'Demo state changed. Reload before continuing.'});
      if(mode==='real'&&['approve','suspend','terminate','provider-error','installation','reset'].includes(body.action)&&body.action!=='installation')throw Object.assign(Error('Simulation controls are unavailable in real Passli mode.'),{status:403});
      if(mode==='real'&&body.action==='resume-start')throw Object.assign(Error('Open the Passli mobile app and choose Disabled devices to review and re-enable this device.'),{status:423});
      if (body.action==='reset') world=freshWorld(now());
      if(mode==='real'&&body.action==='select-account'){
        selecting=true;
        const choice=world.accountChoice;
        if(world.session||!choice||choice.expires<=now()||choice.id!==body.transaction||!choice.accounts.some(account=>account.id===body.accountId))throw Object.assign(Error('Choose an account from the current Passli login.'),{status:409});
        const status=choice.association?await passli.status(choice.association):'unavailable';
        const current=load.get(id);if(!current)throw Object.assign(Error('Login selection expired.'),{status:409});world=JSON.parse(current.state);expire(world,now());
        if(status!=='active'||world.accountChoice?.id!==choice.id||world.session)throw Object.assign(Error('This Passli login is no longer authorized. Start again.'),{status:409});
        const target=linkedAccounts(choice.subject).find(account=>account.id===body.accountId);
        if(!target)throw Object.assign(Error('That account is no longer linked. Start a new Passli login.'),{status:409});
        const sourceId=id;
        const installed=world.installed;world=JSON.parse(load.get(target.visitor).state);world.installed=installed;expire(world,now());world.session=null;world.setup=null;world.pending=null;world.inflight=null;world.accountChoice=choice;world.screen='account-choice';
        const message=act(world,body,now());world.providerAssociation=choice.association;
        db.exec('BEGIN IMMEDIATE');try{
          if(sourceId!==target.visitor){const source=JSON.parse(load.get(sourceId).state);source.accountChoice=null;source.screen='login';save.run(sourceId,JSON.stringify(source),now());}
          id=target.visitor;rotate();syncBindings();persist();db.exec('COMMIT');
        }catch(error){db.exec('ROLLBACK');id=sourceId;throw error;}
        return json(200,{state:view(world),message});
      }
      if(['cart','cart-add','cart-remove','checkout-start','checkout-status','checkout-cancel','checkout-demo-approve','purchase'].includes(body.action)){
        if(checkoutJobs.has(id)&&['checkout-start','checkout-status'].includes(body.action))throw Object.assign(Error('Checkout is being checked. Please wait.'),{status:409});
        checkoutAction(world,body,now(),{real:mode==='real'});
        if(mode==='real'&&(body.action==='checkout-start'||body.action==='checkout-status'&&world.checkout.status==='pending')){
          if(body.action==='checkout-status'&&!world.checkout.proof)throw Error('Checkout could not be started. Cancel and try again.');
          const checkout=world.checkout,sessionId=world.session.id;persist();checkoutJobs.add(id);
          try{
            const result=body.action==='checkout-start'?await passli.createCheckout(world.providerAssociation,checkout.order):await passli.checkoutResult(checkout.proof);
            const current=load.get(id);if(!current)throw Error('Checkout session ended.');world=JSON.parse(current.state);expire(world,now());
            if(!authorizedAccount(world)||world.session.id!==sessionId||world.checkout?.id!==checkout.id||world.checkout.expires<=now()||world.accounts.find(a=>a.id===checkout.accountId)?.cart?.revision!==checkout.revision)throw Error('Checkout changed while awaiting Passli.');
            // Recheck provider state after the network call before granting confirmation.
            if(await passli.status(world.providerAssociation)!=='active')throw Error('Passli authorization ended.');
            const latest=load.get(id);if(!latest)throw Error('Checkout session ended.');world=JSON.parse(latest.state);expire(world,now());
            if(!authorizedAccount(world)||world.session.id!==sessionId||world.checkout?.id!==checkout.id||world.checkout.expires<=now())throw Error('Checkout changed.');
            if(body.action==='checkout-start'){world.checkout.proof=result;world.checkout.expires=Math.min(world.checkout.expires,result.expiresAt*1000);}
            else if(result.cancelled){world.checkout=null;world.screen='cart';}
            else if(result.fields){world.checkout.status='approved';world.checkout.selection=result.fields.selection;world.checkout.requiredLoA=result.fields.requiredLoA;world.checkout.achievedLoA=result.fields.achievedLoA;world.screen='checkout-confirm';}
          }finally{checkoutJobs.delete(id);}
        }
        persist();return json(200,{state:view(world),...(body.action==='checkout-start'&&mode==='real'?{popupUrl:world.checkout.proof.approvalUrl}:{})});
      }
      const previousSession=world.session?.id;
      const message=body.action==='reset'?'Fresh fictional demo data is ready.':act(world,body,now());
      let redirect;
      if(mode==='real'&&world.screen==='approval'&&world.pending)redirect=passli.begin(world.pending);
      db.exec('BEGIN IMMEDIATE');try{if(body.action==='delete-account-confirm'||world.session?.id&&world.session.id!==previousSession)rotate();syncBindings();persist();db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
      return json(200,{state:view(world),message,redirect});
    } catch(error) {
      if(bodyCheckoutAction(text)){const current=load.get(id);if(current)world=JSON.parse(current.state);}
      if(selecting){const current=load.get(id);if(!current)return json(409,{message:'This Passli login was already completed or cancelled. Start again.'});world=JSON.parse(current.state);}
      // A failed/replayed proof is consumed, but account changes are never partial.
      if (world.screen==='approval' && !world.pending) world.screen=world.session ? world.providerStatus==='suspended'?'suspended':'settings' : world.setup?'setup':'login';
      persist();return json(error.status || 400,{state:view(world),message:error instanceof SyntaxError?'Invalid JSON.':error.message});
    }
  });
  server.once('close',()=>{clearInterval(cleanup);db.close();});return server;
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT||18766),origin=process.env.DEMO_ORIGIN||`http://127.0.0.1:${port}`;
  const mode=process.env.DEMO_MODE||'real';
  const service=createDemo({origin,mode,database:process.env.DEMO_DATABASE||resolve(here,'data','demo.sqlite')});
  service.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Northstar demo ${version} listening at ${origin} (${mode})`));
  const services=[service];
  if(mode==='real'&&process.env.DEMO_WALKTHROUGH!=='0') {
    const walkthrough=createDemo({origin,mode:'walkthrough',publicPrefix:'/walkthrough',database:process.env.DEMO_DATABASE?resolve(dirname(process.env.DEMO_DATABASE),'walkthrough.sqlite'):resolve(here,'data','walkthrough.sqlite')});
    walkthrough.listen(port+1,process.env.HOST||'127.0.0.1');services.push(walkthrough);
  }
  const stop=()=>{let remaining=services.length;for(const server of services){server.close(()=>{if(--remaining===0)process.exit(0);});server.closeIdleConnections();}};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
