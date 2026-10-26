# Integration readiness

Version: 4
Updated: 2026-10-26

## What this repository provides

Site-facing integration requirements, a documented compatibility profile,
current Passli SVG/PNG icons, a static button presentation example and the
[live Northstar demo](https://demo.passli.app). The demo uses real Passli Direct
authentication with fictional local accounts. See the [implementation](../demo/README.md).
Public HTTP acceptance with a dedicated synthetic Passli account covered linking,
returning login from a fresh browser session, unlinking, registration and protected
API denial after provider lock. Physical browser/phone acceptance is separate.

| Capability | Status |
| --- | --- |
| Direct login with state, nonce and S256 PKCE | Implemented in the live demo using real provider assertions |
| FedCM assertion and backend token verification | Existing compatibility demonstration; browser support must be validated |
| Server verification of provider grant/session | Existing compatibility demonstration |
| Login button visibility | Always show Continue with Passli; extension or app detection is not required |
| Installed app/PWA detection | Requires supported platform APIs and verified app/site association; universal detection is unavailable |
| Existing-site account lookup, explicit linking and new-account choice | Implemented in the demo backend; replace its fictional local authentication with the target site's real login/MFA |
| Suspension/resume and protected API enforcement | Demo backend checks provider status; local tests cover wrong-account resume and unchanged deadlines; live provider-lock denial verified |
| Unlink Passli | Requires a fresh first-class Passli unlink request and verified site-identity signature plus provider attestation at LoA 4 or higher; no old site credentials; exact-binding removal invalidates dependent sessions |
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

The public demo client is `demo`, registered only for `https://demo.passli.app`
with callback `https://demo.passli.app/auth/passli/callback`. Do not reuse that
client ID on another site.

Keep deployment configuration explicit. Do not infer endpoint availability from
this reference or invent a client registration API. The compatibility profile
uses custom Direct endpoints and must not be advertised as a general OIDC SDK.

## Release acceptance

Use section 7 of the [site integration specification](Passli_site_integration_spec.md)
as the acceptance checklist. Verify the real browser, server and account flow,
including invalid proofs, replay, cancellation, account conflicts, suspension,
provider failure and direct protected API access. Record the tested environment
and remaining gaps; a static button preview does not establish login readiness.
