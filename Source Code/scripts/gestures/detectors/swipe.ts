/**
 * File: scripts/gestures/detectors/swipe.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * Detects a fast horizontal hand movement and fires the whip pan transition.
 *
 * Travel is measured in hand spans rather than in normalised image units. A
 * hand near the lens covers far more of the frame per centimetre moved than one
 * at arm's length, so a threshold in image units would demand a small movement
 * up close and an impossible one further away. Dividing by span removes the
 * distance term and makes one threshold correct at any range.
 *
 * The direction of travel is carried into the effect so the whip pan smears the
 * way the hand actually moved.
 */

import { GESTURES } from '../../config';
import { clamp } from '../../core/geometry';
import { allowance, threshold } from '../sensitivity';
import type { HandFrame } from '../../tracking/landmarks';
import type { DetectorContext, DetectorInstance, GestureDetector, GestureTrigger } from '../types';

const CONFIG = GESTURES.swipe;

class SwipeDetector implements DetectorInstance {
    update(context: DetectorContext): GestureTrigger | null {
        const { now, current, history } = context;

        const origin = this.findWindowStart(history, now);

        if (!origin) {
            return null;
        }

        const span = Math.max(current.features.span, 1e-6);
        const horizontal = (current.features.centre.x - origin.features.centre.x) / span;
        const vertical = (current.features.centre.y - origin.features.centre.y) / span;

        const travelled = Math.abs(horizontal);

        if (travelled < threshold(CONFIG.minimumTravel)) {
            return null;
        }

        // A diagonal movement is a hand being repositioned, not a swipe. The
        // ratio test is what excludes an arm being raised or lowered quickly.
        if (Math.abs(vertical) > travelled * allowance(CONFIG.maximumVerticalRatio)) {
            return null;
        }

        return {
            gestureId: 'swipe',
            effectId: 'whip-pan',
            // A swipe is recognised as it completes, so the current instant is
            // the correct one. Unlike a flip, there is no earlier causal frame.
            at: now,
            handedness: current.handedness,
            confidence: clamp(travelled / (CONFIG.minimumTravel * 2), 0.5, 1),
            direction: Math.sign(horizontal),
        };
    }

    /**
     * Returns the oldest frame still inside the measurement window.
     *
     * Frames are searched from newest to oldest and the last one inside the
     * window is kept, which gives the full window whenever history covers it
     * and the whole of history when it does not.
     */
    private findWindowStart(history: readonly HandFrame[], now: number): HandFrame | null {
        let candidate: HandFrame | null = null;

        for (let index = history.length - 1; index >= 0; index -= 1) {
            const frame = history[index];

            if (now - frame.t > CONFIG.windowMs) {
                break;
            }

            candidate = frame;
        }

        // A window containing a single frame carries no displacement.
        return candidate && candidate.t !== now ? candidate : null;
    }

    reset(): void {
        // Stateless: every decision is read from the shared history buffer,
        // which the engine clears when a hand leaves the frame.
    }
}

export const swipe: GestureDetector = {
    id: 'swipe',
    label: 'Swipe',
    instruction: 'Sweep your hand quickly across the frame, left or right.',
    effectId: 'whip-pan',
    cooldownMs: CONFIG.cooldownMs,
    create: () => new SwipeDetector(),
};
