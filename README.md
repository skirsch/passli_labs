# Passli Labs

Public integration documentation and official icon assets for **Login with Passli**.

**[Integration guide](docs/Passli_site_integration_spec.md)** ·
**[Live demo — demo.passli.app](https://demo.passli.app)** ·
**[Guided walkthrough](https://demo.passli.app/walkthrough/)** ·
**[Demo implementation](demo/README.md)**

The live demo home selects **Northstar**, **TV app login**, **Schwab mutual auth**,
and **Bank Wire**. Each minisite links back to Passli Demo Home. Northstar is a
fictional site using real Passli Direct login.
Explore first-use account choice, explicit existing-account linking, new-account
creation, returning login, account settings and unlinking. The site's backend
verifies Passli assertions and current authorization; Northstar's own passwords
and projects are deliberately fictional. The [implementation notes](demo/README.md)
explain which components to replace with your site's real account authentication.

For the demo, enter **any email address** with password **`demo`** to represent
an existing account. Demo accounts and their Passli links are forgotten **30 minutes
after creation**; signing in again does not extend that time. Manual unlinking
requires a fresh Passli **LoA 4 signature**, with no old site password prompt.

<img src="assets/icons/passli-mark.svg" alt="Passli" width="80" height="80">

## Start here

- [Site integration specification](docs/Passli_site_integration_spec.md): requirements for adding Passli to an existing site's authentication and account system.
- [Integration readiness](docs/integration_status.md): current reference behavior, missing dependencies and onboarding inputs.
- [Direct/FedCM compatibility reference](docs/compatibility_protocol.md): request shapes and server verification responsibilities.
- [Icons and button guidelines](assets/README.md): SVG and PNG downloads and usage rules.
- [Sign-in page mockup](examples/login-button.html): compact provider buttons styled by the host site. Append `?preview=1` to show Passli in the static preview.
- [Complete demo source](demo/README.md): server-enforced accounts, linking,
  unlinking, sessions, real Passli callbacks and an optional local walkthrough.
- [Executable guide](docs/executables.md): local preview, demo startup and checks.
- [Disabled-device deployment tests](docs/disabled_devices_deployment_test_suite.md): suspension, selective mobile recovery and live acceptance checklist.

To hand this to an implementation assistant:

> Read docs/Passli_site_integration_spec.md and docs/integration_status.md, then add Login with Passli to this site. Preserve existing authentication and report any missing supported interfaces before implementing the live ceremony.

## Current status

This is an integration reference, working demo and asset kit, not a universal
production login SDK. The live demo uses the Direct provider-token compatibility
profile. It does not implement the unfinished protected threshold-login target.
Universal app/PWA discovery and onboarding of additional sites still require work. See the [readiness document](docs/integration_status.md).

The demo shows the Passli login button after detecting the current extension.
Without supported installation evidence, normal fictional site sign-in remains
available; account settings still show the Link Passli flow. You can also run the
separate [guided walkthrough](https://demo.passli.app/walkthrough/) to inspect
approval and suspension screens without a real Passli account. It uses an isolated
backend, cookie and database and labels all approvals as simulated. You can also
[run it locally](demo/README.md#run-locally).

Use **Continue with Passli** alongside other provider options, or **Login with
Passli** to match the site's wording. The host site draws the button; Passli
supplies the logo. Always show the button, including without extension or app
detection, so phone-app users can sign in. Start the verified Passli ceremony only
after a user click; normal site login remains available alongside it.

## Downloads and contributions

Use the files under [assets/icons](assets/icons), or pin an integration to a
reviewed commit. Keep filenames and asset URLs under your own deployment's
control instead of depending on a moving GitHub branch at runtime.

Use this repository's Issues for integration questions and documentation fixes.
Never post credentials, authentication tokens, recovery material or personal data.

See [LICENSE](LICENSE) for documentation/example permissions and brand asset terms.
