const app = document.querySelector('#app');
const endpoint = path => (location.pathname.startsWith('/walkthrough/') ? '/walkthrough' : '') + path;
let state;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const action = (name, label, style = 'primary', extra = '') => `<button ${extra.includes('type=') ? '' : 'type="button"'} class="${style}" data-action="${name}" ${extra}>${label}</button>`;
const cancel = () => action('cancel', 'Cancel', 'subtle cancel');
const heading = (title, text = '') => `<div class="auth-heading"><h1>${title}</h1>${text ? `<p class="muted">${text}</p>` : ''}</div>`;
const passliButton = () => {const hidden=(state.mode === 'real' ? discovered : state.installed)?'':'hidden';return `<div class="divider" ${hidden}>or</div><button type="button" class="provider" data-action="passli-start" ${hidden}><img src="/passli-mark.svg" alt="" width="20" height="20">Continue with Passli</button>`;};
const localForm = (purpose = 'login') => `<form data-form="${purpose}"><label for="username">Email address</label><input id="username" name="username" type="email" maxlength="254" required autocomplete="off" value="avery@example.test"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="off" value="demo" required><p class="small muted">Enter any email address with password <strong>demo</strong> to try a fictional existing account. No email is sent or verified.</p>${action(purpose, purpose === 'login' ? 'Sign in' : 'Sign in to existing account', 'primary', 'type="submit"')}</form>`;
let expiryTimer;
setInterval(()=>{if(state?.screen==='profile-sharing'||state?.pendingAction==='register')void refresh().catch(()=>{});},2000);

function render() {
  const account = state.account;
  clearTimeout(expiryTimer);
  if(account?.expiresAt)expiryTimer=setTimeout(()=>void refresh().catch(()=>notice('Reload to check account expiry.')),Math.max(100,account.expiresAt-Date.now()+50));
  app.className = ['home','settings'].includes(state.screen) ? 'wide' : '';
  document.querySelector('#mode-label').textContent = state.modeLabel;
  document.querySelector('#walkthrough-link').hidden = state.mode !== 'real';
  document.querySelector('#installation').value = String(state.installed);
  document.querySelector('#installation').disabled = state.mode === 'real';
  document.querySelector('[data-action="reset"]').hidden = state.mode === 'real';
  document.querySelector('.tools-body > .muted').textContent = state.mode === 'real' ? 'This site uses real Passli Direct login. Northstar accounts and projects are fictional. The Passli button appears after extension discovery; unsupported app-only discovery remains hidden.' : 'Try the full journey with fictional accounts. Approvals and installation status are simulated.';
  document.querySelector('#header-actions').innerHTML = account ? `${action('home', 'Overview', 'subtle')}${action('settings', 'Settings', 'subtle')}${action('logout', 'Sign out', 'subtle')}` : '';
  document.querySelector('#session-tools').innerHTML = state.mode === 'walkthrough' && state.sessionMethod === 'passli' ? `${action('suspend', 'Simulate Passli session suspension', 'subtle')}${action('terminate', 'Simulate Passli session termination', 'subtle')}${action('provider-error', 'Simulate provider unavailable', 'subtle')}` : '';
  const views = {
    login: () => `<div class="auth-heading"><span class="star" aria-hidden="true">✳</span><h1>Sign in to Northstar</h1></div>${localForm()}${passliButton()}<p class="center space-top">New to Northstar? ${action('register-local', 'Create an account', 'subtle')}</p><p class="small muted center space-top">Use only the public demo password above.<br>Never enter a real password here.</p>`,
    setup: () => `${heading('Finish setting up Login with Passli', 'Do you already have an account on Northstar?')}<div class="stack">${action('choose-link', '<strong>Link to my existing account</strong><span>Keep your projects, settings and history.</span>', 'choice')}${action('choose-create', '<strong>Create new account</strong><span>Start fresh with a separate Northstar account.</span>', 'choice')}</div>${cancel()}<p class="small muted center space-top">You are not signed in to Northstar yet.</p>`,
    'link-login': () => `${heading('Sign in to your existing account', 'For this demo, enter any email address with password demo.')}${localForm('link-login')}${cancel()}`,
    'link-confirm': () => `${heading(`Link Passli to ${escape(account?.name)}?`, 'Next time, use Passli to sign in to this same account.')}<div class="panel"><strong>${escape(account?.name)}</strong><div class="muted">${escape(account?.email)}</div><p class="small muted space-top">Your projects, settings and other login methods stay with this account.</p></div>${action('confirm-link', 'Link Passli')}${cancel()}`,
    register: () => `${heading('Create your Northstar account', 'Passli will ask you to share your name, phone and email.')}<button type="button" class="provider" data-action="register"><img src="/passli-mark.svg" alt="" width="20" height="20">Create account with Passli</button><p class="small muted center space-top">Your account, shared information and Passli link will be forgotten 30 minutes after creation.</p>${cancel()}`,
    'profile-sharing': () => `${heading('Share your information with Northstar', 'Choose your name, phone and email in Passli. Your Northstar account will be created after you approve sharing.')}<button type="button" class="provider" data-pii-share>Open Passli to share information</button>${cancel()}`,
    approval: () => state.mode === 'real' ? `${heading('Complete your approval in Passli', 'Return here when you finish, or cancel and start again.')}${cancel()}` : `<img class="approval-mark" src="/passli-mark.svg" alt="Passli">${heading(state.pendingAction === 'unlink' ? 'Approve unlinking from Northstar' : state.pendingAction === 'link' ? 'Approve linking to Northstar' : state.pendingAction === 'register' ? 'Approve your new account' : state.pendingAction === 'resume' ? 'Resume your session' : 'Continue to Northstar', state.pendingAction === 'unlink' ? 'Simulated LoA 4 unlink approval' : 'Simulated Passli approval')}<div class="callout">This walkthrough simulates approval. It does not contact your real Passli account.</div><label for="identity">Fictional Passli identity</label><select id="identity"><option value="demo-alice">Alex’s Passli account</option><option value="demo-bob">Another Passli account</option></select>${action('approve', 'Approve in this demo')}${cancel()}`,
    home: () => `${heading(`Welcome, ${escape(account?.name.split(' ')[0])}`, 'Your Northstar workspace')}<div class="row"><h2>Projects</h2>${action('settings', 'Account settings', 'secondary')}</div><div class="panel"><div class="record"><strong>Website refresh</strong><div class="muted small">Design review · Updated today</div></div><div class="record"><strong>Autumn launch</strong><div class="muted small">Planning · 3 tasks remaining</div></div><div class="record"><strong>Personal notes</strong><div class="muted small">Private workspace</div></div></div><p class="muted small">These sample projects belong to your Northstar account. Linking or unlinking Passli does not delete them.</p>`,
    settings: () => `${heading('Account settings', 'Manage how you sign in to Northstar.')}<div class="panel"><h2>${escape(account?.name)}</h2><p class="muted">${escape(account?.email)}</p><p class="muted">${escape(account?.phone)}</p></div><h2>Login & security</h2><div class="panel"><div class="row"><div><strong>Password</strong><div class="muted small">Demo password available as an alternative login.</div></div><span class="badge">Available</span></div></div><div class="panel"><div class="panel-head"><img src="/passli-mark.svg" alt=""><div><h2>Passli ${account?.linked ? '<span class="badge">Linked</span>' : ''}</h2><span class="muted small">${account?.linked ? 'Sign in to this account using Passli.' : 'Add Passli as another way to sign in.'}</span></div></div>${action(account?.linked ? 'unlink' : 'settings-link', account?.linked ? 'Unlink Passli' : 'Link Passli', account?.linked ? 'danger' : 'secondary')}</div><p class="muted small">Signing out ends this site session. Unlinking removes the login association.</p>`,
    suspended: () => `${heading('Session suspended', 'Log into the same Passli account to resume.')}<div class="callout">Your workspace is locked. Your account is still linked.</div>${action('resume-start', 'Open Passli', 'provider')}${action('logout', 'Log out of this site', 'subtle cancel')}`
  };
  app.innerHTML = (views[state.screen] || views.login)();
}

async function refresh() {
  const response = await fetch(endpoint('/api/state'), {cache:'no-store'});
  if (!response.ok) throw Error('Could not load the demo.');
  state = await response.json();
  render();
  if (state.message) notice(state.message);
  if (state.mode === 'real') discover();
}
function notice(message) {
  const node = document.querySelector('#notice'); node.textContent = message; node.hidden = !message;
}
async function send(name, body = {}) {
  const popup=name==='register'&&state.mode==='real'?window.open('about:blank','passli-registration','popup,width=640,height=760'):null;
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  try {
    const response = await fetch(endpoint('/api/action'), {method:'POST', headers:{'Content-Type':'application/json','X-Demo-CSRF':state.csrf}, body:JSON.stringify({action:name, transaction:state.transaction, ...body})});
    const result = await response.json();
    state = result.state || state;
    if (response.ok && result.redirect) { if(popup){popup.location.replace(result.redirect);render();return;}location.assign(result.redirect);return; }
    if(popup)popup.close();
    render();
    notice(result.message || (response.ok ? '' : 'This action could not be completed.'));
    app.focus({preventScroll:true});
  } catch { if(popup)popup.close();await refresh().catch(() => {}); notice('The connection was interrupted. Check the current state before retrying.'); }
}
document.addEventListener('click', event => {
  if(event.target.closest('[data-pii-share]')&&state.piiRequest){window.open('https://passli.app/?piiRelease='+encodeURIComponent(state.piiRequest.id)+'&piiSite='+encodeURIComponent(location.origin),'passli-pii-release','popup,width=640,height=760');return;}
  const button = event.target.closest('button[data-action]');
  if (!button || button.type === 'submit') return;
  const name = button.dataset.action;
  if (['home','settings'].includes(name)) notice('');
  const extra = name === 'approve' ? {identity:document.querySelector('#identity').value,achievedLoA:4} : {};
  void send(name, extra);
});
document.addEventListener('submit', event => {
  event.preventDefault();
  const purpose = event.target.dataset.form;
  void send(purpose, {username:event.target.elements.username?.value, password:event.target.elements.password?.value});
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
