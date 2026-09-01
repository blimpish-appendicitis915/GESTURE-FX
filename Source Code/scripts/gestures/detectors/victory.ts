/**
 * File: scripts/gestures/detectors/victory.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * Detects two raised fingers held still, and fires the chromatic split effect.
 *
 * This is the simplest detector in the project, and it is included partly to
 * show that the engine supports a plain static pose as readily as it supports
 * the temporal gestures beside it. A pose test plus a hold is the whole of the
 * implementation, and any new pose gesture can be written the same way.
 */

import { GESTURES } from '../../config';
import { clamp } from '../../core/geometry';
import { hold } from '../sensitivity';
import { isVictory } from '../../tracking/features';
import type { DetectorContext, DetectorInstance, GestureDetector, GestureTrigger } from '../types';

const CONFIG = GESTURES.victory;

class VictoryDetector implements DetectorInstance {
    /** When the pose was first observed, or 0 when it is not held. */
    private heldSince = 0;

    private hasFired = false;

    update(context: DetectorContext): GestureTrigger | null {
        const { now, current } = context;

        if (!isVictory(current.features)) {
            this.reset();
            return null;
        }

        if (this.heldSince === 0) {
            this.heldSince = now;
            return null;
        }

        const held = now - this.heldSince;

        if (held < hold(CONFIG.holdMs) || this.hasFired) {
            return null;
        }

        this.hasFired = true;

        return {
            gestureId: 'victory',
            effectId: 'chromatic-split',
            at: now,
            handedness: current.handedness,
            confidence: clamp(held / (CONFIG.holdMs * 2), 0.5, 1),
        };
    }

    reset(): void {
        this.heldSince = 0;
        this.hasFired = false;
    }
}

export const victory: GestureDetector = {
    id: 'victory',
    label: 'Two fingers',
    instruction: 'Raise two fingers and hold the shape.',
    effectId: 'chromatic-split',
    cooldownMs: CONFIG.cooldownMs,
    create: () => new VictoryDetector(),
};
