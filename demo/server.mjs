import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {freshWorld,expire,publicState,act,random,authorizedAccount} from './model.mjs';
import {version} from './version.mjs';
import {createPassli} from './passli.mjs';

const here=dirname(fileURLToPath(import.meta.url));
export function createDemo({origin='http://127.0.0.1:18766',database=':memory:',now=Date.now,mode='walkthrough',provider,publicPrefix='',cleanupInterval=15000}={}) {
  if (!['real','walkthrough'].includes(mode)) throw Error('Unknown demo mode.');
  const passli=mode==='real'?(provider || createPassli({origin})):null;
  const secure=new URL(origin).protocol === 'https:',cookieName=(secure?'__Host-':'')+(mode==='real'?'northstar-demo':'northstar-walkthrough');
  if (database !== ':memory:') mkdirSync(dirname(resolve(database)),{recursive:true});
  const db=new DatabaseSync(database);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, state TEXT NOT NULL, updated INTEGER NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS bindings (subject TEXT PRIMARY KEY, visitor TEXT NOT NULL, account TEXT NOT NULL)');
  const load=db.prepare('SELECT state FROM visitors WHERE id=?'),save=db.prepare('INSERT INTO visitors VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,updated=excluded.updated');
  const removeOld=db.prepare('DELETE FROM visitors WHERE updated < ?');
  const bindingFor=db.prepare('SELECT visitor,account FROM bindings WHERE subject=?');
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
  const view=world=>({...publicState(world),...(mode==='real'?{mode:'real',modeLabel:'Real Passli authentication · Fictional Northstar accounts'}:{})});
  const files=new Map([['/', ['index.html','text/html; charset=utf-8']],['/privacy',['privacy.html','text/html; charset=utf-8']],['/terms',['terms.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']],['/passli-mark.svg',['passli-mark.svg','image/svg+xml']]].map(([url,[file,type]])=>[url,{body:readFileSync(resolve(here,'public',file)),type}]));
  if(publicPrefix)files.get('/').body=Buffer.from(files.get('/').body.toString().replace('href="/"',`href="${publicPrefix}/"`));
  let swept=0;const rates=new Map();
  const server=http.createServer(async(req,res)=>{
    const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const path=new URL(req.url,origin).pathname;
    if(mode==='real'&&path==='/walkthrough') {res.writeHead(308,{Location:'/walkthrough/'});res.end();return;}
    if (path==='/health' && req.method==='GET') return json(200,{ok:true,version,mode});
    if (files.has(path) && ['GET','HEAD'].includes(req.method)) {const file=files.get(path);res.writeHead(200,{'Content-Type':file.type});res.end(req.method==='HEAD'?undefined:file.body);return;}
    if (!['/api/state','/api/action','/api/private','/auth/passli/callback'].includes(path)) return json(404,{error:'Not found'});
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
    if (path==='/auth/passli/callback') {
      const url=new URL(req.url,origin),proof=world.pending;
      const redirect=()=>{res.writeHead(303,{Location:'/'});res.end();};
      if(mode!=='real'||!proof||!proof.state||url.searchParams.get('state')!==proof.state||proof.expires<=now())return json(400,{error:'Login transaction expired or does not match this browser.'});
      world.pending=null;world.inflight=proof.id;persist(); // Reserve once before code exchange; never replay.
      if(url.searchParams.has('error')) {world.setup=null;world.screen=world.session?'settings':'login';world.message='Login was not completed.';persist();return redirect();}
      try {
        const result=await passli.complete(proof,url.searchParams.get('code'));
        if(proof.expires<=now())throw Error('Login transaction expired.');
        const reserved=load.get(id);if(!reserved)throw Error('Site transaction cancelled.');world=JSON.parse(reserved.state);forgetExpired(id,world);
        if(world.inflight!==proof.id || world.pending)throw Error('Site transaction changed.');
        world.inflight=null;
        sweep();const owner=bindingFor.get(result.identity);
        if(proof.action==='login'&&owner) {
          const original=load.get(owner.visitor);if(!original)throw Error('Linked account is unavailable.');
          world=JSON.parse(original.state);id=owner.visitor;world.session=null;world.setup=null;world.pending=null;
        } else if(owner && (owner.visitor!==id || owner.account!==proof.accountId)) throw Error('This Passli identity is already linked to another account.');
        if(['link','register','unlink'].includes(proof.action)) {
          const current=load.get(id);if(!current)throw Error('Site transaction is unavailable.');world=JSON.parse(current.state);expire(world,now());
          if(['link','unlink'].includes(proof.action)&&world.session?.id!==proof.sessionId)throw Error('Site account changed during linking.');
        }
        world.pending=proof;
        act(world,{action:'approve',transaction:proof.id,identity:result.identity},now(),{verifiedIdentity:result.identity,verifiedUnlink:result.unlinkVerified===true});
        if(world.session?.method==='passli')world.providerAssociation=result.association;
        db.exec('BEGIN IMMEDIATE');try{rotate();syncBindings();persist();db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
        return redirect();
      } catch {const current=load.get(id);if(current)world=JSON.parse(current.state);if(world.inflight===proof.id){world.inflight=null;world.pending=null;world.screen=world.session?'settings':world.setup?'setup':'login';}world.message='Passli verification failed or the transaction changed. Start again.';persist();return redirect();}
    }
    if(mode==='real'&&world.session?.method==='passli'&&world.providerAssociation) {
      const originalSession=world.session.id,status=await passli.status(world.providerAssociation);
      const current=load.get(id);if(current)world=JSON.parse(current.state);
      if(world.session?.id===originalSession) {world.providerStatus=status;expire(world,now());if(status==='active'&&world.screen==='suspended')world.screen='home';}
      persist();
    }
    if (path==='/api/state') {const message=world.message;delete world.message;persist();return json(200,{...view(world),message});}
    if (path==='/api/private') {persist();const account=authorizedAccount(world);return account?json(200,{accountId:account.id,projects:['Website refresh','Autumn launch','Personal notes']}):json(401,{error:'Current site authorization is required.'});}
    if (req.headers.origin!==origin || req.headers['x-demo-csrf']!==world.csrf || !String(req.headers['content-type']).startsWith('application/json')) return json(403,{error:'Invalid request origin or CSRF proof.'});
    const rate=rates.get(id)||{count:0,until:now()+60000};rates.set(id,rate);if (++rate.count>120) return json(429,{error:'Too many demo actions. Wait a minute.'});
    let text='';
    try {
      for await (const chunk of req) {text+=chunk;if (Buffer.byteLength(text)>4096) throw Object.assign(Error('Request too large.'),{status:413});}
      const body=JSON.parse(text);
      if (!body || Array.isArray(body) || typeof body.action!=='string') throw Object.assign(Error('Invalid action.'),{status:400});
      // Re-read after async body input: a concurrent tab may have consumed proof.
      const current=load.get(id);if (current) world=JSON.parse(current.state);
      expire(world,now());
      if (req.headers['x-demo-csrf']!==world.csrf) return json(403,{error:'Demo state changed. Reload before continuing.'});
      if(mode==='real'&&['approve','suspend','terminate','provider-error','installation','reset'].includes(body.action)&&body.action!=='installation')throw Object.assign(Error('Simulation controls are unavailable in real Passli mode.'),{status:403});
      if(mode==='real'&&body.action==='resume-start') {persist();return json(200,{state:view(world),redirect:'https://passli.app/'});}
      if (body.action==='reset') world=freshWorld(now());
      const previousSession=world.session?.id;
      const message=body.action==='reset'?'Fresh fictional demo data is ready.':act(world,body,now());
      let redirect;
      if(mode==='real'&&world.screen==='approval'&&world.pending)redirect=passli.begin(world.pending);
      db.exec('BEGIN IMMEDIATE');try{if(world.session?.id&&world.session.id!==previousSession)rotate();syncBindings();persist();db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
      return json(200,{state:view(world),message,redirect});
    } catch(error) {
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
