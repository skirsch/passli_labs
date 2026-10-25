# Disabled devices deployment acceptance suite

Version: 1
Date: 2026-10-24
Status: Reference suite for API592/web726/mobile726/demo0.1.15. Automated release checks passed; physical phone acceptance remains pending.

Use disposable accounts and enrolled test devices. Preserve original session and account deadlines. Record API, web, mobile and demo versions, UTC time, expected result, actual result and evidence for each case.

| Case | Steps | Required result |
| --- | --- | --- |
| Three strikes | Sign into demo, RP1 and RP2 using Passli from one enrolled browser. Cancel three distinct LoA 4 unlink ceremonies. | Browser device becomes disabled. All three RP protected reads and writes deny access. Demo clears protected content within its visible-session polling interval. |
| Idle demo | Leave a Passli-authenticated demo page visible while the same enrolled device trips elsewhere. | Demo enters suspension without a click. Unsaved notes cannot be submitted while suspended. |
| No repeated pushes | Attempt browser Resume and new operation-approval starts while disabled. | Explain mobile **Disabled devices**. No new push or approval ceremony starts. Cancel/logout/status remain usable. |
| Red mobile button | Foreground and unlock the enabled test phone after a device is disabled. | A large red **Disabled devices** button appears on Home. It opens a dedicated selection screen. Opening/closing it enables nothing. |
| Selective recovery | Disable two test devices. Select only one and press **Re-enable selected**. | Only selected device becomes enabled, after required assurance. The authoritative refreshed list retains the other device. |
| Assurance | Recover a device latched at LoA 4, then one latched at a higher level. Cancel the factor step once. | At least the latched assurance is required; cancellation changes nothing. An unrelated sufficient login approval cannot re-enable it. |
| Actor restrictions | Try disabled phone, disabled browser, self, foreign ID, deleted device and revoked SSH instance as recovery actors/targets. | Reject unauthorized actors and targets. SSH needs fresh enrollment. No private cross-account data is shown. |
| Binding and replay | Change selection or trigger a new disable event after approval creation. Replay a completed approval/request. | Changed evidence cannot consume old approval. Exact transport retry has one effect; consumed proof cannot authorize a second recovery. |
| Manual disable | Disable a normal test device and a second admin phone through normal account management. | Both appear in Disabled devices. Re-enabling admin phone preserves its stronger assurance requirements. Deleted devices are not restored. |
| Resume deadline | Re-enable the device, then check each original RP session. | Original eligible session resumes only after fresh provider status. Identity, grant and original deadlines remain unchanged. Demo still forgets accounts 30 minutes after creation. |
| Provider unavailable | Interrupt status checks or remove the synthetic fixture's provider association. | Protected reads/writes fail closed. No cached active status grants access. |
| App lifecycle | Switch accounts, background/foreground and lock/unlock during list refresh and recovery. | Old responses cannot display another account's devices. Polling stops when inactive/locked; reopening refreshes from the server. |

From the public repository's `demo` directory, run:

```sh
node --test test/*.test.mjs
```

The Passli maintainer must also run the backend and mobile regression gates described in the canonical deployment checklist. Synthetic tests and compilation do not establish deployment or physical Face ID acceptance. Verify live API, web, mobile and demo release versions and artifacts before marking this suite accepted.
