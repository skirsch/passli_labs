# Passli icons and login button

Version: 1
Updated: 2026-10-24

These are the existing Passli product assets, copied without redesign.

| Asset | Intended use |
| --- | --- |
| [passli-mark.svg](icons/passli-mark.svg) | Transparent scalable blue/cyan mark; preferred for login buttons |
| [passli-mark-16.png](icons/passli-mark-16.png) | 16 x 16 transparent icon |
| [passli-mark-32.png](icons/passli-mark-32.png) | 32 x 32 transparent icon |
| [passli-mark-48.png](icons/passli-mark-48.png) | 48 x 48 transparent icon |
| [passli-mark-128.png](icons/passli-mark-128.png) | 128 x 128 transparent icon |
| [passli-mark-256.png](icons/passli-mark-256.png) | 256 x 256 transparent icon |
| [passli-tile.svg](icons/passli-tile.svg) | Scalable mark on the existing dark rounded tile |
| [passli-tile-128.png](icons/passli-tile-128.png) | 128 x 128 dark tile |

## Login button

Use the label **Login with Passli**, with the mark to its left. Match the site's
typography and retain a clear border, visible keyboard focus, readable contrast
and a target at least 44 CSS pixels high. Keep the mark square and undistorted;
use approximately 24 pixels within a 44–48 pixel button. Do not recolor, crop
or add effects to the mark. When adjacent text names Passli, use an empty image
alt attribute so screen readers do not repeat the brand name.

The [HTML example](../examples/login-button.html) provides light/dark styles and
a disabled loading treatment. It is a presentation example, with no discovery
adapter or authentication implementation. Its controls start hidden. For local
visual review only, append `?preview=1` to the file URL to see sample states.

In an integration, show the button only after positive supported installation
discovery in the current browser context. Pending, failed or unsupported
discovery keeps it hidden and unfocusable. Do not prompt for wallet accounts or
authentication just to detect installation. Normal site login remains usable.

Start authentication only from a user action. During an attempt, prevent duplicate
submission and announce progress. On cancellation or error, restore the control
and provide accessible feedback. The button and its icon never establish a
session; backend verification is required.

## Asset permission

Use these marks to identify Passli and offer an actual Passli integration.
Do not imply endorsement, impersonate Passli or use its marks as your own brand.
See the [license](../LICENSE). The HTML/CSS layout is a starting point, not a
claim that a final branded component or public login SDK has shipped.
