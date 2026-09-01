/**
 * File: scripts/effects/rewind-cut.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), GLSL ES 3.00
 *
 * Description:
 * Cuts to what the camera saw a couple of seconds ago, holds, and cuts back.
 *
 * This is the effect the project was built to make possible, and it is the one
 * thing here that has no equivalent in a shader alone.
 *
 * The trend this project began from hides an edit between two separately filmed
 * takes behind a hand flip, so the subject appears to change in an instant. No
 * shader can reproduce that, because the replacement subject is not in the
 * frame and never was.
 *
 * Retaining the recent past reaches the same result from the other direction.
 * The rewind buffer keeps the last few seconds, so when the gesture fires the
 * effect can cut to a moment when the subject stood somewhere else, hold there,
 * and cut back. Inside one continuous recording that reads as the same trick,
 * and every frame shown was genuinely recorded by the person watching it.
 *
 * The seams are deliberately violent. A soft dissolve between two moments of
 * the same scene reads as a video fault; a hard cut with a tear on either side
 * reads as an edit, which is what this is.
 *
 * When too little history exists, which is the case in the first seconds after
 * a recording starts, the shader falls back to a tear on the live image so the
 * gesture still produces something rather than appearing to fail.
 */

import type { EffectDefinition } from './types';

export const rewindCut: EffectDefinition = {
    id: 'rewind-cut',
    label: 'Rewind cut',
    description: 'Cuts to a moment from a few seconds ago, then cuts back.',
    durationMs: 1100,
    freezesSource: false,

    fragmentShader: /* glsl */ `
void main() {
    // The cut occupies the middle of the effect, with a tear at each seam.
    float cutIn = smoothstep(0.04, 0.10, u_progress);
    float cutOut = 1.0 - smoothstep(0.74, 0.80, u_progress);
    float inPast = cutIn * cutOut;

    // Seam strength peaks at each transition and is zero elsewhere.
    float seam =
        (1.0 - abs(u_progress - 0.07) / 0.07) +
        (1.0 - abs(u_progress - 0.77) / 0.07);
    seam = clamp(seam, 0.0, 1.0) * u_intensity;

    // Torn bands, quantised in time so they jump rather than slide.
    float band = floor(v_screen.y * 18.0);
    float tick = floor(u_time * 26.0);
    float noise = hash(vec2(band, tick + u_seed * 61.0));

    vec2 uv = v_uv;
    uv.x += (noise - 0.5) * 0.26 * seam * step(0.45, noise);

    vec3 live = sampleSource(uv);

    // Without enough history there is nothing to cut to, so the effect
    // degrades to the tear alone rather than to a black frame.
    vec3 past = texture(u_past, clamp(uv, 0.0, 1.0)).rgb;
    vec3 colour = mix(live, past, inPast * u_hasPast);

    // The recalled frame is graded slightly cooler and softer, which is the
    // cue that tells a viewer they are looking at a different moment rather
    // than at a glitch in the current one.
    float grey = luminance(colour);
    vec3 recalled = mix(vec3(grey), colour, 0.86) * vec3(0.97, 1.0, 1.05);
    colour = mix(colour, recalled, inPast * u_hasPast);

    // Channel separation on the seams, matching the signature glitch.
    float separation = 0.02 * seam;
    if (separation > 0.0001) {
        colour.r = mix(colour.r, sampleSource(uv + vec2(separation, 0.0)).r, 0.85);
        colour.b = mix(colour.b, sampleSource(uv - vec2(separation, 0.0)).b, 0.85);
    }

    // A bright line races down the frame on each seam, which is the visual
    // shorthand for a tape being scrubbed.
    float sweep = 1.0 - smoothstep(0.0, 0.035, abs(v_screen.y - fract(u_progress * 3.0)));
    colour += sweep * seam * 0.30;

    colour += (hash(v_screen * u_resolution + u_time * 55.0) - 0.5) * 0.12 * seam;

    fragColour = vec4(clamp(colour, 0.0, 1.0), 1.0);
}
`,
};
