/**
 * File: scripts/gestures/detectors/fist.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * Detects a closed fist held still, and fires the freeze frame effect.
 *
 * The hold requirement is the whole of the design. A hand passing through a
 * closed shape is common: it happens while reaching, gripping, or simply
 * lowering an arm. Requiring the shape to persist is what separates an intended
 * gesture from a hand in transit, and it costs only the hold duration in
 * latency because the effect is a freeze, which has no meaningful onset.
 */

import { GESTURES } from '../../config';
import { clamp } from '../../core/geometry';
import { hold } from '../sensitivity';
import { isFist } from '../../tracking/features';
import type { DetectorContext, DetectorInstance, GestureDetector, GestureTrigger } from '../types';

const CONFIG = GESTURES.fist;

class FistDetector implements DetectorInstance {
    /** When the hand first closed, or 0 when it is open. */
    private closedSince = 0;

    /** Set once a hold has fired, so it cannot fire again until released. */
    private hasFired = false;

    update(context: DetectorContext): GestureTrigger | null {
        const { now, current } = context;

        if (!isFist(current.features)) {
            this.reset();
            return null;
        }

        if (this.closedSince === 0) {
            this.closedSince = now;
            return null;
        }

        const held = now - this.closedSince;

        if (held < hold(CONFIG.holdMs) || this.hasFired) {
            return null;
        }

        this.hasFired = true;

        return {
            gestureId: 'fist',
            effectId: 'freeze',
            at: now,
            handedness: current.handedness,
            // A fist held well past the threshold is unambiguous; one that only
            // just qualifies is given a slightly weaker effect.
            confidence: clamp(held / (CONFIG.holdMs * 2), 0.5, 1),
        };
    }

    reset(): void {
        this.closedSince = 0;
        this.hasFired = false;
    }
}

export const fist: GestureDetector = {
    id: 'fist',
    label: 'Fist',
    instruction: 'Close your hand into a fist and hold it still.',
    effectId: 'freeze',
    cooldownMs: CONFIG.cooldownMs,
    create: () => new FistDetector(),
};
