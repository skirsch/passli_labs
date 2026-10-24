# Northstar: complete site integration demo

Version: 3
Updated: 2026-10-24

Northstar is a fictional site with an actual server-side account/linking model.
The default service mode uses real Passli Direct authentication. It requests no
profile data, uses a site-specific public subject and verifies the signed assertion
and current provider authorization before a Passli session can access projects.

**[Real demo](https://demo.passli.app)** ·
**[Guided walkthrough](https://demo.passli.app/walkthrough/)** ·
**[Integration guide](../docs/Passli_site_integration_spec.md)**

The walkthrough is a separate simulated backend with its own cookie and database.
It lets users and implementation assistants inspect every account/approval state
without installing Passli. Simulation controls cannot authenticate the real demo.

## Run locally

Node.js 24.16 or later is required; there are no npm dependencies.

```sh
cd demo
npm test
DEMO_MODE=walkthrough npm start
```

In PowerShell use `$env:DEMO_MODE='walkthrough'; npm start`.
Open http://127.0.0.1:18766. Walkthrough mode uses simulated approvals and is
clearly labeled. It never contacts a real Passli account. Its installation toggle,
identity selection and provider-failure controls do not exist in real mode.

For real mode, deploy at the registered origin with:

```text
DEMO_MODE=real
DEMO_ORIGIN=https://demo.passli.app
DEMO_DATABASE=/data/demo.sqlite
HOST=0.0.0.0
PORT=18766
```

The real client ID is `demo`; its only callback is
`https://demo.passli.app/auth/passli/callback`. A different deployment requires
its own provider registration and configuration. Real mode is the process default;
do not silently fall back to simulated approval if a provider call fails.

By default, real-mode startup also serves the separate walkthrough on `PORT + 1`.
Route `/walkthrough/` to that listener, stripping the prefix; its browser API calls
retain the `/walkthrough` prefix and use a separate HttpOnly cookie. Set
`DEMO_WALKTHROUGH=0` to disable that optional listener.

## Try the journeys

1. **Link an existing account:** Continue with Passli → complete real Passli
   authentication → Link to my existing account → sign in to the fictional
   Northstar account → enter any email address with password `demo`, confirm the named target and complete → fresh Passli approval.
2. **Register:** unbound Passli login → Create new account → explicit creation →
   fresh approval → Jordan's separate account. No full account exists before
   registration and binding complete.
3. **Returning login:** sign out of Northstar, then Continue with Passli. An
   existing binding opens the same account without the chooser, including from
   another browser after real proof of that identity.
4. **Link from settings:** ordinary fictional Northstar login → Settings →
   Link Passli → named confirmation → fresh approval.
5. **Unlink:** Settings → Unlink Passli → confirm with the fictional account's
   alternative password. Projects remain; Passli-established sessions end. A
   later unbound Passli login returns to the chooser.
6. **Suspension:** change your real Passli session state under its supported
   policy, then return to Northstar. Protected APIs must deny access while
   suspended. Same-association revalidation can resume within the original
   deadline; termination, revocation or provider failure ends the site session.
   Walkthrough mode offers separate controls to explore these states locally.

## Code map

| File | Responsibility |
| --- | --- |
| `public/app.js`, `public/style.css` | Compact site UI, account screens and presentation-only extension discovery |
| `server.mjs` | HTTP, origin/CSRF checks, cookie rotation, SQLite persistence, real callbacks and unique global bindings |
| `model.mjs` | Explicit setup/link/register/unlink/session state transitions |
| `passli.mjs` | S256 PKCE, signed assertion verification and live provider authorization; single-use verified TLS requests |
| `edge-worker.mjs` | Demo-only edge forwarding to a configured HTTPS origin |
| `test/` | HTTP journeys, denial cases, concurrency, persistence and protocol checks |

## Reference boundaries

Passli authentication is real in the hosted real mode. **Northstar's own accounts,
passwords and projects are fictional.** The filled-in `demo` is deliberately
public and proves control only within this demo's isolated fictional account
space. Replace that local-login fixture with your site's real authentication/MFA;
never reuse it to protect customer data. No actual Passli passwords, recovery
material, private keys or profile data are requested by Northstar.

Bindings are stored on the server until the account expires, unique by verified subject for this fixed
issuer/client, and resolved only after proof verification. Each initial visitor
gets an isolated fictional workspace; a returning real identity resolves its
existing workspace. Authentication rotates the opaque cookie and ends that
workspace's prior browser session. This demo has one active site session per
workspace; production sites should use their normal per-device session store.

The demonstration unlink policy requires an alternative local login, explicit
confirmation and reauthentication, preserves account data and invalidates a
Passli-established site session. These illustrate the proposed safeguards in
the integration guide; they do not finalize Passli-wide unlink policy.

Real installation discovery supports the current Passli extension's EIP-6963
announcement/provider markers on fresh page loads, without requesting accounts.
Those signals control UI only and can be imitated. App-only detection and
universal browser/platform discovery are unfinished. Unsupported or absent
discovery keeps the button hidden. No stored installed flag reveals the button
on a fresh load before discovery. Verify stale/uninstalled extension behavior
in your supported environments.

The Direct profile is provider-token compatibility authentication. It is not
the unfinished protected threshold-login target. Real browser/phone acceptance
and synthetic HTTP verification are reported separately in release evidence.

## Temporary demo accounts

Enter any email address with password `demo` to represent an existing site account.
The address is normalized and displayed at named linking confirmation; no mailbox
is verified and no email is sent. This public credential is a demo fixture only.

Each account and its local Passli binding is forgotten 30 minutes after account
creation. Activity and repeated logins never extend that deadline. Expiry denies
protected access immediately and a background sweep removes stored account data
and bindings within 15 seconds, even without browser activity. Existing records
use their original workspace creation time when migrating to this policy. A later
Passli login starts unbound setup again. Other accounts retain their own fixed
deadlines. The real Passli account and provider-side history are unaffected.
