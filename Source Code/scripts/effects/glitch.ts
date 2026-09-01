/**
 * File: scripts/effects/glitch.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), GLSL ES 3.00
 *
 * Description:
 * The signature effect, fired by the palm flip: a digital tear in which the
 * frame breaks into displaced horizontal bands, the colour channels separate,
 * and scanlines and speckle wash across the image before it settles.
 *
 * The construction is four layers rather than one, because a single displacement
 * reads as a rendering error while the combination reads as a deliberate
 * transition:
 *
 *   1. Band displacement, quantised in time so bands jump rather than slide.
 *   2. Channel separation, which supplies the colour fringing.
 *   3. Scanlines, which place the image on a screen.
 *   4. Speckle and slice inversion, which break up the regularity.
 *
 * Every layer is scaled by the envelope, so the effect peaks immediately after
 * the flip and resolves back to a clean frame.
 */

import type { EffectDefinition } from './types';

export const glitch: EffectDefinition = {
    id: 'glitch',
    label: 'Glitch',
    description: 'The frame tears into displaced bands with separated colour channels.',
    durationMs: 620,
    freezesSource: false,

    fragmentShader: /* glsl */ `
void main() {
    float strength = u_envelope * u_intensity;
    vec2 uv = v_uv;

    // --- 1. Band displacement --------------------------------------------
    // Time is quantised to 24 steps a second so bands hold for a moment and
    // then jump. A continuous offset would slide, which reads as a wobble.
    float band = floor(v_screen.y * 15.0);
    float tick = floor(u_time * 24.0);
    float noise = hash(vec2(band, tick + u_seed * 97.0));

    // Only the noisiest bands move, so the frame stays legible.
    float displaced = step(0.55, noise);
    uv.x += (noise - 0.5) * 0.20 * strength * displaced;

    // --- 2. Channel separation -------------------------------------------
    float separation = 0.022 * strength;
    vec3 colour = vec3(
        sampleSource(uv + vec2(separation, 0.0)).r,
        sampleSource(uv).g,
        sampleSource(uv - vec2(separation, 0.0)).b
    );

    // --- 3. Scanlines -----------------------------------------------------
    float scanline = sin(v_screen.y * u_resolution.y * 1.4) * 0.5 + 0.5;
    colour *= 1.0 - 0.20 * strength * scanline;

    // --- 4. Speckle and slice inversion -----------------------------------
    float speckle = hash(v_screen * u_resolution + u_time * 60.0);
    colour += (speckle - 0.5) * 0.16 * strength;

    // A small number of slices invert, which supplies the hardest accent.
    float slice = step(0.94, hash(vec2(floor(v_screen.y * 44.0), tick)));
    colour = mix(colour, 1.0 - colour, slice * strength * 0.4);

    fragColour = vec4(colour, 1.0);
}
`,
};
