# Browser Support

**Repository**: <https://github.com/Amey-Thakur/GESTURE-FX>
**Author**: [Amey Thakur](https://github.com/Amey-Thakur)
**Licence**: MIT
**Last updated**: 31 August 2026

What is required, what was actually verified, and what is still unverified. The
last of those is stated as plainly as the others, because a support table that
does not separate "tested" from "expected" is not evidence of anything.

---

## 1. Requirements

| Capability | Needed for | Minimum |
|-----------|------------|---------|
| `getUserMedia` | The camera | Universal, secure context only |
| WebAssembly | Hand tracking | Universal |
| **WebGL 2** | **All rendering. Hard requirement** | Chrome 56, Firefox 51, Safari 15 |
| `canvas.captureStream` | Recording | Chrome 51, Firefox 43, Safari 11 |
| `MediaRecorder` | Recording | Chrome 47, Firefox 25, Safari 14.1, iOS 14 |
| Web Share, files | Sharing on a phone | Safari 14, Chrome Android 75 |

WebGL 2 is the only hard requirement. A device without it is told so
immediately, before the 19.7 MB download, rather than after it.

Recording is not a hard requirement. A browser that cannot record still applies
live effects; the record control is disabled and carries the reason in its
tooltip.

---

## 2. Verification status

Three categories, kept strictly separate.

### Verified in this environment

Chromium, desktop, with a **synthetic camera stream** substituted for real
hardware, plus emulated viewports at 375 × 812, 768 × 1024 and desktop.

| Check | Result |
|-------|--------|
| Application loads, no console errors | Pass |
| Model and runtime download, progress reported | Pass |
| All 6 filters and all 7 effect shaders compile and render | Pass |
| Two-pass pipeline, filter combines with effect | Pass |
| **Rewind buffer recalls the correct past frame** | Pass, measured |
| Recording produces a playable MP4 | Pass |
| Review, duration repair, download | Pass |
| Camera denied and camera absent, both paths | Pass |
| Settings, theme switching, persistence | Pass |
| Layout at three sizes, no overflow, record centred | Pass |
| Deployed build on GitHub Pages, model fetched over HTTPS | Pass |
| A six second recording is not abandoned by the stall watchdog | Pass |
| **A starved render loop is detected and reported** | Pass, observed |

The rewind check is the one worth quoting, because it is the feature that could
most easily have been broken without anyone noticing. A synthetic camera drawing
its own elapsed time was recorded. Live read **4.1 s**; during the cut the frame
read **2.4 s** then **2.6 s**; after it, **5.2 s**. The configured delay is
2200 ms. The buffer is genuinely returning the past.

### Not verifiable in this environment

Everything below needs hardware or a browser engine that was not available. None
of it is claimed to work.

| Item | Why not | Risk |
|------|---------|------|
| **A real camera** | No camera present | Low. The path differs from the synthetic stream only in the source of frames |
| **Gesture accuracy against real hands** | Requires a hand in front of a lens | **The largest untested area.** The detectors are derived rather than tuned, but no threshold has met a real hand |
| **Safari, macOS and iOS** | No Apple hardware | **Highest risk.** See section 3 |
| **Firefox** | Not available here | Low. Every API used is long supported; WebM rather than MP4 |
| **Android Chrome** | No device | Low to moderate. Mainly a performance question |
| **Real device performance** | Emulated viewports do not emulate a phone's GPU | Moderate. The figures in the specification are estimates |
| **Web Share with files** | Desktop Chromium reports it unavailable | Low. The download path is always present |

### Expected, from documented support data

Compiled from browser compatibility data rather than observation.

| Browser | Effects | Recording | Format | Notes |
|---------|---------|-----------|--------|-------|
| Chrome, Edge 130+ desktop | Expected | Expected | MP4 | The verified configuration |
| Firefox 115+ desktop | Expected | Expected | WebM | No MP4 from MediaRecorder |
| Safari 16+ macOS | Expected | Uncertain | MP4 | Section 3 |
| Chrome Android 12+ | Expected | Expected | MP4 or WebM | |
| Safari iOS 16+ | Expected | Uncertain | MP4 | Section 3 |
| Safari iOS 18.4+ | Expected | Uncertain | MP4 or WebM | WebM added in 18.4 |
| Any browser without WebGL 2 | **No** | No | | Refused at start-up with an explanation |

---

## 3. Safari and iOS

The honest position: **the APIs are supported, the known defects are mitigated
in code, and none of it has been confirmed on a device.**

Safari's history with canvas capture is poor, and four specific defects are
handled. Each mitigation is in the code, not merely noted here.

| Defect | Status upstream | Mitigation |
|--------|-----------------|------------|
| MediaRecorder over `captureStream` produced blank video ([WebKit 229611](https://bugs.webkit.org/show_bug.cgi?id=229611)) | Resolved as a duplicate of 230613, fixed 2022 | `preserveDrawingBuffer` is enabled, which is the configuration reported to work |
| The `stop` event intermittently never fires | Long standing, reported repeatedly | A timeslice delivers chunks throughout, and `stop` resolves on a 2 s timer using what arrived |
| A capture stream whose video track never produces frames | Reported historically | The track is checked for a live ready state before recording starts, so it fails with a message rather than an empty file |
| No duration in the container header, so the scrubber is dead | Affects every browser, most visible in Safari | The review player seeks past the end once to force the duration to be computed |

Two further iOS behaviours are handled as ordinary requirements rather than
defects. The video element carries `playsinline` and `muted`, without which
Safari takes the stream fullscreen and removes the canvas the application is
built around. And saving uses the share sheet rather than a download link,
because iOS handles a blob download poorly and the share sheet reaches the photo
library, which is where a video is going anyway.

**If you have an iPhone, the single most useful contribution you can make to
this project is to tell us what happened.** Include the iOS version, whether the
preview appeared, whether recording produced a playable file, and the approximate
frame rate shown beside the gesture list.
[Open an issue.](https://github.com/Amey-Thakur/GESTURE-FX/issues/new/choose)

---

## 3a. A recording needs the tab to be painted

Found while testing the deployed build, and worth stating because it is not
obvious and it is not a defect in this application.

A canvas capture stream emits a frame only when the canvas is **painted**. A
browser stops painting a window it considers not visible, and it can do so while
`document.visibilityState` still reports `visible`, which happens when a window
is fully occluded or when the page is not the foreground tab on some platforms.
Animation frames stop; timers keep running.

The observable result is a recording that encodes nothing. It was reproduced
here: `visibilityState` read `visible`, the render loop was not running, and the
recording came back empty.

Two mitigations are in place.

The **stall watchdog** is a timer, not a check inside the render loop, because
the condition being detected is the loop not running. If the canvas goes
unpainted for 2.5 seconds during a recording, the take is abandoned immediately
and the user is told why, while they can still act on it, rather than losing it
silently and discovering the loss when they press stop.

The **empty result guard** remains as the backstop, and its message now names
the likely cause rather than only blaming the browser.

The practical guidance for a user is one line: **keep the tab visible and in
front while recording.** Every camera application in a browser has this
constraint; most do not tell you about it.

---

## 4. Performance expectations

Estimates, other than the desktop row.

| Class | Tracking | Render | Notes |
|-------|----------|--------|-------|
| Desktop, integrated or discrete GPU | 24 Hz, the configured cap | 60 fps | Verified |
| Recent phone or tablet, 2022 onward | 20 to 24 Hz | 50 to 60 fps | Estimated |
| Older or low-power device | 12 to 18 Hz | 30 to 45 fps | Estimated |

Because detection is decoupled from rendering, the last row degrades in
recognition latency rather than in effect quality. A gesture is noticed slightly
later; the effect it fires is exactly as smooth.

The frame rate beside the gesture list is a live reading on the visitor's own
hardware, which is worth more than this table.

---

## 5. Known limitations

1. **WebGL 2 is required.** No WebGL 1 path exists, because it would mean a
   second copy of every shader in an older dialect.
2. **The first load is 19.7 MB**, cached afterwards.
3. **Recording is capped at 60 seconds** to bound memory on a phone.
4. **Recording ends when the tab is hidden.** The encoder keeps running while
   the canvas stops being painted, so continuing would fill the file with a
   frozen frame.
5. **Two hands reported with the same handedness share a detector slot.**
   MediaPipe assigns no stable identity across frames, so hands are keyed by
   handedness.
6. **Poor light degrades tracking**, and nothing in this project improves on the
   model's own limits.

---

## 6. Reporting a device

Please include:

- Device, operating system version, browser and version
- Whether the preview appeared
- Whether a gesture was recognised, and which
- Whether recording produced a playable file
- The frame rate shown beside the gesture list
- Any console errors

[Open an issue.](https://github.com/Amey-Thakur/GESTURE-FX/issues/new/choose)
Reports that something did not work are more valuable than reports that it did.

---

<div align="center">

[SPECIFICATION.md](SPECIFICATION.md) · [GESTURES.md](GESTURES.md) · [EFFECTS.md](EFFECTS.md) · [README](../README.md)

</div>
