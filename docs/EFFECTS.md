# Effects and Filters

**Repository**: <https://github.com/Amey-Thakur/GESTURE-FX>
**Author**: [Amey Thakur](https://github.com/Amey-Thakur)
**Licence**: MIT

How the rendering pipeline is built, and how to add an effect or a filter.

---

## 1. Two concepts, kept apart

| | **Filter** | **Effect** |
|---|--------|--------|
| What it is | A look you choose | An event a gesture causes |
| How long | The whole recording | A few hundred milliseconds |
| Driven by | Nothing | Progress, envelope, intensity, direction |
| Runs in | Pass one | Pass two |

The separation is not tidiness. Because a filter runs before an effect, any
filter combines with any effect: six filters and seven effects give forty-two
combinations, and not one of them is a shader anybody wrote.

## 2. The pipeline

```
camera frame
     │
     ▼  pass 1: crop to the output aspect, mirror, follow the face, apply the FILTER
scene buffer  (a framebuffer at the recording resolution)
     │
     ├──►  blit, eight times a second, reduced to a quarter size
     │     rewind buffer  (24 frames, roughly three seconds of history)
     │
     ├──►  pass 2: the abstraction, three bilateral passes at half resolution
     │     surface buffer            (only while the finger frame is open)
     │
     ▼  pass 3: composite the WINDOW, evaluating the STYLE inside the quad only
composite buffer                     (only while the finger frame is open)
     │
     ▼  pass 4: apply the EFFECT, reading the scene and optionally the past
  canvas   ──►  captureStream  ──►  MediaRecorder  ──►  the exported file
```

Passes two and three run only while the window is open. A session that never
makes the gesture never allocates their buffers.

The canvas at the end is the canvas that gets recorded. That is why an effect
ends up in the exported file as pixels and no editing step exists.

> One mode inverts that property on purpose. With the Gemini restyle armed, the
> window is withheld from the canvas and drawn over it in the document instead,
> so the recording is a clean camera image for a model to redraw. See
> `scripts/ui/frame-guide.ts`.

## 3. The shader interface

Every filter and every effect is a fragment shader body. The prelude in
`render/shaders/prelude.ts` is prepended to all of them, so a shader file
contains only `main` and whatever helpers it needs.

### Inputs available everywhere

| Uniform | Meaning |
|---------|---------|
| `v_uv` | Source coordinate, crop and mirroring already applied |
| `v_screen` | Output coordinate in [0, 1], for anything aligned to the frame |
| `u_source` | The frame. The camera in pass one, the scene thereafter |
| `u_resolution` | Output size in pixels |
| `u_time` | Seconds since start, continuous across firings |

### Additional inputs inside the window

Available to a frame style, and to nothing else, because only the portal
programs are assembled with them.

| Uniform | Meaning |
|---------|---------|
| `u_abstract` | The surface: the scene after the abstraction pass, at half resolution |
| `u_restyled` | A separately generated version of the take. Read by the generated style only |
| `u_corner0`…`3` | The window's corners, in output space, in anatomical order |
| `u_presence` | The window's fade, in [0, 1] |
| `u_aspect` | Output aspect, so a distance is not stretched with the frame |

### Additional inputs for effects

| Uniform | Meaning |
|---------|---------|
| `u_progress` | 0 at the trigger, 1 at the end |
| `u_envelope` | Progress shaped into attack and decay. **Drive strength from this** |
| `u_intensity` | Gesture confidence, 0 to 1 |
| `u_direction` | Direction of the causing movement, -1 to 1 |
| `u_seed` | Random per firing, so repeats do not look identical |
| `u_past` | A frame from a few seconds ago, from the rewind buffer |
| `u_hasPast` | 1 when `u_past` is genuine, 0 when too little history exists |

### Helpers

```glsl
float hash(vec2 p);              // cheap noise
float luminance(vec3 colour);    // Rec. 709
vec3  sampleSource(vec2 uv);     // clamped, so a displaced read hits the edge
```

Use `sampleSource` rather than `texture(u_source, uv)`. Effects displace their
lookups past the frame edge, and clamping smears the edge pixel instead of
folding the far side of the image into the tear.

## 4. Two rules worth stating

**Drive strength from `u_envelope`, not `u_progress`.** The envelope rises over
the first 15 percent and falls across the rest, so the peak lands immediately
after the gesture. A linear ramp reads as a fade that happens to coincide with a
hand movement rather than as something the movement caused.

An effect may define its own curve where the shared one is wrong. The flash
does, because a flash that ramps up is not a flash.

**Multiply by `u_hasPast` whenever you read `u_past`.** In the first seconds of
a recording the history is empty and the texture is a placeholder. An effect
that ignores the flag cuts to a duplicate of the current frame and appears not
to have fired.

## 5. Add an effect

### Step 1: write it

`Source Code/scripts/effects/your-effect.ts`:

```ts
/**
 * File: scripts/effects/your-effect.ts
 * ... the standard header ...
 */

import type { EffectDefinition } from './types';

export const yourEffect: EffectDefinition = {
    id: 'your-effect',
    label: 'Your effect',
    description: 'One line describing what the viewer sees.',
    durationMs: 600,
    freezesSource: false,

    fragmentShader: /* glsl */ `
void main() {
    float strength = u_envelope * u_intensity;

    vec2 uv = v_uv;
    uv.x += sin(v_screen.y * 40.0 + u_time * 8.0) * 0.03 * strength;

    fragColour = vec4(sampleSource(uv), 1.0);
}
`,
};
```

### Step 2: register it

Add `'your-effect'` to `EffectId` in `effects/types.ts`, then import it and add
it to the `EFFECTS` array in `effects/registry.ts`.

It now appears in the effect menu on every gesture row. Binding it to a gesture
by default is one identifier in that gesture's detector.

### `freezesSource`

Setting it makes the renderer copy the frame at the trigger and sample that copy
for the effect's whole life, so the picture stops while the camera keeps
running. The freeze effect uses it. If you set it, remember your shader receives
a still image and is responsible for making the stillness legible; a freeze on a
motionless subject is otherwise invisible.

## 6. Add a filter

The same, in `effects/filters.ts`, with no timing uniforms:

```ts
const yourFilter: FilterDefinition = {
    id: 'your-filter',
    label: 'Your filter',
    description: 'One line for the tooltip.',
    fragmentShader: /* glsl */ `
void main() {
    vec3 colour = sampleSource(v_uv);
    fragColour = vec4(colour * vec3(1.1, 1.0, 0.9), 1.0);
}
`,
};
```

Add the id to `FilterId` and the definition to the `FILTERS` array.

Include a vignette. Every filter carries one, because the frame otherwise runs
to the panel edge and loses its boundary against the interface at the corners.

## 7. Cost

Pass two runs at the display refresh rate on every pixel of the recording
resolution, which is 921,600 pixels in portrait. A texture read is the expensive
operation.

| Reads per pixel | Verdict |
|-----------------|---------|
| 1 to 3 | Free in practice |
| 4 to 9 | Fine. The whip pan uses nine |
| 10 to 20 | Measure on a phone before committing |
| Over 20 | Needs a reason, and probably needs a lower resolution pass |

The frame rate readout beside the gesture list is there to be watched while you
work. If it moves when your effect fires, the effect is too expensive.

Two techniques in the existing shaders are worth reusing. The neon filter
approximates an edge detector with two extra samples and a difference rather
than a full convolution. The glitch quantises time so bands jump rather than
slide, which costs nothing and reads as digital rather than as a wobble.

## 8. Why one effect at a time

The timeline draws only the most recently triggered effect. Compositing several
was tried and rejected: overlapping displacement shaders produce mud rather than
a richer image, and a firm replacement reads as an intentional cut.

Chaining effects properly would need a ping-pong framebuffer pair rather than
the single scene buffer. The machinery is already half present, and it is on the
roadmap in [SPECIFICATION.md](SPECIFICATION.md).

---

<div align="center">

[SPECIFICATION.md](SPECIFICATION.md) · [GESTURES.md](GESTURES.md) · [BROWSER-SUPPORT.md](BROWSER-SUPPORT.md) · [README](../README.md)

</div>
