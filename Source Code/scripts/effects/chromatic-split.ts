/**
 * File: scripts/effects/chromatic-split.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), GLSL ES 3.00
 *
 * Description:
 * Separates the red and blue channels radially outward from the centre of the
 * frame, in imitation of the lateral chromatic aberration of a fast lens.
 *
 * The separation grows with distance from the centre rather than being applied
 * uniformly. That is how the optical defect actually behaves, and it is why
 * this reads as a lens artefact while a flat horizontal offset reads as a
 * printing error.
 */

import type { EffectDefinition } from './types';

export const chromaticSplit: EffectDefinition = {
    id: 'chromatic-split',
    label: 'Chromatic split',
    description: 'Colour channels separate outward from the centre of the frame.',
    durationMs: 900,
    freezesSource: false,

    fragmentShader: /* glsl */ `
void main() {
    float strength = u_envelope * u_intensity;

    // Direction and distance from the centre of the output frame.
    vec2 fromCentre = v_screen - 0.5;
    float radius = length(fromCentre);
    vec2 direction = radius > 0.0001 ? fromCentre / radius : vec2(0.0);

    // Aberration is negligible on axis and strongest at the edges, so the
    // offset is weighted by the square of the distance from the centre.
    float offset = 0.05 * strength * radius * radius * 4.0;

    vec3 colour = vec3(
        sampleSource(v_uv + direction * offset).r,
        sampleSource(v_uv).g,
        sampleSource(v_uv - direction * offset).b
    );

    // A slight lift in saturation keeps the fringes from reading as grey.
    float grey = luminance(colour);
    colour = mix(vec3(grey), colour, 1.0 + 0.25 * strength);

    fragColour = vec4(colour, 1.0);
}
`,
};
