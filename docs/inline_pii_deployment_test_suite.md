# Inline PII release deployment test suite

Version: 2
Status: acceptance suite; API596/web733/RP596/demo016 deployment is recorded
in passli/docs/reports/api596_web733_inline_pii.md. Interactive browser and
physical-phone approval acceptance remain separate. Earlier local results below
are historical source checks, not a substitute for that deployment receipt.
Candidate: API/RP596, web733, demo0.1.16. Earlier local tag-case and mobile-button
changes must be preserved in any coordinated release.

## Expected flow

When consent is new or unset, after normal site authentication, the current tab shows one standalone Passli
page with Name, Email and Phone value selectors. The two actions are Cancel and
Allow and continue. There is no sharing LoA ceremony, approval push, delivered
screen, account sidebar or PII editor. Both outcomes return to the calling RP.
Login assurance, session suspension and fresh LoA4 unlink requirements remain.

Saved usable allow/deny decisions automatically deliver current allowed values and
return to the RP without selectors or another approval, in any authorized browser.

## Post-deployment acceptance

Run separately on RP1, RP2 and demo with a disposable account. Record actual
versions and distinguish automated fixtures from browser/phone acceptance.

1. Start sharing and verify no new tab/window opens. For RP1/RP2, test both login
   buttons with sharing selected and Share information from an existing session.
2. On first consent, confirm exactly one intermediate release page, the correct RP origin, actual
   full name/email/phone, default selections, no null/Use default/Choose another
   placeholders, and exactly Cancel / Allow and continue.
3. Change a contact, then Allow and continue. Confirm the RP receives exactly the
   reviewed current values and immediately advances its own page. No extra LoA,
   approval notification, completion page or account-manager landing may appear.
4. Uncheck a field on RP1/RP2 and confirm it is absent from delivery. Tampering a
   callback to include that field must be rejected against provider-approved
   outputs, even if the RP originally requested it.
5. Cancel before approval. Return to that RP, keep its existing login/context,
   deliver no PII and create no new account or linkage. Demo returns to Create
   account. Retry sharing from the RP session without signing in again.
6. Wait beyond expiry; the same page says Your request timed out. Please try
   again. Cancel still returns to the RP. Late selection/delivery must fail.
7. Change/log out the Passli account in another tab. Previously visible choices
   disappear, late results cannot repopulate them, and no values are delivered.
8. Revoke permission, suspend the originating device/session, change the selected
   records or race two devices. Old authorization must not deliver. Wrong origin,
   callback, Person/Profile, challenge, version or delivery token must fail.
9. Simulate a lost delivery response. An explicit retry must reuse the same
   request/token and values, never create a second account. A successful RP
   receipt returns to the RP even if final broker cleanup fails.
10. Verify an ordinary LoA4/6 login still requires its configured factors; sharing
    adds none. Verify unlink still requires a fresh bound LoA4-or-higher proof.
11. Create a demo account and verify its 30-minute creation deadline and notes.
    Confirm missing required PII, cancellation and replay create no account.

12. After approving once, repeat login and Share information in the same browser
    and a different authorized browser. No PII approval appears; allowed current
    values arrive and denied fields remain absent. Repeat after updating values.
13. Revoke a field to Ask, remove an allowed record, or change RP/Person/Profile.
    Require consent in the affected scope; never inherit or silently substitute.

## Compatibility and publication

Publish the provider and RP/demo receiver support for requestedFields and exact
approved output verification before activating the new page. Preserve legacy
fixed-field releases during transition. The provider parameter is pii_flow=inline
for Direct and piiFlow: inline for FedCM. Return is fixed to the verified RP's
/auth/passli/pii-return; the outcome query alone is never proof of delivery.
Do not publish an entire dirty checkout. Follow the canonical full deployment
checklist with frozen source, all-host gates, public bundle/origin hashes and
current topology. No private plaintext, keys or customer data belong in receipts.

## Local validation result

Latest remembered-consent gate: 1,207 tests, 1,205 passed, two optional skips,
zero failures. Log: apps/web/.web-deploy/remembered-pii596-required-gate.log.
Focused provider/broker/UI tests: 21 passed, including returning consent across
a second browser for each RP, denied-field exclusion, automatic all-denied
delivery, and revocation of an already-issued authorization.
Previous demo regression: 29 passed (demo implementation unchanged this turn).
Current TypeScript and web/iOS JavaScript exports passed for web733.
These are local current-tree checks; all-host frozen-runtime publication and
actual browser/phone acceptance have not been performed. Production is unchanged.
