/**
 * File: scripts/effects/zoom-punch.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), GLSL ES 3.00
 *
 * Description:
 * A sharp push into the centre of the frame with a radial blur trailing behind
 * it, the emphasis cut used to land a beat.
 *
 * No gesture fires this by default. It is registered so that a contributor
 * adding a gesture has an effect available to bind to without writing a shader,
 * and so the effect registry demonstrates that gestures and effects are
 * independent: any gesture can fire any effect by changing one identifier in a
 * detector.
 */

import type { EffectDefinition } from './types';

/** Samples along the zoom axis. Six is enough to hide the banding. */
const TAPS = 6;

export const zoomPunch: EffectDefinition = {
    id: 'zoom-punch',
    label: 'Zoom punch',
    description: 'The frame lunges toward the centre and settles back.',
    durationMs: 460,
    freezesSource: false,

    fragmentShader: /* glsl */ `
void main() {
    float strength = u_envelope * u_intensity;

    vec2 fromCentre = v_uv - 0.5;

    vec3 total = vec3(0.0);

    // Each tap samples a slightly different zoom level. Accumulating them
    // produces the radial streak that sells the push as motion.
    for (int i = 0; i < ${TAPS}; i++) {
        float tap = float(i) / float(${TAPS} - 1);
        float scale = 1.0 - 0.14 * strength * tap;

        total += sampleSource(fromCentre * scale + 0.5);
    }

    vec3 colour = total / float(${TAPS});

    // Contrast rises with the push, which keeps the lunge from looking soft.
    colour = clamp((colour - 0.5) * (1.0 + 0.30 * strength) + 0.5, 0.0, 1.0);

    fragColour = vec4(colour, 1.0);
}
`,
};
