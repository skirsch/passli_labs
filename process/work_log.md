# Work log

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
