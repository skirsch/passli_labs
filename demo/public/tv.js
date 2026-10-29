const root=document.querySelector('#tv'),escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,busy=false,error='',expiry,events;
function render(){
 clearTimeout(expiry);
 const active=state?.pending&&state.expiresAt>Date.now();
 root.innerHTML=state?.authenticated?`<h1>Who’s watching?</h1><p>Signed in on ${escape(state.name)}. Your phone approved this TV login.</p><div class="preview-shelf"><div class="poster">NORTH OF HERE</div><div class="poster">THE LAST ORBIT</div><div class="poster">DEEP WATER</div></div><p class="quiet">${state.remembered?'TV remembered. Future scans can sign in without another confirmation when Passli policy permits.':'This login did not remember the TV.'}</p><button data-action="logout">Sign out of TV</button><button class="secondary" data-action="forget">Forget this TV pairing</button>`:`<h1>${active?'Scan. Approve. Watch.':'Your next great watch starts here.'}</h1><p>${active?'Scan this QR code with your phone camera, then approve the login in Passli. Keep this TV screen open.':'Sign in with Passli on your phone. No Passli app or account is needed on the TV.'}</p>${active?`<div class="tv-qr"><img src="${escape(state.qrUrl)}" width="300" height="300" alt="Scan this QR code on your phone to approve this TV login"></div><p class="quiet">This QR code expires in three minutes. A remembered TV can sign in after the scan without another confirmation.</p><button class="secondary" data-action="cancel">Cancel login</button>`:`<label for="tv-name">TV name</label><input id="tv-name" maxlength="60" value="${escape(state?.name||'Living room TV')}"><button data-action="start">Sign in with Passli</button>`}`;
 if(state)root.insertAdjacentHTML('beforeend',`<p class="tv-address">TV address: <code>${escape(state.address)}</code></p>${state.mode!=='real'?'<p class="quiet">Local visual preview. Real phone approval requires the hosted HTTPS demo.</p>':''}`);
 if(error)root.insertAdjacentHTML('beforeend',`<p role="alert" class="error">${escape(error)}</p>`);
 for(const button of root.querySelectorAll('button'))button.disabled=busy;
 if(active)expiry=setTimeout(()=>{error='This QR code expired. Start a new TV login.';state.pending=false;render();},Math.max(1,state.expiresAt-Date.now()+10));
}
async function refresh(){const response=await fetch('/api/tv/state'),body=await response.json();if(!response.ok)throw Error(body.error);state=body;render();}
root.addEventListener('click',async event=>{
 const action=event.target.closest('[data-action]')?.dataset.action;if(!action||busy||!state)return;
 const name=document.querySelector('#tv-name')?.value;busy=true;error='';render();
 try{const response=await fetch('/api/tv/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Demo-CSRF':state.csrf},body:JSON.stringify({name})}),body=await response.json();if(!response.ok)throw Error(body.error);state=body;}catch(caught){error=caught.message;}finally{busy=false;render();}
});
try{
 await refresh();const subscribe=()=>{events?.close();events=new EventSource('/api/tv/events');events.onmessage=event=>{try{state=JSON.parse(event.data);error='';render();}catch{error='Could not read TV status.';render();}};events.onerror=()=>{error='TV connection interrupted. Reconnecting to receive the current login status…';render();};};subscribe();window.addEventListener('pagehide',()=>events.close());window.addEventListener('pageshow',event=>{if(event.persisted){subscribe();void refresh().catch(caught=>{error=caught.message;render();});}});
 window.addEventListener('focus',()=>{if(!busy)void refresh().catch(caught=>{error=caught.message;render();});});
}catch(caught){root.textContent=caught.message;}
