# Demo site implementation plan

Version: 18
Updated: 2026-10-25
Status: Implemented with real Passli Direct authentication at https://demo.passli.app.

## Purpose

Host the complete example site at https://demo.passli.app and keep its source in
this repository. The README must lead to both the integration specification and
the live demo. Preserve the compact sign-in page approved in the button mockup.

## User journeys

1. Existing local account: ordinary sign-in, account page, login/security
   settings and one Link Passli click that immediately starts fresh Passli proof
   without another site confirmation.
2. First unbound Passli login: restricted setup with Link to my existing account
   and Create new account. Cancellation returns to signed out; abandoned setup
   appears again on a later Passli login.
3. Linking: prove control of the existing site account, confirm the named target,
   obtain fresh Passli proof for that same identity and commit a unique
   identity/account pair. Settings shows one action: Link Passli while unlinked,
   replaced by Unlink Passli after linking. Another account can add its own link.
4. Registration: one Create account with Passli button, no local name/phone/email form. Request those fields in the Passli popup, use approved PII supplied by the authorized device, then atomically create the account and binding. Missing, denied, expired or cancelled sharing creates no account.
5. Returning linked identity: one linked account opens directly. Multiple linked
   accounts show Choose your account with recognizable names/emails. Only that
   verified identity's accounts appear; no project/notes access is granted before
   selection. Recheck the live binding and provider status, consume the original
   browser-bound login continuation once and rotate the session. Cancellation,
   expiry, replay, foreign selections and removed bindings grant no access.
6. Settings: show linked status and Unlink Passli; the click immediately opens Passli unlink approval without another site confirmation. Retain account
   data and alternative login; later unbound login returns to the chooser.
7. Session lifecycle: local logout, suspension with protected access denied,
   same-identity resume, wrong-identity rejection, termination and expiry.

Unlink requires a fresh Passli unlink signature at LoA 4 or higher, bound to
the exact site/account/binding/identity/challenge. It never asks for old site
credentials; cancellation or verification failure retains the link.

## Implementation boundary

The hosted demo uses real mode. Its source and operational boundaries are
documented in [demo/README.md](../demo/README.md). A separate simulated mode is
available for local walkthroughs; the hosted real mode rejects simulated approval
and provider-state controls. The Northstar account/password fixture remains
fictional in both modes.

Account bindings and authenticated sessions belong to the site backend. A client
screen, identity-selection control or stored browser preference cannot authorize
protected APIs. The demo needs isolated visitor data, fixed transaction deadlines,
one-use challenges, CSRF protection, atomic uniqueness and explicit cancellation.

Real Passli mode requires a registered demo client, correct callbacks, supported
installation discovery and provider grant/session checks. Simulated mode must
identify itself persistently and use fake accounts/approvals without accepting
Passli credentials. A walkthrough can demonstrate the UX but cannot be described
as validation of real authentication or protected threshold signing.

## Hosting

Deploy an independent demo service and route only demo.passli.app to it. Preserve
the existing private Passli application and other relying-party demos. Verify
public HTTPS, initial HTML, linked assets, backend enforcement and complete user
journeys before advertising the demo as live in the README.

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

## Account deletion

Settings offers Delete my Account. Obtain fresh LoA4 unlink approval for each
remaining binding, then ask for final site-account deletion confirmation. For
an unlinked account, show that confirmation directly. Remove only the selected
account/data/bindings and end its session. A restricted 60-second confirmation
capability may survive unlink ending a Passli session; it never grants project
access. Cancellation/expiry preserves the account; a completed unlink stays
unlinked. Never delete the real Passli account. Later Passli login starts setup.

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


## Card checkout extension (local candidate)

Cart navigation, $50 add/remove controls, a large Checkout with Passli button,
saved name/card/address consent, an exact authorization cap, and a separate Purchase
confirmation demonstrate cumulative device spending policy. Real mode uses
structured signed checkout fields; walkthrough approval remains simulated. No
processor capture is performed. Same-tab/name consent is a pending source correction;
release activation is held separately.
See [the checkout implementation contract](../demo/README.md#card-checkout-local-candidate).


The selected name and address are delivered directly from the authorized device to
`/api/checkout-release`; Passli signs a versioned SHA-256 commitment and masked
card reference. The site checks the exact signed commitment, live provider
session, current cart and fixed expiry before accepting it. Plaintext name/address,
PAN and CVV do not enter Passli signing requests. A retry finishes the same
approved order without an additional signature/spending reservation. Continue
checkout on Cart resumes a pending approval or approved purchase review.

Unlinked carts show "Link your Passli account for faster checkout" using the
existing explicit link flow, then return to the preserved cart. Checkout is shown
and accepted only after linking; its approval identity must remain linked.


## Release status

Demo022 is deployed with the single Link/Unlink action; see `docs/releases/demo022_single_link_button.md`. The full checkout candidate is Demo023, paired with API609/app753, and remains subject to exact production approval. Record and source checkpoints do not imply deployment.
