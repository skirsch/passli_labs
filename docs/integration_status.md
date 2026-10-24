# Integration readiness

Version: 1
Updated: 2026-10-24

## What this repository provides

Site-facing integration requirements, a documented compatibility profile,
current Passli SVG/PNG icons and a static button presentation example.
The documentation was checked against the current implementation source. This
publication did not run a live login, deploy a provider or certify a browser flow.

| Capability | Status |
| --- | --- |
| Direct login with state, nonce and S256 PKCE | Existing compatibility demonstration |
| FedCM assertion and backend token verification | Existing compatibility demonstration; browser support must be validated |
| Server verification of provider grant/session | Existing compatibility demonstration |
| Installation discovery | Extension discovery building blocks exist; public shared adapter and platform matrix are pending |
| Installed app/PWA detection | Requires supported platform APIs and verified app/site association; universal detection is unavailable |
| Existing-site account lookup, explicit linking and new-account choice | Site requirements specified; complete production reference is pending |
| Suspension/resume and protected API enforcement | Requirements specified; implement and verify across the target site's backend |
| Unlink Passli | Capability specified; detailed safeguards remain proposed for review |
| Protected threshold login | Target defined; final protocol envelope, implementation and migration are pending |
| Public hosted login script / universal SDK | Not supplied by this repository |

Compatibility demonstration means reference behavior, not a production service
availability guarantee. Do not copy demo client IDs or ephemeral in-memory
session/account storage into production.

## Before connecting a site

Coordinate with the Passli maintainer through this repository to obtain:

1. The supported protocol profile and environment.
2. A registered client ID, exact allowed origins and exact callback URLs.
3. The configured issuer, trusted verification-key source and supported key policy.
4. Required assurance and the grant/session-status contract.
5. A supported installation discovery mechanism for each target browser/platform.
6. Agreed account-linking, unlinking and session lifecycle behavior.

Keep deployment configuration explicit. Do not infer endpoint availability from
this reference or invent a client registration API. The compatibility profile
uses custom Direct endpoints and must not be advertised as a general OIDC SDK.

## Release acceptance

Use section 7 of the [site integration specification](Passli_site_integration_spec.md)
as the acceptance checklist. Verify the real browser, server and account flow,
including invalid proofs, replay, cancellation, account conflicts, suspension,
provider failure and direct protected API access. Record the tested environment
and remaining gaps; a static button preview does not establish login readiness.
