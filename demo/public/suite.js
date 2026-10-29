const demo=location.pathname.split('/')[1],root=document.querySelector('#minisite');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,busy=false,amount='1000.00',approvalUrl='',code='',status='';
const button=(action,label,extra='')=>`<button type="button" data-action="${action}" ${busy?'disabled':''} ${extra}>${label}</button>`;
const connect=()=>button('login',state?.authenticated?'Reconnect Passli identity':'Connect with Passli');
function render(){
 document.body.className=demo+'-page';document.title=({tv:'TV app login',schwab:'Schwab mutual authentication',wire:'Bank Wire'})[demo]+' · Passli demo';
 const signed=state?.demo===demo?state.receipt:null,connected=state?.authenticated;
 const messages=`<p class="status ${status.startsWith('Error:')?'error':''}" role="status">${escape(status||state?.message)}</p>${signed?`<p class="quiet">Verified identity signature · Required LoA ${signed.requiredLoA} · Achieved LoA ${signed.achievedLoA}${signed.verificationCode?` · Signed code ${escape(signed.verificationCode)}`:''}</p>`:''}`;
 if(demo==='tv')root.innerHTML=`<div class="brand">NETFLIX</div><section class="panel-demo"><p class="kicker">THE TV EXPERIENCE · PASSLI DEMO</p><h1>${connected?'Who’s watching?':'Your next great watch starts here.'}</h1><p>${connected?'You signed in using a verified Passli identity.':'Sign in with Passli. Keep the typing on your phone and the entertainment on your TV.'}</p>${connected?'<div class="preview-shelf"><div class="poster">NORTH OF HERE</div><div class="poster">THE LAST ORBIT</div><div class="poster">DEEP WATER</div></div>':connect()}${messages}<p class="quiet">Netflix-inspired demonstration. Unaffiliated with Netflix; no subscription or playback is provided.</p></section>`;
 if(demo==='schwab')root.innerHTML=`<div class="brand">Charles Schwab</div><section class="panel-demo"><p class="eyebrow">CALL CENTER DEMONSTRATION</p><h1>Mutual authentication</h1><label for="customer">Schwab customer</label><input id="customer" value="Steve Kirsch" readonly><p>Verify the customer on the call using their Passli identity. This approval authorizes this conversation only.</p>${connected?button('start','Start mutual authentication'):connect()}${code?`<div class="code" aria-label="Agent’s spoken code">${escape(code)}</div><p>Agent: read this code to the customer. Customer: enter it in Passli, on your own device. A landline works too.</p>${approvalUrl?`<a class="approval-link" href="${escape(approvalUrl)}" target="_blank" rel="noopener">Customer: open Passli to enter the code</a>`:''}<p class="quiet">For a live demonstration, leave this agent screen visible and open the approval on the customer’s device. This page does not detect call state.</p>`:''}${messages}${state?.pending?button('cancel','Cancel verification','class="secondary"'):''}<p class="quiet">Unaffiliated Schwab demonstration. The verified Passli origin is demo.passli.app. A spoken code reduces accidental approvals; it does not prevent a scammer from relaying a code.</p></section>`;
 if(demo==='wire'){
  const value=Number(amount),loa=value<1000?3:value<=5000?4:5;
  root.innerHTML=`<div class="brand">WELLS FARGO</div><section class="panel-demo"><p class="eyebrow">WIRE TRANSFER DEMONSTRATION</p><h1>Approve a wire</h1><p>Review this wire to OpenAI before approving with Passli.</p><label for="amount">Wire amount (USD)</label><input id="amount" type="number" min="0.01" max="99999999.99" step="0.01" value="${escape(amount)}"><div class="details"><span>Recipient</span><strong>OpenAI</strong><span>Routing number (fictional)</span><strong>000000000</strong><span>Account number (fictional)</span><strong>000123456789</strong><span>Required assurance</span><strong id="loa">LoA ${loa}</strong></div>${connected?button('start','Approve wire with Passli'):connect()}<p class="quiet">Below $1,000: LoA 3. $1,000–$5,000: LoA 4. Above $5,000: LoA 5. Passli settings may require stronger assurance.</p>${messages}${state?.pending?button('cancel','Cancel wire','class="secondary"'):''}<p class="quiet">Unaffiliated Wells Fargo demonstration. The bank details are fictional. Approving signs an authorization; no wire is sent.</p></section>`;
 }
 if(state?.pending&&state.demo===demo)root.insertAdjacentHTML('beforeend',button('check','Check approval result'));
}
async function refresh(){const response=await fetch('/api/demo-suite/state');if(!response.ok)throw Error('Could not load demo.');state=await response.json();if(state.demo==='schwab')code=state.code||'';render();}
async function send(action,extra={}){
 if(busy)return;busy=true;render();
 try{const response=await fetch('/api/demo-suite/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Demo-CSRF':state.csrf},body:JSON.stringify({demo,...extra})}),result=await response.json();if(!response.ok)throw Error(result.error||'Request failed.');
  if(result.redirect){location.assign(result.redirect);return;}
  if(result.approvalUrl){approvalUrl=result.approvalUrl;code=result.code;status='Read the code to the customer. Awaiting the identity-signed response.';}
  else if(result.pending)status='Waiting for Passli approval. Finish in Passli, then check again.';
  else{status='';approvalUrl='';code='';}
  await refresh();
 }catch(error){status='Error: '+error.message;}finally{busy=false;render();}
}
root.addEventListener('input',event=>{if(event.target.id==='amount'){amount=event.target.value;document.querySelector('#loa').textContent='LoA '+(Number(amount)<1000?3:Number(amount)<=5000?4:5);}});
root.addEventListener('click',event=>{const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;if(action==='check'){const requestId=new URL(location.href).searchParams.get('signatureResult')||state.requestId;void send('result',{requestId});}else void send(action,{amount});});
window.addEventListener('focus',()=>{if(!busy&&state)void refresh().catch(error=>{status='Error: '+error.message;render();});});
try{await refresh();const params=new URL(location.href).searchParams;if(params.has('signatureResult'))await send('result',{requestId:params.get('signatureResult')});}catch(error){root.textContent='Could not load demo: '+error.message;}
