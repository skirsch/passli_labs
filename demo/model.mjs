import {randomBytes, timingSafeEqual} from 'node:crypto';

export const random = () => randomBytes(32).toString('base64url');
const minute = 60000;
export const accountLifetime = 30 * minute;
const fail = message => {throw Object.assign(Error(message), {status:409});};
const passwordOK = password => {
  const actual = Buffer.from(String(password || '')), expected = Buffer.from('demo');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
export function freshWorld(now = Date.now()) {
  return {csrf:random(), created:now, installed:true, screen:'login', accounts:[{id:random(), name:'Avery Chen', email:'avery@example.test', identities:[],createdAt:now,expiresAt:now+accountLifetime}], session:null, setup:null, pending:null, providerStatus:'active'};
}
export function expire(world, now = Date.now()) {
  if(world.accountChoice?.expires<=now){world.accountChoice=null;world.screen=world.session?'home':'login';world.message='Your request timed out. Please try again.';}
  if(world.deletion&&(world.deletion.expires<=now||!world.accounts.some(a=>a.id===world.deletion.accountId)||(world.session?.id||null)!==world.deletion.sessionId)){
    world.deletion=null;if(world.screen==='delete-confirm')world.screen=world.session?'settings':'login';
  }
  if(world.screen==='unlink-confirm')world.screen=world.session?'settings':'login';
  if(world.registration?.expires<=now){world.registration=null;world.screen="register";}
  for (const account of world.accounts) {
    account.linkIds ??= Object.fromEntries(account.identities.map(subject=>[subject,random()]));
    account.createdAt ??= world.created;
    account.expiresAt ??= account.createdAt + accountLifetime;
  }
  const expired = new Set(world.accounts.filter(account=>account.expiresAt<=now).map(account=>account.id));
  world.accounts = world.accounts.filter(account=>!expired.has(account.id));
  if(world.providerAssociation && !world.accounts.some(account=>account.identities.includes(world.providerAssociation.subject)))world.providerAssociation=null;
  if (expired.has(world.session?.accountId) || expired.has(world.pending?.accountId)) {
    world.session=null;world.pending=null;world.setup=null;world.inflight=null;world.providerAssociation=null;world.screen='login';
    world.message='Your demo account and Passli link have been forgotten after 30 minutes. You can start again.';
  }
  if (world.session && world.session.expires <= now) {world.session = null; world.pending = null; world.screen = 'login';}
  if (world.setup && world.setup.expires <= now) {world.setup = null; world.pending = null; world.screen = world.session ? 'settings' : 'login';}
  if (world.pending && world.pending.expires <= now) {world.pending = null; world.screen = world.session ? 'settings' : world.setup ? 'setup' : 'login';}
  if (world.session?.method === 'passli' && world.providerStatus === 'suspended') world.screen = world.pending?.action === 'resume' ? 'approval' : 'suspended';
  if (world.session?.method === 'passli' && ['terminated','unavailable'].includes(world.providerStatus)) {world.session = null; world.pending = null; world.screen = 'login';}
  if(world.checkout&&(!world.session||world.checkout.sessionId!==world.session.id||world.checkout.accountId!==world.session.accountId||world.checkout.expires<=now)){world.checkout=null;if(['checkout-wait','checkout-confirm'].includes(world.screen))world.screen=world.session?'cart':'login';}
}
function accountFor(world) {return world.accounts.find(a => a.id === world.session?.accountId);}
export function authorizedAccount(world) {
  if (!world.session || world.session.expires <= Date.now()) return null;
  if (world.session.method === 'passli' && world.providerStatus !== 'active') return null;
  return accountFor(world) || null;
}
export function publicState(world) {
  const account = authorizedAccount(world);
  const deletion=world.deletion&&world.accounts.find(a=>a.id===world.deletion.accountId);
  return {mode:'walkthrough', modeLabel:'Interactive walkthrough · Simulated Passli approvals', csrf:world.csrf, installed:world.installed, screen:world.screen, sessionMethod:world.session?.method || null, setup:!!world.setup, pendingAction:world.pending?.action, transaction:world.pending?.id || world.accountChoice?.id || null, accountChoices:world.accountChoice?.accounts.map(({id,name,email})=>({id,name,email}))||[], deletion:deletion?{name:deletion.name,email:deletion.email}:null, piiRequest:world.registration?{id:world.registration.release.id}:null, demoAccounts:world.accounts.map(a=>({name:a.name,email:a.email})), account:account ? {id:account.id,notes:account.notes||'',name:account.name,email:account.email,phone:account.phone,linked:account.identities.length > 0,expiresAt:account.expiresAt} : null};
}
function requireAccount(world) {
  const account = authorizedAccount(world);
  if (!account) fail('Sign in again before continuing.');
  return account;
}
function session(world, account, method, subject, now) {
  world.session = {id:random(),accountId:account.id,method,subject,expires:now+30*minute};
  world.providerStatus = 'active';
}
function pending(world, action, now, extra = {}) {
  world.pending = {id:random(),action,expires:now+minute,...extra}; world.screen = 'approval';
}
function prepareDeletion(world,account,now){
  world.deletion={accountId:account.id,sessionId:world.session?.id||null,expires:Math.min(now+minute,account.expiresAt)};
  world.screen='delete-confirm';
}
function checkProof(world, body, now, verifiedIdentity) {
  const proof = world.pending;
  // Consume once, even on a failed identity check; a retry needs fresh approval.
  world.pending = null;
  if (!proof || proof.id !== body.transaction || proof.expires <= now) fail('Approval expired or was already used. Start again.');
  if (verifiedIdentity !== body.identity && !['demo-alice','demo-bob'].includes(body.identity)) fail('Choose a fictional demo identity.');
  if (proof.subject && proof.subject !== body.identity) fail('This is a different Passli account. Start again with the original account.');
  return proof;
}
function bind(world, account, identity) {
  if (!account.identities.includes(identity)) {account.identities.push(identity);(account.linkIds??={})[identity]=random();}
}
function localAccount(world, body, now) {
  const email=typeof body.username==='string'?body.username.trim().toLowerCase():'';
  if (!email || email.length>254 || !/^[^\s@]+@[^\s@]+$/.test(email) || !passwordOK(body.password)) fail('Enter any email address and use password demo.');
  let account = world.accounts.find(a => a.email === email);
  if (!account) {
    if (world.accounts.length>=10) fail('This workspace already has 10 demo accounts. They are forgotten after 30 minutes.');
    account={id:random(),name:email,email,identities:[],createdAt:now,expiresAt:now+accountLifetime};world.accounts.push(account);
  }
  return account;
}

export function act(world, body, now = Date.now(), {verifiedIdentity,verifiedUnlink=false,personalInformation,loginAccounts} = {}) {
  expire(world, now);
  const action = body.action;
  if(!['select-account','installation'].includes(action))world.accountChoice=null;
  switch (action) {
    case 'select-account': {
      const choice=world.accountChoice;
      if(world.session||!choice||world.screen!=='account-choice'||choice.id!==body.transaction||choice.expires<=now||!choice.accounts.some(account=>account.id===body.accountId))fail('Choose an account from the current Passli login.');
      const account=world.accounts.find(account=>account.id===body.accountId&&account.identities.includes(choice.subject));
      if(!account)fail('That account is no longer linked. Start a new Passli login.');
      world.accountChoice=null;world.setup=null;session(world,account,'passli',choice.subject,now);world.screen='home';return '';
    }
    case 'notes-save': {
      const account=requireAccount(world);
      if(body.accountId!==account.id)fail('The account changed. Reload before saving your note.');
      if(typeof body.notes!=='string'||body.notes.length>2000)fail('Enter a note of up to 2,000 characters.');
      account.notes=body.notes;return 'Note saved.';
    }
    case 'installation': world.installed = body.installed === true; return '';
    case 'home': requireAccount(world); world.pending = null; world.screen = 'home'; return '';
    case 'settings': requireAccount(world); world.pending = null; world.screen = 'settings'; return '';
    case 'login': {
      const account = localAccount(world,body,now);
      world.setup = null; world.pending = null; session(world,account,'password',null,now); world.screen = 'home'; return '';
    }
    case 'passli-start':
      if (world.session) fail('Sign out before starting a new login.');
      if (!world.installed) fail('Passli is not available in this walkthrough context.');
      world.setup = null; pending(world,'login',now); return '';
    case 'approve': {
      const proof = checkProof(world,body,now,verifiedIdentity);
      const identity = body.identity;
      if (proof.action === 'login') {
        const matches=loginAccounts??world.accounts.filter(a=>a.identities.includes(identity));
        if(matches.length>1){world.session=null;world.setup=null;world.accountChoice={id:random(),subject:identity,expires:proof.expires,accounts:matches.map(({id,name,email})=>({id,name,email}))};world.screen='account-choice';return '';}
        const bound = world.accounts.find(a => a.id===matches[0]?.id&&a.identities.includes(identity));
        if (bound) {session(world,bound,'passli',identity,now); world.setup = null; world.screen = 'home';}
        else {world.session = null; world.setup = {subject:identity,expires:now+5*minute}; world.screen = 'setup';}
        return '';
      }
      if (proof.action === 'unlink') {
        const account=requireAccount(world);
        if(account.id!==proof.accountId||world.session.id!==proof.sessionId||account.linkIds?.[identity]!==proof.bindingId)fail('The linked account changed. Start unlinking again.');
        if(verifiedIdentity ? !verifiedUnlink : body.achievedLoA!==4)fail('Unlink requires a fresh verified LoA 4 signature.');
        account.identities=account.identities.filter(subject=>subject!==identity);delete account.linkIds[identity];world.setup=null;world.providerAssociation=null;
        if(world.session.method==='passli'&&world.session.subject===identity){world.session=null;world.screen='login';}else world.screen='settings';
        if(proof.prepareDeletion&&!account.identities.length)prepareDeletion(world,account,now);
        return 'Passli unlinked after LoA 4 approval. Your account and projects are preserved.';
      }
      if (proof.action === 'resume') {
        if (!world.session || world.session.id !== proof.sessionId || world.session.subject !== identity || world.session.expires <= now || world.providerStatus !== 'suspended') fail('The original session can no longer be resumed. Sign in again.');
        world.providerStatus = 'active'; world.screen = 'home'; return 'Your original session has resumed.';
      }
      if (proof.action === 'link') {
        const account = requireAccount(world);
        if (account.id !== proof.accountId || world.session.id !== proof.sessionId) fail('The target account changed. Start linking again.');
        if (world.setup && world.setup.subject !== identity) fail('The Passli identity changed during setup.');
        bind(world,account,identity); world.setup = null; world.screen = 'settings'; return 'Passli is now linked. Your existing account and projects are unchanged.';
      }
      if (proof.action === 'register') {
        if (proof.subject && proof.subject !== identity) fail('The Passli account changed. Start again.');
        if (world.accounts.some(a => a.identities.includes(identity))) fail('That identity was linked while registration was pending. Start a new login.');
        if (world.accounts.length >= 10) fail('Reset the demo before creating more sample accounts.');
        const profile=verifiedIdentity?personalInformation:{name:'Jordan Morgan',email:'jordan@example.test',phone:'+15555550123'};
        if(!profile || ['name','email','phone'].some(key=>typeof profile[key]!=='string'||!profile[key].trim()||profile[key].length>2048))fail('Share your name, phone and email in Passli to create this account.');
        const account = {id:random(),name:profile.name,email:profile.email,phone:profile.phone,identities:[identity],linkIds:{[identity]:random()},createdAt:now,expiresAt:now+accountLifetime};
        world.accounts.push(account); session(world,account,'passli',identity,now); world.setup = null; world.screen = 'home'; return 'Your new Northstar account is ready.';
      }
      fail('Unsupported approval.'); break;
    }
    case 'choose-link': if (!world.setup || world.session) fail('Start a new Passli setup.'); world.screen = 'link-login'; return '';
    case 'link-login': {
      if (!world.setup) fail('Setup expired. Start a new Passli login.');
      const account = localAccount(world,body,now); session(world,account,'password',null,now); world.screen = 'link-confirm'; return '';
    }
    case 'settings-link': {
      const account=requireAccount(world);world.setup=null;
      pending(world,'link',now,{accountId:account.id,sessionId:world.session.id});return '';
    }
    case 'confirm-link': {
      if (world.screen !== 'link-confirm') fail('Confirm the named account before linking.');
      const account = requireAccount(world);
      pending(world,'link',now,{accountId:account.id,sessionId:world.session.id,...(world.setup ? {subject:world.setup.subject} : {})}); return '';
    }
    case 'choose-create': if (!world.setup || world.session) fail('Start a new Passli setup.'); world.screen = 'register'; return '';
    case 'register-local': world.setup = null; world.pending = null; if (world.session) fail('Sign out first.'); world.screen = 'register'; return '';
    case 'register':
      if (world.screen !== 'register') fail('Choose account creation first.');
      pending(world,'register',now,world.setup?{subject:world.setup.subject}:{}); return '';
    case 'delete-account-start': {
      const account=requireAccount(world);
      if(world.screen!=='settings')fail('Open account settings before deleting.');
      world.deletion=null;world.setup=null;
      if(account.identities.length){const subject=account.identities[0],bindingId=account.linkIds?.[subject];if(!bindingId)fail('No current Passli binding exists.');pending(world,'unlink',now,{accountId:account.id,sessionId:world.session.id,subject,bindingId,prepareDeletion:true});}
      else prepareDeletion(world,account,now);
      return '';
    }
    case 'delete-account-confirm': {
      const deletion=world.deletion,account=world.accounts.find(a=>a.id===deletion?.accountId);
      if(world.screen!=='delete-confirm'||!deletion||!account||deletion.expires<=now||(world.session?.id||null)!==deletion.sessionId||account.identities.length)fail('Restart account deletion from settings.');
      world.accounts=world.accounts.filter(a=>a.id!==account.id);
      world.session=null;world.setup=null;world.pending=null;world.inflight=null;world.registration=null;world.providerAssociation=null;world.deletion=null;world.csrf=random();world.screen='login';
      return 'Your Northstar account and its Passli linkage have been deleted. Your Passli account is unchanged.';
    }
    case 'unlink-start': // Compatibility for a previously loaded settings button.
    case 'unlink': {
      if(world.screen!=='settings')fail('Open account settings before unlinking.');
      world.setup=null;
      const account=requireAccount(world),subject=account.identities[0],bindingId=account.linkIds?.[subject];
      if(!subject||!bindingId)fail('No current Passli binding exists.');
      pending(world,'unlink',now,{accountId:account.id,sessionId:world.session.id,subject,bindingId});return '';
    }
    case 'suspend': requireAccount(world);if (world.session.method !== 'passli') fail('Sign in using Passli first.');world.providerStatus='suspended';world.pending=null;world.screen='suspended';return '';
    case 'resume-start': if (!world.session || world.session.method !== 'passli' || world.providerStatus !== 'suspended') fail('No suspended session to resume.');pending(world,'resume',now,{subject:world.session.subject,sessionId:world.session.id});return '';
    case 'terminate': case 'provider-error':
      requireAccount(world);if (world.session.method !== 'passli') fail('Sign in using Passli first.');
      world.providerStatus=action === 'terminate' ? 'terminated' : 'unavailable';world.session=null;world.pending=null;world.setup=null;world.screen='login';return action === 'terminate' ? 'Your site session ended. Your account is still linked.' : 'Provider authorization could not be verified. The site session ended.';
    case 'logout': world.inflight=null;world.session=null;world.setup=null;world.pending=null;world.screen='login';return 'You are signed out of Northstar. Your account links are unchanged.';
    case 'cancel': world.deletion=null;world.registration=null;world.inflight=null;world.pending=null;world.setup=null;world.screen=world.session ? world.providerStatus === 'suspended' ? 'suspended' : 'settings' : 'login';return '';
    default: fail('Unknown demo action.');
  }
}
