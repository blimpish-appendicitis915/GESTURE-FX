/**
 * File: scripts/gestures/types.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * The contract every gesture detector implements.
 *
 * A detector is a factory rather than a singleton because each tracked hand
 * needs its own state machine. Two hands performing the same gesture at the
 * same time must not share a progress variable, and a hand leaving the frame
 * must reset only its own state.
 *
 * Adding a gesture means writing one file against this interface and listing it
 * in detectors/index.ts. Nothing else in the application changes.
 */

import type { EffectId } from '../effects/types';
import type { HandFrame, Handedness } from '../tracking/landmarks';

export type GestureId = 'palm-flip' | 'fist' | 'swipe' | 'palm-push' | 'victory';

/** Emitted when a detector recognises its gesture. */
export interface GestureTrigger {
    gestureId: GestureId;

    /** The effect this gesture fires. */
    effectId: EffectId;

    /**
     * The instant the gesture actually happened, which is earlier than the
     * instant it was recognised.
     *
     * A detector confirms a gesture only after seeing evidence that follows it,
     * so recognition necessarily lags the event by tens of milliseconds. The
     * effect timeline is seeded from this value rather than from the current
     * time, which is what keeps an effect synchronised with the frame that
     * caused it instead of with the frame that proved it.
     */
    at: number;

    /**
     * The observation `at` was inferred from, where the detector interpolated.
     *
     * A detector that locates an event between two samples is claiming to know
     * something finer than it observed, and the size of that claim is the
     * distance between this and `at`. Reporting both makes the claim auditable
     * instead of asking that it be taken on trust, and it is what the published
     * evaluation measures the interpolation against. Detectors that report the
     * sample itself omit it.
     */
    sampledAt?: number;

    /** Which hand produced the gesture. */
    handedness: Handedness;

    /** Detector confidence in [0, 1], used to modulate effect intensity. */
    confidence: number;

    /**
     * Direction of the causing movement in [-1, 1], where the gesture has
     * one. Only directional effects such as the whip pan read it; gestures
     * without a direction omit it and the effect receives zero.
     */
    direction?: number;
}

/** What a detector is given on each tracked frame. */
export interface DetectorContext {
    /** Current timestamp from `performance.now()`. */
    now: number;

    /** The hand as of this frame. */
    current: HandFrame;

    /**
     * Recent frames for this hand, oldest first, with `current` last.
     *
     * Bounded by `TRACKING.historyLength`. Detectors that measure motion read
     * this rather than retaining their own copies.
     */
    history: readonly HandFrame[];
}

/** One detector's state machine, owned by one hand. */
export interface DetectorInstance {
    /** Called once per tracked frame. Returns a trigger, or null. */
    update(context: DetectorContext): GestureTrigger | null;

    /** Called when the hand leaves the frame, or when recording restarts. */
    reset(): void;
}

/** The registrable description of a gesture. */
export interface GestureDetector {
    readonly id: GestureId;

    /** Short name shown in the gesture legend. */
    readonly label: string;

    /** The movement to perform, written as an instruction to the user. */
    readonly instruction: string;

    /** The effect fired when this gesture is recognised. */
    readonly effectId: EffectId;

    /** Minimum interval between two triggers of this gesture, in milliseconds. */
    readonly cooldownMs: number;

    /** Constructs an independent state machine for one hand. */
    create(): DetectorInstance;
}
