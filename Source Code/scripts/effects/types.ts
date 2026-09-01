/**
 * File: scripts/effects/types.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), GLSL ES 3.00
 *
 * Description:
 * The contract every visual effect implements.
 *
 * An effect is a fragment shader plus a duration. It receives the camera frame
 * as a texture and a normalised progress value, and returns the composited
 * image. It holds no state, which is what allows the same effect to be replayed
 * deterministically and to be triggered by any gesture.
 */

export type EffectId =
    | 'glitch'
    | 'rewind-cut'
    | 'chromatic-split'
    | 'flash'
    | 'freeze'
    | 'whip-pan'
    | 'zoom-punch';

export interface EffectDefinition {
    readonly id: EffectId;

    /** Name shown in the gesture legend and the settings panel. */
    readonly label: string;

    /** One line describing what the viewer sees, used in tooltips. */
    readonly description: string;

    /** How long one firing lasts, in milliseconds. */
    readonly durationMs: number;

    /**
     * Whether the effect samples a held frame rather than the live camera.
     *
     * The renderer copies the current frame into a second texture when an
     * effect declares this, so the freeze effect can show a still image while
     * the camera keeps running underneath it.
     */
    readonly freezesSource: boolean;

    /** The fragment shader body, compiled once when the renderer starts. */
    readonly fragmentShader: string;
}

/** One firing of an effect, held on the timeline while it plays. */
export interface EffectInstance {
    readonly definition: EffectDefinition;

    /** When the effect's timeline begins, which is the causal instant. */
    readonly startedAt: number;

    /** Intensity in [0, 1], taken from the confidence of the gesture. */
    readonly intensity: number;

    /**
     * Direction of the causing movement, where the effect has one.
     *
     * Currently only the whip pan reads this, to smear the way the hand moved.
     */
    readonly direction: number;

    /** A per-firing random value, so repeated triggers do not look identical. */
    readonly seed: number;
}
