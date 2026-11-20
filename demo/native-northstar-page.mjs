export function nativeNorthstarPage(version){
 if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid demo version.');
 return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Northstar · Passli integration demo</title><link rel="icon" href="/passli-mark.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css"><script src="/native-northstar.js" defer></script></head>
<body>
 <div class="demo-version" aria-label="Demo version">v${version}</div>
 <div class="demo-banner"><span class="demo-tag">PASSLI DEMO</span><span>Interactive account linking reference</span><a href="https://github.com/skirsch/passli_labs/blob/main/docs/Passli_site_integration_spec.md">Integration guide ↗</a><a href="/walkthrough/">Guided walkthrough ↗</a></div>
 <a class="demo-home" href="/" aria-label="Passli Demo Home">⌂ Passli Demo Home</a>
 <header class="site-header"><a class="wordmark" href="/northstar/" aria-label="Northstar home"><span class="star" aria-hidden="true">✳</span> Northstar</a></header>
 <p class="notice">Demo accounts and Passli links are forgotten 30 minutes after account creation. Signing in again does not extend this time.</p>
 <main id="app" tabindex="-1">
  <section id="signed-out">
   <div class="auth-heading"><span class="star" aria-hidden="true">✳</span><h1 id="signin-heading">Sign in to Northstar</h1></div>
   <form id="password-form"><label for="email">Email address</label><input id="email" type="email" required maxlength="254" autocomplete="off"><label for="password">Demo password</label><input id="password" type="password" value="demo" required autocomplete="off"><p class="small muted">Enter any email address with password <strong>demo</strong> to try a fictional existing account. No email is sent or verified.</p><button class="primary" type="submit">Sign in</button></form>
   <div id="passli-login"><div class="divider">or</div><button id="login" class="provider" type="button"><img src="/passli-mark.svg" alt="" width="20" height="20">Continue with Passli</button><p class="small muted center space-top">Choose whether to link an existing Northstar account or create a new one.</p></div>
   <p id="existing-help" class="small muted space-top" hidden>Sign in to your existing Northstar account, then approve linking it in Passli. Your projects and notes stay with that account.</p><button id="cancel-existing" class="subtle cancel" type="button" hidden>Cancel</button>
   <p class="small muted center space-top">Use only the public demo password above.<br>Never enter a real password here.</p>
  </section>
  <section id="signed-in" hidden>
   <h1 id="welcome"></h1><p id="identity" class="small muted"></p>
   <div class="panel"><h2>Your projects</h2><div class="record">Website refresh</div><div class="record">Autumn launch</div><div class="record">Personal notes</div></div>
   <div class="panel"><label for="notes">Your note</label><textarea id="notes" maxlength="2000"></textarea><button id="save" class="primary" type="button">Save note</button></div>
   <h2>Login &amp; security</h2><div class="panel"><div class="panel-head"><img src="/passli-mark.svg" alt="" width="28" height="28"><div><strong>Passli</strong><p id="link-state" class="small muted"></p></div></div><div class="stack"><button id="link" class="secondary" type="button">Link Passli</button><button id="unlink" class="danger" type="button">Unlink Passli</button></div></div>
   <p class="small muted">Unlinking preserves this account, notes and projects. It removes the registered keyset and ends Passli sessions.</p><p id="demo-login" class="callout"></p><button id="logout" class="subtle" type="button">Sign out</button>
  </section>
  <section id="account-choice" hidden><div class="auth-heading"><span class="star" aria-hidden="true">✳</span><h1>Finish setting up Login with Passli</h1><p class="muted">Do you already have an account on Northstar?</p></div><div class="stack"><button id="choose-existing" class="choice" type="button"><strong>Link to my existing account</strong><span>Keep your projects, settings and notes.</span></button><button id="choose-create" class="choice" type="button"><strong>Create new account</strong><span>Start fresh with a separate Northstar account.</span></button></div><button id="cancel-choice" class="subtle cancel" type="button">Cancel</button></section>
  <section id="approval" class="panel space-top" hidden><div class="auth-heading"><img class="approval-mark" src="/passli-mark.svg" alt=""><h2>Approve in Passli</h2></div><p><a id="continue" target="_blank" rel="noopener">Continue using your signed-in Passli account</a></p><button id="check" class="secondary" type="button">Check approval</button><button id="cancel" class="subtle cancel" type="button">Cancel</button></section>
  <p id="status" class="small space-top" role="status"></p><p id="error" class="small space-top" role="alert"></p>
 </main>
 <footer>Northstar is a fictional site demonstrating Login with Passli. <a href="/privacy">Demo privacy</a> · <a href="https://github.com/skirsch/passli_labs">Documentation &amp; source</a></footer>
</body></html>`;
}
