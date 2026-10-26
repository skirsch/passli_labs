const app = document.querySelector('#app');
const endpoint = path => (location.pathname.startsWith('/walkthrough/') ? '/walkthrough' : '') + path;
let state;
let noteDraft;
let checkoutPopup;
const dollars=cents=>'$'+(cents/100).toFixed(2);
setInterval(()=>{if(!document.hidden&&!actionBusy&&state?.screen==='checkout-wait'&&state.mode==='real'&&state.cart?.approval?.status==='pending')void send('checkout-status',{checkoutId:state.cart.approval.id});},2000);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const action = (name, label, style = 'primary', extra = '') => `<button ${extra.includes('type=') ? '' : 'type="button"'} class="${style}" data-action="${name}" ${extra}>${label}</button>`;
const cancel = () => action('cancel', 'Cancel', 'subtle cancel');
const heading = (title, text = '') => `<div class="auth-heading"><h1>${title}</h1>${text ? `<p class="muted">${text}</p>` : ''}</div>`;
const passliButton = () => {const hidden=(state.mode === 'real' ? discovered : state.installed)?'':'hidden';return `<div class="divider" ${hidden}>or</div><button type="button" class="provider" data-action="passli-start" ${hidden}><img src="/passli-mark.svg" alt="" width="20" height="20">Continue with Passli</button>`;};
const localForm = (purpose = 'login') => `<form data-form="${purpose}"><label for="username">Email address</label><input id="username" name="username" type="email" maxlength="254" required autocomplete="off" value="avery@example.test"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="off" value="demo" required><p class="small muted">Enter any email address with password <strong>demo</strong> to try a fictional existing account. No email is sent or verified.</p>${action(purpose, purpose === 'login' ? 'Sign in' : 'Sign in to existing account', 'primary', 'type="submit"')}</form>`;
let expiryTimer;
let actionBusy=false,refreshBusy=false,stateRevision=0;
setInterval(()=>{if(!document.hidden&&(state?.sessionMethod==='passli'||state?.screen==='account-choice'||state?.screen==='profile-sharing'||state?.pendingAction==='register'))void refresh().catch(()=>notice('Could not check your session. Please try again.'));},2000);

function render() {
  const account = state.account;
  if(!account)noteDraft=null;else if(noteDraft?.accountId!==account.id||!noteDraft.dirty)noteDraft={accountId:account.id,text:account.notes||'',dirty:false};
  clearTimeout(expiryTimer);
  if(account?.expiresAt)expiryTimer=setTimeout(()=>void refresh().catch(()=>notice('Reload to check account expiry.')),Math.max(100,account.expiresAt-Date.now()+50));
  app.className = ['home','settings','cart','checkout-wait','checkout-confirm','purchase-complete'].includes(state.screen) ? 'wide' : '';
  document.querySelector('#mode-label').textContent = state.modeLabel;
  document.querySelector('#walkthrough-link').hidden = state.mode !== 'real';
  document.querySelector('#installation').value = String(state.installed);
  document.querySelector('#installation').disabled = state.mode === 'real';
  document.querySelector('[data-action="reset"]').hidden = state.mode === 'real';
  document.querySelector('.tools-body > .muted').textContent = state.mode === 'real' ? 'This site uses real Passli Direct login. Northstar accounts and projects are fictional. The Passli button appears after extension discovery; unsupported app-only discovery remains hidden.' : 'Try the full journey with fictional accounts. Approvals and installation status are simulated.';
  document.querySelector('#header-actions').innerHTML = account ? `${action('home', 'Overview', 'subtle')}${action('cart', 'Cart', 'subtle')}${action('settings', 'Settings', 'subtle')}${action('logout', 'Sign out', 'subtle')}` : '';
  document.querySelector('#session-tools').innerHTML = state.mode === 'walkthrough' && state.sessionMethod === 'passli' ? `${action('suspend', 'Simulate Passli session suspension', 'subtle')}${action('terminate', 'Simulate Passli session termination', 'subtle')}${action('provider-error', 'Simulate provider unavailable', 'subtle')}` : '';
  const views = {
    login: () => `<div class="auth-heading"><span class="star" aria-hidden="true">✳</span><h1>Sign in to Northstar</h1></div>${localForm()}${passliButton()}<p class="center space-top">New to Northstar? ${action('register-local', 'Create an account', 'subtle')}</p><p class="small muted center space-top">Use only the public demo password above.<br>Never enter a real password here.</p>`,
    setup: () => `${heading('Finish setting up Login with Passli', 'Do you already have an account on Northstar?')}<div class="stack">${action('choose-link', '<strong>Link to my existing account</strong><span>Keep your projects, settings and history.</span>', 'choice')}${action('choose-create', '<strong>Create new account</strong><span>Start fresh with a separate Northstar account.</span>', 'choice')}</div>${cancel()}<p class="small muted center space-top">You are not signed in to Northstar yet.</p>`,
    'account-choice': () => `${heading('Choose your account', 'These Northstar accounts are linked to your Passli identity.')}<div class="stack">${state.accountChoices.map(account=>action('select-account',`<strong>${escape(account.name)}</strong><span>${escape(account.email)}</span>`,'choice',`data-account="${escape(account.id)}"`)).join('')}</div>${cancel()}<p class="small muted center space-top">Choose an account to finish signing in.</p>`,
    'link-login': () => `${heading('Sign in to your existing account', 'For this demo, enter any email address with password demo.')}${localForm('link-login')}${cancel()}`,
    'link-confirm': () => `${heading(`Link Passli to ${escape(account?.name)}?`, 'Next time, use Passli to sign in to this same account.')}<div class="panel"><strong>${escape(account?.name)}</strong><div class="muted">${escape(account?.email)}</div><p class="small muted space-top">Your projects, settings and other login methods stay with this account.</p></div>${action('confirm-link', 'Link Passli')}${cancel()}`,
    register: () => `${heading('Create your Northstar account', 'Passli will ask you to share your name, phone and email.')}<button type="button" class="provider" data-action="register"><img src="/passli-mark.svg" alt="" width="20" height="20">Create account with Passli</button><p class="small muted center space-top">Your account, shared information and Passli link will be forgotten 30 minutes after creation.</p>${cancel()}`,
    'profile-sharing': () => `${heading('Share your information with Northstar', 'Choose your name, phone and email in Passli. Your Northstar account will be created after you approve sharing.')}<button type="button" class="provider" data-pii-share>Open Passli to share information</button>${cancel()}`,
    approval: () => state.mode === 'real' ? `${heading('Complete your approval in Passli', 'Return here when you finish, or cancel and start again.')}${cancel()}` : `<img class="approval-mark" src="/passli-mark.svg" alt="Passli">${heading(state.pendingAction === 'unlink' ? 'Approve unlinking from Northstar' : state.pendingAction === 'link' ? 'Approve linking to Northstar' : state.pendingAction === 'register' ? 'Approve your new account' : state.pendingAction === 'resume' ? 'Resume your session' : 'Continue to Northstar', state.pendingAction === 'unlink' ? 'Simulated LoA 4 unlink approval' : 'Simulated Passli approval')}<div class="callout">This walkthrough simulates approval. It does not contact your real Passli account.</div><label for="identity">Fictional Passli identity</label><select id="identity"><option value="demo-alice">Alex’s Passli account</option><option value="demo-bob">Another Passli account</option></select>${action('approve', 'Approve in this demo')}${cancel()}`,
    home: () => `${heading(account?.name?.trim() ? `Welcome ${escape(account.name.trim())}!` : 'Welcome!', 'Your Northstar workspace')}<div class="row"><h2>Projects</h2>${action('settings', 'Account settings', 'secondary')}</div><div class="panel"><div class="record"><strong>Website refresh</strong><div class="muted small">Design review · Updated today</div></div><div class="record"><strong>Autumn launch</strong><div class="muted small">Planning · 3 tasks remaining</div></div><div class="record"><strong>Personal notes</strong><div class="muted small">Private workspace</div></div></div><p class="muted small">These sample projects belong to your Northstar account. Linking or unlinking Passli does not delete them.</p><section class="panel" aria-labelledby="notes-heading"><h2 id="notes-heading">Notes</h2><p class="muted small">Save a note to see your context return when you sign in to this same account again. Your note and account are forgotten 30 minutes after account creation.</p><form data-form="notes-save"><label for="notes">Your note</label><textarea id="notes" name="notes" rows="5" maxlength="2000" placeholder="Write something to remember on your next login…">${escape(noteDraft?.text)}</textarea>${action('notes-save', 'Save note', 'primary', 'type="submit"')}</form></section>`,
    cart: () => `${heading('Your cart', 'Every item is $50.00. No added tax or shipping in this demo.')}<div class="panel"><div class="row"><strong>Northstar item</strong><strong>$50.00 each</strong></div><p>Quantity: <strong>${state.cart.quantity}</strong></p><div class="row">${action('cart-add','Add item to cart','secondary')}${action('cart-remove','Remove item from cart','subtle',state.cart.quantity?'':'disabled')}</div></div><p class="cart-total">Total: ${dollars(state.cart.totalCents)}</p>${state.cart.approval?action('checkout-resume','Continue checkout','provider checkout-button'):action('checkout-start','<img src="/passli-mark.svg" alt="" width="26" height="26"> Checkout with Passli','provider checkout-button',state.cart.quantity?'':'disabled')}<p class="small muted">Approve your maximum amount, card reference and shipping address in Passli, then return here to click Purchase. Demo only — no card is charged.</p><p class="muted">Purchases completed: ${dollars(state.cart.purchasedCents)}. Passli applies your device’s cumulative authorization allowance; an approved amount counts even if you do not click Purchase.</p>`,
    'checkout-wait': () => `${heading('Approve checkout with Passli', state.mode==='real'?'Complete approval in the Passli popup.':'Simulated Passli popup — fictional card and address.')}<div class="panel"><p>Maximum amount authorized: <strong>${dollars(state.cart.totalCents)}</strong></p>${state.mode==='walkthrough'?'<p>Card: <strong>My AMEX •••• 1009</strong></p><p>Ship to: <strong>My home</strong><br>50 Example Street, Example City, CA 94000, US</p><p>Approve release of this fictional address and masked card reference.</p><p>Simulated allowance: $100.00. LoA 2 within the allowance; LoA 4 when exceeded. A successful overage approval resets the allowance.</p>':'<p role="status">Waiting for Passli approval…</p><p>Choose your saved card and address in Passli. This site receives only the masked card reference and the address you approve.</p>'}</div>${state.mode==='walkthrough'?action('checkout-demo-approve','Approve amount and share information'):action('checkout-open','Open Passli approval','provider')}${action('checkout-cancel','Cancel checkout','subtle cancel')}`,
    'checkout-confirm': () => `${heading('Review your purchase', 'Passli approved this order. Click Purchase to place the demo order.')}<div class="panel"><p>${state.cart.quantity} item(s) × $50.00</p><p class="cart-total">Total: ${dollars(state.cart.totalCents)}</p><p>Maximum amount authorized: ${dollars(state.cart.totalCents)}</p><p>Card: <strong>${escape(state.cart.approval.selection.card.label)} •••• ${escape(state.cart.approval.selection.card.last4)}</strong></p><p>Ship to: <strong>${escape(state.cart.approval.selection.address.label)}</strong><br>${['street','city','region','postalCode','country'].map(k=>escape(state.cart.approval.selection.address[k])).join(', ')}</p><p>Required LoA ${state.cart.approval.requiredLoA} · Achieved LoA ${state.cart.approval.achievedLoA}</p></div>${action('purchase','Purchase '+dollars(state.cart.totalCents))}${action('checkout-cancel','Cancel','subtle cancel')}<p class="muted small">Demo order. No charge will be made.</p>`,
    'purchase-complete': () => `${heading('Demo purchase complete', 'No card was charged.')}<div class="panel"><p>${state.cart.receipt.quantity} item(s) · ${dollars(state.cart.receipt.totalCents)}</p><p>${escape(state.cart.receipt.card)} · Ship to ${escape(state.cart.receipt.address)}</p><p>Required LoA ${state.cart.receipt.requiredLoA} · Achieved LoA ${state.cart.receipt.achievedLoA}</p><p>Cumulative purchases: ${dollars(state.cart.purchasedCents)}</p></div>${action('cart','Back to cart')}`,
    settings: () => `${heading('Account settings', 'Manage how you sign in to Northstar.')}<div class="panel"><h2>${escape(account?.name)}</h2><p class="muted">${escape(account?.email)}</p><p class="muted">${escape(account?.phone)}</p></div><h2>Login & security</h2><div class="panel"><div class="row"><div><strong>Password</strong><div class="muted small">Demo password available as an alternative login.</div></div><span class="badge">Available</span></div></div><div class="panel"><div class="panel-head"><img src="/passli-mark.svg" alt=""><div><h2>Passli ${account?.linked ? '<span class="badge">Linked</span>' : ''}</h2><span class="muted small">${account?.linked ? 'Sign in to this account using Passli.' : 'Add Passli as another way to sign in.'}</span></div></div>${action('settings-link', 'Link Passli', 'secondary')}${account?.linked ? action('unlink', 'Unlink Passli', 'danger') : ''}</div><p class="muted small">Signing out ends this site session. Unlinking removes the login association.</p><h2>Delete account</h2><div class="panel"><p>Delete your Northstar account and its Passli linkage. Your Passli account will remain.</p>${account?.linked ? '<p class="muted small">First approve unlinking in Passli, then return here to confirm deletion.</p>' : ''}${action('delete-account-start', 'Delete my Account', 'danger')}</div>`,
    'delete-confirm': () => `${heading('Delete your Northstar account?', 'This permanently deletes this Northstar account and its data.')}<div class="callout warning"><strong>${escape(state.deletion?.name)}</strong><p>${escape(state.deletion?.email)}</p>Your Passli account will remain. Any Passli link to this Northstar account has been removed.</div>${action('delete-account-confirm', 'Delete my Account', 'danger')}${cancel()}`,
    suspended: () => `${heading('Session suspended', 'Open the Passli mobile app and tap Disabled devices to review and re-enable this device.')}<div class="callout">Your workspace is locked. Your account is still linked.</div>${state.mode==='real'?action('check-session', 'Check device status', 'provider'):action('resume-start','Open Passli','provider')}${action('logout', 'Log out of this site', 'subtle cancel')}`
  };
  app.innerHTML = (views[state.screen] || views.login)();
}

async function refresh() {
  if(actionBusy||refreshBusy)return;
  refreshBusy=true;const revision=stateRevision;
  try{
  const response = await fetch(endpoint('/api/state'), {cache:'no-store'});
  if (!response.ok) throw Error('Could not load the demo.');
  const next=await response.json();
  if(revision!==stateRevision||actionBusy)return;
  const changed=JSON.stringify(state)!==JSON.stringify(next);state=next;
  if(changed)render();
  if (state.message) notice(state.message);
  if (state.mode === 'real') discover();
  }finally{refreshBusy=false;}
}
function notice(message) {
  const node = document.querySelector('#notice'); node.textContent = message; node.hidden = !message;
}
async function send(name, body = {}) {
  if(name==='check-session')return refresh();
  if(actionBusy)return;
  actionBusy=true;stateRevision++;
  for (const button of document.querySelectorAll('button, textarea')) button.disabled = true;
  try {
    const response = await fetch(endpoint('/api/action'), {method:'POST', headers:{'Content-Type':'application/json','X-Demo-CSRF':state.csrf}, body:JSON.stringify({action:name, transaction:state.transaction, ...body})});
    const result = await response.json();
    state = result.state || state;
    if(!response.ok&&name==='checkout-start'&&checkoutPopup&&!checkoutPopup.closed){checkoutPopup.close();checkoutPopup=null;}
    if(name==='notes-save'&&response.ok)noteDraft=null;
    if(response.ok&&result.popupUrl){const url=new URL(result.popupUrl);if(url.origin!=='https://passli.app'||url.pathname!=='/'||url.searchParams.get('signatureRequest')!==state.cart?.approval?.requestId)throw Error('Invalid checkout popup.');if(checkoutPopup&&!checkoutPopup.closed){url.searchParams.set('signatureReturn','demo');checkoutPopup.location.replace(url.href);}}
    if (response.ok && result.redirect) { location.assign(result.redirect);return; }
    render();
    notice(result.message || (response.ok ? '' : 'This action could not be completed.'));
    app.focus({preventScroll:true});
  } catch { actionBusy=false;await refresh().catch(() => {}); render();notice('The connection was interrupted. Check the current state before retrying.'); }
  finally{actionBusy=false;}
}
document.addEventListener('click', event => {
  if(event.target.closest('[data-pii-share]')&&state.piiRequest){location.assign('https://passli.app/?piiRelease='+encodeURIComponent(state.piiRequest.id)+'&piiSite='+encodeURIComponent(location.origin));return;}
  const button = event.target.closest('button[data-action]');
  if (!button || button.type === 'submit') return;
  const name = button.dataset.action;
  if(name==='checkout-open'){if(state.cart?.approval?.approvalUrl)checkoutPopup=window.open(state.cart.approval.approvalUrl+'&signatureReturn=demo','passli-checkout','popup,width=820,height=900');return;}
  if(name==='checkout-start'&&state.mode==='real')checkoutPopup=window.open('about:blank','passli-checkout','popup,width=820,height=900');
  if (['home','settings'].includes(name)) notice('');
  const extra = name === 'approve' ? {identity:document.querySelector('#identity').value,achievedLoA:4} : name === 'select-account' ? {accountId:button.dataset.account} : {};
  void send(name, {...extra,...(state.cart?.approval?{checkoutId:state.cart.approval.id}:{})});
});
document.addEventListener('input',event=>{if(event.target.id==='notes'&&state.account)noteDraft={accountId:state.account.id,text:event.target.value,dirty:true};});
document.addEventListener('submit', event => {
  event.preventDefault();
  const purpose = event.target.dataset.form;
  void send(purpose, purpose==='notes-save'?{notes:event.target.elements.notes.value,accountId:state.account?.id}:{username:event.target.elements.username?.value, password:event.target.elements.password?.value});
});
document.querySelector('#installation').addEventListener('change', event => void send('installation', {installed:event.target.value === 'true'}));
let discovered = false;
function discover() {
  const present = provider => provider?.isPassli === true || provider?.isPassliSafeWallet === true;
  if (!discovered && (present(window.passliSafeWallet) || present(window.ethereum))) {
    discovered = true;
    void send('installation', {installed:true});
  }
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}
window.addEventListener('eip6963:announceProvider', event => {
  if (state?.mode === 'real' && !discovered && event.detail?.info?.rdns === 'app.passli.hyperliquid' && event.detail?.provider?.isPassli === true) {
    discovered = true; void send('installation',{installed:true});
  }
});
window.addEventListener('focus', () => void refresh().catch(() => notice('Unable to verify the current session.')));
document.addEventListener('visibilitychange', () => {if (!document.hidden) void refresh().catch(() => notice('Unable to verify the current session.'));});
await refresh().catch(() => {app.innerHTML = '<h1>Demo unavailable</h1><p>Please reload to try again.</p>';});
