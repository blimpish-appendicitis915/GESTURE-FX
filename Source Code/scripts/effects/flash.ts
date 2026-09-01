/**
 * File: scripts/effects/flash.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), GLSL ES 3.00
 *
 * Description:
 * A camera flash, fired by pushing an open palm toward the lens.
 *
 * The frame is not simply mixed toward white. Exposure is raised first, so the
 * highlights blow out before the shadows lift, which is what a real sensor does
 * when it is overexposed. Mixing to white instead produces an even wash that
 * reads as a fade rather than as light.
 *
 * The attack is deliberately short. A flash that ramps up is not a flash, so
 * this effect overrides the default envelope shape with a much faster rise.
 */

import type { EffectDefinition } from './types';

export const flash: EffectDefinition = {
    id: 'flash',
    label: 'Flash',
    description: 'The frame overexposes to white and falls back.',
    durationMs: 480,
    freezesSource: false,

    fragmentShader: /* glsl */ `
void main() {
    vec3 colour = sampleSource(v_uv);

    // A near-instant rise followed by a sharp decay. Reusing the shared
    // envelope would ramp into the flash, and a symmetric fall would hold the
    // frame white for most of the effect, which loses whatever was being
    // recorded. The exponent is what makes the light discharge rather than fade.
    float rise = smoothstep(0.0, 0.05, u_progress);
    float fall = pow(1.0 - u_progress, 2.5);
    float strength = rise * fall * u_intensity;

    // Exposure gain blows the highlights before it lifts the shadows.
    colour *= 1.0 + 4.0 * strength;

    // A trace of white for the last of the ramp, so the peak reaches paper.
    colour = mix(colour, vec3(1.0), strength * 0.35);

    fragColour = vec4(min(colour, vec3(1.0)), 1.0);
}
`,
};
