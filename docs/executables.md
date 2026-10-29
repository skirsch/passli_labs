# Executable guide

Version: 2
Updated: 2026-10-24

| Command | Purpose | Inputs | Outputs |
| --- | --- | --- | --- |
| `cd demo && npm start` | Serve the site; default mode is real Passli Direct authentication | Node >=24.16; `DEMO_MODE`, `DEMO_ORIGIN`, `DEMO_DATABASE`, `HOST`, `PORT` | HTTP site, API and SQLite database |
| `cd demo && npm test` | Verify HTTP account flows and protocol checks | No credentials; in-memory or temporary SQLite and isolated provider fixtures | Test summary; temporary files removed |
| `python -m http.server 18765 --bind 127.0.0.1` from repository root | Preview the static button mockup | Python, repository assets | `http://127.0.0.1:18765/examples/login-button.html?preview=1` |

To run a local simulation, set `DEMO_MODE=walkthrough` before `npm start`.
For PowerShell: `$env:DEMO_MODE='walkthrough'; npm start`.
Keep `demo/data/` and deployment credentials out of Git. The edge worker requires
a configured HTTPS `DEMO_UPSTREAM` and a route scoped to the demo hostname.
See the [demo implementation notes](../demo/README.md) for exact configuration.

`demo/unlink.mjs` is the dependency-free backend verifier for operation-bound
LoA 4 unlink proofs; `npm test` includes both-signature and exact-binding denial
cases. It is imported by `demo/passli.mjs`, not executed directly.

## Demo suite

`demo/server.mjs` now serves the four-demo selector plus `/northstar/`, `/tv/`,
`/schwab/`, and `/wire/`. Existing `cd demo && npm start` and environment inputs
are unchanged. `node --test demo/test/suite.test.mjs` checks wire cent boundaries,
CSRF, isolated Direct callbacks, request consumption and cryptographic tampering.
