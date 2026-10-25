# Northstar: complete site integration demo

Version: 11
Updated: 2026-10-24

Northstar is a fictional site with an actual server-side account/linking model.
The default service mode uses real Passli Direct authentication. Registration requests name, phone and email with Passli consent and authorized device delivery. Login and linking request no profile data. It uses a site-specific public subject and verifies the signed assertion
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
   Link Passli → fresh Passli proof → linked. The settings button starts the
   transaction immediately, without another site confirmation screen.
5. **Unlink:** Settings → Unlink Passli → immediately open Passli for fresh
   Passli unlink signature at LoA 4 or higher. No old site password is requested.
   Projects remain; Passli-established sessions end. A
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
| `pii.mjs` | Origin-bound disclosure validation, exact approved fields and delivery-token checks |
| `passli.mjs` | S256 PKCE, signed assertion verification and live provider authorization; single-use verified TLS requests |
| `edge-worker.mjs` | Demo-only edge forwarding to a configured HTTPS origin |
| `test/` | HTTP journeys, denial cases, concurrency, persistence and protocol checks |

## Reference boundaries

Passli authentication is real in the hosted real mode. **Northstar's own accounts,
passwords and projects are fictional.** The filled-in `demo` is deliberately
public and proves control only within this demo's isolated fictional account
space. Replace that local-login fixture with your site's real authentication/MFA;
never reuse it to protect customer data. No actual Passli passwords, recovery
material or private keys are requested by Northstar. Registration receives only the name, phone and email approved in Passli; the walkthrough uses a fictional shared profile.

Bindings are stored on the server until the account expires, unique by verified subject for this fixed
issuer/client, and resolved only after proof verification. Each initial visitor
gets an isolated fictional workspace; a returning real identity resolves its
existing workspace. Authentication rotates the opaque cookie and ends that
workspace's prior browser session. This demo has one active site session per
workspace; production sites should use their normal per-device session store.

Unlink requires a fresh first-class Passli `unlink` request, a site-identity user
signature and a verified provider assurance attestation at LoA 4 or higher. The
site verifies operation, origin, account, exact binding, subject, nonce and expiry
before atomic removal. Ordinary login tokens and old site credentials cannot
authorize unlink. Cancellation/failure retains the link; dependent site sessions
end only after verified unlink. See `unlink.mjs` and the compatibility reference.

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

Registration uses `request_pii=true`. The backend verifies the signed assertion, completes the provider grant and stages the origin-bound `piiRelease` for at most its original 120-second lifetime. `/api/pii-challenge` exposes only the public challenge; `/api/pii-release` verifies the delivery token, approved fields and live provider authorization before atomic account creation and binding. CORS allows only Passli web origins. Cancellation and expiry discard the pending release. Email is profile data, never proof of an existing account or permission to merge.

## Delete an account

Settings includes **Delete my Account**. An unlinked account goes to a final
explicit deletion confirmation. A linked account first approves unlinking in
Passli at LoA 4 or higher, then returns to confirm deletion. The account remains
until that final click. After a Passli session ends on unlink, a restricted,
one-use confirmation capability lasts at most 60 seconds and grants no project
access. Cancelling this last step keeps the account, now unlinked. Deletion
removes the selected account and shared PII, clears its bindings and session,
and rotates the cookie/CSRF token. Other demo accounts and the real Passli
account remain. A later Passli login starts unbound setup.

## Account notes and returning-login context

The home page includes Notes with a Save note button (up to 2,000 characters).
Notes are saved on the server with the authenticated Northstar account, rather
than with a browser or login session. Signing out and returning by ordinary login
or the same linked Passli identity restores that account's note, including from
another browser. Different accounts keep separate notes. A save is bound to the
current account/session and rejects a stale account ID; notes are returned only
with current authorization. They are rendered as text, never HTML.

The note is removed with account deletion or the fixed expiry 30 minutes after
account creation. Saving, activity and repeated logins never extend this deadline.
Idle cleanup uses the existing 15-second sweep. Unsaved edits stay in page memory
through focus refreshes for the same account, and are cleared on logout/account
switch. The field does not use browser local storage.


## Returning from cancellation

A Passli error/cancel callback redirects to the site UI, including after the
approval transaction expires or cleanup has removed it. A matching current
transaction returns to account settings with the Passli link unchanged. A stale,
replayed or different-browser return cannot cancel a newer transaction, redeem
a code, unlink, or restore authorization. Authentication proof deadlines and the
30-minute account lifetime still apply; cancellation navigation does not extend
either deadline. Cancellation is not rendered as a raw JSON authentication error.


## Expired approval and callback

If approval arrives after the original deadline, show "Your request timed out.
Please try again." The provider hides the expired form and offers Return to site.
Expired callbacks navigate to the site with a readable message instead of raw
JSON. Do not redeem a code, mutate a link, restore a session or consume a newer
request for a stale/foreign callback. Expiry and returning after a timeout are
not an explicit Cancel. Keep the original request/account deadlines unchanged.

## Disabled devices and suspension

Visible Passli sessions poll authorization, and the server rechecks the provider before protected actions. Missing association or unavailable authorization denies access. Suspension clears protected content while retaining the bounded account linkage.

For a disabled device, open the Passli mobile app and tap **Disabled devices**. Review the list, select the devices to restore, and press **Re-enable selected**. Browser recovery does not send repeated approval pushes. The provider must verify this explicit phone operation at the required assurance before the original eligible site session can resume. Recovery never extends the original 30-minute account deadline.

See the [deployment acceptance checklist](../docs/disabled_devices_deployment_test_suite.md). The published reference is demo0.1.15 with API592/mobile726 or later compatible releases; physical-phone acceptance is separate from automated checks.
