/**
 * File: scripts/gestures/detectors/palm-push.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * Detects an open palm pushed toward the camera and fires the flash effect.
 *
 * Growth in apparent hand span is used as the approach signal rather than the
 * depth coordinate the model reports. Landmark depth is inferred from a single
 * view and is the noisiest value in the output, whereas span is measured
 * directly in the image plane and grows monotonically as a hand nears the lens.
 *
 * The push requirement exists to keep this gesture disjoint from the palm flip.
 * An open palm held toward the camera is the pose a flip starts from, so a
 * detector that fired on the pose alone would flash before every flip. Demanding
 * movement toward the lens separates the two by intent rather than by shape.
 */

import { GESTURES } from '../../config';
import { clamp } from '../../core/geometry';
import { threshold } from '../sensitivity';
import { isOpenPalm } from '../../tracking/features';
import type { HandFrame } from '../../tracking/landmarks';
import type { DetectorContext, DetectorInstance, GestureDetector, GestureTrigger } from '../types';

const CONFIG = GESTURES.palmPush;

class PalmPushDetector implements DetectorInstance {
    /** Set once a push has fired, cleared when the hand stops being a palm. */
    private hasFired = false;

    update(context: DetectorContext): GestureTrigger | null {
        const { now, current, history } = context;

        if (!isOpenPalm(current.features)) {
            this.reset();
            return null;
        }

        if (this.hasFired) {
            return null;
        }

        const origin = this.findWindowStart(history, now);

        if (!origin) {
            return null;
        }

        const growth = current.features.span / Math.max(origin.features.span, 1e-6) - 1;

        if (growth < threshold(CONFIG.growthRatio)) {
            return null;
        }

        this.hasFired = true;

        return {
            gestureId: 'palm-push',
            effectId: 'flash',
            at: now,
            handedness: current.handedness,
            confidence: clamp(growth / (CONFIG.growthRatio * 2), 0.5, 1),
        };
    }

    /** The oldest frame still inside the growth measurement window. */
    private findWindowStart(history: readonly HandFrame[], now: number): HandFrame | null {
        let candidate: HandFrame | null = null;

        for (let index = history.length - 1; index >= 0; index -= 1) {
            const frame = history[index];

            if (now - frame.t > CONFIG.windowMs) {
                break;
            }

            candidate = frame;
        }

        return candidate && candidate.t !== now ? candidate : null;
    }

    reset(): void {
        this.hasFired = false;
    }
}

export const palmPush: GestureDetector = {
    id: 'palm-push',
    label: 'Palm push',
    instruction: 'Open your hand and push it toward the camera.',
    effectId: 'flash',
    cooldownMs: CONFIG.cooldownMs,
    create: () => new PalmPushDetector(),
};
