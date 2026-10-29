const demo=location.pathname.split('/')[1],root=document.querySelector('#minisite');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,busy=false,amount='1000.00',approvalUrl='',code='',status='';
const button=(action,label,extra='')=>`<button type="button" data-action="${action}" ${busy?'disabled':''} ${extra}>${label}</button>`;
const connect=()=>button('login',state?.authenticated?'Reconnect Passli identity':'Connect with Passli');
function render(){
 document.body.className=demo+'-page';document.title=({tv:'TV app login',schwab:'Schwab mutual authentication',wire:'Bank Wire'})[demo]+' · Passli demo';
 const signed=state?.demo===demo?state.receipt:null,connected=state?.authenticated;
 const messages=`<p class="status ${status.startsWith('Error:')?'error':''}" role="status">${escape(status||state?.message)}</p>${signed?`<p class="quiet">Verified identity signature · Required LoA ${signed.requiredLoA} · Achieved LoA ${signed.achievedLoA}${signed.verificationCode?` · Signed code ${escape(signed.verificationCode)}`:''}</p>`:''}`;
 if(demo==='schwab')root.innerHTML=`<div class="brand">Charles Schwab</div><section class="panel-demo"><p class="eyebrow">CALL CENTER DEMONSTRATION</p><h1>Mutual authentication</h1><label for="customer">Schwab customer</label><input id="customer" value="Steve Kirsch" readonly><p>Traditional phone calls do not provide cryptographic mutual authentication and can be vulnerable to man-in-the-middle attacks.</p><p>Mutual authentication assurance requires a digital channel that authenticates both parties and binds their identities to the call. Passli CallerID is designed to let Passli users make and receive secure calls in the Passli mobile app or in a browser, including calls to and from corporate call centers.</p><p class="quiet">Secure calling is under development. This demo currently demonstrates signed identity approval only; it does not place an audio call or contact Schwab.</p>${button(connected?'start':'login','Call Schwab')}${code?`<div class="code" aria-label="Agent’s spoken code">${escape(code)}</div><p>Agent: read this code to the customer. Customer: enter it in Passli, on your own device. A landline works too.</p>${approvalUrl?`<a class="approval-link" href="${escape(approvalUrl)}" target="_blank" rel="noopener">Customer: open Passli to enter the code</a>`:''}<p class="quiet">For a live demonstration, leave this agent screen visible and open the approval on the customer’s device. This page does not detect call state.</p>`:''}${messages}${state?.pending?button('cancel','Cancel verification','class="secondary"'):''}<p class="quiet">Unaffiliated Schwab demonstration. The verified Passli origin is demo.passli.app. A spoken code reduces accidental approvals; it does not prevent a scammer from relaying a code.</p></section>`;
 if(demo==='wire'){
  const result=state?.demo==='wire'?state.wireResult:null;
  if(result){
   const approved=result.outcome==='approved';
   root.innerHTML=`<div class="brand">WELLS FARGO</div><section class="panel-demo"><p class="eyebrow">WIRE APPROVAL RESULT</p><h1>${approved?'Amount approved':'Amount not approved'}</h1><p class="amount">${escape(new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(result.amount)))}</p><p>Wire to <strong>OpenAI</strong></p><p class="status ${approved?'':'error'}" role="status"><strong>${approved?'Success':result.outcome==='cancelled'?'Cancelled':'Approval failed'}</strong><br>${escape(result.message)}</p>${approved&&signed?`<p class="quiet">Verified identity signature · Required LoA ${signed.requiredLoA} · Achieved LoA ${signed.achievedLoA}</p>`:''}<p class="quiet">Demonstration only. No money moved.</p>${button('return','Return to Wire funds')}</section>`;
   return;
  }
  const value=Number(amount),loa=value<1000?3:value<=5000?4:5;
  root.innerHTML=`<div class="brand">WELLS FARGO</div><section class="panel-demo"><p class="eyebrow">WIRE TRANSFER DEMONSTRATION</p><h1>Wire funds</h1><p>Review this wire to OpenAI before approving with Passli.</p><label for="amount">Wire amount (USD)</label><input id="amount" type="number" min="0.01" max="99999999.99" step="0.01" value="${escape(amount)}"><div class="details"><span>Recipient</span><strong>OpenAI</strong><span>Routing number (fictional)</span><strong>000000000</strong><span>Account number (fictional)</span><strong>000123456789</strong><span>Required assurance</span><strong id="loa">LoA ${loa}</strong></div>${connected?button('start','Approve wire with Passli'):connect()}<p class="quiet">Below $1,000: LoA 3. $1,000–$5,000: LoA 4. Above $5,000: LoA 5. Passli settings may require stronger assurance.</p>${messages}${state?.pending?button('cancel','Cancel wire','class="secondary"'):''}<p class="quiet">Unaffiliated Wells Fargo demonstration. The bank details are fictional. Approving signs an authorization; no wire is sent.</p></section>`;
 }
 if(state?.pending&&state.demo===demo)root.insertAdjacentHTML('beforeend',button('check','Check approval result'));
}
async function refresh(){const response=await fetch('/api/demo-suite/state');if(!response.ok)throw Error('Could not load demo.');state=await response.json();if(state.demo==='schwab')code=state.code||'';if(state.demo==='wire'&&state.wireResult)amount=state.wireResult.amount;render();}
async function send(action,extra={}){
 if(busy)return;busy=true;render();
 try{const response=await fetch('/api/demo-suite/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Demo-CSRF':state.csrf},body:JSON.stringify({demo,...extra})}),result=await response.json();if(!response.ok)throw Error(result.error||'Request failed.');
  if(result.redirect){location.assign(result.redirect);return;}
  if(result.approvalUrl){approvalUrl=result.approvalUrl;code=result.code;status='Read the code to the customer. Awaiting the identity-signed response.';}
  else if(result.pending)status='Waiting for Passli approval. Finish in Passli, then check again.';
  else{status='';approvalUrl='';code='';}
  if(action==='return')history.replaceState(null,'','/wire/');
  await refresh();
 }catch(error){status='Error: '+error.message;if(demo==='wire'&&action==='result')await refresh().catch(()=>{});}finally{busy=false;render();}
}
root.addEventListener('input',event=>{if(event.target.id==='amount'){amount=event.target.value;document.querySelector('#loa').textContent='LoA '+(Number(amount)<1000?3:Number(amount)<=5000?4:5);}});
root.addEventListener('click',event=>{const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;if(action==='check'){const requestId=new URL(location.href).searchParams.get('signatureResult')||state.requestId;void send('result',{requestId});}else void send(action,{amount});});
window.addEventListener('focus',()=>{if(!busy&&state)void refresh().catch(error=>{status='Error: '+error.message;render();});});
try{await refresh();const params=new URL(location.href).searchParams;if(params.has('signatureResult')&&state.wireResult?.requestId!==params.get('signatureResult'))await send('result',{requestId:params.get('signatureResult')});}catch(error){root.textContent='Could not load demo: '+error.message;}
