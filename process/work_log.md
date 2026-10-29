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

## 2026-10-24 — Passli PII account creation (demo 0.1.8)

- What we did: replaced Northstar's fictional signup profile/local account path with one Create account with Passli button. Registration opens a Passli popup, requests name/phone/email, then continues to existing authorized-device disclosure. Login/linking still request no PII. Account and binding commit only after complete, live-authorized PII delivery; data follows the fixed 30-minute account lifetime. Public privacy notice and integration/demo guides updated.
- Command / executable: node --test demo/test/flows.test.mjs demo/test/passli.test.mjs (public repo); node --test scripts/fedcm/pii-disclosure-http.test.mjs scripts/fedcm/direct-login.test.mjs (private provider); ignored operator pii018-release/deploy-demo.py.
- Outputs: demo 0.1.8; public integration spec 8, demo guide/README 6; private integration spec 6. Deployment retained previous 0.1.7 container and fixed image/config/data mount.
- Results: 18 demo tests plus 9 provider tests pass; same demo suite passes in deployed pinned Node runtime. Public HTTPS health reports 0.1.8. Live browser signup shows only the Passli button and sharing/lifetime explanation, no profile inputs. Tests cover device delivery, denied authorization, incomplete fields, cancellation, replay, existing linking/unlink and expiry. No provider/mobile code change or deployment was needed.
- Next steps: physical end-to-end acceptance of the existing Passli PII picker/device-sharing flow remains separate; no real user PII was used for automated testing.

## 2026-10-24 — Clear Passli PII consent labels (API580)

- What we did: traced the visible null to intentionally absent server-side plaintext values being concatenated into option labels. Removed value/record details from the initial permission rows; added explicit Choose another only for distinct contacts. Default aliases retain their IDs and count with their resolved record as one contact. Updated internal/public site guidance; no contact or consent state migration.
- Command / executable: 36 focused consent/device/disclosure/unlink tests; complete local check-id-contracts gate; exact frozen gates on five hosts; browser preview of real continuation HTML with encrypted metadata fixtures.
- Outputs: process/releases/api580_pii_consent.md; ignored consent580-release manifests, checks and receipts; public integration specification version 9, internal version 7.
- Results: focused tests pass; local gate 1,133 passed, 2 skipped; browser shows only Name/Email/Cell phone checkboxes for the reported single-contact/default-alias case. The placeholder does not establish whether a particular encrypted user contact contains a readable value; those values are reviewed on the authorized device.
- Next steps: finish sequential deployment and canonical backup barriers; restart already-rendered approval pages to load updated HTML. Physical device acceptance remains separate.

- Deployment completion: all five hosts verified API580, the exact 1,072 source hashes, unchanged config/dependencies/web bundle and zero restarts. Canary continuation rendering and every sequential canonical backup barrier passed; rollback containers retained. Cancel and reopen an existing popup to load new HTML.

## 2026-10-24 — One-click unlink handoff (demo 0.1.9)

- What we did: removed Northstar's unlink confirmation page. The settings Unlink Passli button directly starts the first-class provider unlink request for the authenticated account/current binding. Passli explains the operation and obtains phone approval. Existing cached unlink-start actions remain compatible; an old persisted confirmation screen returns to settings.
- Command / executable: node --test demo/test/flows.test.mjs demo/test/passli.test.mjs; ignored unlink019-release/deploy-demo.py and live HTTPS walkthrough request/cancellation checks.
- Outputs: demo 0.1.9 live; public integration spec 10, internal spec 8, demo guide/README 7; pinned runtime tests and live acceptance receipt retained in the ignored operator release directory.
- Results: 18 tests pass locally and in the deployed pinned runtime. The real-provider adapter test verifies an immediate provider redirect while the binding remains intact. Live walkthrough confirms one-click arrival at approval and cancellation preserves the binding; public health reports 0.1.9. Exact LoA4 user/provider signature, target binding, expiry and replay requirements are unchanged. No Passli API/mobile deployment was needed.
- Next steps: refresh the demo to load the updated settings action. Physical phone approval remains separate from synthetic verification.

## 2026-10-24 — Delete my Account (demo 0.1.10)

- What we did: added account-settings deletion. Linked accounts first complete a verified LoA4 unlink for each binding, then explicitly confirm site deletion. A one-use, same-browser/account, at-most-60-second restricted confirmation survives a Passli session ending on unlink; it grants no project access. Deletion removes the selected account/PII/bindings and session, rotates cookie/CSRF and preserves unrelated accounts and the real Passli account.
- Command / executable: node --test demo/test/flows.test.mjs demo/test/passli.test.mjs; ignored delete010-release/deploy-demo.py; live disposable walkthrough HTTP acceptance and browser settings inspection.
- Outputs: demo 0.1.10 live, 22 tests passing locally and in pinned deployed runtime; public site spec 11, internal spec 9, demo README/guide 8.
- Results: confirmation/replay/expiry/cancellation/multiple bindings/account switch and Passli-session deletion checks pass. Persistent global binding removal is verified. A later Passli login starts unbound setup. Browser confirms Delete my Account appears in settings. No provider API/mobile release was required.
- Next steps: physical phone acceptance is separate from synthetic proof/device mocks; real Passli account is never deleted by this control.

## 2026-10-24 — Full-name values and sentence-case PII captions (web712)

- What we did: sharing review explicitly labels actual approved Person.fullName as Full name, displays actual contact values, removes misleading self record/Profile metadata and rejects blank values without label/alias fallback. Family-sharing context is retained. Applied sentence-case captions to PII editors/table/accessibility labels while preserving keys and values. Public/private site guidance and field-name spec updated.
- Command / executable: isolated focused PII tests (22 passed), TypeScript, isolated full check-id-contracts gate (1,131 passed / 2 skipped), Expo export, browser component previews with synthetic full-name and mixed-case label fixtures; web712-values web.py/web-verify.py.
- Outputs: web712 on all five origins; 149 export files verified; 94 CDN checks; release process/releases/web712_pii_values.md. Demo 0.1.10 and API580 unchanged. No native/Metro release.
- Results: browser shows Full name / Birth date / Birth place and actual approved full-name/contact values. Public bundle bytes/hash verified; API containers unchanged. Isolated source excludes concurrent tag popup/manager edits and preserves their workspace changes. An initial full-tree gate hit concurrent import changes; only the isolated successful gate/export was published. Corrected Windows line-ending serialization in follow-up source commit; code semantics unchanged.
- Next steps: reload Passli and restart signup for fresh web712 UI; physical phone acceptance remains separate. Server-rendered permission pages cannot show decrypted private values; readable review is on the authorized device.


## 2026-10-24 - Demo version in upper left

- Request: display the demo version in the upper-left corner.
- Change: server renders its running version in an accessible top-left strip on main and walkthrough pages; demo package/runtime incremented to 0.1.12.
- Validation: npm test: 24 passed, zero failures; local Chrome confirmed visible v0.1.12.
- Result: source prepared and pushed separately from concurrent notes work; deployment remains pending.


## 2026-10-24 - Account notes and returning-login context (demo 0.1.11)

- What we did: added an authenticated home-page Notes section, saved per Northstar account and restored on returning login, including linked Passli login across browsers. Notes are limited to 2,000 characters, escaped as text, isolated between accounts, and bound to the active account/session. Unsaved drafts stay only in page memory.
- Command / executable: node --test demo/test/flows.test.mjs demo/test/passli.test.mjs; ignored notes011-release/deploy-demo.py; live HTTPS disposable-account persistence/isolation checks.
- Outputs: demo 0.1.11 live; 24 tests pass locally and in the pinned deployed runtime; notes011-release/live-acceptance.json confirms returning-login persistence, other-account isolation and unchanged creation expiry. Demo README/guide version 9 and privacy notice updated.
- Results: saving does not extend the fixed 30-minute lifetime from creation. Expiry/deletion removes notes; SQLite restart preserves unexpired notes. A rollback-container name collision briefly stopped deployment; restored the existing service, added a pre-stop collision check, and successfully deployed with a unique rollback name. No API/mobile deployment.
- Next steps: refresh the demo. Real phone approval acceptance is separate from mocked provider coverage and live ordinary-login HTTP verification.


## 2026-10-24 - Cancel returns to RP settings instead of raw expiry error (demo0.1.13)

- What we did: moved error/cancel callback navigation ahead of approval-proof validation. A matching current callback cancels only that transaction and returns to settings with linkage unchanged. Stale/expired/replayed/different-browser error callbacks still redirect safely, but cannot consume a newer request, redeem a code, unlink or restore authority. Authentication deadlines and fixed account lifetime are unchanged. Demo README/guide version10 document the return behavior.
- Command / executable: node --test demo/test/flows.test.mjs demo/test/passli.test.mjs; frozen cancel013-release/deploy-demo.py; live HTTPS disposable-account stale-return check.
- Outputs: apps/web/.web-deploy/cancel013-release/{source,demo013-runtime-test.log,demo013-release.json,live-acceptance.json}. Demo0.1.13 live; rollback passli-integration-demo-before-cancel-0-1-13 retained.
- Results: all25 tests pass locally and in pinned runtime. Coverage includes ordinary and expired cancellation, stale callback against a newer transaction, browser isolation, unchanged binding/account expiry and no code redemption. Live stale callback returns303 to / and settings, preserving the disposable account and expiry. Initial new test used an obsolete action name; corrected to settings-link. Concurrent version-badge changes excluded from frozen deployment and this commit. No Passli API/mobile change.
- Next steps: retry Unlink then Cancel; the RP returns to settings. If the account itself has reached its30-minute lifetime, return to sign-in rather than restoring an expired session.


## 2026-10-24 - Friendly expired callback (demo0.1.14)
- What we did: expired/replayed/foreign real callbacks redirect to the site with readable timeout/unavailable messages. No code exchange or newer proof consumption; post-exchange deadline errors also show the exact timeout text. Preserved pending version-badge UI work outside the frozen release.
- Command / executable: 26 demo flow/provider tests locally and in the pinned runtime; timeout014-release/deploy-demo.py; live HTTPS isolated-visitor callback and state check.
- Outputs: demo0.1.14 live; ignored timeout014-release/demo014-runtime-test.log, demo014-release.json and live-acceptance.json in the private Passli workspace; public integration/demo docs updated.
- Results: public callback returns home with Your request timed out. Please try again.; no account authorized. Account/link/expiry and newer request isolation covered by synthetic tests. Original deadlines unchanged.
- Next steps: start a fresh Passli request. Shared provider popup timeout UX is the separate API590 publication; no mobile build required.

## 2026-10-24 - Disabled devices and demo suspension candidate
- User confirmed the demo session used Passli. Added visible authenticated-session polling and protected-action provider revalidation, failing closed for missing association; original incident account had already expired at read-only browser inspection.
- Added explicit enabled-phone Disabled devices list and selective recovery. Existing latched assurance and higher Devices policy remain enforced; exact selection/current disable evidence binds approval. Browser Resume no longer sends a push, and ordinary verification cannot clear a latch. Generic device listings reflect tripwire disablement.
- Added large red mobile Home button and dedicated selection screen, account/lifecycle response fences and refreshed-list confirmation. Browser notice directs to mobile. Added focused backend/UI regression tests and Markdown deployment acceptance suite.
- Production mutation hold requested by the concurrently authorized login/logout incident owner. No release versions allocated and no deployment performed; local validation continues. Physical phone acceptance remains pending.

## 2026-10-24 - Disabled-device candidate validation complete; deployment held
- Frozen API590/web724 plus scoped disabled-device changes: full gate 1186 tests,1184 pass,2 optional skips,0 failures. Final exact-source focused checks82/82 and typecheck passed. Public demo28/28 includes idle-client polling and missing-association failclosed regression.
- Production mutation hold remains active during a separately coordinated login/logout incident. No versions allocated, release published, customer recovery performed or physical phone acceptance claimed. Candidate source/manifest/receipts: apps/web/.web-deploy/disabled-devices-candidate/frozen-source.
- An initial staging copy followed a dependency junction; the copy process was stopped and the correct candidate was rebuilt strictly from the verified1092-file manifest. Cleanup of the unused partial source directory was rejected by automatic approval review as blocked by policy, including after explicit user authorization; it remains untouched.


## 2026-10-24 - Disabled-device recovery published (API592 / web726 / Metro726 / demo0.1.15)
- What we did: demo polls visible Passli sessions and fails closed on provider checks before protected actions, including missing association. Mobile Home has a large red Disabled devices button and dedicated selective recovery screen. Only explicit enabled-phone recovery can clear a latched suspension; exact selection/current evidence binds assurance. Browser Resume and operation-approval starts cannot generate recovery pushes. Original account/session deadlines and failure history remain intact.
- Commands / evidence: frozen full gates locally and all five runtimes1188 tests/1186 passed/2 optional skips/0 failures; pending-push92; TypeScript plus web/iOS exports and active native import graph; demo28 locally/pinned image. Dedicated live signed synthetic QR browser/phone test completed three cancels, protected423, no browser recovery approval, list, real QA secure-key LoA4 recovery, refreshed-list confirmation and restored browser access; QA account relocked.
- Results: API592 all5 source1092/config/image/deps/restarts0/barriers; web726 all5 exact104 artifacts and public bundleSHA944f96d00a47bf93ba2abb4693b468efda66ae537fbd354cf8ca1dafeb84ffad; actual Metro717 baseline preserved through narrow6-file Code726 patch, public iOS launchSHA b5ca7a9bc1d4732fd3e7466177f1a77c7589b2035c9fc1fdc28410b317a28e51. Demo0.1.15 source18/public JS/CSS/image/env/data mounts verified. RP1/RP2 remain584; native binary and extension unchanged. API591 Site permissions changes preserved; next independent593/web727 release is rebased on592.
- Notes: API/static publication waited for the independently diagnosed Chrome/Cloudflare HTTP3 incident to clear; this release changed no transport config. Metro took about50s to start; initial502 was diagnosed from actual local packager status and read-only verification resumed, without republishing. Whole-directory old native source has unused legacy web/role type errors; the active native import graph and exact iOS export passed, and legacy files were preserved. The initial partial staging copy followed a dependency junction; its process was stopped, correct sources rebuilt by explicit manifest, and cleanup remains blocked by automatic approval review even after user consent. No customer account reset or forced API shutdown occurred.
- Outputs / next: docs/reports/api592_web726_disabled_devices.md and Markdown acceptance suite; ignored disabled592-app726 immutable sources/manifests/gates/canaries/barriers/publication receipts. Reload phone to Code726 and complete physical Disabled devices/Face ID acceptance; synthetic signatures are not physical acceptance.

## 2026-10-24 - Inline PII registration source0.1.16
- Removed registration/sharing popup launches; same-tab callback opens the dedicated Passli selector page and the fixed return endpoint restores registration on Cancel or site Home after actual receipt. Requested-fields releases require exact provider-approved outputs; legacy releases remain supported. Updated public spec16 and added inline_pii_deployment_test_suite.md.
- Validation: npm test,29 passed. Coordinated root API/RP595 and web731 required gate1205 tests/1203 pass/2 optional skips/0 fail; TypeScript and web/iOS JS exports passed.
- Result: source only; no public Git push or production deployment performed. Preserve existing version-badge/style drafts. Next: coordinated provider/RP/demo/web publication and the deployment acceptance suite.


## 2026-10-24 - Remembered PII consent guidance
Updated integration spec and acceptance suite: first/unset consent uses selectors; usable account/RP consent automatically delivers current allowed values across browsers. Saved Deny stays denied. Companion provider596/web733 local gate:1,205 pass,2 optional skips,0 fail. Not deployed; demo implementation unchanged this turn.


## 2026-10-25 - Demo016 deployed with coordinator approval
Final source commit9644bf0e85e811d80e609f0d1ba72f0c03d57f04;30exact-image tests passed including release metadata consistency. Public health016 and app/style bytes verified; existing SQLite data/env preserved. Earlier metadata/probe failures rolled back safely to015; corrected Docker-network+public probes accepted final016. API596/web733/RP596 live; Metro/native/extension unchanged. Browser/physical-phone approval acceptance remains unperformed. Full receipt: passli/apps/web/.web-deploy/pii596-web733/deployment-receipt.json.


## 2026-10-25 - Demo017 visible version on every page
- What we did: Published reviewed badge draft on shared real/walkthrough shell and privacy/terms, deriving all HTML version strings from runtime version017. Scoped immutable public-repo commit4a45a21f9f0355a9a3a2e401afa03b401b2d21b6, manifest098e7aea9f264c315932d32d66b576471b68fb433c527cd924f4db5355f319e3. Coordinator separately approved staging and activation.
- Command / executable: node --test test/*.test.mjs locally/exact production image; protected preflight/stage/activate and final HTTP/source checks under apps/web/.web-deploy/demo017-version.
- Outputs: deployment-receipt.json; docs/reports/demo017_version_badge.md; public/runtime/rollback evidence.
- Results:32pass0fail0skip locally and runtime; six public real/walkthrough routes show exactly one v0.1.17, no unresolved placeholder; direct/public health017 and exact CSS/JS. Image/env/SQLite mounts/network/security preserved; runtime restarts0. Generic backup name collision prevented mutation; retained old archive and used commit-specific016 rollback name. API596/web733/RP596 unchanged, Metro/native/extension not published.
- Next steps: Refresh demo. No screenshots/authenticated browser interactions performed; HTTP rendering/assets/runtime verified. Coordinator completion report/slot release.

### 2026-10-25 - Multiple Passli-linked accounts and demo019
- What we did: Link Passli remains available when linked; same-pair linking is idempotent; multiple site accounts per verified identity use explicit account choice while one link remains direct. Added composite SQLite migration, bounded browser-bound choice authorization, live provider/membership rechecks and replay/concurrency guards. Updated developer spec/demo plan/README and docs/multiple_accounts_test_suite.md.
- Command / executable: `node --test demo/test/*.test.mjs`; exact-image staged gate and coordinator-approved demo-only activation through passli/apps/web/.web-deploy/demo019-multi-account/ scripts.
- Outputs: Local immutable commit79ee316bff92a31f651de6759732919de975f741 on codex/demo019-multiple-accounts; live demo019. Detailed release report in passli/docs/reports/demo019_multiple_accounts.md.
- Results: All40 local/exact-image tests passed; root-only consistent SQLite backups verified; direct/public health, six badges, exact app.js and fresh synthetic public walkthrough passed, including notes isolation, picker protection and exact unlink. Own fixture accounts deleted. Existing worktree changes preserved; no GitHub push or physical phone acceptance claimed. One early Windows test cleanup hook ran before database closure; corrected cleanup order and reran full gate successfully.
- Next steps: Real Passli physical-phone acceptance; coordinate public GitHub publication separately. Retained018 cannot safely serve multiple links/pending choices, so preserve current DB and use a compatible forward fix if needed.


## 2026-10-25 - Shared source preservation checkpoint

- What we did: Preserved saved integration/demo source, tests and documentation under acknowledged coordinator writer freeze, including local demo020 checkout and earlier account/version work.
- Command / executable: git status/diff; staged source, artifact and secret-pattern review; normal non-force commit/publication.
- Results: Source preservation only. No deployment, native build or real account mutation; production demo019 remains unchanged.
- Next steps: Release writer freeze after commit receipts; finish immutable integration validation and obtain coordinator approval before deployment.


## 2026-10-25 - Card checkout local demo021

- What we did: Cart with $50 add/remove, Passli popup authorization of exact cap plus saved-card/address reference, direct signed-commitment address delivery, separate Purchase, resume and receipt/cumulative totals. Card capture remains simulated; real mode requires matching private API605/app748.
- Command / executable: `cd demo; node --test test/*.test.mjs` (45 passed). Private focused125 checks and typecheck passed. Actual Chrome localhost walkthrough verified $100 at simulated LoA2, approved-order resume, then next $50 at simulated LoA4.
- Outputs: `demo/checkout.mjs`, `demo/test/checkout.test.mjs`, updated server/adapter/UI and README/demo plan. Private acceptance report `passli/docs/reports/demo021_card_checkout_local.md` records broad web suite26 failures with attribution unknown.
- Results: Independently verified exact order and both signatures; address must match the signed versioned hash; wrong values, cancellation during async approval, account/expiry changes, replay and duplicate Purchase deny access. No PAN/CVV; plaintext address goes device-to-Demo, not signing API. All data follows the existing account expiry.
- Next steps: Real saved-record, popup/phone browser acceptance and explicit coordinator release approval. Local only; deployed demo019 unchanged by this task. Checkout020 in preservation checkpoint is superseded by021 privacy correction and must not be deployed.

## 2026-10-25 Same-tab Passli checkout correction
- What we did: reproduced blank popup/password-session rejection in live Chrome; replaced checkout popup with same-tab Passli review, order-scoped Direct continuation without linking, saved recipient-name consent/hash and prominent total.
- Command / executable: frozen web+RP381, provider85 including actual protected owned-to-Demo adapter, Demo55, npm run typecheck; zero failures/skips.
- Outputs: private process/checkout_same_tab_* logs; docs/reports/checkout_same_tab.md; process/releases/checkout_same_tab manifests/receipt; private d225cc67 / Labs1e12931 source refs.
- Results: source hashes stable post-gates, no PAN/CVV/raw name/address in signing; stale callbacks, tampering, revocation and replay reject. Updated UI tested synthetically, real browser/phone acceptance not claimed.
- Next steps: coordinator holds release slots/activation during human OPAQUE repair. No version/lock/push/build/deploy writes; preserve concurrent work and integrate scoped source only after release coordination.

## 2026-10-25 Linked-cart checkout steering
- What we did: unlinked carts show Link your Passli account for faster checkout; existing explicit link flow returns to same cart on success/cancel/expiry. Server requires link before checkout and rejects another unlinked approval identity.
- Command / executable: frozen checkout-linked web/RP, provider/auth/remote/spending, Demo tests and TypeScript.
- Outputs: private process/checkout_linked_* logs and process/releases/checkout_linked receipts; docs/reports/checkout_same_tab.md v2/specv4. Source private bcf1c4da / Labs c254b3a7 supersedes earlier unlinked-checkout allowance.
- Next steps: preserve OPAQUE deployment hold and concurrent changes; assign release versions/approval centrally. No package/version/lock writes, push/build/deploy/charge.

## 2026-10-25 Single Passli settings action
- What we did: per direct human correction, settings now shows Link Passli only while unlinked, replacing it with Unlink Passli after linking. Updated existing UI assertion and stale docs.
- Command / executable: node --test --test-reporter=tap test/*.test.mjs (Demo).
- Outputs: process-settings-passli-button.tap; scoped source/handoff refs provided to coordinator.
- Results: all61 tests pass, zero failures/skips; one action asserted in each linkage state.
- Next steps: include in pending linked-cart/same-tab release; OPAQUE deployment hold remains. No package/version/lock metadata or push/build/deploy writes.

## 2026-10-25 Compact cart quantity controls
- What we did: replaced add/remove text actions with left-aligned 44px +/minus buttons below Quantity, including accessible labels and 0/100 limits.
- Command / executable: Demo node --test test/*.test.mjs; frozen scoped source handed to coordinator.
- Results / next steps: preserve pending checkout/settings scope and deployment hold; no package/version/lock or activation changes.


### 2026-10-25 - Shared source checkpoint and GitHub reconciliation
- Preserved raw files/index and saved-work Git history before replacing stale drafts with the reviewed release union. Intentional nonsecret reports, test logs and manifests are checked in.
- Current source includes API609/app753 and full Demo023 candidates; deployed Demo022 hotfix has its own receipt. Source checkpoint does not grant production approval. Shared runtime files match the exact reviewed candidate; isolated deployment artifacts are unchanged.

### 2026-10-26 - Demo023 checkout publication verified
- What: Published frozen400bae checkout source after API609/app753.61 local and61 host-image tests passed; public health23 and JS/style hashes matched.
- Outputs: docs/releases/demo023_checkout.md. Fictional browser cart quantity0 to1 to0 and totals$0 to$50 to$0 verified, unlinked CTA and disabled minus atzero. No customer disclosure/purchase submitted.
- Next: User acceptance on refreshed pages and mobileCode753; physical-device reset remains unverified.

### 2026-10-26 - Demo024 explicit phone-app login preparation
- What: Confirmed extension-only discovery hides real Passli login for phone-app users. Added a trusted real-mode server option allowing explicit Passli start without inventing installation detection; walkthrough simulation keeps its install gate. UI prominence choice remains pending user answer because the existing spec requires installed-only automatic presentation.
- Command: node --test demo/test/flows.test.mjs (42pass). Initial testexpected400corrected to existing409conflict contract; no productbehaviorchangefromthatassertion.
- Outputs: version024server/model source and two regressions: undiscovered explicitstartstillrequiresprovidercallback, no account/session early; requestcannotoverridewalkthroughgate. LiveDemo023baselineall24runtimefiles/currentcontainer/image/restarts verified read-only.
- Next: User chooses secondaryphoneoption vsalwaysshow; implementchosenUI/spec, completefulltests/browserQA/freeze andexactcoordinatorapproval beforedeploy. API/native/PIN/unlink-audit behaviorunchanged.

### 2026-10-26 - Demo024 always-visible Continue with Passli
- What: User chose Always show Continue withPassli. Removedextension-onlyvisibility/discoveryposts; realmodealwaysshowsproviderbutton, walkthroughonlyinstallationcontrolsarehiddeninrealmode. Revisedpublicspec20/compatibility5/readiness4/demoREADME20 toreplaceinstalled-onlypolicy.
- Command: node --test demo/test/*.test.mjs (64pass); actualChrome localreal-modeUI withisolatedsyntheticprovider.
- Results: initialpagebuttonvisiblealongsidepasswordlogin; explicitclicknavigatesexistingtabtoboundedlocalproviderhandoff; noaccountlogin/approvalsubmitted. Normalcallbackauthentication remainsrequired, installedflagstaysfalsewithoutdetection.
- Next: freeze024, exacthost-imageQA+coordinatorapprovedactivation, publichash/actualUIverification. NoAPI/native/PIN/unlink-audit changes.

## 2026-10-26 Demo024 always-visible Passli release
- What we did: implemented the explicit Always show Continue with Passli choice, revised installed-only specs, froze minimal runtime overlay and deployed with separate coordinator stage/activate approvals.
- Command / executable: node --test demo/test/*.test.mjs; frozen overlay tests; approved deploy024.py --stage and --activate.
- Outputs: docs/reports/demo024_phone_signin.md and sanitized evidence (private); docs/releases/demo024_phone_signin.md (Labs).
- Results: 64 tests passed locally/frozen/host-image; public0.1.24 assets matched; Chrome visible button and same-tab mobile-app option verified; no customer login or disclosure. Image/env/data retained.
- Next steps: physical phone completion acceptance; separate historical unlink LoA site attribution remains pending exact row evidence.

## 2026-10-26 - Checkout v3 email and phone consent

- What we did: Demo025 requests name, email, phone, card and shipping address; checks the exact v3 disclosure commitment; displays approved contacts at Purchase. Pending v1/v2 orders remain compatible.
- Command / executable: node --test test/*.test.mjs in demo; git diff --check.
- Outputs: demo/checkout.mjs, demo/public/app.js, tests and demo/README.md. Branch codex/checkout-contact-fields; starting commit 76fde4b1b1512e82192651ed39877e0d74740df2 in C:/Users/stk/.codex/worktrees/checkout-contact-fields/passli_labs.
- Results: all 65 tests passed. Companion Passli API611/app758 implementation on codex/checkout-fields. No deployment, push, main integration or physical-device acceptance.
- Next steps: coordinate with Passli API/web release approval before Demo025 activation; validate real browser/phone checkout.

## 2026-10-28 - Demo selector and signed call/wire demonstrations (0.1.26)

- What we did: four-card root selector; Northstar at /northstar/; Netflix-inspired Direct login; Schwab Steve Kirsch fixture with agent spoken-code ceremony; Wells Fargo-inspired fictional OpenAI wire with server-derived LoA 3/4/5 thresholds. Added independent identity-signature/provider-attestation verification and isolated suite cookies/CSRF/expiry.
- Commands: `node --test demo/test/*.test.mjs`; local in-memory browser preview on port 18886.
- Outputs/results: 68 tests passed, including cent boundaries, invalid amounts, CSRF, callback, cross-demo/replayed results and signature tampering. Browser inspected selector, TV, Schwab, wire and return-home links; corrected inherited Northstar CSS sizing.
- Next steps: Coordinator releases demo026 with API651/Code815. Code entry is on the Passli web approval page before the phone ceremony; native push code entry and bank agent lookup are not implemented. New walkthrough minisites are visual previews. No deployment/phone acceptance claimed. Retain worktree through acceptance.

## 2026-10-28 - Fix Connect invalid Direct state (demo027)

- What we did: removed suite. prefix from the Direct adapter state. Route suite callbacks by exact saved browser-cookie/pending-state match and let unrelated Northstar callbacks pass through. Preserve nonce/PKCE and consume callbacks once. Version demo027; no API/web/iOS changes.
- Commands: `node --test demo/test/*.test.mjs`; generated three HTTP Connect requests using real createPassli.begin; WSL `node process/demo-direct-contract.mjs` checked actual Passli directRequest parser; anonymous GETs to live /direct/login for old/fixed synthetic TV requests.
- Outputs/results: 71 tests passed. Provider parser accepts fixed TV/Schwab/wire requests and rejects original prefixed states. Live old request HTTP400/no redirect; fixed HTTP302 to https://passli.app. Added three real-adapter HTTP regressions including PKCE, missing-cookie denial, one-use callback; replaced original mocked login-state test which missed this contract.
- Next steps: Coordinator demo-only rollout on human request; no deployment performed here. Live authenticated browser/phone completion remains unverified. Synthetic request/evidence files are ignored in this owning worktree.

## 2026-10-28 - Phone-approved TV QR login and remembered-TV scans (demo028)

- What we did: isolated TV login from any desktop Passli session; button creates a three-minute QR for the system phone camera, explicit LoA4 first approval, optional unchecked 30-day remember consent, fresh identity proof on repeat scans with higher policy preserved, stable public TV address plus private HttpOnly credential, forget/revocation generation and eight-hour demo sessions. Atomic callback completion, post-await fences and cookie/PKCE isolation; TV SSE completion with graceful shutdown, no phone polling. No native TV application or native Passli QR-parser change.
- Commands: `cd demo && npm ci`; `npm run build:qr`; `node --test demo/test/*.test.mjs`; local origin-matched browser preview on port18886.
- Outputs/results: 84 tests passed. New tests cover cross-TV/cookie/CSRF denial, LoA enforcement, expired/replayed/replaced requests, identity switch, opt-in trust expiry, revocation race, SQLite restart, SSE completion/shutdown and independent QR decoding. Browser verified TV button creates QR instead of redirecting, phone confirmation shows matching address and unchecked consent. Local preview initially used default18766 origin while serving18886; corrected preview configuration before browser acceptance.
- Release inputs: committed QR core encoder20388 bytes plus qrcode/dijkstrajs license notices; pinned dev-only build/test packages and lockfile. Production remains dependency-free. Include new tv/qr/vendor source and public TV/phone assets in source archive.
- Next steps: Coordinator demo-only rollout on human request; API651/Code815 suffice, no API/web/iOS rebuild. Physical-phone app handoff and live edge SSE acceptance remain unverified. Retain worktree, small dev dependencies and ignored screenshot/test evidence through human acceptance.
