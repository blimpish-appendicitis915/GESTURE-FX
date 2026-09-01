/**
 * File: scripts/effects/freeze.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), GLSL ES 3.00
 *
 * Description:
 * Holds a single frame while the camera keeps running underneath, fired by a
 * closed fist.
 *
 * The hold itself is not performed here. This effect declares `freezesSource`,
 * and the renderer responds by copying the frame at the trigger into a second
 * texture and binding that instead of the live camera for the duration. The
 * shader therefore receives a still image and is only responsible for making
 * the stillness legible.
 *
 * It does that with a held-frame treatment rather than by doing nothing: a
 * cooling of the colour, a tightening vignette and a bright edge that snaps in
 * and eases out. Without them a freeze on a static subject is invisible, and
 * the viewer cannot tell the effect fired at all.
 */

import type { EffectDefinition } from './types';

export const freeze: EffectDefinition = {
    id: 'freeze',
    label: 'Freeze frame',
    description: 'The picture stops on a single frame and holds.',
    durationMs: 900,
    freezesSource: true,

    fragmentShader: /* glsl */ `
void main() {
    vec3 colour = sampleSource(v_uv);

    // Present for the whole hold, unlike the peaked envelope the other effects
    // use, because the freeze must read as sustained rather than as a hit.
    float hold = smoothstep(0.0, 0.04, u_progress) * (1.0 - smoothstep(0.82, 1.0, u_progress));
    float strength = hold * u_intensity;

    // Cool and slightly desaturate, which is the visual language of a still.
    float grey = luminance(colour);
    vec3 chilled = mix(vec3(grey), colour, 0.72) * vec3(0.94, 0.99, 1.10);
    colour = mix(colour, chilled, strength);

    // The vignette tightens as the hold settles.
    float radius = length(v_screen - 0.5) * 1.41421356;
    colour *= 1.0 - 0.34 * strength * smoothstep(0.35, 1.05, radius);

    // A bright border snaps in at the trigger and eases away, which is what
    // announces the freeze on a subject that was already still.
    float edge = min(min(v_screen.x, 1.0 - v_screen.x), min(v_screen.y, 1.0 - v_screen.y));
    float frameLine = 1.0 - smoothstep(0.0, 0.006, edge);
    colour += frameLine * strength * 0.55;

    fragColour = vec4(colour, 1.0);
}
`,
};
