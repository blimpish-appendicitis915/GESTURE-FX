# Security Policy

## Supported versions

The application is deployed continuously from `main`, and the published site is
always built from the latest commit. Only that version is supported.

| Version | Supported |
|---------|-----------|
| `main`, as deployed | Yes |
| Older commits and forks | No |

## Reporting a vulnerability

Report privately through GitHub's
[security advisory form](https://github.com/Amey-Thakur/GESTURE-FX/security/advisories/new)
rather than in a public issue.

Please include what an attacker would gain, the steps to reproduce it, and the
browser and version you observed it in. You will receive an acknowledgement
within seven days and a decision on the report within thirty.

Anyone who reports a valid issue is credited in the advisory and the release
notes, unless they ask not to be.

## Threat model

Understanding what this application is makes clear which reports are meaningful.

GESTURE-FX is a static site. It has **no backend, no database, no account, no
session and no cookie**. There is no server that could be attacked, no data at
rest to exfiltrate and no privilege to escalate. The entire application is HTML,
CSS, JavaScript and a WebAssembly module executing in the visitor's own browser
sandbox.

Two features are exceptions, both disabled until the visitor enables them, and
both are in scope for a report. Spoken command recognition uses the browser's own
speech interface, which in Chrome and Edge transmits microphone audio to the
browser vendor. The delegated restyle uploads one recording to Google against an
API key the visitor supplies and which the application never holds on their
behalf. **In the shipped default configuration nothing is uploaded and no key
exists**; a report that either statement is false in that configuration is the
most serious this project can receive.

The following are therefore in scope and are taken seriously:

- **Any network request that leaves the device carrying user data.** The
  application is documented as making none. A demonstration otherwise is the
  most serious report this project can receive.
- **Cross-site scripting**, whether from a crafted URL, a stored setting or a
  file name. All interface text is written with `textContent`; the only
  `innerHTML` in the project writes icon markup from a compile-time constant.
- **Supply chain compromise** of the sole runtime dependency, of the WebAssembly
  runtime, or of the model, including the content delivery networks they are
  fetched from.
- **A recording reachable by another origin**, or persisting after the tab is
  closed.
- **Failure to release the camera**, or any path that keeps the device's camera
  indicator lit after the page is closed or the camera is stopped.
- **Content Security Policy or subresource integrity weaknesses** in the
  deployed site.

The following are out of scope:

- Missing security headers that GitHub Pages does not permit a project site to
  set. This is a platform limitation and is documented in
  [docs/SPECIFICATION.md](../docs/SPECIFICATION.md).
- Denial of service against a static file host.
- Reports that a user can grant their own camera permission, or record
  themselves. That is the purpose of the application.
- Vulnerabilities in a browser itself. Report those to the browser vendor.
- Output from an automated scanner with no demonstrated impact.

## Third party components

The dependency surface is deliberately small, and is listed in full in
[THIRD-PARTY-NOTICES.md](../docs/THIRD-PARTY-NOTICES.md). One runtime package,
`@mediapipe/tasks-vision`, and one model, both from Google under Apache-2.0.
Typefaces are vendored into the repository rather than fetched at runtime.

## Privacy

Privacy is treated as a security property here rather than a separate concern,
because a camera application that leaks is a security failure regardless of
intent. What is processed and what is stored is set out in
[PRIVACY.md](../docs/PRIVACY.md).
