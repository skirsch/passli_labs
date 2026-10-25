# Passli Site Integration Specification

Version: 14
Updated: 2026-10-24
Status: Public integration requirements; implementation gaps and open decisions are identified below.

## Purpose and use

Give this document to an AI implementing Login with Passli on an existing site.
The instruction can simply be: **Use Passli_site_integration_spec.md to add
Passli login to this site.** A separate custom implementation prompt is not
required. Preserve the site's existing authentication and account system.

Explore the complete [live demo](https://demo.passli.app) and its
[public implementation](../demo/README.md) alongside this guide. Northstar uses
real Passli Direct authentication with fictional local accounts. Replace its
local authentication fixture with the target site's real login and MFA; the
demo's public sample password must never protect customer data.

This document contains the site-facing product requirements. Source references
at the end provide protocol and implementation context; they are not substitutes
for the requirements here. Do not interpret an open decision as approved policy,
or an example API as an available production SDK. Report missing dependencies
and unresolved decisions that prevent completing an implementation.

## 1. Temporary visibility rule: installed users only

**Confirmed, 2026-10-24:** for now, show **Login with Passli** only when the
current browser context positively detects an installed Passli application/PWA
or the Passli browser extension. The purpose is to avoid confusing existing site
users who do not use Passli. This is the default integration policy until an
explicit later revision changes it.

| Detection result | Login page behavior |
| --- | --- |
| Passli app/PWA detected | Show Login with Passli |
| Passli extension detected | Show Login with Passli |
| Neither detected | Hide the button |
| Pending, unavailable, denied, timed out or failed | Hide the button |

Keep the button hidden from the initial render, including server-rendered HTML,
until detection succeeds. Do not flash it and then remove it. Hidden controls
must not remain focusable or be announced as available by assistive technology.
Keep the site's normal login and registration usable without waiting for detection.
Do not replace the hidden button with a Passli installation promotion for now.

Installation is different from being logged in, unlocked, enrolled or linked to
this site. A detected installation may show the button while locked or logged
out; the normal Passli ceremony handles authentication. A previous Passli login,
an existing account binding, a stored preference or a successful provider HTTP
request is not evidence of a current installation. An app on another device or
an extension in another browser/profile does not meet this visibility rule.

### Detection implementation boundary

Use a documented Passli discovery adapter or supported platform mechanism. It
must work without automatically opening an app, popup, permission prompt,
account connection or signing request. Do not probe custom URL schemes using
focus/timing heuristics, enumerate installed software, or request wallet accounts
merely to decide whether to display a login control.

Current extension source exposes EIP-6963 provider announcements, an
`isPassli` provider marker, `window.passliSafeWallet`, and a content-script
runtime status message. These are discovery building blocks, not an established
public Passli-login detection SDK. A shared adapter must handle initial discovery,
late injection, mixed versions and stale page providers. Inspect current source
before selecting the exact interface; do not infer a new API from this document.
Page-visible markers can be imitated, so they govern presentation only.

For installed app/PWA detection, use only a supported browser/platform mechanism
with its required app/site association. `navigator.getInstalledRelatedApps()`
does not provide a universal installed-app inventory: it requires a verified
relationship and has platform, origin and scope restrictions. A site's own
standalone display mode does not prove Passli is installed. Where no reliable
Passli installation signal is available, retain the hidden state and document
that platform gap. Do not silently change the rule to always show the button.

Discovery should return only availability/capability information, not a global
Passli identity, wallet address or profile. Avoid permanent installation flags;
re-evaluate on a fresh page load and supported discovery updates. Detection
must never create a site session, link an account or authorize protected data.

## 2. Integration inputs and implementation status

Before implementing, identify the site's login framework, registration flow,
stable account IDs, session store, authenticated middleware and protected APIs.
Obtain the supported Passli protocol profile, environment-specific client ID,
issuer, allowed origins/callbacks, verification-key source, required assurance,
session-status contract and discovery adapter. Do not copy RP1's client identity.

RP1 is the mechanical reference for existing Direct/FedCM compatibility flows.
It is a demonstration, not a universal production SDK. Its in-memory maps are
not a durable account database. Proposed hosted scripts and installer APIs in
older documents must not be assumed to exist.

The protected native target uses one ordinary Ed25519 signature jointly produced
by the customer device and enclave under the enrolled stable site key. Its final
envelope, migration and deployment remain unfinished in the governing spec.
Provider-issued demo tokens do not satisfy that target. Identify which supported
profile is being implemented; never silently downgrade protected authentication
or invent missing protocol endpoints, credentials or signing behavior.

## 3. Login ceremony and backend verification

1. After positive installation detection, attach Login with Passli to the site's
   normal login page, using its existing UI components and accessible feedback.
2. On a user click, create a short-lived, single-use server-owned login transaction.
   Bind the browser attempt, intended operation, origin, nonce, assurance and
   allowed return destination. Restrict return destinations to avoid open redirects.
3. Run the supported Direct or FedCM ceremony. Direct requires fresh state/nonce,
   S256 PKCE and the registered callback. FedCM requires its supported browser
   flow and a server-verifiable assertion bound to the attempt's nonce.
4. Verify the result on the site's backend. For the current compatibility profile,
   verify signature, configured issuer, audience, nonce, bounded timestamps,
   achieved/required assurance and current grant/session authorization. Direct
   exchange codes must be single-use and checked against the PKCE transaction.
   For the protected native profile, apply its enrolled-key and exact challenge
   rules when that profile is available. Never trust decoded claims alone.
5. Resolve the verified site-specific identity to the local account before
   deciding whether setup is needed. Create the site's own secure session only
   after authorization and account resolution succeed.

Rotate site session IDs on authentication, use secure session cookies and CSRF
protection, bound transaction/session lifetimes and rate-limit authentication
endpoints. Cancellation, timeout, invalid proof or replay must not create a
session or binding. Do not expose tokens or sensitive claims in URLs or logs.
Passli visibility checks are not backend authentication controls.

## 4. Account lookup and first-use setup

**Already bound:** sign directly into the linked local account, subject to
current authorization and local account policy. Show no chooser or conflict
prompt during ordinary login. A disabled account is not an unbound identity.

**Unbound:** issue only a restricted setup session and show:

```text
Finish setting up Login with Passli

Do you already have an account on this site?

[ Link to my existing account ]
[ Create new account ]
```

Do not create a provisional full account, select an email-matched account or
grant ordinary authenticated access. The user remains in setup until one option
completes. Cancel clears setup state and returns to the signed-out site.
Abandonment, failure or expiry confers no Passli-based site login. Normal site
authentication remains available to prove control of an existing account.

### Link to my existing account

Use the site's current authentication, including its required MFA/SSO/passkeys.
Passli must not collect those credentials. After authentication, show
**Link Passli to [account name]** and require explicit confirmation. Obtain the
target account from the authenticated server session, not the displayed name
or a browser-supplied account ID.

Create a fresh single-use linking transaction bound to that local account,
authenticated session, operation and fresh Passli challenge. Verify that the
Passli identity is the same one that began setup. Do not reuse the earlier
unlinked login proof as authority to attach a login method. Account or identity
switches require restarting explicitly. Commit the binding atomically, preserve
all existing account data/permissions, and show success.

An additional Link Passli action may be offered from authenticated account
settings. That click is the site's explicit consent: start the fresh linking
transaction immediately, without another site confirmation page or button.
Display the target account in settings before the click. Required Passli proof
and any higher configured approval policy still apply; no binding is committed
until fresh proof is verified. Linking the same identity to the same account is idempotent. Reject
conflicting settings-based links or races without moving or merging accounts;
these guards do not add a chooser to ordinary already-bound login.

### Create new account

Offer Create account with Passli. Request the required name, phone and email through Passli's PII consent and authorized disclosure flow rather than asking the user to retype information already held by Passli. Create the local account only after approved data arrives and required field validation succeeds. Cancellation, missing fields or disclosure failure must leave no account or binding. Apply the site's terms, eligibility and verification rules; shared contact data is not automatically proof of mailbox or phone control. Email is profile data, never an account-binding key;
matching even verified emails does not authorize linking. Apply normal duplicate
registration rules and offer existing login/recovery when necessary.

Use the selected Person record's `fullName` value for the shared name, never its record label or the Passli account alias. The authorized-device sharing review must show the actual Full name, Email and Cell phone values before delivery. Reject missing or blank required values instead of substituting metadata.

The Passli consent screen names requested fields in plain language. Do not render null values, encryption placeholders or internal default/Profile identifiers as personal information. Keep record selection behind an explicit choice when different contacts are available; a default alias and its resolved record are one contact. Review readable values on the authorized device before delivery.

Bind the verified identity, account creation and completed choice atomically.
Enforce uniqueness and idempotency so retries or concurrent tabs cannot create
multiple accounts or orphan records. Expired setup needs fresh authentication.
Then create the ordinary local session.

### Reminders and durable state

Successful linking records Yes to linking; successful new-account creation
records No. Either completed outcome stops reminders. Clicking a button alone
does not. Unfinished setup returns to the chooser on the next verified Passli
login while the identity remains unbound. Persist bindings and completion on
the site server, not in a browser checkbox or localStorage flag. Creating an
account does not authorize later automatic account merging.

## 5. Unlink Passli

Provide **Unlink Passli** in the linked account's login/security settings.
That click starts the fresh Passli unlink request immediately. Do not add a
second site confirmation screen: Passli identifies the unlink operation, explains
its consequences and obtains the required phone approval. Keep the binding until
the site verifies the resulting LoA 4 or higher unlink signature.
**Approved requirement, 2026-10-24:** unlinking requires a fresh Passli `unlink`
request and a verified user signature at **LoA 4 or higher**. Do not request the
site's old password or other local credentials as unlink authorization. A local
session, ordinary login assertion, remembered assurance or lower-LoA approval is
insufficient. Passli enforces a non-downgradable operation minimum of 4; higher
site/device/account policy still applies. No cached login grace authorizes unlink.
All approval surfaces must identify the operation as **unlink**, including the
browser heading, waiting instructions and push notification title. Explain that
Passli is being removed as a sign-in method while the local account/data remain.
Derive this wording from the validated operation, not from LoA alone or arbitrary
RP-supplied prose. Never label an unlink approval as login.

The site backend creates a one-use challenge for the authenticated local account
and exact current Passli binding. The signed payload must contain operation
`unlink`, domain `passli:unlink:v1`, registered relying origin/audience, linked
site subject, opaque local account ID, current binding ID, nonce and bounded
issuance/expiry. Verify both the site-identity user signature and Passli's signed
assurance attestation, including required/achieved LoA >= 4, against the exact
server-held request. Reject wrong account, identity, binding, origin, operation,
nonce, expired/replayed proofs and incomplete/cancelled approvals. Never accept
browser-provided assurance or a generic text signature as an unlink proof.

Only after successful verification, atomically remove that binding and consume
the challenge. Invalidate sessions established through it, including suspended
sessions, and pending transactions that could restore it. Independently
established sessions follow site policy. Cancel/failure leaves the binding intact;
retries cannot remove a replacement binding. Preserve both accounts, local data,
roles and other sites' associations. A later unbound login shows setup again;
relinking always needs a fresh explicit link flow. Grant revocation and logout
remain separate operations. The temporary demo's automatic account expiry is
account-data cleanup, not authorization to manually unlink a retained account.

### Delete the site account

Offer **Delete my Account** in account settings. Delete the selected local account,
its profile data, Passli bindings and dependent site sessions; preserve unrelated
accounts and the user's Passli account. Account deletion must not bypass unlink
authorization: obtain a fresh, verified LoA 4 or higher unlink proof for every
remaining Passli binding before removing it.

In the demo, a linked account's Delete my Account click starts that unlink flow.
After unlink approval, return to a final explicit deletion confirmation. The
unlink screen's statement that site data remains is true until this separate
confirmation. An unlinked account goes directly to deletion confirmation. If
unlink ends the Passli site session, retain only a server-held, same-browser,
same-account, one-use deletion authorization for at most 60 seconds, bounded by
account expiry. It must not authorize project access or a replacement session.
Cancel, timeout, changed account/session or a newly linked identity invalidates
that authorization. Final deletion atomically removes the selected local data and
bindings, ends the site session and rotates its cookie/CSRF token. Old callbacks
and challenges must not recreate the deleted account or binding. A later unbound
Passli login starts normal first-use setup.


## 6. Suspend, resume and terminate

The site must enforce current Passli session authorization on its backend for
every protected route/API/action, with visible-page checks on focus/resume and bounded periodic checks while a Passli session is visible. A missing provider association must deny protected access. Recheck the current session after asynchronous input before applying a protected action.
Suspension changes session access, not account binding or setup completion.

| Verified status | Required site behavior |
| --- | --- |
| Active | Permit the bound account subject to local policy |
| Explicitly suspended, grant still valid | Retain a bounded session association; deny protected access |
| Same eligible account/device active again | Revalidate original subject, session, grant and local account before resuming |
| Terminated, revoked, expired or locally disabled | End the session and require new login |
| Provider unavailable, timeout or unverifiable response | Deny access; RP1's reference ends the local session |

While suspended, hide/clear sensitive page content and show:

```text
Session suspended
Log into the same Passli account to resume.
[ Open Passli ]  [ Log out of this site ]
```

For device tripwire suspension, tell the user to open the Passli mobile app and tap **Disabled devices**, select the affected device, and explicitly re-enable it. Do not start browser recovery pushes or retry them indefinitely. Offer **Check device status** and local logout. A device remains disabled until this explicit phone operation succeeds.

Opening Passli or receiving a client event is not proof of authorization.
Revalidate before revealing data or resuming protected operations. Backend
enforcement is required even when a page overlay is present. Previously shown
data cannot be recalled, and focus checks alone do not promise instant locking
across tabs. Installation discovery failure must not bypass authorization or
unlink an existing account; it only controls showing a new login button.

Resume keeps the same local account and original session expiry. Another Passli
identity cannot inherit the suspended session. Pending setup/link transactions
retain their deadlines and require fresh verification before completion.

Honor the user's Suspend site sessions versus End site sessions preference.
Under End, Passli logout invalidates the session rather than leaving it
resumable. Log out of this site always ends that site's session, including
while suspended, clears its cookie and does not unlink the account or log the
user out of Passli globally.

RP-to-Passli server HTTPS requests use fresh single-use TCP/TLS connections,
HTTP/1.1, Connection: close, certificate validation and bounded deadlines, as
required by the current integration transport contract. Browser connections
and internal cluster connections have different ownership.

## 7. Acceptance and delivery

Verify the real supported flow and report evidence for:

- No installation: no Passli button, focus target, initial flash or installation
  promotion; ordinary login remains usable. Repeat for unsupported, denied,
  timed-out and failed discovery.
- Detected extension and supported installed app/PWA: button appears without
  requesting accounts or approval. Include locked/logged-out installs, late
  discovery and stale/unloaded extension contexts. A forged presentation signal
  never grants authenticated access.
- Known binding: correct account, no chooser. Unbound identity: both choices,
  restricted setup, signed-out cancellation and reminders until completion.
- Existing account: full normal authentication, named confirmation and fresh
  identity-bound linking. Email matches never create associations.
- New registration: explicit choice, normal validation, atomic binding,
  duplicate/collision handling, concurrent tabs, retry and rollback behavior.
- LoA 4 signed unlink enforcement and its approved safeguards; no automatic reassociation.
- Suspension blocks direct protected API requests as well as pages. Same-account
  resume preserves the account; wrong-account resume, termination, revocation,
  expiry, local disablement and provider failure deny access.
- Signature/issuer/audience/nonce/state mismatch, replay, insufficient assurance,
  CSRF, forged callbacks and unsafe return URLs fail without side effects.

Deliver the integrated code, necessary durable schema/configuration changes,
deployment/setup instructions, and focused verification results. Identify
unimplemented capabilities and open decisions. Do not call a UI-only mock,
provider-token demo or passing typecheck a completed protected integration.

## 8. Public references and remaining dependencies

- [Compatibility protocol reference](compatibility_protocol.md): existing
  Direct/FedCM request shapes and backend verification requirements.
- [Integration readiness](integration_status.md): available reference behavior,
  planned features and information needed before onboarding a site.
- [Icon assets and button guidance](../assets/README.md).
- [Live demo](https://demo.passli.app) and [demo implementation](../demo/README.md):
  complete account lifecycle example, security boundaries and local walkthrough.
- Browser installation constraints:
  [Chrome installed related apps documentation](https://developer.chrome.com/docs/capabilities/get-installed-related-apps).

RP1 refers to an earlier Passli compatibility demonstration. The Northstar demo
source is included in this kit; the provider's internal implementation and
supporting design documents are not. This document contains site-facing
requirements. Request supported client
registration and protocol configuration from the Passli maintainer before
implementing a live integration. Do not assume access to internal source.

Still to supply/finalize: public Passli login discovery adapter and supported
browser matrix; verified app/site installation associations where supported;
the target site's client registration and supported protocol configuration;
the approved LoA 4 unlink contract; protected-native protocol implementation/migration
when that profile is requested. This document defines requirements without
claiming these dependencies have shipped.


## Private account hint on the button: design boundary

A Passli ID or account label placed in the site's DOM, attributes, image URL,
canvas inputs or page messages is disclosed to the site. Extension content-script
isolation does not make shared DOM contents private. The current public button
stays generic and does not request a global Passli ID for presentation.

A future Passli-controlled cross-origin iframe could render the active account
label privately while the embedding page receives only bounded operation/status
messages. Keep identity out of the iframe URL, embedding attributes, messages and
identity-dependent size. This requires a supported widget/session/discovery
protocol and browser privacy validation; it is not implemented by this demo.
A Passli-owned popup or browser-owned account chooser can identify the account
without placing it in the site's DOM and provides a clearer trusted surface.
Only the necessary verified site-specific identity should reach the site after
an approved login/link operation; the global Passli ID need not be disclosed.


## Expired approval and callback

If approval arrives after the original deadline, show "Your request timed out.
Please try again." The provider hides the expired form and offers Return to site.
Expired callbacks navigate to the site with a readable message instead of raw
JSON. Do not redeem a code, mutate a link, restore a session or consume a newer
request for a stale/foreign callback. Expiry and returning after a timeout are
not an explicit Cancel. Keep the original request/account deadlines unchanged.
