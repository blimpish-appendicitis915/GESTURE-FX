/**
 * File: scripts/effects/whip-pan.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), GLSL ES 3.00
 *
 * Description:
 * A whip pan transition, fired by sweeping a hand across the frame: the image
 * smears horizontally in the direction the hand travelled, as a camera does
 * when it is swung faster than its shutter can resolve.
 *
 * The smear is a directional blur built from nine taps along the direction of
 * travel, weighted so the nearest samples dominate. Nine is the point at which
 * the banding between taps stops being visible at the smear lengths used here;
 * more taps cost fill rate for no visible gain.
 *
 * `u_direction` carries the sign of the hand's movement, so the image smears
 * the way the hand actually went rather than in a fixed direction.
 */

import type { EffectDefinition } from './types';

/** Taps per side of the centre sample. Nine samples in total. */
const TAPS = 4;

export const whipPan: EffectDefinition = {
    id: 'whip-pan',
    label: 'Whip pan',
    description: 'The frame smears sideways in the direction of the swipe.',
    durationMs: 540,
    freezesSource: false,

    fragmentShader: /* glsl */ `
void main() {
    float strength = u_envelope * u_intensity;

    // Length of the smear in source coordinates, signed by travel direction.
    float reach = 0.16 * strength * sign(u_direction == 0.0 ? 1.0 : u_direction);

    vec3 total = vec3(0.0);
    float weightSum = 0.0;

    for (int i = -${TAPS}; i <= ${TAPS}; i++) {
        float tap = float(i) / float(${TAPS});

        // Triangular weighting keeps the subject readable at the centre while
        // the tail of the smear falls away.
        float weight = 1.0 - abs(tap) * 0.75;

        total += sampleSource(v_uv + vec2(tap * reach, 0.0)) * weight;
        weightSum += weight;
    }

    vec3 colour = total / weightSum;

    // A slight push in lets the frame lunge rather than only blur.
    vec2 zoomed = (v_uv - 0.5) / (1.0 + 0.06 * strength) + 0.5;
    colour = mix(colour, sampleSource(zoomed), 0.25 * strength);

    // The leading edge of a whip darkens as the lens loses light.
    colour *= 1.0 - 0.18 * strength;

    fragColour = vec4(colour, 1.0);
}
`,
};
