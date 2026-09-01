/**
 * File: scripts/gestures/engine.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * Drives the registered detectors, maintains per-hand frame history, and
 * enforces the cooldown that stops one physical gesture firing twice.
 *
 * Hands are keyed by handedness because MediaPipe does not assign stable
 * identities across frames. Two hands are therefore two independent state
 * machines, and a hand that leaves the frame has its state cleared rather than
 * carried over, which prevents a gesture from completing across an absence.
 *
 * Cooldown is held per gesture rather than per hand. A flip performed with both
 * hands at once is one event to the viewer, and should fire one effect.
 */

import { GESTURES, TRACKING } from '../config';
import type { HandFrame, Handedness, TrackingFrame } from '../tracking/landmarks';
import type { DetectorInstance, GestureDetector, GestureId, GestureTrigger } from './types';

/** Everything the engine tracks for one hand. */
interface HandSlot {
    history: HandFrame[];
    detectors: Map<GestureId, DetectorInstance>;
    lastSeenAt: number;
}

export class GestureEngine {
    private readonly slots = new Map<Handedness, HandSlot>();

    /** Last trigger time per gesture, for cooldown enforcement. */
    private readonly firedAt = new Map<GestureId, number>();

    /** Gestures the user has switched off in the interface. */
    private readonly disabled = new Set<GestureId>();

    constructor(private readonly detectors: readonly GestureDetector[]) {}

    /** The registered detectors, for building the gesture legend. */
    get registered(): readonly GestureDetector[] {
        return this.detectors;
    }

    isEnabled(id: GestureId): boolean {
        return !this.disabled.has(id);
    }

    setEnabled(id: GestureId, enabled: boolean): void {
        if (enabled) {
            this.disabled.delete(id);
        } else {
            this.disabled.add(id);
        }
    }

    /**
     * Advances every detector by one tracked frame and returns what fired.
     *
     * A null frame means inference was throttled or produced nothing, which is
     * not evidence that the hands are gone. Only elapsed time decides absence,
     * so a low tracking rate does not reset a gesture in progress.
     */
    update(frame: TrackingFrame | null, now: number): GestureTrigger[] {
        if (frame) {
            this.ingest(frame);
        }

        this.expireAbsentHands(now);

        if (!frame) {
            return [];
        }

        const triggers: GestureTrigger[] = [];

        for (const hand of frame.hands) {
            const slot = this.slots.get(hand.handedness);

            if (!slot) {
                continue;
            }

            // A hand too small in frame is either far away or a false positive.
            // Skipping it here keeps every detector free of the same guard.
            if (hand.features.span < GESTURES.minimumSpan) {
                continue;
            }

            for (const detector of this.detectors) {
                if (this.disabled.has(detector.id)) {
                    continue;
                }

                const instance = slot.detectors.get(detector.id);

                if (!instance) {
                    continue;
                }

                const trigger = instance.update({
                    now,
                    current: hand,
                    history: slot.history,
                });

                if (trigger && this.passesCooldown(trigger, now)) {
                    this.firedAt.set(trigger.gestureId, now);
                    triggers.push(trigger);
                }
            }
        }

        return triggers;
    }

    /** Appends the frame to each hand's history, creating slots as needed. */
    private ingest(frame: TrackingFrame): void {
        for (const hand of frame.hands) {
            let slot = this.slots.get(hand.handedness);

            if (!slot) {
                slot = {
                    history: [],
                    detectors: new Map(
                        this.detectors.map((detector) => [detector.id, detector.create()]),
                    ),
                    lastSeenAt: frame.t,
                };

                this.slots.set(hand.handedness, slot);
            }

            slot.history.push(hand);
            slot.lastSeenAt = frame.t;

            if (slot.history.length > TRACKING.historyLength) {
                slot.history.shift();
            }
        }
    }

    /**
     * Clears any hand not seen recently.
     *
     * Without this, a hand that leaves during a flip and returns minutes later
     * would resume mid-gesture and fire on a movement the user never made.
     */
    private expireAbsentHands(now: number): void {
        for (const [handedness, slot] of this.slots) {
            if (now - slot.lastSeenAt <= TRACKING.absenceResetMs) {
                continue;
            }

            slot.detectors.forEach((detector) => detector.reset());
            slot.history.length = 0;
            this.slots.delete(handedness);
        }
    }

    private passesCooldown(trigger: GestureTrigger, now: number): boolean {
        const detector = this.detectors.find((candidate) => candidate.id === trigger.gestureId);
        const cooldown = detector?.cooldownMs ?? 1000;
        const previous = this.firedAt.get(trigger.gestureId);

        return previous === undefined || now - previous >= cooldown;
    }

    /** Clears all state. Called when recording starts, so takes are independent. */
    reset(): void {
        this.slots.forEach((slot) => {
            slot.detectors.forEach((detector) => detector.reset());
        });

        this.slots.clear();
        this.firedAt.clear();
    }
}
