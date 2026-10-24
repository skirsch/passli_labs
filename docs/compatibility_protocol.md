# Direct/FedCM compatibility reference

Version: 3
Updated: 2026-10-24
Status: Existing demonstration profile; not the protected threshold-login protocol.

Read the [site integration requirements](Passli_site_integration_spec.md) and
[readiness document](integration_status.md) first. These request shapes describe
the current compatibility implementation. Obtain explicit environment/client
configuration from the maintainer before connecting a site. `ISSUER`,
`CLIENT_ID` and `SITE_ORIGIN` below are configuration placeholders.

## Direct login

The site's backend creates a short-lived, single-use login transaction bound
to the browser, nonce, state, requested assurance, callback and a random PKCE
verifier. Keep the verifier on the server. The current reference uses 32 random
bytes encoded as base64url for state, nonce and verifier; derive the challenge
as base64url(SHA-256(verifier)).

On a user click, redirect to `ISSUER/direct/login` with:

| Query parameter | Value |
| --- | --- |
| `client_id` | Registered `CLIENT_ID` |
| `redirect_uri` | Exact registered `SITE_ORIGIN/auth/passli/callback` |
| `state` | Fresh transaction state; reference expects 43 base64url characters |
| `nonce` | Fresh nonce; reference expects 43 base64url characters |
| `code_challenge` | S256 challenge; 43 base64url characters |
| `code_challenge_method` | `S256` |
| `required_loa` | Explicit supported assurance level, integer 1 through 6 |
| `request_pii` | `false` for a login-only integration |

Requesting a level does not establish that its factors are available or have
passed acceptance in your environment. Obtain supported assurance policy.
Arbitrary `scope` and `claims` parameters are rejected by this profile.
Optional profile-data release requires its own supported consent contract.

The callback carries `code` and `state`, or an error such as `access_denied`.
Consume the site's transaction once, check state and its expiry, then exchange
the code from the backend:

```http
POST /direct/token
Content-Type: application/json
Connection: close

{"code":"CODE_FROM_CALLBACK","clientId":"CLIENT_ID","redirect":"SITE_ORIGIN/auth/passli/callback","verifier":"SERVER_HELD_VERIFIER"}
```

The response is `{ "token": "SIGNED_ASSERTION" }`. The current provider code
expires after 60 seconds, is single-use and binds client, callback and S256 PKCE.
Verify the assertion and current authorization before issuing any site session.
Do not log callback codes or forward assertions in URLs.

## FedCM

After positive installation detection and a user click, obtain a nonce from
the site's backend and bind it to a single-use transaction. The existing
reference requests an assertion using this browser shape:

```javascript
// Compatibility reference only: obtain nonce and policy from your own backend.
const credential = await navigator.credentials.get({
  identity: {
    providers: [{
      configURL: `${issuer}/fedcm/config.json`,
      clientId,
      fields: ['name'],
      nonce,
      params: { requiredLoA, requestPersonalInformation: false }
    }],
    mode: 'active'
  },
  mediation: 'optional'
});
```

Validate browser/platform support and the applicable Permissions Policy.
The reference site sends `Permissions-Policy: identity-credentials-get=(self)`.
Handle cancellation and unsupported browsers without disrupting existing login.
Post `credential.token` to your site's backend using the site's CSRF/origin
controls. Neither the returned browser object nor `isAutoSelected` proves login.

## Backend verification

Both paths require the same server-owned transaction and cryptographic checks:

1. Fetch trusted keys only from the configured issuer's
   `/.well-known/jwks.json`; never follow token-supplied key URLs. The current
   reference selects an `OKP` / `Ed25519` key with `kid: passli-fedcm-v1`.
2. Verify the complete JWT signature, with header `alg: EdDSA`,
   `kid: passli-fedcm-v1` and `typ: JWT`. Reject malformed or oversized tokens.
3. Require exact configured `iss`, registered `aud`, expected `nonce` and a
   valid site-specific public-key `sub`. Use the verified `(issuer, audience,
   subject)` identity as the local binding key, never an email address.
4. Require integer `iat` and `exp`, an unexpired token, `iat` no more than 30
   seconds into the future and a token lifetime no greater than one hour.
   Apply the site's shorter transaction deadline independently.
5. Require integer `requiredLoA` and `achievedLoA`: both meet the server's
   requested level, neither exceeds 6, and achieved is at least required.
6. Validate `gid` and `sid` using the supported capability contract. The current
   format is either 43 base64url characters or `region.encryptedRouting.random`,
   with a 1–32-character lowercase region, 39–220 base64url routing characters
   and 43 base64url random characters. Raw account-prefixed forms are rejected.
   Preserve the entire opaque value; do not assume a fixed 43-character length.
   Do not log capabilities or expose them to the browser.
7. Confirm current authorization from the backend as below, then resolve the
   local binding and complete explicit setup if needed.

Use an audited JWT implementation configured for this exact profile. This
document is not a replacement for a maintained verifier or the final supported
subject/capability validation contract. Reject unsupported profiles and keys.

## Grant/session confirmation

After verifying the token, call the configured issuer from the site's server:

```http
POST /fedcm/session-status
Content-Type: application/json
Connection: close

{"sessionId":"VERIFIED_SID","clientId":"CLIENT_ID","subject":"VERIFIED_SUB","grantId":"VERIFIED_GID","complete":true}
```

Require an HTTP success response with `active: true` before completing login.
Persist the verified provider association with the site's bounded session.
Subsequent authorization checks send the same four identity fields, omitting
`complete`. Explicit suspension denies protected access while retaining only
the bounded association. Revocation, termination, expiry, local disablement,
timeouts and unverifiable status deny access; the demonstration ends the local
session on provider failure. Resume requires revalidation of the original
association and must not extend the site's original expiry.

Enforce authorization on every protected backend route/action, including API
requests made outside the page UI. Use focus/visibility checks to update the
page; opening Passli or receiving a browser event cannot resume authorization.

All RP-to-provider HTTPS requests use a fresh single-use TCP/TLS connection,
HTTP/1.1, `Connection: close`, normal certificate validation and bounded deadlines.
Disable pooling/reuse in the actual transport; setting a header alone does not
establish the connection policy. Browser-managed connections are separate.

## Account/session responsibilities

An assertion authenticates a site-specific identity; it does not authorize
automatic registration or email-based linking. Implement the explicit
existing-account/new-account flow in the [site specification](Passli_site_integration_spec.md).
Keep setup sessions restricted, bindings durable and atomic, authentication
cookies secure, session IDs rotated and mutation endpoints CSRF-protected.
The reference's in-memory maps are unsuitable as a production session store.


## First-class signed unlink request

An ordinary Direct login token cannot authorize unlink. Use the same registered
Direct callback/code exchange with `operation=unlink`, `required_loa=4`,
`request_pii=false`, and `unlink_subject`, `unlink_account`, `unlink_binding`.
These three target fields are canonical 32-byte base64url values: the bound
site-identity public key, opaque local account ID and current random binding ID.
Generate and retain a fresh nonce/state/PKCE verifier on the site server. The
site session must select the account and current binding; never accept a target
account from the page. Passli's operation floor remains 4 even if the caller
requests LoA 1, and higher configured signing/device policy still applies.

The browser and secure-phone approval identify this as `unlink`. The phone's
signed approval JSON includes the exact target and nonce. No login grace is
reused. After fresh secure approval, Passli returns a one-use authorization code
whose exchanged signed token has `kind=passli:unlink:v1`, `operation=unlink`,
`iss`, `aud`, `sub`, `nonce`, `requiredLoA`, `achievedLoA`, `iat`, `exp`, and
`unlinkProof`. It does not issue a login grant/session for unlink.

`unlinkProof` contains the site-specific Ed25519 `publicKey`, `keyId`,
`userSignature`, `hash`, `hashAlgorithm=SHA-256`,
`encoding=passli-sorted-json-utf8-v1`,
`signatureAlgorithm=Ed25519-over-SHA256`, and `fields`. The fields are exactly:
`domain=passli:unlink:v1`, `operation=unlink`, `audience` (registered HTTPS site
origin), `subject`, `accountId`, `bindingId`, `nonce`, `requiredLoA`,
`achievedLoA`, `issuedAt`, `expiresAt`. Times are Unix seconds; the proof lasts
at most 60 seconds and never beyond the approval deadline. Canonical JSON sorts
object keys recursively, preserves array order, omits undefined object values,
and uses UTF-8. Hash these bytes with SHA-256; verify the user signature over the
32 hash bytes and pin its public key's `x` to the existing linked subject.

Verify the provider JWT signature using its trusted discovery JWKS and fixed
issuer/audience, then verify the entire embedded user proof, its exact target and
nonce, operation/domain, issuance/expiry, and matching required/achieved LoA >= 4.
Use the standalone [demo verifier](../demo/unlink.mjs) as an implementation
reference. Consume the server-held transaction once with atomic exact-binding
removal and dependent-session invalidation. A generic signature, login token,
wrong identity, stale binding, replay, expiry or cancellation changes no binding.
The site's old password is never requested for this operation.
