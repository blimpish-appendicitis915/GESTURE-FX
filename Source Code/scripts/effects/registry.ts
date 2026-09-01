/**
 * File: scripts/effects/registry.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * The effect registry. This list is the single place the application learns
 * which effects exist, and the renderer compiles one shader program for each
 * entry when it starts.
 *
 * To add an effect: write one file in this directory exporting an
 * `EffectDefinition`, add its identifier to `EffectId` in types.ts, and list it
 * below. Binding it to a gesture is a separate, one-line change in a detector.
 * See docs/EFFECTS.md.
 */

import { chromaticSplit } from './chromatic-split';
import { flash } from './flash';
import { freeze } from './freeze';
import { glitch } from './glitch';
import { rewindCut } from './rewind-cut';
import type { EffectDefinition, EffectId } from './types';
import { whipPan } from './whip-pan';
import { zoomPunch } from './zoom-punch';

/** Registered effects, in presentation order. */
export const EFFECTS: readonly EffectDefinition[] = [
    glitch,
    rewindCut,
    whipPan,
    freeze,
    flash,
    chromaticSplit,
    zoomPunch,
];

/** Lookup by identifier, built once at module load. */
const BY_ID = new Map<EffectId, EffectDefinition>(
    EFFECTS.map((effect) => [effect.id, effect]),
);

/**
 * Returns the definition for an identifier.
 *
 * Throws rather than returning undefined: an unknown identifier means a
 * detector references an effect that was never registered, which is a
 * programming error that should surface immediately rather than as a frame
 * that silently fails to render.
 */
export function effectById(id: EffectId): EffectDefinition {
    const effect = BY_ID.get(id);

    if (!effect) {
        throw new Error(`[gesture-fx] no effect is registered under the identifier "${id}"`);
    }

    return effect;
}
