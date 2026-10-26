# Demo022 single Passli settings action

Version: 1
Date: 2026-10-25
Status: deployed and verified

Demo022 fixes the duplicate Link/Unlink buttons. Linked accounts show Unlink Passli; unlinked accounts show Link Passli. The backend, checkout flow and stored data format remain the Demo021 implementation.

Runtime source: d9278bdddf9e1b8aa6f031b8f51a5810e5030f8c, based on e0055b694d12b3d0189c5458cd6e34647a938f1f. The release changes one app.js condition, package/version metadata and its regression assertion.

Validation: 45 local and 45 isolated deployed-image checks passed. Public health/version badge report 0.1.22. The refreshed linked browser session shows zero Link and one Unlink action. Two tests against the downloaded public JavaScript verify both linkage states and escaped account selection.

Deployed runtime manifest SHA256: f4a99a32facbe41ea52a6171d9e1cc4a9ae882375acdfdecf8a6ef5297f52bd4. Public and frozen app.js bytes match SHA256 c6b577776af5ec2cbf22b3cbf8d5e6622b27b328e18e79d74cc1dd3d3846a997. Git stores LF bytes (8b9e5ff9218eeb018da3146485d27ec5ff3f58d05108753d9c57c689d81f7c85); the exported artifact uses CRLF. Exact newline conversion was verified, and the deployed manifest binds the exported bytes.

The existing image, environment, network and current data mounts were preserved. The previous container remains stopped with restart disabled for same-schema rollback using current data; no database restore occurred. Full checkout/PII changes are reserved for API609/app753/Demo023 and are not included in this hotfix. Detailed nonsecret receipts and full generated evidence remain in the private release staging directory.
