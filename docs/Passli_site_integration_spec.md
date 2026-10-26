# Passli Site Integration Specification

Version: 20
Updated: 2026-10-26
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

## 1. Login visibility: always offer Continue with Passli

**Revised by the user, 2026-10-26:** always show **Continue with Passli** on the
site login page, including when no browser extension or installed-app signal is
available. This supersedes the earlier installed-only visibility rule. Phone-app
users must be able to start the normal Passli ceremony without an extension.
Keep the site's other login and registration methods available alongside it.

A visible button is an entry point, not proof that Passli is installed, signed in,
unlocked, enrolled or linked to the site. A site cannot reliably infer a native
phone installation or a session on another device from its browser context.
Do not manufacture an installed flag, wallet connection or identity to show the
button. Optional discovery must not gate visibility or authorization.

Start authentication only after an explicit user click. Use the normal same-tab
Direct flow or the supported FedCM ceremony and preserve state, nonce, PKCE,
registered origin/callback, expiry, replay protection and verification. Rendering
the page must not open an app, popup, permission request or signing prompt.
Never probe custom URL schemes using timing/focus heuristics or request wallet
accounts merely to draw a login button. A user without an active Passli session
uses the normal Passli login options; showing the button grants no site access.

## 2. Integration inputs and implementation status

Before implementing, identify the site's login framework, registration flow,
stable account IDs, session store, authenticated middleware and protected APIs.
Obtain the supported Passli protocol profile, environment-specific client ID,
issuer, allowed origins/callbacks, verification-key source, required assurance,
session-status contract. Installation discovery is optional. Do not copy RP1's client identity.

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

1. Show Continue with Passli on the site's normal login page, using its existing
   UI components and accessible feedback; installation detection is not required.
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

**Account resolution (2026-10-25):** one verified Passli identity may link to
multiple local accounts. With exactly one current linked account, sign into it
directly, subject to current authorization and local account policy. With more
than one, show **Choose your account** listing only the accounts linked to the
verified identity, using recognizable account names and email addresses.
Do not select the first match automatically. A disabled account is not an
unbound identity.

The account picker is a short-lived, server-owned continuation of the verified
login, bound to that identity, browser and original deadline. Until selection,
grant no ordinary site session or protected account data. On selection, recheck
the exact live binding, account existence/expiry and provider authorization,
consume the continuation once and rotate the site session. Forged account IDs,
foreign browsers, replay, cancellation, expiry, unlink and account deletion must
not grant access. Account names and emails are display values, never authority.

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

Keep Link Passli available from authenticated account settings even when this
account or the selected Passli identity is already linked. That click is the
site's explicit consent: start the fresh linking
transaction immediately, without another site confirmation page or button.
Display the target account in settings before the click. Required Passli proof
and any higher configured approval policy still apply; no binding is committed
until fresh proof is verified. Linking the same identity to the same account is idempotent. Reject
invalid or stale settings-based links or races without moving or merging accounts.
The same Passli identity may be linked to another authenticated local account;
preserve each account's data, permissions and independent binding. Unlinking or
deleting one account must not remove its other account links. Enforce uniqueness
on each identity/account pair, rather than on the identity alone.

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

### One-page personal-information release

For first-time or unset consent, after the RP establishes its normal authenticated site session, sharing uses one
standalone Passli page in the current tab. Show the RP origin and the readable
Name, Email and Phone selectors, preselecting the user's saved/default values.
Provide exactly two actions: **Cancel** and **Allow and continue**. Do not open a
new window or popup, mount the account-management/PII editor, show a separate
"delivered" page, or require a second confirmation. The displayed name is the
selected Person's full name.

PII release adds no LoA step-up or phone approval/push. It uses the existing active,
authorized Passli/RP session and explicit field selection. Normal site login
requirements still apply when establishing that session. This does not weaken
unlink's mandatory fresh LoA 4 proof, device recovery or unrelated operations.
A locked, expired, suspended, wrong-account or unauthorized device must fail closed
on this same page, with Cancel available to return to the RP.

Cancel cancels the release and returns to the requesting RP without delivering
information or creating an account/link. Allow and continue saves the field
choices, delivers exactly the reviewed values directly from the authorized device
to the RP over HTTPS, and immediately returns to the RP's next page after its
receipt. Broker cleanup must not strand a user after a confirmed RP receipt.
Keep errors and timeout messages inline. Never display plaintext in redirect URLs.

Current protocol: Direct registration/login requests use `request_pii=true` and
`pii_flow=inline` (FedCM supports `piiFlow: "inline"` in its params). Consent is
deferred until after login, and the issued PII release contains `requestedFields`
and initially empty `fields` only when consent is needed. When saved permissions
are usable, `consentRemembered: true` and `selectionRequired: false` attest the
current allowed `fields`; the device claims, validates, decrypts and delivers
automatically, then returns directly to the RP without a consent screen. An already authenticated RP can request another
release using `/fedcm/pii/start` with its existing session/grant association; do
not restart login just to share information. The dedicated release page is
`https://passli.app/?piiRelease=<opaque request>&piiSite=<verified RP origin>`.

The signed device `select` action sends only the request ID, challenge, expected
PII version and selected record IDs/null decisions. Passli resolves authorized
record fields and binds the exact selection, current permission policy/version
and claiming device. The RP must check the delivery token and live provider
status, including the exact approved output fields; merely being among the
original requested fields is insufficient. Revocation, expiry and replay checks
remain mandatory. Legacy fixed-field releases remain supported during migration.

Return through the RP's fixed `/auth/passli/pii-return` endpoint with opaque request
ID and `delivered`/`cancelled` outcome. Validate against that browser's RP session;
never trust the outcome query as proof of delivery. Only the actual accepted
receipt can create an account or advance setup. Preserve the user's RP context,
and never accept an arbitrary caller-supplied return URL.


Returning releases with remembered consent show a read-only summary of exactly
the validated allowed values and the verified RP hostname. State that the user
previously approved sharing those values with that site. Keep the complete summary
visible for at least one second after painting, then return automatically after
the RP receipt, without another approval button. Saved Deny fields are omitted;
if all are denied, say that no personal information is shared. The viewing pause
never extends the fixed release deadline. Account changes, navigation, expiry or
revocation clear the summary and prevent stale delivery; recheck authorization
after the pause before sending. The standalone page fills the viewport on desktop
and mobile, including while loading.

### Personal-information permission scope

Remember name, email and phone delivery permissions for the Passli account and
verified relying party (RP), not for a browser, browser session or device. For
example, authorizing these fields for github.com applies when that same RP
requests them from any authenticated, authorized browser. A new browser does not
require a new field-sharing permission solely because it is a new browser.
Preserve the selected Profile and Person scope and record choices; this does not
grant access to another account, Profile, Person or RP. Resolve RP identity from
the registered client and its verified origin, never a caller-supplied site name
or a matching hostname suffix. Do not merge unrelated RP registrations by name.

Ask/Allow/Deny changes and revocation apply across browsers. Each delivery still
requires a fresh, unexpired request for that RP, the current allowed records and
an authorized device able to decrypt them. Device authentication, local unlock,
transaction review and single-device delivery claims are separate from durable
RP consent; a delivery token or an earlier browser session is not reusable consent.
Never use browser storage as the authoritative permission store.

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
unlink an existing account. The login button remains available independently.

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

- Continue with Passli remains visible and keyboard-accessible with no extension,
  no app-detection signal, denied/failed discovery, or a locked/logged-out app.
  Ordinary login remains usable. Rendering alone never starts authentication,
  requests wallet accounts, opens the app or displays an approval prompt.
- A phone-app user without an extension can explicitly start the normal verified
  ceremony. No installation flag or detected marker grants authenticated access;
  a missing/invalid/expired provider callback still fails closed.
- Exactly one linked account: direct login. Multiple linked accounts: list only
  that verified identity's accounts, require explicit selection and deny protected
  access until completion. Test each account's independent notes/data, another
  browser, server restart, original expiry, cancellation, foreign IDs, replay,
  simultaneous selections and unlink/deletion while choosing.
- Keep Link Passli visible on already-linked accounts; same-pair linking is
  idempotent and linking another authenticated account preserves previous links.
  Migrate existing single-account binding storage without losing links or data.
- Unbound identity: both choices,
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
