# Passli links to multiple site accounts

Version: 1
Date: 2026-10-25

One verified site-specific Passli identity can have independent bindings to
multiple local site accounts. Keep Link Passli available in authenticated account
settings even when already linked. A fresh successful proof adds the current
account binding or leaves the same pair unchanged. Never move or merge accounts.

After verified Passli login, zero links leads to restricted first-use setup,
one link opens that account, and multiple links show Choose your account. Show
only names/emails of the accounts linked to that identity. Account selection is
server-owned, browser-bound, single-use and subject to the original login expiry.
Recheck account existence, expiry, exact binding and current provider status.
Before selection, expose no account notes/projects or authenticated site session.

Run `cd demo` then `npm test` (Node.js 24.16 or later).

| Requirement | Automated coverage |
| --- | --- |
| Link remains visible when linked; unlink remains independently available | `test/account-choice-ui.test.mjs` |
| Re-link the same pair; link the same identity to another authenticated account | `test/flows.test.mjs`, walkthrough and real-mode provider fixtures |
| Zero/one/multiple links; explicit choice of either account; independent notes | `test/flows.test.mjs` |
| Cross-browser links; foreign/unlinked IDs; restricted access before choosing | `test/flows.test.mjs` |
| Replay, concurrent selection and cancellation during provider status check | `test/flows.test.mjs` |
| Original choice expiry; provider suspension; removed/expired/deleted account | `test/flows.test.mjs` |
| Preserve old single-account SQLite bindings; choice/session persistence over restart | `test/flows.test.mjs` |
| Unlink one account leaves other links and single-account direct login working | `test/flows.test.mjs` |
| Escape hostile account labels and submit the chosen ID with the current transaction | `test/account-choice-ui.test.mjs` |

The real-mode tests use an injected synthetic provider. They exercise HTTP,
cookies, CSRF, persistence, migration and authorization; they do not prove a
physical phone ceremony. After deployment, verify public version/assets and a
fresh isolated walkthrough. Then physically test linking two ordinary demo site
accounts to the same real Passli identity and choosing each after Passli login.
Do not use account emails as binding authority or auto-select the first match.

SQLite migration changes the unique key from subject alone to subject/account.
Back up both demo databases on the host while the service is stopped before
activation. After multiple links exist, the older single-account application is
not a safe rollback target: it may choose the first match. Preserve current data
and require a compatible rollback or forward fix; do not restore an old database
over new user changes.
