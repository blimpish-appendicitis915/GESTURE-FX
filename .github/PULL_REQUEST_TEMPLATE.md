# Pull request

## What this changes

<!-- One or two sentences. If it adds a gesture or an effect, say which. -->

## Why

<!-- The problem it solves, or the thing it makes possible. -->

## Type

- [ ] New gesture
- [ ] New effect or filter
- [ ] Bug fix
- [ ] Interface or accessibility
- [ ] Documentation
- [ ] Build or tooling

## Verification

```
npm run build
```

- [ ] `npm run build` passes
- [ ] Tried on a real camera

If this changes gesture detection:

- [ ] Tried with the left hand and the right hand
- [ ] Tried the movement that most resembles the gesture but is not it, and it did not fire

<!-- Say which near miss you tried. This is the part reviewers cannot check for you. -->

If this changes the interface:

- [ ] Checked at phone, tablet and desktop widths
- [ ] Checked in both themes
- [ ] Every new control has an accessible name and a `data-tooltip`
- [ ] No literal colours; tokens only

## House style

- [ ] Standard header block on every new file
- [ ] One purpose per file
- [ ] Any new tunable number lives in `config.ts` with a comment saying what it measures
- [ ] No new runtime dependencies

## Evidence

<!--
A screenshot or a short clip is worth more than a description, especially for a
gesture or an effect.

Do not attach anything containing a person who has not agreed to appear.
-->
