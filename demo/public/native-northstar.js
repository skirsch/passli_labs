const el=id=>document.getElementById(id);let state,ticket=null,stage='waiting',busy=false,waiting,noteDraft=null,choosing=false;
function passliURL(link,operation){return 'https://passli.app/?'+new URLSearchParams({nativeRP:link,...(['discover','login','create_account'].includes(operation)?{compactRP:'1'}:{})});}
async function api(path,body){const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-Demo-CSRF':state?.csrf||''}:{},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});const type=response.headers.get('content-type')||'';if(!type.includes('application/json'))throw Error('Northstar returned an unexpected response (HTTP '+response.status+'). The request could not be confirmed.');const value=await response.json();if(!response.ok)throw Error(value.error||'Request failed.');return value;}
function render(){const a=state.account;el('app').className=a?'wide':'';if(!a)noteDraft=null;else if(noteDraft?.accountID!==a.id||!noteDraft.dirty)noteDraft={accountID:a.id,text:a.notes,dirty:false};const unlinking=!!ticket&&state.pendingOperation==='unlink';el('signed-in').hidden=!a||!!ticket&&!unlinking;const choice=choosing||state.accountChoice;el('signed-out').hidden=!!a||!!ticket||choice;el('account-choice').hidden=!choice;el('approval').hidden=!ticket||choice||unlinking;el('approval-heading').textContent=state.pendingOperation==='unlink'?'Approve unlinking in Passli':state.pendingOperation==='link'?'Approve linking in Passli':'Approve in Passli';const existing=state.setup==='link-existing';el('signin-heading').textContent=existing?'Sign in to your existing account':'Sign in to Northstar';el('passli-login').hidden=existing;el('existing-help').hidden=!existing;el('cancel-existing').hidden=!existing;if(a){el('welcome').textContent='Welcome '+a.name+'!';el('identity').textContent='Northstar account: '+a.id;el('demo-login').textContent='Demo-only alternative login: '+a.email+' with password demo. Save this address to return after unlinking.';el('notes').value=noteDraft.text;el('link-state').textContent=a.linked?'Passli Linked':'Passli is not linked.';el('link').hidden=a.linked;el('unlink').hidden=!a.linked;el('unlink').textContent=unlinking?'Continue unlink request':'Unlink Passli';}for(const b of document.querySelectorAll('button'))b.disabled=busy;}
async function refresh(){state=await api('/api/northstar/state');ticket=state.ticket||null;if(ticket){stage='waiting';const link='passli://rp-login?'+new URLSearchParams({origin:location.origin,ticket});el('continue').href=passliURL(link,state.pendingOperation);}render();if(ticket&&state.pendingOperation!=='unlink')el('approval').focus();}
async function run(work){if(busy)return;busy=true;el('error').textContent='';if(state)render();try{await work();}catch(e){el('error').textContent=e.message;}finally{busy=false;if(state)render();}}
async function action(action,extra={}){state=await api('/api/northstar/action',{action,...extra});render();}
async function check(){if(!ticket||waiting)return;const active=ticket;waiting=true;try{for(let i=0;i<4&&ticket===active;i++){const next=await api('/api/identity/handoff/'+active+'?wait='+stage);if(ticket!==active)return;if(next.stage==='proof'&&next.transaction?.operation==='create_account'){if(state.setup==='create-new'){await api('/api/identity/handoff/'+active+'/finish',{createAccount:true});ticket=null;await refresh();el('status').textContent='Your Northstar account is ready.';}else{await refresh();el('status').textContent='Choose how to use Passli with Northstar.';}return;}if(['proof','complete'].includes(next.stage)){if(next.stage==='proof')await api('/api/identity/handoff/'+active+'/finish',{});ticket=null;await refresh();el('status').textContent='Passli action completed.';return;}if(next.stage==='cancelled')throw Error('Approval cancelled.');if(next.stage===stage){el('status').textContent='Approval pending. Check again after approving in Passli.';return;}stage=next.stage;}}catch(e){el('error').textContent=e.message;}finally{waiting=false;render();}}
async function start(operation,prepare){
 if(busy)return;
 if(ticket){if(operation==='unlink'&&state.pendingOperation==='unlink')window.location.assign(el('continue').href);return;}
 const popup=operation==='unlink'?null:window.open('about:blank','northstar-passli');
 await run(async()=>{try{
  if(prepare)await prepare();choosing=false;await api('/api/identity/context');
  const handoff=await api('/api/identity/handoff',{operation});ticket=handoff.ticket;state.pendingOperation=operation;stage='waiting';
  const url=passliURL(handoff.link,operation);el('continue').href=url;
  if(operation==='unlink'){window.location.assign(url);return;}
  if(popup){popup.opener=null;popup.location.replace(url);}render();el('approval').focus();
 }catch(e){popup?.close();throw e;}});
 if(ticket&&operation!=='unlink')void check();
}
async function resumeReturn(){
 await refresh();const hash=location.hash||'';
 if(!hash.startsWith('#passli-handoff=')&&!hash.startsWith('#passli-cancel='))return;
 window.history.replaceState(null,'',location.pathname+location.search);
 if(!ticket)return;
 if(hash==='#passli-cancel='+ticket){await action('cancel');ticket=null;render();el('status').textContent='Request cancelled.';}
 else if(hash==='#passli-handoff='+ticket)await check();
}

el('password-form').onsubmit=e=>{e.preventDefault();const login=()=>action('password-login',{email:el('email').value,password:el('password').value});if(state?.setup==='link-existing')void start('link',login);else void run(login);};
el('login').onclick=()=>{if(busy||ticket)return;choosing=true;el('error').textContent='';el('status').textContent='';render();};el('link').onclick=()=>void start('link');el('unlink').onclick=()=>void start('unlink');
el('notes').oninput=()=>{if(noteDraft){noteDraft.text=el('notes').value;noteDraft.dirty=true;}};
el('save').onclick=()=>{const notes=el('notes').value;void run(async()=>{await action('notes-save',{notes});if(noteDraft)noteDraft.dirty=false;el('status').textContent='Note saved.';});};
el('logout').onclick=()=>void run(async()=>{await action('logout');ticket=null;});el('cancel').onclick=()=>void run(async()=>{await action('cancel');ticket=null;choosing=false;});el('check').onclick=()=>void check();
el('choose-existing').onclick=()=>void run(async()=>{await action('choose-existing');ticket=null;choosing=false;el('status').textContent='';});
el('choose-create').onclick=()=>{if(!ticket){void start('discover',()=>action('choose-new'));return;}void run(async()=>{await api('/api/identity/handoff/'+ticket+'/finish',{createAccount:true});ticket=null;choosing=false;await refresh();el('status').textContent='Your Northstar account is ready.';});};
for(const id of ['cancel-choice','cancel-existing'])el(id).onclick=el('cancel').onclick;
window.addEventListener('focus',()=>{if(!busy&&ticket)void check();else if(!busy)void resumeReturn().catch(e=>{el('error').textContent=e.message;});});
void resumeReturn().catch(e=>{el('error').textContent=e.message;});
