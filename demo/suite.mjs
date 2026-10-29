import {randomBytes,randomInt} from 'node:crypto';
const random=()=>randomBytes(32).toString('base64url');
export function wireDetails(value='1000.00'){
 if(typeof value!=='string'||!/^\d{1,8}(\.\d{1,2})?$/.test(value))throw Error('Enter a positive USD amount with at most two decimal places.');
 const [whole,fraction='']=value.split('.'),cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(cents<=0)throw Error('Enter an amount greater than zero.');
 const amount=(cents/100).toFixed(2),requiredLoA=cents<100000?3:cents<=500000?4:5;
 return {text:`Wells Fargo wire demonstration. Approve USD ${amount} to OpenAI. Routing number: 000000000. Account number: 000123456789. These are fictional bank details. No money will move.`,json:{amount,currency:'USD'},requiredLoA};
}
export function createSuite({db,passli,mode,origin,now=Date.now}){
 db.exec('CREATE TABLE IF NOT EXISTS demo_suite (id TEXT PRIMARY KEY, state TEXT NOT NULL)');
 const load=db.prepare('SELECT state FROM demo_suite WHERE id=?'),save=db.prepare('INSERT INTO demo_suite VALUES (?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state');
 const locks=new Set(),cookieName=(origin.startsWith('https:')?'__Host-':'')+'passli-demo-suite';
 return async(req,res,path)=>{
  const url=new URL(req.url,origin),callback=path==='/auth/passli/callback';
  const returning=path==='/'&&url.searchParams.has('signatureResult');
  if(!path.startsWith('/api/demo-suite/')&&!callback&&!returning)return false;
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));return true;};
  const redirect=path=>{res.writeHead(303,{Location:path});res.end();return true;};
  let id=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1),state;
  db.prepare("DELETE FROM demo_suite WHERE json_extract(state,'$.expires') <= ?").run(now());
  const row=id&&load.get(id);if(row){try{state=JSON.parse(row.state);}catch{}}
  // Share the registered callback with Northstar without changing the opaque
  // Direct state. Only the exact pending suite state selects this handler.
  if(callback&&(!state?.login||state.login.state!==url.searchParams.get('state')))return false;
  if(!state||state.expires<=now()){
   if(callback)return json(403,{error:'Demo login expired. Start again.'});
   if(db.prepare('SELECT COUNT(*) AS count FROM demo_suite').get().count>=1000)return json(429,{error:'Too many demo sessions. Try again later.'});
   id=random();state={csrf:random(),expires:now()+1800000};
   res.setHeader('Set-Cookie',`${cookieName}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1800${origin.startsWith('https:')?'; Secure':''}`);
  }
  const persist=()=>save.run(id,JSON.stringify(state));
  if(returning){if(!state.proof||state.proof.requestId!==url.searchParams.get('signatureResult'))return false;return redirect('/'+state.demo+'/?'+url.searchParams.toString());}
  if(locks.has(id))return json(409,{error:'This demo request is being checked. Wait for it to finish.'});
  locks.add(id);
  try{
   if(callback){
    const proof=state.login;
    if(!proof||proof.state!==url.searchParams.get('state')||proof.expires<=now())throw Error('Demo login expired or does not match this browser.');
    delete state.login;persist();
    if(url.searchParams.has('error')){state.message='Passli login cancelled.';persist();return redirect('/'+state.demo+'/');}
    const verified=await passli.complete(proof,url.searchParams.get('code'));state.association=verified.association;state.message='Passli identity verified.';persist();return redirect('/'+state.demo+'/');
   }
   if(req.method==='GET'&&path==='/api/demo-suite/state'){
    persist();return json(200,{csrf:state.csrf,mode,authenticated:!!state.association,message:state.message||'',demo:state.demo,pending:!!state.proof,requestId:state.proof?.requestId,code:state.demo==='schwab'?state.proof?.verificationCode:undefined,receipt:state.receipt});
   }
   if(req.method!=='POST')return json(405,{error:'Method not allowed.'});
   if(req.headers.origin!==origin||req.headers['x-demo-csrf']!==state.csrf)return json(403,{error:'Demo state changed. Reload before continuing.'});
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)throw Error('Request too large.');}const body=JSON.parse(raw);
   if(!['schwab','wire'].includes(body.demo))throw Error('Choose a demo.');
   const action=path.slice('/api/demo-suite/'.length);
   if(action==='login'){
    if(mode!=='real')throw Error('Real Passli login is available on the hosted demo. This is a local preview.');
    state.demo=body.demo;state.proof=null;state.receipt=null;
    const proof={action:'login',expires:now()+60000},target=passli.begin(proof);state.login=proof;persist();return json(200,{redirect:target});
   }
   if(!state.association||mode!=='real')throw Error('Connect your Passli identity before starting this demo.');
   if(await passli.status(state.association)!=='active'){state.association=null;state.proof=null;throw Error('Passli authorization ended. Connect again.');}
   if(action==='start'){
    if(state.proof)throw Error('Finish or cancel your pending demo first.');
    state.demo=body.demo;state.receipt=null;
    const details=body.demo==='wire'?wireDetails(body.amount):{text:'Schwab mutual authentication demonstration. Customer: Steve Kirsch. Verify my identity for this call only. This does not authorize a wire, payment or account change.',requiredLoA:4,verificationCode:String(randomInt(0,100)).padStart(2,'0')};
    state.proof=await passli.createDemoApproval(state.association,details);persist();return json(200,body.demo==='schwab'?{code:state.proof.verificationCode,approvalUrl:state.proof.approvalUrl+'&signatureReturn=demo'}:{redirect:state.proof.approvalUrl+'&signatureReturn=demo'});
   }
   if(action==='cancel'){state.proof=null;state.message='Demo request cancelled.';persist();return json(200,{cancelled:true});}
   if(action==='result'){
    if(state.demo!==body.demo||!state.proof||state.proof.requestId!==body.requestId||state.proof.expiresAt*1000<=now())throw Error('This approval expired or belongs to another demo.');
    const result=await passli.demoApprovalResult(state.proof);
    if(result.pending)return json(200,{pending:true});
    if(result.cancelled){state.message=state.demo==='schwab'?(result.fraudReported?'Call verification declined. Fraud concern recorded in this demo only.':'Call verification cancelled.'):'Wire approval cancelled.';state.proof=null;persist();return json(200,{cancelled:true});}
    if(await passli.status(state.association)!=='active')throw Error('Passli authorization ended before verification.');
    state.receipt={text:result.fields.text,requiredLoA:result.fields.requiredLoA,achievedLoA:result.fields.achievedLoA,verificationCode:result.fields.verificationCode,verified:true};state.proof=null;state.message=state.demo==='schwab'?'Customer identity and spoken code verified by digital signature.':'Wire authorization verified. Demo only — no money moved.';persist();return json(200,{verified:true});
   }
   throw Error('Unknown demo action.');
  }catch(error){persist();return json(400,{error:error.message});}finally{locks.delete(id);}
 };
}
