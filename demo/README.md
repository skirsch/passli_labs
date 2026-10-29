# Northstar: complete site integration demo

Version: 26
Updated: 2026-10-28

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

Node.js 24.16 or later is required. Production has no npm dependencies; install
the pinned development packages to run QR decoding tests or rebuild the encoder.

```sh
cd demo
npm ci
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
   identity with one linked account opens it directly, including from another
   browser after real proof. Multiple linked accounts appear in Choose your
   account; select one to access its own projects and saved notes.
4. **Link from settings:** ordinary fictional Northstar login → Settings →
   Link Passli → fresh Passli proof → linked. The settings button starts the
   transaction immediately, without another site confirmation screen. After linking,
   that single button becomes Unlink Passli. Settings never shows both actions.
   The same identity can still link to additional authenticated Northstar accounts.
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
| `public/app.js`, `public/style.css` | Compact site UI, account screens and always-visible Passli sign-in |
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

Continue with Passli is always visible, including without a browser extension.
A phone-app user explicitly starts the same-tab Direct flow; normal provider
verification and account setup/linking still apply. No extension discovery or
stored installation flag controls the real login button, and merely rendering
it never starts authentication. The installation control is a walkthrough-only
simulation and is hidden in real mode.

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


## Card checkout (local candidate)

Open **Cart**, use the compact **+** and **−** buttons on the left below Quantity
to add or remove $50 items, then choose **Checkout with Passli**.
The pending same-tab correction navigates to a Passli-served review of the exact
USD total/maximum and saved name, CreditCard and Address records. A password-based
merchant customer first links Passli explicitly from the cart. The link button
reads "Link your Passli account for faster checkout"; approval, cancellation or
expiry returns to the same cart. Linked accounts see Checkout with Passli.
Checkout authorization preserves the merchant account/session and must use one
of its currently linked Passli identities. It shares a masked
card reference and the displayed shipping address, then Northstar shows a separate
**Purchase** confirmation. No card is charged; a real processor integration is
outside this demonstration. These checkout changes require the corresponding
Passli API and web candidate. The same-tab/name correction is not yet deployed.

Passli applies its device payment policy to cumulative authorized amounts. An
approved amount counts even if the final Purchase is abandoned. A successful
over-limit approval resets the existing allowance. The walkthrough uses fictional
My AMEX / My home records and a simulated $100 allowance with LoA 2 within the
allowance and LoA 4 over it. The page reports cumulative completed purchases and
the verified required/achieved LoA separately.

`checkout.mjs` owns prices, cart revisions, final consumption and independent
verification of the pairwise user signature and Passli attestation. No PAN or CVV
is sent to or stored by the demo. Cart/order data expires with the account.


The selected name and address are delivered directly from the authorized device to
`/api/checkout-release`; Passli signs a versioned SHA-256 commitment and masked
card reference. The site checks the exact signed commitment, live provider
session, current cart and fixed expiry before accepting it. Plaintext name/address,
PAN and CVV do not enter Passli signing requests. A retry finishes the same
approved order without an additional signature/spending reservation. Continue
checkout on Cart resumes a pending approval or approved purchase review.

New orders use checkout version 3. The versioned address commitment includes the
selected Person record ID, full recipient name, Email record ID/value and Phone
record ID/value. Missing or changed shipping/contact values reject delivery.
Passli labels each slot and preselects its scoped saved default before explicit
approval. The Demo shows the approved email and phone at final Purchase.
Pending version 1/2 orders retain their original compatibility and expiry.
Checkout-specific provider authority never creates a merchant identity link.


## Release status

Demo022 is deployed with the single Link/Unlink action; see `docs/releases/demo022_single_link_button.md`. The full checkout candidate is Demo023, paired with API609/app753, and remains subject to exact production approval. Record and source checkpoints do not imply deployment.

## Four-demo home (0.1.26)

The origin root is a four-card selector. Northstar is at `/northstar/`, the
Netflix-inspired TV login is `/tv/`, Schwab mutual authentication is `/schwab/`,
and Wells Fargo-inspired Bank Wire is `/wire/`. Each has Passli Demo Home navigation.

TV uses real Direct login, without streaming-service connectivity. The Schwab
operator first connects the customer identity, then reads a random two-digit code
from the agent screen. The customer enters it on the Passli approval webpage
before the existing phone approval ceremony. The exact code is identity-signed.
Native push code entry and a production bank agent lookup are not implemented.
The Steve Kirsch field is a fictional display fixture; the connected pairwise
Passli subject is the verified identity. Codes mitigate accidental approvals but
can be relayed by a scammer. Declines record only local demo concerns.

Wire defaults to $1,000 to OpenAI with fictional routing/account numbers. The
server requests LoA 3 below $1,000, LoA 4 for $1,000 through $5,000 inclusive,
and LoA 5 above $5,000; Passli policy may require stronger assurance. No money
moves. `suite.mjs` owns cookie-isolated state and server-derived requests;
`signature.mjs` independently verifies both signatures and exact request fields.
After approval, `/wire/` shows a separate result page with the original amount,
recipient and success, cancellation or verification failure. Pending requests
remain pending. Return to Wire funds dismisses the result and retains the amount
and connected identity for another wire. Results survive reload without consuming
the signature response again. This demonstration never sends money.
Requires corresponding Passli API651 and Code815 code-entry support. Existing
Northstar walkthrough stays available; new walkthrough minisites are visual
previews and refuse real connection. Run `node --test demo/test/*.test.mjs`
from the repository root. Publication and phone acceptance are pending.

### Connect callback correction (0.1.27)

All three new minisites preserve the Direct adapter's exact 43-character opaque
state. The suite selects its callback only when the saved pending state matches
the current browser cookie; unrelated Northstar callbacks pass through normally.
The previous `suite.` prefix violated the provider request contract and made
Connect fail before authentication. Regression tests now use the real Direct
adapter and cover TV, Schwab and wire, PKCE preservation, other-browser denial
and callback replay. This is a demo-service-only update; API651/Code815 suffice.

## TV QR login and remembered devices (0.1.28)

The TV Sign in button always creates a fresh three-minute QR request; the TV
browser's Passli login cannot sign it in. Scan with the phone's system camera.
The phone page shows the TV name/address and opens the registered Direct flow
at minimum LoA4 for explicit first-time approval. The TV receives completion by
SSE. No Passli application is installed on the TV and the phone does not poll.

Each browser profile gets a stable public TV address and a separate private
HttpOnly device cookie. The address is not an IP address or a login secret.
On first approval, the unchecked Remember this TV choice can grant 30 days of
scan-triggered sign-in for that TV and the verified identity on that phone browser.
Future scans still obtain a fresh Passli identity proof; higher account/site
policy may require approval. Identity changes, expiry and revoked trust cannot
reuse the previous consent. Sign out keeps the address/trust; Reset Demo
revokes all remembered phones and pending requests for that TV. The
phone can also forget its own trust. Clearing TV cookies creates a new identity.
This is a browser bearer-credential model, not a hardware-attested TV key.

`tv.mjs` owns SQLite TV/phone/request records, policy-bound callbacks, atomic
completion and SSE. `public/tv.js` and `public/tv-phone.js` render the two devices.
`qr.mjs` uses the committed licensed `vendor/qr-encoder.mjs`; production needs no
package installation. `npm run build:qr` regenerates that module and licenses
from the pinned development dependencies. Include vendor/ in release archives.
`test/tv.test.mjs` covers first/remembered logins, identity isolation, consent,
expiry, revocation races, restart persistence, SSE/shutdown and independently
decodes the generated QR.

This is a demo-only rollout using the existing API651/Code815 Direct support.
It does not add a native Passli QR parser: use the system camera and HTTPS phone
page with existing Passli approval/app handoff. Physical-phone acceptance and
production publication remain unverified until rollout and human testing.

### Reset Demo (0.1.29)

Reset Demo sits directly below the TV Passli sign-in button and remains available
while waiting or signed in. It clears the current TV session, cancels its pending
QR/phone approval and advances its trust generation, invalidating all remembered
phone approvals for that TV. The stable TV address stays the same. The next scan
requires explicit LoA4 phone approval; selecting Remember this TV again restores
scan-and-done for later logins when Passli policy permits. The existing forget
endpoint remains compatible. Other demo accounts/devices are untouched.

### Netflix signed-in header (0.1.30)

Log out appears in the upper-right page header only while the TV is signed in.
It uses the existing TV logout action and preserves remembered consent and the
TV address. Reset Demo remains the separate control that clears remembered
approvals. The old in-card Sign out of TV button is removed.
