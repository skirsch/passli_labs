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
}
function accountFor(world) {return world.accounts.find(a => a.id === world.session?.accountId);}
export function authorizedAccount(world) {
  if (!world.session || world.session.expires <= Date.now()) return null;
  if (world.session.method === 'passli' && world.providerStatus !== 'active') return null;
  return accountFor(world) || null;
}
export function publicState(world) {
  const account = authorizedAccount(world);
  return {mode:'walkthrough', modeLabel:'Interactive walkthrough · Simulated Passli approvals', csrf:world.csrf, installed:world.installed, screen:world.screen, sessionMethod:world.session?.method || null, setup:!!world.setup, pendingAction:world.pending?.action, transaction:world.pending?.id || null, demoAccounts:world.accounts.map(a=>({name:a.name,email:a.email})), account:account ? {name:account.name,email:account.email,linked:account.identities.length > 0,expiresAt:account.expiresAt} : null};
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
  const owner = world.accounts.find(a => a.identities.includes(identity));
  if (owner && owner.id !== account.id) fail('That Passli identity is already linked to another Northstar account. No accounts were moved or merged.');
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

export function act(world, body, now = Date.now(), {verifiedIdentity,verifiedUnlink=false} = {}) {
  expire(world, now);
  const action = body.action;
  switch (action) {
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
        const bound = world.accounts.find(a => a.identities.includes(identity));
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
        if (!world.setup || world.setup.subject !== identity) fail('Setup expired. Start a new login.');
        if (world.accounts.some(a => a.identities.includes(identity))) fail('That identity was linked while registration was pending. Start a new login.');
        if (world.accounts.length >= 10) fail('Reset the demo before creating more sample accounts.');
        const number = world.accounts.length;
        const account = {id:random(), name:'Jordan Morgan', email:`jordan${number}@example.test`, identities:[identity],linkIds:{[identity]:random()},createdAt:now,expiresAt:now+accountLifetime};
        world.accounts.push(account); session(world,account,'passli',identity,now); world.setup = null; world.screen = 'home'; return 'Your new Northstar account is ready.';
      }
      fail('Unsupported approval.'); break;
    }
    case 'choose-link': if (!world.setup || world.session) fail('Start a new Passli setup.'); world.screen = 'link-login'; return '';
    case 'link-login': {
      if (!world.setup) fail('Setup expired. Start a new Passli login.');
      const account = localAccount(world,body,now); session(world,account,'password',null,now); world.screen = 'link-confirm'; return '';
    }
    case 'settings-link': requireAccount(world); world.setup = null; world.screen = 'link-confirm'; return '';
    case 'confirm-link': {
      if (world.screen !== 'link-confirm') fail('Confirm the named account before linking.');
      const account = requireAccount(world);
      pending(world,'link',now,{accountId:account.id,sessionId:world.session.id,...(world.setup ? {subject:world.setup.subject} : {})}); return '';
    }
    case 'choose-create': if (!world.setup || world.session) fail('Start a new Passli setup.'); world.screen = 'register'; return '';
    case 'register-local': world.setup = null; world.pending = null; if (world.session) fail('Sign out first.'); world.screen = 'register'; return '';
    case 'register':
      if (world.screen !== 'register') fail('Choose account creation first.');
      if (!world.setup) {
        if (world.accounts.length >= 10) fail('Reset the demo before creating more sample accounts.');
        const account = {id:random(),name:'Jordan Morgan',email:`jordan${world.accounts.length}@example.test`,identities:[],createdAt:now,expiresAt:now+accountLifetime};
        world.accounts.push(account);session(world,account,'password',null,now);world.screen = 'home';return 'Your demo account is ready.';
      }
      pending(world,'register',now,{subject:world.setup.subject}); return '';
    case 'unlink-start': {
      const account=requireAccount(world);if(!account.identities.length)fail('No Passli link exists.');
      world.pending=null;world.setup=null;world.screen='unlink-confirm';return '';
    }
    case 'unlink': {
      if(world.screen!=='unlink-confirm')fail('Confirm the named account before unlinking.');
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
    case 'cancel': world.inflight=null;world.pending=null;world.setup=null;world.screen=world.session ? world.providerStatus === 'suspended' ? 'suspended' : 'settings' : 'login';return '';
    default: fail('Unknown demo action.');
  }
}
