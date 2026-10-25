# Work log

## 2026-10-24 — Complete live site integration reference

- What we did: implemented Northstar's server-side first-use choice, explicit
  existing-account linking, settings Link/Unlink Passli, new-account creation,
  returning login, logout and suspended/terminated session handling. Connected
  the hosted site's main mode to real Passli Direct authentication. Added a
  separate guided walkthrough with isolated cookie, backend and SQLite database.
- Command / executable: `cd demo && npm test`; exact Node 24.16 runtime gates;
  public HTTPS and actual provider/demo HTTP journeys with a dedicated synthetic
  Passli account; browser walkthrough and installation-hidden-state checks.
- Outputs: https://demo.passli.app, https://demo.passli.app/walkthrough/,
  `demo/` source version 0.1.3, integration guide version 4, updated root README.
- Results: 11 focused tests pass locally and in the exact deployed runtime.
  Live real-provider acceptance passes restricted setup, named account linking,
  fresh linking proof, cross-browser returning login, unlink preservation and
  session invalidation, no automatic relink, explicit separate registration and
  protected API denial after provider lock. Synthetic fixture locked afterward.
  Public checks confirm separate real/walkthrough cookies, CSRF and account
  state; simulated approval is rejected by real mode. Browser UI checks confirm
  account choices, confirmation, linked settings and unlink cancellation.
- Validation limits: actual physical browser/phone acceptance is separate.
  Northstar's local account passwords and projects are fictional. The demo
  uses the Direct provider-token compatibility profile, not protected threshold
  authentication. General app/PWA discovery and final unlink policy remain open.
- Next steps: use the real demo and guided walkthrough alongside the integration
  guide; replace the fictional local login fixture when adapting a real site.

## 2026-10-24 — Site-styled sign-in page mockup

- What we did: replaced the isolated button sample with a complete compact
  sign-in page inspired by the supplied reference. Passli shares the same
  provider-button CSS as passkey, Google and Apple; only the logo and text differ.
  Updated asset guidance to document host-drawn buttons and context-sensitive
  Continue with Passli wording. Asset guidance incremented to version 2.
- Command / executable: local HTTP preview, browser screenshot/AX inspection,
  local link checks and `git diff --check`.
- Outputs: `examples/login-button.html`, `assets/README.md`, root README.
- Results: preview renders the full login layout with compact 40-pixel provider
  rows, 20-pixel icons and 44-pixel targets on touch pointers. Passli remains
  hidden by default; `?preview=1` shows it solely for design review. Input fields
  are read-only and controls perform no sign-in or network submission.
- Next steps: review the page appearance; connect only supported discovery and
  verified authentication interfaces when implementing a real site.

## 2026-10-24 — Initial public integration kit

- What we did: prepared a self-contained public site integration specification,
  compatibility protocol reference, readiness notes, existing Passli icons and a
  static accessible login-button example. Public specification version 3 adapts
  the current site-facing version 2, replacing private source dependencies with
  public references and omitting local prototype test history.
- Command / executable: selective asset copies; documentation editing; local
  link, SVG/PNG and publication-content checks; `git diff --check`; `gh repo create`.
- Outputs: documentation under `docs/`, icons under `assets/icons/`, presentation
  example under `examples/`, root README and license.
- Results: existing compatibility behavior and unfinished production features
  are distinguished. All 29 local links resolve; 2 SVGs parse and all 6 PNGs
  have the documented dimensions. Publication pattern review and staged
  `git diff --check` passed. Browser preview confirmed light/dark/loading
  appearance and no accessible buttons in the default hidden state. No provider
  deployment or live login acceptance is claimed.
- Next steps: finalize public discovery adapter, site registration/configuration
  and remaining account lifecycle decisions before a production integration.

## 2026-10-24 — Public publication verified

- What we did: created `skirsch/passli_labs` as PUBLIC and pushed the initial kit.
- Command / executable: `gh repo create --public --source . --remote origin --push`;
  unauthenticated GitHub API and raw-content requests; SHA-256 comparisons.
- Outputs: https://github.com/skirsch/passli_labs, default branch `main`.
- Results: anonymous API confirms public visibility. Published README, site
  specification, compatibility reference and representative SVG/PNG files match
  the local files byte-for-byte. Original application checkout was not changed.
- Next steps: use this public kit as the site integration handoff; complete the
  dependencies listed in `docs/integration_status.md` before live onboarding.


## 2026-10-24 � Demo 0.1.4: fixed account lifetime and arbitrary-email linking

- What we did: replaced the fixed-account selector with an editable email field
  and public password `demo`; kept real Passli proof and explicit named linking.
  Added a fixed 30-minute account deadline, immediate access denial, idle SQLite
  cleanup of accounts/bindings within 15 seconds, and UI/privacy/documentation
  disclosures. Activity and repeat login do not extend account lifetime.
- Command / executable: `node --test demo/test/flows.test.mjs demo/test/passli.test.mjs`;
  same suite in the pinned production Node 24.16 image; standalone demo container
  replacement; public health/static checks; browser walkthrough; dedicated
  synthetic real Passli acceptance script (`real-demo014-qa.mjs`, operator-only).
- Outputs: public demo version 0.1.4, source under `demo/`, updated README and
  demo guide version 3. Operator QA receipt stays outside this public repository.
- Results: all 14 tests passed locally and in production runtime, including idle
  deletion of stored account data/global bindings and fresh setup for a returning
  verified identity after expiry. Live real-mode acceptance passed arbitrary-email
  named linking, fresh proof, cross-browser return, unlink, registration and lock
  denial. Browser walkthrough linked `someone@example.org` with `demo` and showed
  the expiry notice. Both public health endpoints report 0.1.4. Initial Windows
  cleanup-hook ordering failed; moving temporary-directory removal after server
  closure corrected it. The 30-minute boundary used an injected test clock;
  no physical-phone acceptance or 30-minute wall-clock wait is claimed.
- Next steps: none for this change; real Passli account/provider history remains
  outside Northstar's temporary-account cleanup.


## 2026-10-24 — Mandatory LoA 4 signed unlink (demo 0.1.6)

- What we did: made fresh operation-bound Passli unlink approval at LoA 4 or higher
  normative in the site spec and compatibility guide. Removed old-credential
  unlink forms and the password-only server action. Added a standalone verifier
  for the site-identity Ed25519 signature plus provider assurance attestation,
  exact account/binding/subject/origin/nonce/expiry checks and one-use removal.
  The walkthrough labels its separate unlink approval as simulated LoA 4.
- Command / executable: `node --test demo/test/flows.test.mjs demo/test/passli.test.mjs`;
  same 16 tests in the pinned production Node image; public browser walkthrough;
  dedicated native-signature synthetic HTTPS acceptance against Passli API578;
  public health/source verification and `git diff --check`.
- Outputs: demo 0.1.6, `demo/unlink.mjs`, site spec version 5, compatibility guide
  version 3 and updated README/demo docs. Passli API578 is deployed on all five
  hosts; provider implementation and operator receipts live in the private repo.
- Results: all 16 demo tests passed. Live canary and final acceptance verified the
  secure phone challenge binds the unlink target, provider completion fails before
  secure proof, the site verifies the signature before unlink, the local account
  survives, dependent sessions end and later login never restores the old link.
  Lower LoA, wrong identities/targets, replay, cancellation and expiry fail closed
  in regression tests. All five provider gates and final canonical backup barrier
  passed. Physical phone/browser acceptance remains separate from synthetic proof.
- Next steps: none for this requested change. Automatic 30-minute demo account
  expiry remains account-data cleanup, distinct from manual unlink authorization.


## 2026-10-24 — One-click settings linking and private identity boundary

- What we did: made settings Link Passli immediately start the fresh bound Passli
  ceremony, without a second site confirmation. First-use account authentication
  and named linking stay explicit. Documented that site DOM labels disclose the
  identity, whereas a future Passli-origin iframe or trusted popup can keep its
  account hint private; no private identity widget is implemented here.
- Command / executable: 16 HTTP/cryptographic demo tests locally and in the pinned
  production image; live real-mode settings-action/redirect/cancel check; browser
  walkthrough from settings through approval to Linked; `git diff --check`.
- Outputs: demo 0.1.7, public site specification version 6, demo guide version 5.
- Results: all tests passed; one settings click starts provider proof, no binding
  exists before verified proof, cancel leaves it unlinked, and the browser
  walkthrough links without a second site confirmation. Privacy design checked
  against the HTML origin rules and Chrome content-script documentation.
- Next steps: private identity rendering needs a separately designed Passli widget
  or trusted account chooser. Required provider approval and LoA4 unlink remain.


## 2026-10-24 — Explicit unlink approval presentation

- What we did: require unlink-specific headings, waiting text and notification
  titles in the site contract; document retained site account/data. The provider
  now renders Approve unlink and an explanation of removing Passli as a sign-in
  method. Settings one-click linking remains live in demo 0.1.7.
- Command / executable: 22 focused provider/rendering/outbox tests, full deployment
  gates on five hosts, local browser rendering, and public synthetic HTTPS proof
  acceptance including a check of the actual provider continuation HTML.
- Outputs: public site specification version 7, compatibility reference version 4;
  Passli provider API579 implementation is in the private application repository.
- Results: a fresh API578 unlink already had operation-specific wording, while
  the reported screenshot was login-labeled; its exact pending request was not
  available for attribution. API579 makes the heading/consequence more explicit
  and fixes the remaining generic push title. Tests verify unlink wording through
  LoA4, LoA5 and LoA6 waiting/polling, with unchanged LoA4 signature enforcement.
- Next steps: start a fresh unlink request after deployment; previously rendered
  prompts do not rewrite their existing HTML automatically. Physical acceptance
  remains separate from synthetic proof and browser rendering checks.

## 2026-10-24 � Passli PII account creation (demo 0.1.8)

- What we did: replaced Northstar's fictional signup profile/local account path with one Create account with Passli button. Registration opens a Passli popup, requests name/phone/email, then continues to existing authorized-device disclosure. Login/linking still request no PII. Account and binding commit only after complete, live-authorized PII delivery; data follows the fixed 30-minute account lifetime. Public privacy notice and integration/demo guides updated.
- Command / executable: node --test demo/test/flows.test.mjs demo/test/passli.test.mjs (public repo); node --test scripts/fedcm/pii-disclosure-http.test.mjs scripts/fedcm/direct-login.test.mjs (private provider); ignored operator pii018-release/deploy-demo.py.
- Outputs: demo 0.1.8; public integration spec 8, demo guide/README 6; private integration spec 6. Deployment retained previous 0.1.7 container and fixed image/config/data mount.
- Results: 18 demo tests plus 9 provider tests pass; same demo suite passes in deployed pinned Node runtime. Public HTTPS health reports 0.1.8. Live browser signup shows only the Passli button and sharing/lifetime explanation, no profile inputs. Tests cover device delivery, denied authorization, incomplete fields, cancellation, replay, existing linking/unlink and expiry. No provider/mobile code change or deployment was needed.
- Next steps: physical end-to-end acceptance of the existing Passli PII picker/device-sharing flow remains separate; no real user PII was used for automated testing.
