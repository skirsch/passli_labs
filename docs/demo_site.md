# Demo site implementation plan

Version: 4
Updated: 2026-10-24
Status: Implemented with real Passli Direct authentication at https://demo.passli.app.

## Purpose

Host the complete example site at https://demo.passli.app and keep its source in
this repository. The README must lead to both the integration specification and
the live demo. Preserve the compact sign-in page approved in the button mockup.

## User journeys

1. Existing local account: ordinary sign-in, account page, login/security
   settings, Link Passli, fresh approval and named confirmation.
2. First unbound Passli login: restricted setup with Link to my existing account
   and Create new account. Cancellation returns to signed out; abandoned setup
   appears again on a later Passli login.
3. Linking: prove control of the existing site account, confirm the named target,
   obtain fresh Passli proof for that same identity and commit a unique binding.
4. Registration: explicit account creation, normal site registration validation,
   atomic binding and ordinary site session only after completion.
5. Returning linked identity: enter the original account directly without chooser.
6. Settings: show linked status and Unlink Passli, confirm removal, retain account
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
