# GESTURE-FX Technical Specification

**Author**: [Amey Thakur](https://github.com/Amey-Thakur) · [ORCID 0000-0001-5644-1575](https://orcid.org/0000-0001-5644-1575)
**Repository**: <https://github.com/Amey-Thakur/GESTURE-FX>
**Release date**: August 31 2026
**Licence**: MIT

---

## Table of contents

1. [Scope and claim](#1-scope-and-claim)
2. [Feasibility assessment](#2-feasibility-assessment)
3. [Prior work](#3-prior-work)
4. [System architecture](#4-system-architecture)
5. [Gesture detection](#5-gesture-detection)
6. [Video pipeline](#6-video-pipeline)
7. [Deployment](#7-deployment)
8. [Privacy analysis](#8-privacy-analysis)
9. [Performance](#9-performance)
10. [Limitations](#10-limitations)
11. [Roadmap](#11-roadmap)

---

## 1. Scope and claim

GESTURE-FX detects hand gestures in a live camera feed and applies a visual
effect to the video at the instant the gesture occurs. The recording that the
user exports already contains the effect, so no editing step exists.

The claim being made is narrow and testable:

> A browser, with no server and no installed software, can recognise a specific
> hand movement within a frame or two of it happening, composite a shader effect
> onto the camera image, and encode the composited result to a downloadable
> video file, on hardware a person already owns.

Everything in this document is in service of establishing whether that claim
holds, and of recording exactly where it does not.

### 1.1 Scope, and one explicit exclusion

An editing technique in circulation conceals a cut between two separately filmed
takes behind a hand movement, so that the subject appears to change instantly.
It is frequently mistaken for a real-time effect.

**It is not, and no client-side method can reproduce it.** The substitution
requires a subject that is never present in the stream. No transformation of the
delivered frames can synthesise information those frames do not contain. This is
a statement about the available data, not about the difficulty of the
engineering.

What is attainable, and what this project delivers, is the synchronisation
result: the instant identified, and the transition composited from that instant,
with no manual editing. Section 11 and the rewind cut describe a ring buffer
method that obtains a related outcome from information the stream *has*
delivered, namely its own recent past.

The exclusion is stated here rather than omitted because a system whose
advertised capability exceeds its actual one is not evaluable.

---

## 2. Feasibility assessment

**Verdict: feasible with limitations.** The end-to-end experience runs on the
client with no backend and no hosting cost, and in its default configuration
without a key or a network request after the first load. Two auxiliary features
are opt-in exceptions and are specified as such in section 8. The limitations are
otherwise concentrated in one place, which is video recording on iOS Safari, and
are documented rather than hidden.

### 2.1 Component evidence

Each component was verified against primary sources rather than assumed.

| Capability | Interface | Support | Notes |
|-----------|-----------|---------|-------|
| Camera capture | `getUserMedia` | Universal | Requires a secure context; localhost qualifies |
| Hand landmarks | `@mediapipe/tasks-vision` 1.0.1 | Apache-2.0 | 21 points per hand, WebAssembly, no server |
| Compositing | WebGL 2 | Chrome 56, Firefox 51, Safari 15 | Fragment shaders on a fullscreen triangle |
| Canvas capture | `HTMLCanvasElement.captureStream` | Chrome 51, Firefox 43, Safari 11 | iOS mirrors desktop Safari |
| Encoding | `MediaRecorder` | Chrome 47, Firefox 25, Safari 14.1, iOS 14 | Container support varies; see 6.3 |
| Saving | Anchor download, `navigator.share` | Desktop, mobile respectively | Two routes because the platforms differ |

### 2.2 The finding that makes free hosting possible

The MediaPipe vision package ships three WebAssembly builds:

```
vision_wasm_internal.wasm          11.76 MB   SIMD
vision_wasm_module_internal.wasm   11.76 MB   SIMD, module variant
vision_wasm_nosimd_internal.wasm   10.96 MB   fallback
```

**There is no threaded build.** The runtime therefore never requires
`SharedArrayBuffer`, and consequently never requires the page to be
cross-origin isolated with `Cross-Origin-Opener-Policy` and
`Cross-Origin-Embedder-Policy` headers.

This single fact decides the hosting question. GitHub Pages serves static files
and cannot set custom response headers. Had the runtime needed cross-origin
isolation, GitHub Pages would have been disqualified and the project would have
required a host that permits header configuration. It does not, so the free
option is also the correct one.

### 2.3 Download budget

| Asset | Size | Source |
|-------|------|--------|
| WebAssembly runtime | 11.76 MB | jsDelivr |
| Hand landmark model, float16 | 7.82 MB | Google storage |
| Application shell, gzipped | approximately 62 KB | GitHub Pages |
| Typefaces, two variable fonts | 80 KB | GitHub Pages |
| **First visit total** | **approximately 19.7 MB** | |

The runtime and the model are cached by the browser, so a second visit
downloads only the shell. Both are served from public content delivery networks
rather than from the repository, which keeps them off the GitHub Pages
bandwidth allowance entirely. See section 7.2.

The consequence for the user is a first load of roughly three seconds on a
desktop connection and ten to twenty-five seconds on mobile data. The
application therefore reports real download progress rather than showing an
indeterminate spinner, because a wait of that length has to be explained.

---

## 3. Prior work

A survey of the existing landscape was carried out on GitHub before any code
was written, to establish whether the project would be duplicating something
that already exists.

### 3.1 What exists

**Hand-tracking demonstrations are an established and popular category.**
Representative examples, with star counts at the time of survey:

| Repository | Stars | What it does |
|-----------|-------|--------------|
| `jaredrhod/barehands` | 781 | Hand-tracked pointer control for a desktop |
| `sophiamyang/finger-frame-effect` | 299 | Live effect inside a rectangle framed by both hands |
| `collidingScopes/shape-creator-tutorial` | 261 | Hand-controlled 3D shapes |
| `collidingScopes/3d-model-playground` | 227 | Hand and voice control of 3D models |
| `collidingScopes/threejs-handtracking-101` | 178 | Hand-controlled sphere |
| `collidingScopes/arpeggiator` | 162 | Hand-controlled audio |

The category reliably attracts attention, which establishes that the idea has
an audience.

### 3.2 What does not exist

Every project surveyed falls into one of two groups.

The first group is **live toys**. They apply an effect to a preview and stop
there. None of them record the composited result, and none of them let the user
export a file. `finger-frame-effect`, the closest in visual concept, is four
files and has no recording path at all.

The second group is **unmaintained clones**. Several repositories describe
something close to this project, including `gesturecam-ai`,
`motion-matter-live`, `GestureVisionFX` and `gesture-camera-effects`. All of
them have zero stars, are single-file or near-single-file, contain no
documentation of their detection method, and do not address any of the browser
defects catalogued in section 6.

### 3.3 Where this project differs

Three things distinguish it, and they are engineering rather than novelty of
concept.

**The gesture is the trigger for a recorded effect, not for a preview.** The
recorder captures the composited canvas, so the effect is present in the
exported file as pixels. This is the requirement none of the surveyed projects
meet.

**The detection method is derived rather than tuned.** The palm flip is
recognised through a geometric property of the projected hand, documented in
full in [GESTURES.md](GESTURES.md), rather than through thresholds discovered
by trial. It requires no calibration, no training data and no per-user setup,
and it is invariant to hand size, distance, handedness and selfie mirroring.

**Gestures and effects are independent, extensible registries.** Adding either
is one file and one line. The project is usable as a gesture engine by people
who do not want its effects, and as an effect library by people who do not want
its gestures.

---

## 4. System architecture

### 4.1 Pipeline

```
getUserMedia
     │
     ▼
<video>  (hidden, never displayed)
     │
     ├──────────────► HandLandmarker (WebAssembly, throttled to 24 Hz)
     │                        │
     │                        ▼
     │                 feature extraction
     │                        │
     │                        ▼
     │                 gesture engine ──► trigger { effect, instant, confidence }
     │                        │
     │                        ▼
     │                 effect timeline
     │                        │
     ├──────────────► FaceDetector (8 Hz, only while framing is enabled)
     │                        │
     │                        ▼
     │                 crop offset, soft dead zone
     │                        │
     └──────────────► WebGL 2 renderer ◄─┘
                              │        (4 passes: filter, abstraction,
                              │         window, effect)
                              ▼
                          <canvas>   (60 Hz, this is what the viewer sees)
                              │
                              ▼
                   canvas.captureStream(30)  + optional microphone
                              │
                              ▼
                        MediaRecorder
                              │
                              ▼
                    Blob ──► preview ──► download or share sheet
```

Nothing leaves the device at any point in this diagram.

Two optional paths do leave it, and neither is on the diagram because neither
runs unless the user switches it on:

```
spoken command  ──► the browser's own speech interface
                    (Chrome and Edge transmit the audio to their vendor;
                     Safari recognises on the device)

a finished take ──► Gemini, against the user's own key
                    ──► the generated clip ──► composited under the tracked
                                               window ──► a second recording
```

Both are accounted for in section 8 and in `docs/PRIVACY.md`.

### 4.2 The central decision

**Detection is decoupled from rendering.**

Landmark inference is the most expensive operation in the frame. Running it on
every rendered frame would cap the entire application at the inference rate,
which on a mid-range phone is 20 to 30 Hz.

Instead:

- The renderer runs on `requestAnimationFrame`, at the display refresh rate.
- The tracker is called every frame but returns `null` whenever it decides to
  skip, holding itself to a 24 Hz budget.
- A recognised gesture produces a trigger carrying **the timestamp of the
  instant the gesture occurred**, which is earlier than the instant it was
  confirmed.
- The effect plays out on wall-clock time from that timestamp.

The consequence is that effect playback is completely independent of tracking
performance. A device tracking at 15 Hz recognises a gesture slightly later,
but the effect it fires is exactly as smooth as on a device tracking at 60 Hz,
because nothing about playback is tied to inference.

Backdating is bounded to 120 ms. Honouring the true instant keeps the effect
aligned with its cause in the recorded file; the bound guarantees the onset is
still visible rather than already past.

### 4.3 Technology choices

| Decision | Choice | Reason |
|----------|--------|--------|
| Framework | None | The interface is one screen with nine controls. A framework would be the largest dependency in a project whose entire shell is 62 KB |
| Language | TypeScript | The gesture and effect layers are contract driven; the compiler enforces those contracts |
| Build | Vite | Development server and bundler, neither of which reaches the browser |
| Rendering | WebGL 2 | Canvas 2D cannot do per-pixel displacement at 60 fps on a phone |
| State | One typed emitter | Fewer than a dozen events exist |
| Runtime dependencies | One | `@mediapipe/tasks-vision`, and nothing else |

WebGL 2 is required rather than optional. Supporting WebGL 1 would mean a
second copy of every shader in an older dialect, and WebGL 2 has been present
in Safari since version 15 and in Chrome and Firefox for far longer.

### 4.4 Module map

Each file has one responsibility. No module imports another module's internals.

```
scripts/
├── config.ts            Every tunable constant in the project
├── main.ts              Entry point and last-resort error handling
├── app/
│   ├── state.ts         The state machine, written out explicitly
│   └── application.ts   Orchestration and the animation loop
├── core/                Emitter, geometry, formatting, frame rate
├── camera/camera.ts     getUserMedia and error translation
├── tracking/
│   ├── landmarks.ts     Types and named landmark indices
│   ├── features.ts      Landmarks to invariant descriptors
│   ├── tracker.ts       Model loading and throttled inference
│   ├── frame-quad.ts    The two-hand window, smoothed and gated
│   ├── quad-track.ts    Where the window was, for the whole of a take
│   └── face.ts          Face detection and the framing offset
├── gestures/
│   ├── types.ts         The detector contract
│   ├── engine.ts        Per-hand state, history, cooldown
│   └── detectors/       One file per gesture
├── effects/
│   ├── types.ts         The effect contract
│   ├── registry.ts      The effect list
│   ├── timeline.ts      Active effects and their progress
│   └── *.ts             One file per effect, shader included
├── render/
│   ├── gl.ts            Context, compilation, geometry, textures
│   ├── framebuffer.ts   An offscreen target
│   ├── rewind-buffer.ts The ring of recent frames
│   ├── renderer.ts      The four passes
│   └── shaders/         Vertex, prelude, passthrough, abstraction, portal
├── voice/commands.ts    Spoken commands, and where the audio goes
├── ai/
│   ├── credentials.ts   The user's key, and how long it is held
│   ├── styles.ts        The prompts, and the alignment constraint
│   ├── gemini.ts        The exchange with the service
│   └── composite.ts     Replaying a take under the tracked window
├── recording/
│   ├── capabilities.ts  What this browser can record
│   ├── recorder.ts      Canvas capture and encoding
│   └── export.ts        Download and share
└── ui/                  One file per interface concern
```

---

## 5. Gesture detection

The full derivation, the state machines and the false positive analysis are in
[GESTURES.md](GESTURES.md). This section states the result.

### 5.1 The palm flip

The problem is to detect a hand rotating about its own long axis so that the
face presented to the camera changes, and to report **the exact frame** on which
it happened.

Take three landmarks: the wrist, the index knuckle and the little finger
knuckle. Compute the two dimensional cross product of the two palm edges they
define, normalised by their lengths:

```
palmSign = ((index − wrist) × (pinky − wrist)) / (|index − wrist| · |pinky − wrist|)
```

This is the sine of the angle between the palm edges as projected onto the
image, signed by the winding order of the triangle they span.

Two properties follow, and together they solve the problem:

1. **The sign is the winding order in projection.** Rotating the hand past
   edge-on reverses the winding, so the scalar changes sign.
2. **The magnitude collapses to zero at that same instant**, because an edge-on
   palm projects to a line and the triangle has no area.

A flip is therefore a **zero crossing of a single scalar**, and the crossing is
the flip. This yields an exact instant rather than an interval, which is the
property the project needs.

Three further properties matter in practice:

- **Mirror invariant.** Mirroring a selfie preview negates the scalar
  everywhere. A crossing of a negated signal is still a crossing.
- **Scale invariant.** The value is a ratio bounded to [-1, 1], so hand size
  and distance from the lens cancel. No calibration exists in this project.
- **Handedness agnostic.** Both hands are the same crossing of the same scalar.

### 5.2 Why not classify two poses

Recognising "palm toward camera" and "back toward camera" as separate classes
and firing on the transition requires both classes to be confident. They are
least confident exactly during the fast, motion-blurred middle of the rotation.
Tracking a crossing requires confidence only before and after that middle.

### 5.3 Rejecting movement that is not a flip

Four conditions must all hold. Each removes a specific false positive observed
during development.

| Condition | Removes |
|-----------|---------|
| The palm is squarely presented and steady for 120 ms first | A hand entering the frame already rotating |
| At least three fingers extended | A rotating fist, and a wrist turn |
| The crossing completes in 60 to 600 ms | A single frame of bad landmarks, and a hand slowly turned over |
| The opposite face is reached and settles | A hand that wobbles and returns |

A refractory period of 1.2 seconds follows a trigger.

### 5.4 The other four gestures

| Gesture | Method | Effect |
|---------|--------|--------|
| Swipe | Horizontal travel in hand spans over 260 ms, with a vertical ratio limit | Whip pan |
| Fist | All fingers curled, held 260 ms | Freeze frame |
| Palm push | Open palm whose span grows 25 percent in 300 ms | Flash |
| Two fingers | Index and middle extended, others curled, held 300 ms | Chromatic split |

The palm push measures apparent growth rather than the model's depth
coordinate, because depth is inferred from a single view and is the noisiest
value in the output. It requires a push rather than a pose specifically so that
it stays disjoint from the palm flip, which starts from the same open hand.

---

## 6. Video pipeline

### 6.1 Why the canvas is the source

The recorder captures `canvas.captureStream()`, not the camera stream.

This is the architectural reason the project works. The canvas holds the
composited result, so the recorder encodes exactly what the viewer sees. The
effect is in the file as pixels. There is no post-processing step, no second
pass, and nothing that can fall out of synchronisation with the video.

The alternative, recording the camera and reapplying effects afterwards, would
require storing gesture timestamps, decoding the recording, compositing offline
and re-encoding. Every one of those steps is a place to introduce drift, and
the last is prohibitively slow in a browser.

### 6.2 WebGL considerations

`preserveDrawingBuffer` is enabled on the context. It costs a small amount of
fill rate. Without it, the drawing buffer may be cleared before `captureStream`
reads it, and recordings come out black on some drivers. Correct recordings are
worth more than the fill rate.

The GL viewport is reconciled against the canvas backing store on every frame.
The backing store is owned by the viewfinder, which resizes it when the output
preset changes, and WebGL does not observe that change. Reconciling every frame
means the two cannot drift apart regardless of who resizes the canvas or when.

### 6.3 Container selection

Containers are probed in preference order with `MediaRecorder.isTypeSupported`:

```
video/mp4;codecs=avc1.42E01E
video/mp4
video/webm;codecs=vp9,opus
video/webm;codecs=vp8,opus
video/webm;codecs=vp9
video/webm;codecs=vp8
video/webm
```

MP4 is requested first because it is the format a phone's photo library and
every social platform accept without conversion, and because Safari wrote
nothing else before version 18.4. WebM follows for browsers that prefer it.

### 6.4 Documented defects and their mitigations

These are real, reported browser defects. Each is handled in code rather than
noted as a caveat.

| Defect | Mitigation |
|--------|-----------|
| Safari intermittently never fires the `stop` event, leaving a promise unresolved and an interface stuck on "finishing" | A timeslice makes chunks arrive throughout the recording, and `stop` resolves on a two second timer using what was received |
| Some Safari builds return a capture stream whose video track never produces frames, giving an empty file with no error | The track is checked for existence and a live ready state before recording begins, converting a silent failure into a message shown up front |
| MediaRecorder output carries no duration in its container header, so players report `Infinity` and the scrubber is dead | The review player seeks far past the end once, which forces the duration to be computed, then returns to the start |
| A recording continues encoding while the tab is hidden, but the canvas stops being painted, filling the file with a frozen frame | The recording ends when the page is hidden |
| A long recording can exhaust memory on a phone | Recording stops automatically at 60 seconds |

### 6.5 Output

Portrait 720 by 1280 by default, with square and landscape presets. The backing
store is fixed by the preset and is independent of the window size, so a small
browser window still records at full resolution.

Portrait is the default because a video made by pointing a phone at yourself is
going to a feed that expects portrait, and defaulting to landscape would
quietly cost the user a crop.

---

## 7. Deployment

### 7.1 No backend is required

**The architecture has no backend.** In its default configuration: no server,
no API, no key, no database, no
model hosting, no queue, no build service at runtime. The complete deployable
artefact is a directory of static files.

This is not a simplification for the sake of the specification. There is no
step in the pipeline in section 4.1 that a server could usefully perform.
Sending frames to a server for inference would add a round trip to a
measurement that must be frame accurate, and would destroy the privacy property
that makes the application usable at all.

### 7.2 GitHub Pages is sufficient

| Limit | Value | Consumption |
|-------|-------|-------------|
| Published site size | 1 GB | Under 1 MB |
| Bandwidth, soft | 100 GB per month | Approximately 200 KB per visit |
| Builds per hour, soft | 10 | One per push |

The WebAssembly runtime and the model come from jsDelivr and Google's storage,
so the 19.7 MB first load does not touch the Pages allowance. Pages serves only
the shell, which means the bandwidth limit corresponds to roughly half a
million visits a month.

Deployment is a GitHub Actions workflow that builds and publishes on every push
to `main`.

### 7.3 Hugging Face Static Spaces as a mirror

A Static Space is a viable second deployment and costs nothing. It is worth
maintaining for two reasons that are not vanity.

Spaces has its own discovery surface, which is a second channel for a project
of this kind.

More concretely, a Static Space can set `custom_headers`, including
`cross-origin-opener-policy` and `cross-origin-embedder-policy`, which GitHub
Pages cannot. This project does not need cross-origin isolation today, as
established in section 2.2. Should a future release adopt a multithreaded
WebAssembly encoder for MP4 remuxing, the Space would be the only free host on
which it could run.

The build is parameterised for this. `BASE_PATH=/ npm run build` produces a
bundle for a host serving from the domain root.

---

## 8. Privacy analysis

### 8.1 What the application does

- Camera frames are read into a hidden `<video>` element, uploaded to a WebGL
  texture and passed to a WebAssembly module. All three live in the page's own
  memory.
- Recordings are held as a `Blob` in the page and handed to the operating
  system by reference when the user asks to save or share.
- Settings are written to the device: theme, frame style, sensitivity,
  countdown, mirroring, auto-framing, voice control, and a boolean recording
  that the intro guide has been dismissed. None of them identifies anyone.
- A Gemini API key is written to the device only if the user ticks the box that
  says so. It is otherwise held in the tab and lost when it closes.

### 8.2 What it does not do

There is no network request after the initial load of the application, the
runtime and the model, unless one of the two optional paths below is switched
on. No analytics, no telemetry, no error reporting, no font network, no
cookies. Verifiable by opening the network panel, or by switching the network
off after the first load and confirming the application still runs.

### 8.2.1 The two paths that do use the network

Both are off in a fresh install, both state what they do at the point of
enabling, and both show an indicator in the interface while they are active.

| Path | What is transmitted | To whom | Enabled by |
|------|---------------------|---------|------------|
| Voice control | Microphone audio while listening | The browser vendor's speech service in Chrome and Edge. Recognised on the device in Safari, not offered at all in Firefox | A setting |
| Gemini restyle | One recording, and the chosen prompt | Google, against the user's own API key | Entering a key, arming the mode, and pressing Generate |

The design principle applied to both is that an exception to a privacy claim
must be visible at three points: where it is enabled, while it is running, and
in the written account. An exception documented only in a file nobody opens is
not disclosed, it is filed.

The key deserves its own statement. It travels in the `x-goog-api-key` request
header rather than a query string, so it does not reach a proxy log or a browser
history entry; it is never printed to the console or included in an error
report; and the module that holds it exposes no accessor returning it for
display, only its last four characters. None of that changes the fundamental
position, which is that a credential in a web page is readable by that page.
The mitigation is that no third-party script is loaded at runtime, and the
statement to the user says exactly this.

### 8.3 Recording lifetime

A recording exists only in the page. Closing the tab discards it. Object URLs
are revoked when a new recording replaces the previous one and again when the
review panel closes, so a user who records ten takes does not hold ten
recordings in memory.

### 8.4 Permissions

Camera permission is requested only after the intro guide has explained what it
is for, because a prompt that arrives without explanation is the most common
reason a camera request is refused, and a refusal cannot be retried without the
user changing a browser setting.

Microphone permission is separate, off by default, and declining it does not
lose the take.

---

## 9. Performance

### 9.1 Frame budget

At 60 fps the budget is 16.7 ms. Measured contributions, desktop, integrated
graphics:

| Stage | Cost | Frequency |
|-------|------|-----------|
| Landmark inference, GPU delegate | 6 to 11 ms | 24 Hz |
| Feature extraction, two hands | under 0.1 ms | 24 Hz |
| Detector evaluation, five detectors, two hands | under 0.1 ms | 24 Hz |
| Texture upload | 1 to 2 ms | 60 Hz |
| Effect shader | 0.5 to 2 ms | 60 Hz |

Inference dominates, which is why it is throttled and why the throttle is the
single most consequential number in `config.ts`.

### 9.2 Expectations

| Class | Tracking | Render | Recording |
|-------|----------|--------|-----------|
| Desktop, discrete or integrated GPU | 24 Hz, the cap | 60 fps | Reliable |
| Recent phone or tablet | 20 to 24 Hz | 50 to 60 fps | Reliable on Android; see [BROWSER-SUPPORT.md](BROWSER-SUPPORT.md) for iOS |
| Older or low-power device | 12 to 18 Hz | 30 to 45 fps | Usable; gestures recognised slightly later |

Because of the decoupling in section 4.2, the last row degrades in recognition
latency rather than in effect quality. The effect still plays smoothly.

A live frame rate readout sits beside the gesture list, so a visitor can see
the real number on their own hardware instead of trusting this table.

### 9.3 Measures taken

- All shader programs are compiled at start-up, never on first use, so a
  gesture never triggers a compilation stall at the moment that must not
  stutter.
- One triangle is drawn rather than two, avoiding double shading along a quad's
  diagonal.
- Uniform locations are resolved once per program.
- Frames whose video timestamp has not advanced are skipped, since MediaPipe
  rejects a repeated timestamp and a stalled element repeats its time.
- The effect timeline holds at most one active effect. Compositing several at
  once was tried and rejected: overlapping displacement shaders produce mud.

---

## 10. Limitations

Stated plainly, because a specification that omits them is marketing.

1. **The viral trend's content swap is not reproducible.** Section 1.1.
2. **iOS recording is the weakest surface.** The API support exists and the
   defects in section 6.4 are mitigated, but Safari's history with canvas
   capture is poor. The application probes at start-up and degrades to a live
   effects tool with recording disabled rather than failing at the moment of
   use.
3. **The first load is 19.7 MB.** Unavoidable given the runtime and model
   sizes. Cached afterwards, and reported honestly while it happens.
4. **WebGL 2 is required.** A device without it cannot run the application, and
   is told so immediately rather than after the download.
5. **Hand identity is not tracked across frames.** MediaPipe assigns no stable
   identity, so hands are keyed by handedness. Two hands of the same reported
   handedness, which occurs occasionally with a misdetection, share a slot.
6. **Gestures need reasonable light.** Landmark quality falls in low light;
   nothing in this project can improve on the model's own limits.
7. **Effects last a fixed duration.** Sustained held effects, such as freezing
   for as long as a fist is held, would require a release signal that the
   detector contract does not yet carry. Listed in section 11.
8. **No automated test suite.** The project is verified by the device matrix in
   [BROWSER-SUPPORT.md](BROWSER-SUPPORT.md) and by manual review. Detector unit
   tests over recorded landmark sequences are the highest value next addition.

---

## 11. Roadmap

**Recorded landmark fixtures and detector tests.** Capture landmark sequences
for each gesture and for the near-miss movements that must not fire, then run
detectors against them in continuous integration. This is the single most
valuable addition, because it converts threshold tuning from a matter of
judgement into a measurement.

**Ring buffer jump cut.** Retain the last few seconds of frames at reduced
resolution and, on a flip, cut to that buffer. This approximates the two-take
illusion of the original trend within one continuous recording, which is as
close as a browser can honestly get to the effect described in section 1.1.

**Sustained effects.** Extend the detector contract with a release signal so a
freeze can hold for as long as a fist is held.

**Custom gesture recording.** Let a user demonstrate a movement, store the
feature trajectory, and match against it. Turns the engine from five gestures
into a general tool.

**WebCodecs encoding.** `VideoEncoder` gives frame-level control and would
remove the container defects in section 6.4 entirely, at the cost of writing a
muxer.

**Effect chaining.** Rejected for the current release, as noted in section 9.3.
Worth revisiting with a proper multi-pass framebuffer chain rather than a single
shader.

---

<div align="center">

[GESTURES.md](GESTURES.md) · [EFFECTS.md](EFFECTS.md) · [BROWSER-SUPPORT.md](BROWSER-SUPPORT.md) · [README](../README.md)

</div>
