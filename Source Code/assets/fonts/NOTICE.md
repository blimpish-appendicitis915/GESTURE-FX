# Vendored typefaces

Both files in this directory are variable fonts covered by the **SIL Open Font
License, Version 1.1**, which permits bundling and redistribution inside a
project provided the fonts are not sold on their own and the licence travels
with them.

| File | Family | Designer | Source | Licence |
|------|--------|----------|--------|---------|
| `outfit-variable.woff2` | Outfit | Smartsheet Inc., Rodrigo Fuenzalida | [Google Fonts](https://fonts.google.com/specimen/Outfit) | [OFL 1.1](https://openfontlicense.org/) |
| `inter-variable.woff2` | Inter | Rasmus Andersson | [Google Fonts](https://fonts.google.com/specimen/Inter) | [OFL 1.1](https://openfontlicense.org/) |

Each file is the Latin subset of the family's variable font, so a single file
covers every weight the interface uses. Together they are 80 KB.

## Why they are stored here

The application states that it sends nothing to any third party. A stylesheet
that pulled these from a font network would make that untrue: the request
itself discloses every visitor's address and page to that network, whether or
not any camera data is involved.

Serving them from the repository also means the interface renders correctly on
the first paint and continues to render correctly with the network switched
off.

## Replacing them

Set `--font-display` and `--font-ui` in `Source Code/styles/tokens.css`, add the
matching `@font-face` rules to `Source Code/styles/base.css`, and update this
file. Nothing else refers to a font by name.
