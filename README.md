# Passli Labs

Public integration documentation and official icon assets for **Login with Passli**.

<img src="assets/icons/passli-mark.svg" alt="Passli" width="80" height="80">

## Start here

- [Site integration specification](docs/Passli_site_integration_spec.md): requirements for adding Passli to an existing site's authentication and account system.
- [Integration readiness](docs/integration_status.md): current reference behavior, missing dependencies and onboarding inputs.
- [Direct/FedCM compatibility reference](docs/compatibility_protocol.md): request shapes and server verification responsibilities.
- [Icons and button guidelines](assets/README.md): SVG and PNG downloads and usage rules.
- [Button example](examples/login-button.html): accessible light/dark presentation, initially hidden until supported installation discovery succeeds.

To hand this to an implementation assistant:

> Read docs/Passli_site_integration_spec.md and docs/integration_status.md, then add Login with Passli to this site. Preserve existing authentication and report any missing supported interfaces before implementing the live ceremony.

## Current status

This is an integration reference and asset kit, not a production login SDK.
The existing Direct/FedCM compatibility demonstrations do not implement the
protected threshold-login target. Public installation discovery, site onboarding
configuration and parts of the account lifecycle still require completion or
confirmation. See the [readiness document](docs/integration_status.md).

The current button label is **Login with Passli**. Show it only after positive
Passli installation detection in the current browser context; normal site login
must remain available. Installation signals control presentation only.

## Downloads and contributions

Use the files under [assets/icons](assets/icons), or pin an integration to a
reviewed commit. Keep filenames and asset URLs under your own deployment's
control instead of depending on a moving GitHub branch at runtime.

Use this repository's Issues for integration questions and documentation fixes.
Never post credentials, authentication tokens, recovery material or personal data.

See [LICENSE](LICENSE) for documentation/example permissions and brand asset terms.
