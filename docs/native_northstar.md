## Three-key update (2026-11-11)

Northstar now registers user, cloud and independent keys. Normal login requires
user + cloud; linking/unlinking and key replacement require all three. The
independent signer is a software prototype. Demo two-key links are retired at
cutover; local accounts, notes and password access remain.

# Native Northstar account integration

Version: 2
Date: 2026-11-11

Northstar's real account page uses `passli:identity-operations:v1`: a stable
128-bit site subject and two pinned keys, one user key and one cloud key. One
Passli identity links to one Northstar account. The walkthrough remains simulated;
TV, Schwab and Bank Wire retain their separate existing integrations.

The native page supports fictional password login, linking an existing account,
first-use Passli account creation, returning login, saved notes and unlinking.
Passli-created demo accounts receive a displayed fictional email login, usable
with the public password `demo` after unlinking. This is the existing fictional
Northstar password mechanism, not a Passli recovery bypass. Unsaved note edits
survive state refreshes, and Save captures the draft before rendering busy state.
It does not send users through the old Direct login/unlink continuation. The old
Northstar account API and callback return 410 after native activation, so they
cannot bypass the two-key verifier. There is no import of old demo associations.
The older checkout/profile-sharing and deletion UI remain in the walkthrough;
they are not implemented on the new native account page and must not be advertised
as native signed operations.

Linking obtains the local account ID from an authenticated Northstar session.
The phone reviews the link operation and account ID, and signs the exact
transaction. Completion validates the two signatures and provider enrollment
certificate, browser context, current policy, nonce, expiry and stored keyset.
The local session is rechecked inside SQLite's transaction. A failed local check
rolls back both the cryptographic receipt and account writes. Unlink requires
approval level 4, both pinned signatures, and the exact account/binding. It clears
the keyset and invalidates Passli sessions while retaining notes and password
access. Old receipts cannot restore an unlinked binding. Site expiry still removes
demo accounts and links 30 minutes after creation; activity does not extend it.

## Deployment inputs

Real-mode startup requires:

- `DEMO_ORIGIN=https://demo.passli.app` and the existing persistent `DEMO_DATABASE`.
- `PASSLI_NATIVE_IDENTITY_CONFIG`: absolute path to the shared public native
  configuration, including `https://demo.passli.app` in `sites`. Deploy that same
  site policy to the API hosts for policy tickets and completion confirmation.
- `PASSLI_NATIVE_RP_COOKIE_KEY`: absolute path to a separately generated persistent
  32-byte base64url cookie key, readable only by the service operator.
- Node 24.16+ and `npm ci --omit=dev` inside `demo` (the QR library is now a runtime
  dependency).

Reuse the existing provider enrollment root and ticket key. Never regenerate them
to enable Northstar. Publish compatible API/mobile/browser origin support before
exposing the native page. The dedicated native tables share the demo SQLite file;
other demonstrations and old account tables are not deleted.

## Verification and source synchronization

Run `cd demo && npm test`. Native HTTP tests perform link, login and unlink with
Ed25519, ML-DSA-44, ML-DSA-65 and ML-DSA-87; test state across restart/new browser,
wrong signatures, canceled requests, replay and one-account binding. These use
generated test keys, not physical phone authentication.

`node demo/scripts/sync-native-runtime.mjs <reviewed-passli-worktree>` copies only
the RP verifier/runtime module dependency graph. The committed SHA-256 manifest
and test prevent accidental copy drift. This is source vendoring, not a dependency
on a developer's private repository at runtime. No production private keys belong
in these files. Live browser/phone acceptance follows deployment.
