# Contributing

Contributions are welcome, and two kinds are especially wanted: **a new gesture**
and **a new effect**. Both are designed to be a single file, and the sections
below are written so that adding one is your first contribution rather than your
fifth.

## Run it locally

```bash
git clone https://github.com/Amey-Thakur/GESTURE-FX.git
cd GESTURE-FX
npm install
npm run dev
```

Open the address it prints. You need Node 18 or newer, a camera, and a browser
with WebGL 2.

`http://localhost` counts as a secure context, so the camera works in
development. A plain HTTP address on your local network does not, which is the
usual reason a page that works on a laptop fails on a phone pointed at the same
machine.

```bash
npm run typecheck    # the compiler, with no output
npm run build        # type check, then bundle into dist/
npm run preview      # serve the built output
```

## Add a gesture

One file in `Source Code/scripts/gestures/detectors/`, plus one line in
`detectors/index.ts`. [docs/GESTURES.md](../docs/GESTURES.md) has a complete
worked example and the contract.

The rule that matters: **read the descriptors in `HandFeatures`, never raw
landmarks.** Everything there is normalised by hand span, which is what makes a
threshold you tune on your own hand work for someone else's, at a different
distance, on a different camera.

## Add an effect

One file in `Source Code/scripts/effects/`, plus one line in `registry.ts` and
one in the `EffectId` union. [docs/EFFECTS.md](../docs/EFFECTS.md) has the uniform
set and a worked example.

Drive the strength of your effect from `u_envelope` rather than from
`u_progress`, so it peaks just after the trigger and reads as caused by the
gesture rather than as a fade that happens to coincide with one.

## Add a filter

Same as an effect, in `Source Code/scripts/effects/filters.ts`. A filter is a
persistent look rather than an event, so it receives no timing uniforms.

## House style

The code is deliberately uniform. Match it and your change will read as part of
the project.

- **TypeScript, four space indentation, single quotes, semicolons.**
- **One file, one purpose.** If a file needs the word "and" to describe it, it
  is two files.
- **Every file opens with the standard header block**: path, author, repository,
  release date, licence, tech stack, description. Copy one from a neighbouring
  file.
- **Comments explain why, never what.** `// increment the counter` above `i++`
  is noise. A comment recording which browser defect a workaround exists for, or
  why a threshold holds its value, is the reason the next person can change it
  safely.
- **No new runtime dependencies.** The project ships one, and the bar for a
  second is that the alternative is genuinely infeasible. Build tooling is a
  separate question and a lower bar.
- **Every tunable number goes in `config.ts`**, with a comment saying what it
  measures. A bare number inside a detector cannot be reviewed.

## Interface changes

- Every control needs an accessible name and a `data-tooltip`.
- Hit areas are at least 44 pixels; 40 in the masthead on narrow screens.
- Check all three layouts: phone, tablet and desktop. The breakpoints are 700px
  and 1080px.
- Check both themes. Never write a literal colour; use a token from
  `styles/tokens.css`. If you need a colour that does not exist, add it there
  once, in both palettes.
- Nothing may change size on hover, only colour and shadow, so the interface
  does not move under a finger already travelling toward it.

## Before you open a pull request

```bash
npm run build
```

Then, by hand, because there is no automated test suite yet:

- Grant the camera, and deny it, and confirm both paths are sensible.
- Record, stop, preview, download.
- Try your gesture with the left hand and the right hand.
- Try the movement that most resembles your gesture but is not it, and confirm
  it does not fire. Say in the pull request what you tried.
- Resize the window from 320px wide upward and confirm nothing overflows.

Describe what you changed and why. A screenshot or a short clip of a new gesture
or effect is worth more than any description of it.

## Things that would genuinely help

- **Recorded landmark fixtures and detector tests.** The highest value
  contribution available. Capture landmark sequences for a gesture and for the
  near misses that must not fire, and run the detectors against them in
  continuous integration. It would turn threshold tuning from judgement into
  measurement.
- **Device reports.** Tell us what happened on hardware not in
  [docs/BROWSER-SUPPORT.md](../docs/BROWSER-SUPPORT.md), especially iPhones. A
  report that recording failed on a specific iOS version is more useful than
  most code.
- **Translations of the interface strings.**

## Conduct

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

Contributions are accepted under the [MIT Licence](../LICENSE), the same terms as
the rest of the project.
