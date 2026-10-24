# Demo site implementation plan

Version: 2
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

Unlink safeguards remain proposed in the governing specification. A demo may
illustrate a candidate policy, but must identify that policy in its reference
documentation rather than presenting it as finalized Passli protocol policy.

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
