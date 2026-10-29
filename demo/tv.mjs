import {randomBytes,createHash} from 'node:crypto';
import {qrSvg} from './qr.mjs';

const random=()=>randomBytes(32).toString('base64url');
const hash=value=>createHash('sha256').update(value).digest('hex');
const requestLife=180000,trustLife=30*86400000,deviceLife=365*86400000,sessionLife=8*3600000;
const cookie=(req,name)=>req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
const valid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const readBody=async req=>{let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>4096)throw Error('Request too large.');}return JSON.parse(text);};

export function createTv({db,passli,origin,mode,now=Date.now}){
 db.exec('CREATE TABLE IF NOT EXISTS demo_tvs (key TEXT PRIMARY KEY, device TEXT UNIQUE NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS demo_tv_phones (key TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS demo_tv_requests (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
 const secure=origin.startsWith('https:'),prefix=secure?'__Host-':'',tvCookie=prefix+'passli-demo-tv',phoneCookie=prefix+'passli-demo-tv-phone';
 const get=(table,key)=>{const row=db.prepare(`SELECT data FROM ${table} WHERE ${table==='demo_tv_requests'?'id':'key'}=?`).get(key);return row?JSON.parse(row.data):null;};
 const saveTv=tv=>db.prepare('INSERT INTO demo_tvs VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(tv.key,tv.id,JSON.stringify(tv));
 const savePhone=phone=>db.prepare('INSERT INTO demo_tv_phones VALUES (?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(phone.key,JSON.stringify(phone));
 const saveRequest=item=>db.prepare('INSERT INTO demo_tv_requests VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(item.id,JSON.stringify(item));
 const tvById=id=>{const row=db.prepare('SELECT data FROM demo_tvs WHERE device=?').get(id);return row?JSON.parse(row.data):null;};
 const sweep=()=>{for(const table of ['demo_tvs','demo_tv_phones','demo_tv_requests'])db.prepare(`DELETE FROM ${table} WHERE json_extract(data,'$.expires') <= ?`).run(now());};
 const limit=table=>{if(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count>=1000)throw Error('Too many demo devices or requests. Try again later.');};
 const setCookie=(res,name,token,age)=>res.setHeader('Set-Cookie',`${name}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure?'; Secure':''}`);
 function tvFor(req,res){let token=cookie(req,tvCookie),tv=valid(token)?get('demo_tvs',hash(token)):null;if(!tv||tv.expires<=now()){limit('demo_tvs');token=random();tv={key:hash(token),id:randomBytes(16).toString('hex'),name:'Living room TV',csrf:random(),generation:0,expires:now()+deviceLife};setCookie(res,tvCookie,token,deviceLife/1000);saveTv(tv);}return tv;}
 function phoneFor(req,res){let token=cookie(req,phoneCookie),phone=valid(token)?get('demo_tv_phones',hash(token)):null;if(!phone||phone.expires<=now()){limit('demo_tv_phones');token=random();phone={key:hash(token),csrf:random(),trust:{},expires:now()+trustLife};setCookie(res,phoneCookie,token,trustLife/1000);savePhone(phone);}return phone;}
 function pending(ticket){if(!valid(ticket))throw Error('Invalid TV QR code.');const item=get('demo_tv_requests',ticket),tv=item&&tvById(item.device);if(!item||!tv||item.status!=='pending'||item.expires<=now()||tv.expires<=now()||tv.requestId!==item.id||tv.generation!==item.generation)throw Error('This TV login expired, was cancelled, or was replaced. Start a new login on the TV.');return {item,tv};}
 const remembered=(phone,tv)=>{const trust=phone.trust[tv.id];return trust&&trust.expires>now()&&trust.generation===tv.generation?trust:null;};
 function view(tv){const item=tv.requestId&&get('demo_tv_requests',tv.requestId),active=item?.status==='pending'&&item.expires>now()&&item.generation===tv.generation;return {csrf:tv.csrf,mode,name:tv.name,address:'TV-'+tv.id,authenticated:!!tv.session&&tv.session.expires>now(),pending:!!active,...(active?{ticket:item.id,expiresAt:item.expires,qrUrl:'/api/tv/qr?ticket='+item.id}:{}),achievedLoA:tv.session?.achievedLoA,remembered:tv.session?.remembered===true};}
 const listeners=new Map(),locks=new Set();
 const publish=tv=>{for(const res of listeners.get(tv.id)||[])res.write('data: '+JSON.stringify(view(tv))+'\n\n');};
 const current=(ticket,phoneKey)=>{const result=pending(ticket),phone=get('demo_tv_phones',phoneKey);if(!phone||phone.expires<=now())throw Error('Phone session expired. Scan again.');return {...result,phone};};
 async function sessionView(tv){if(tv.session){if(tv.session.expires<=now()||await passli.status(tv.session.association)!=='active'){const latest=tvById(tv.id);if(latest?.session?.id===tv.session.id){latest.session=null;saveTv(latest);publish(latest);}tv=latest||tv;}else tv=tvById(tv.id)||tv;}return view(tv);}
 async function begin(phone,ticket,{remember=false,automatic=false}={}){
  const {tv}=pending(ticket),trust=remembered(phone,tv);
  if(automatic&&!trust)throw Error('Approve and remember this TV before using automatic sign-in.');
  const proof={action:'login',requiredLoA:automatic?1:4,expires:Math.min(now()+requestLife,get('demo_tv_requests',ticket).expires)};
  const redirect=passli.begin(proof);phone.pending={ticket,proof,remember:remember===true,automatic,expectedSubject:trust?.subject,generation:tv.generation};phone.message='';savePhone(phone);return redirect;
 }
 return {
  close(){for(const entries of listeners.values())for(const res of entries)res.end();listeners.clear();},
  async handle(req,res,path){
   const url=new URL(req.url,origin),callback=path==='/auth/passli/callback';
   if(!path.startsWith('/api/tv/')&&!callback)return false;
   const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));return true;};
   const redirect=target=>{res.writeHead(303,{Location:target});res.end();return true;};
   let phone,tv,lock;
   try{
    sweep();
    if(callback){
     const token=cookie(req,phoneCookie);phone=valid(token)?get('demo_tv_phones',hash(token)):null;
     if(!phone?.pending||phone.pending.proof.state!==url.searchParams.get('state'))return false;
     lock='phone:'+phone.key;if(locks.has(lock))return json(409,{error:'This phone approval is being checked.'});locks.add(lock);
     const reserved=phone.pending;delete phone.pending;savePhone(phone);
     try{
      let {tv,item}=current(reserved.ticket,phone.key);
      if(reserved.proof.expires<=now()||reserved.generation!==tv.generation)throw Error('TV approval expired. Scan the new QR code.');
      if(url.searchParams.has('error'))throw Error('TV login cancelled.');
      const verified=await passli.complete(reserved.proof,url.searchParams.get('code'));
      ({tv,item,phone}=current(reserved.ticket,phone.key));
      if(!verified.identity||verified.association?.subject!==verified.identity||!Number.isInteger(verified.achievedLoA)||verified.achievedLoA<reserved.proof.requiredLoA)throw Error('Passli did not verify the required phone approval.');
      const trust=remembered(phone,tv);
      if(reserved.automatic&&(!trust||trust.subject!==verified.identity||reserved.expectedSubject!==verified.identity)){
       // A different identity must make its own explicit first-time decision.
       delete phone.trust[tv.id];phone.message='This TV is not remembered for the current Passli identity. Review and approve it below.';savePhone(phone);
       return redirect('/tv/phone/?ticket='+reserved.ticket);
      }
      if(await passli.status(verified.association)!=='active')throw Error('Passli authorization ended before the TV login completed.');
      ({tv,item,phone}=current(reserved.ticket,phone.key));
      if(reserved.automatic&&remembered(phone,tv)?.subject!==verified.identity)throw Error('TV trust changed during login.');
      if(reserved.remember&&!reserved.automatic){if(Object.keys(phone.trust).length>=100&&!phone.trust[tv.id])throw Error('Forget an old TV before remembering another.');phone.trust[tv.id]={subject:verified.identity,generation:tv.generation,expires:now()+trustLife};}
      item.status='complete';item.completedAt=now();
      tv.session={id:random(),phoneKey:phone.key,subject:verified.identity,association:verified.association,expires:now()+sessionLife,achievedLoA:verified.achievedLoA,remembered:!!remembered(phone,tv)};tv.requestId=null;
      phone.message='Signed in on '+tv.name+'.';phone.last={ticket:item.id,device:tv.id};
      db.exec('BEGIN IMMEDIATE');try{saveRequest(item);saveTv(tv);savePhone(phone);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}publish(tv);
     }catch(error){phone=get('demo_tv_phones',phone.key)||phone;phone.message=error.message;phone.autoPausedTicket=reserved.ticket;savePhone(phone);}
     return redirect('/tv/phone/?ticket='+reserved.ticket);
    }
    if(path.startsWith('/api/tv/phone/')){
     phone=phoneFor(req,res);const ticket=url.searchParams.get('ticket');
     if(req.method==='GET'&&path==='/api/tv/phone/state'){
      const item=valid(ticket)&&get('demo_tv_requests',ticket),device=item&&tvById(item.device);
      if(item?.status==='complete'&&phone.last?.ticket===ticket)return json(200,{csrf:phone.csrf,complete:true,message:phone.message,address:'TV-'+phone.last.device});
      const {tv}=pending(ticket),trust=remembered(phone,tv);return json(200,{csrf:phone.csrf,mode,name:tv.name,address:'TV-'+tv.id,ticket,expiresAt:item.expires,remembered:!!trust,automatic:!!trust&&phone.autoPausedTicket!==ticket&&phone.pending?.ticket!==ticket,message:phone.message||''});
     }
     if(req.method!=='POST')return json(405,{error:'Method not allowed.'});
     if(req.headers.origin!==origin||req.headers['x-demo-csrf']!==phone.csrf)return json(403,{error:'Phone state changed. Reload the scanned page.'});
     lock='phone:'+phone.key;if(locks.has(lock))return json(409,{error:'This phone approval is being checked.'});locks.add(lock);
     const body=await readBody(req);
     if(mode!=='real')throw Error('This local preview cannot approve a real Passli login. Use the hosted demo.');
     if(['/api/tv/phone/approve','/api/tv/phone/auto'].includes(path))return json(200,{redirect:await begin(phone,body.ticket,{remember:body.remember,automatic:path.endsWith('/auto')})});
     if(path==='/api/tv/phone/decline'){const {item,tv}=pending(body.ticket);item.status='cancelled';saveRequest(item);tv.requestId=null;saveTv(tv);publish(tv);return json(200,{cancelled:true});}
     if(path==='/api/tv/phone/forget'){const item=get('demo_tv_requests',body.ticket),device=item&&tvById(item.device);if(!device)throw Error('Unknown TV.');delete phone.trust[device.id];phone.message='This phone forgot the TV. Future logins require approval.';savePhone(phone);if(device.session?.phoneKey===phone.key){device.session.remembered=false;saveTv(device);publish(device);}return json(200,{forgotten:true});}
     return json(404,{error:'Unknown phone action.'});
    }
    tv=tvFor(req,res);
    if(req.method==='GET'&&path==='/api/tv/state')return json(200,await sessionView(tv));
    if(req.method==='GET'&&path==='/api/tv/qr'){
     const {item,tv:target}=pending(url.searchParams.get('ticket'));if(target.key!==tv.key)return json(403,{error:'This QR code belongs to another TV.'});
     const image=qrSvg(origin+'/tv/phone/?ticket='+item.id);
     res.writeHead(200,{'Content-Type':'image/svg+xml'});res.end(image);return true;
    }
    if(req.method==='GET'&&path==='/api/tv/events'){
     const state=await sessionView(tv);res.writeHead(200,{'Content-Type':'text/event-stream','X-Accel-Buffering':'no','Connection':'keep-alive'});res.write('data: '+JSON.stringify(state)+'\n\n');
     const entries=listeners.get(tv.id)||new Set();listeners.set(tv.id,entries);entries.add(res);
     const expiry=setTimeout(()=>{const latest=tvById(tv.id);if(latest)publish(latest);},Math.max(1,(state.expiresAt||now()+sessionLife)-now()+20));expiry.unref();
     const heartbeat=setInterval(()=>res.write(': keepalive\n\n'),25000);heartbeat.unref();
     res.once('close',()=>{clearTimeout(expiry);clearInterval(heartbeat);entries.delete(res);if(!entries.size)listeners.delete(tv.id);});return true;
    }
    if(req.method!=='POST')return json(405,{error:'Method not allowed.'});
    if(req.headers.origin!==origin||req.headers['x-demo-csrf']!==tv.csrf)return json(403,{error:'TV state changed. Reload the TV page.'});
    lock='tv:'+tv.key;if(locks.has(lock))return json(409,{error:'This TV request is being checked.'});locks.add(lock);const body=await readBody(req);
    if(path==='/api/tv/start'){
     if(tv.requestId){const old=get('demo_tv_requests',tv.requestId);if(old){old.status='cancelled';saveRequest(old);}}
     limit('demo_tv_requests');tv.name=typeof body.name==='string'&&body.name.trim()?body.name.trim().slice(0,60):tv.name;tv.session=null;
     const item={id:random(),device:tv.id,generation:tv.generation,status:'pending',expires:now()+requestLife};saveRequest(item);tv.requestId=item.id;saveTv(tv);publish(tv);return json(200,view(tv));
    }
    if(['/api/tv/logout','/api/tv/forget','/api/tv/cancel'].includes(path)){
     if(tv.requestId){const item=get('demo_tv_requests',tv.requestId);if(item){item.status='cancelled';saveRequest(item);}}tv.requestId=null;tv.session=null;if(path.endsWith('/forget'))tv.generation++;saveTv(tv);publish(tv);return json(200,view(tv));
    }
    return json(404,{error:'Unknown TV action.'});
   }catch(error){return json(400,{error:error.message});}finally{if(lock)locks.delete(lock);}
  },
 };
}
