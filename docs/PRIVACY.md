# Privacy

GESTURE-FX uses your camera. This document states exactly what happens to what
it sees, in terms specific enough to be verified rather than merely believed.

## The short version

**Nothing leaves your device except through two features you have to switch on
yourself.** No camera frame, no recording, no measurement and no identifier is
transmitted otherwise. There is no server to transmit it to.

The two exceptions are voice control and the Gemini restyle. Both are off by
default, both are described in full below, and both show an indicator in the
interface while they are active. Everything else in this document applies with
them switched off, which is how the application ships.

## What is processed, and where

| Data | Where it goes | How long it lives |
|------|---------------|-------------------|
| Camera frames | A hidden video element, a WebGL texture and a WebAssembly module, all inside the page | Discarded as the next frame replaces them |
| Hand landmarks | Computed in the page, held for at most 48 frames per hand | Cleared when the hand leaves the frame |
| Microphone audio, if enabled | Into the recording only | Discarded with the recording |
| Microphone audio, while voice control is on | To your browser vendor's speech service, in Chrome and Edge. Recognised on the device in Safari | Not under this application's control. See below |
| A recording, when you press Generate in the restyle panel | Uploaded to Google's Gemini API against your own key | Not under this application's control. See below |
| Your Gemini API key, if you enter one | Held in the tab, and sent to Google in a request header. Written to `localStorage` only if you tick the box | Until you press Forget, or the tab closes if you did not tick it |
| Face position, if auto-framing is on | Computed in the page, one coordinate held between frames | Forgotten when the face leaves the frame |
| A finished recording | A `Blob` in page memory | Until you record again or close the tab |
| Your settings | `localStorage` on this device | Until you clear site data |

The settings row is the only thing written to your device: your chosen theme,
frame style, sensitivity, countdown, mirroring, auto-framing and voice control,
plus a single flag recording that the intro guide has been dismissed. It
contains nothing that identifies you.

## Voice control, in full

Voice control is the one feature in this application that is not local, and it
is stated plainly rather than buried.

The Web Speech API is the browser's own interface, and how a browser implements
it is not something a page can change or observe:

- **Chrome and Edge** send the microphone audio to their vendor's speech
  service and return a transcript. That audio leaves your device.
- **Safari** recognises speech on the device on recent systems.
- **Firefox** does not implement the interface at all, and the setting is
  disabled there.

Three things follow from that, and all three are implemented:

1. The setting is **off until you switch it on**. Nothing listens before then.
2. The settings panel prints which of the cases above your browser is in,
   determined from the engine rather than from the brand string.
3. An indicator sits over the viewfinder for as long as recognition is running,
   and it does not fade.

The application receives only a transcript. It matches that against a short list
of phrases and discards it. Nothing spoken is stored, and nothing spoken is used
for anything but starting a take, stopping one, or changing the frame style.

If you would rather nothing left the device at all, leave the setting off. Every
other feature works without it.

## The Gemini restyle, in full

The restyle is the second and last feature that uses the network, and it is the
only one that sends a recording anywhere.

**It does nothing until you do three things.** Enter a key, arm the mode before
recording, and press Generate. Nothing is uploaded at any earlier point, and
entering a key does not check it, because checking it would be a request you did
not ask for.

**What is sent.** One recording, the take you just made, and the prompt for the
look you chose. Nothing else: no identifier, no history, no other recording.

**Where it goes.** To `generativelanguage.googleapis.com`, against your own API
key. What Google does with it is governed by the terms of the key you used, not
by this application. A key from a free tier and a key on a billed project are
treated differently by Google, and their documentation is the authority on
which.

**What it costs.** Generation is billed to your key. This project takes no fee,
has no account, and cannot see your usage.

**Your key.** It is held in the tab. It is written to this device only if you
tick the box that says so, and Forget removes it from both. It travels in the
`x-goog-api-key` header rather than in a URL, so it does not appear in a browser
history entry or a proxy log. It is never printed to the console, never included
in an error report, and never sent anywhere but Google. If you are on a shared
machine, leave the box unticked.

**A key is a secret in a web page.** That is a real limitation and not one this
project can engineer away: any page that makes a request with your key can see
it. This one loads no third-party script at runtime, which is the main way such
a key is stolen, and the whole source is here to read. If that is not enough
assurance for the key you hold, use a restricted key, or do not use the feature.

**What comes back.** The generated clip is offered for download as soon as it
arrives, before it is composited, so a failure in a later step cannot lose a
generation you have already paid for. Both clips are held in page memory and die
with the tab, like every other recording.

## What the application never does

- It never uploads a frame, a recording or any derived measurement.
- It contains no analytics, no telemetry and no error reporting service.
- It sets no cookies.
- It loads no fonts, scripts or styles from a third party at runtime. Both
  typefaces are stored in the repository for exactly this reason.
- It has no account, no login and no identifier of any kind.

## The network requests it does make

Three, all on the first load, none carrying anything about you beyond what
fetching a public file requires:

1. The application itself, from GitHub Pages.
2. The MediaPipe WebAssembly runtime, from jsDelivr.
3. The hand landmark model, from Google's public storage.

A fourth is made only if auto-framing is on: the face detection model, 230 KB,
from the same public storage. It is fetched once and cached, and never at all
while the setting is off.

These model requests are cached by your browser. Run `npm run vendor:models` to
place copies in the repository and serve them from the same origin, which
removes them entirely.

## How to verify all of this

Do not take the above on trust. Two checks settle it:

**Watch the network.** Open your browser's developer tools, select the network
panel, and use the application. After the initial load, nothing further is
requested. No frame, no recording, no beacon.

**Switch the network off.** Load the page once, then disconnect entirely. The
application continues to work: it tracks hands, applies effects, records and
exports. Software that phones home cannot do that. Voice control and the restyle
are the two things that stop working, which is the same statement from the other
direction.

## Your recordings

A recording is held in the memory of the page you are looking at. Closing the
tab discards it. The application cannot recover a recording you did not save,
and neither can anyone else, because no copy was ever made anywhere else.

Saving or sharing hands the file to your operating system. What happens after
that is between you and whichever application you send it to.

## Permissions

The camera is requested only after the intro guide has explained what it is for.
The microphone is separate, off by default, and declining it costs you the audio
rather than the recording.

The microphone is requested a second time, separately, if you switch voice
control on. Declining costs you the spoken commands and nothing else.

The restyle asks for no permission at all, because it needs none: it uses a key
you typed and a recording you already made.

All are released when you close the page. The camera indicator on your device
going out is the observable confirmation.

## Children

The application collects nothing, so there is nothing to collect from anyone of
any age.

## Changes

This file is versioned with the code. Any change to what the application does
with your data is a change to this file in the same commit, visible in the
repository history.

## Contact

Questions or corrections: [open an issue](https://github.com/Amey-Thakur/GESTURE-FX/issues).
Suspected leaks: see [SECURITY.md](../.github/SECURITY.md).
