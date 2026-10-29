# Executable guide

Version: 3
Updated: 2026-10-28

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

## TV QR encoder and acceptance checks

- `cd demo && npm ci`: install locked development-only packages for owner tests
  and QR regeneration. Production uses committed JavaScript, with no npm install.
- `cd demo && npm run build:qr`: `scripts/build-qr.mjs` bundles qrcode1.5.4 core
  with esbuild into `vendor/qr-encoder.mjs` and copies both qrcode/dijkstrajs
  license notices with LF. Regenerate only when changing the encoder/dependencies.
- `node --test demo/test/tv.test.mjs`: HTTP two-device login, trust expiry and
  revocation, identity/assurance checks, SQLite restart, SSE and independent QR
  decoding. Default databases are in memory; the restart test deletes only its
  own temporary SQLite files/directory. No real user or phone approval is sent.
- Local visual preview: `node --input-type=module -e "import {createDemo} from
  './demo/server.mjs';createDemo({origin:'http://127.0.0.1:18886'}).listen(18886,'127.0.0.1');"`
  from the repo root. Keep configured origin and listening port identical; this
  walkthrough preview displays QR/consent but cannot approve real identities.
