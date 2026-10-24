# Work log

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
