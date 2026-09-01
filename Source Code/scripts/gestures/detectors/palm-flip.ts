/**
 * File: scripts/gestures/detectors/palm-flip.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * Detects a palm flip: an open hand rotating about its own long axis so that
 * the face presented to the camera changes from palm to back, or back to palm.
 *
 * Method
 * ------
 * The detector tracks one scalar, `features.palmSign`, which is the sine of the
 * angle between the two palm edges as projected onto the image, signed by the
 * winding order of the triangle they span with the wrist.
 *
 * Rotating a hand past edge-on reverses that winding, so the scalar changes
 * sign. Because an edge-on palm projects to a line, its magnitude also falls to
 * zero at the same instant. A flip is therefore a zero crossing, and the moment
 * of the crossing is the moment of the flip.
 *
 * That gives an exact trigger instant rather than an interval, which is what
 * this project needs: the effect has to land on the frame the hand turned, not
 * on the frame the software finished deciding.
 *
 * Why not classify two poses
 * --------------------------
 * Recognising "palm forward" and "back forward" as separate classes and firing
 * on the transition requires both classes to be confident, which they are not
 * while the hand is moving fastest and is most motion-blurred. Tracking the
 * crossing needs confidence only before and after the fast part.
 *
 * Rejecting movements that are not flips
 * --------------------------------------
 * Four conditions must all hold, which is what keeps ordinary hand movement
 * from firing the effect:
 *
 *   1. The palm is squarely presented and held steady before the flip begins.
 *   2. At least three fingers are extended, so a rotating fist is excluded.
 *   3. The crossing completes within a bounded interval. Faster is a landmark
 *      glitch; slower is a hand being turned over rather than flipped.
 *   4. The opposite face is reached and settles, rather than the hand wobbling
 *      back to the face it started on.
 *
 * Properties worth noting
 * -----------------------
 * The detector is handedness agnostic, because both hands are treated as a
 * crossing of the same scalar. It is unaffected by the mirroring applied to a
 * selfie camera, because mirroring negates the scalar everywhere and a crossing
 * of a negated signal is still a crossing. It needs no calibration for hand
 * size, because the scalar is a ratio and is already bounded to [-1, 1].
 */

import { GESTURES } from '../../config';
import { clamp } from '../../core/geometry';
import { allowance, hold, threshold } from '../sensitivity';
import type { Handedness } from '../../tracking/landmarks';
import type { DetectorContext, DetectorInstance, GestureDetector, GestureTrigger } from '../types';

const CONFIG = GESTURES.palmFlip;

type Phase =
    /** No steady palm has been seen. */
    | 'idle'
    /** A steady palm is present and a crossing would count. */
    | 'armed'
    /** The palm has gone edge-on and the opposite face is awaited. */
    | 'crossing';

class PalmFlipDetector implements DetectorInstance {
    private phase: Phase = 'idle';

    /** When the current steady palm orientation was first observed. */
    private steadySince = 0;

    /** The sign of `palmSign` while armed, that is, the face first presented. */
    private armedSign = 0;

    /** When the magnitude first fell below the crossing threshold. */
    private crossedAt = 0;

    /**
     * The last sample carrying the armed sign, and the first carrying the
     * opposite one, which bracket the zero.
     *
     * The instant reported to the timeline is interpolated between them rather
     * than taken from either. Dating the gesture to the start of the crossing
     * places it early by about half the time the signal spends near zero, which
     * is tens of milliseconds and is visible: the effect begins before the hand
     * has finished turning.
     */
    private beforeAt = 0;
    private beforeMagnitude = 0;
    private afterAt = 0;
    private afterMagnitude = 0;

    update(context: DetectorContext): GestureTrigger | null {
        const { now, current } = context;
        const { palmSign, extendedCount } = current.features;

        const magnitude = Math.abs(palmSign);
        const sign = Math.sign(palmSign);
        const handIsOpen = extendedCount >= CONFIG.minimumExtendedFingers;

        // A closed hand cannot flip. Rotating a fist produces the same sign
        // change, so this test is what separates the gesture from a wrist turn.
        if (!handIsOpen) {
            this.reset();
            return null;
        }

        this.bracket(now, magnitude, sign);

        switch (this.phase) {
            case 'idle':
                this.trackSteadyPalm(now, magnitude, sign);
                return null;

            case 'armed':
                return this.awaitCrossing(now, magnitude, sign);

            case 'crossing':
                return this.awaitOppositeFace(now, magnitude, sign, current.handedness);

            default:
                return null;
        }
    }

    /**
     * Keeps the two samples that bracket the zero.
     *
     * The one before it is whichever sample most recently carried the armed
     * sign. The one after it is the first to carry the opposite sign once a
     * crossing is under way, and is kept rather than replaced, because a later
     * sample is further from the zero and interpolating against it would be
     * worse than interpolating against the first.
     */
    private bracket(now: number, magnitude: number, sign: number): void {
        if (this.armedSign === 0) {
            return;
        }

        if (sign === this.armedSign) {
            this.beforeAt = now;
            this.beforeMagnitude = magnitude;
            return;
        }

        if (this.phase === 'crossing' && this.afterAt === 0) {
            this.afterAt = now;
            this.afterMagnitude = magnitude;
        }
    }

    /**
     * The instant the scalar passed through zero.
     *
     * Linear interpolation between the bracketing samples. It is exact to first
     * order because s = k cos(theta) and cosine is linear about pi/2, so the
     * error left is second order in the sampling interval rather than first.
     *
     * Falls back to the start of the crossing when no bracket exists, which
     * happens only if the sign changed on the very sample that entered the
     * crossing and no earlier sample was recorded.
     */
    private zeroCrossing(): number {
        if (this.beforeAt === 0 || this.afterAt <= this.beforeAt) {
            return this.crossedAt;
        }

        const span = this.beforeMagnitude + this.afterMagnitude;

        if (span <= 1e-6) {
            return (this.beforeAt + this.afterAt) / 2;
        }

        return this.beforeAt + (this.afterAt - this.beforeAt) * (this.beforeMagnitude / span);
    }

    /**
     * Waits for the palm to sit squarely toward the camera and stay there.
     *
     * The hold requirement is what stops a hand that is already mid-rotation
     * when it enters the frame from arming and firing on the tail of a movement
     * the detector never saw the start of.
     */
    private trackSteadyPalm(now: number, magnitude: number, sign: number): void {
        const isSquare = magnitude >= threshold(CONFIG.armThreshold);

        if (!isSquare) {
            this.steadySince = 0;
            return;
        }

        // A sign change while idle restarts the hold: this is a different face.
        if (this.steadySince === 0 || sign !== this.armedSign) {
            this.steadySince = now;
            this.armedSign = sign;
            return;
        }

        if (now - this.steadySince >= hold(CONFIG.armHoldMs)) {
            this.phase = 'armed';
        }
    }

    /** Armed. Waits for the palm to reach edge-on, which starts the crossing. */
    private awaitCrossing(now: number, magnitude: number, sign: number): null {
        if (magnitude <= allowance(CONFIG.crossThreshold)) {
            this.phase = 'crossing';
            this.crossedAt = now;
            this.afterAt = 0;
            this.afterMagnitude = 0;
            return null;
        }

        // Still square, but now showing the other face without ever passing
        // through edge-on. Tracking dropped frames through the fast part of the
        // rotation, so this is re-armed against the face now visible rather
        // than reported as a flip that was never actually observed.
        if (sign !== this.armedSign && magnitude >= threshold(CONFIG.armThreshold)) {
            this.armedSign = sign;
            this.steadySince = now;
        }

        return null;
    }

    /**
     * Crossing. Confirms the opposite face is reached inside the time window.
     *
     * Returning to the original face means the hand wobbled rather than
     * flipped, and re-arms without firing.
     */
    private awaitOppositeFace(
        now: number,
        magnitude: number,
        sign: number,
        handedness: Handedness,
    ): GestureTrigger | null {
        const elapsed = now - this.crossedAt;

        if (elapsed > allowance(CONFIG.maximumFlipMs)) {
            // The hand stayed edge-on. That is a hand held sideways, not a flip.
            this.reset();
            return null;
        }

        if (magnitude < threshold(CONFIG.confirmThreshold)) {
            // Still turning through the crossing.
            return null;
        }

        if (sign === this.armedSign) {
            this.phase = 'armed';
            this.steadySince = now;
            return null;
        }

        if (elapsed < CONFIG.minimumFlipMs) {
            // Too fast to be a hand. A single frame of bad landmarks can invert
            // the winding, and this is the guard against that.
            this.reset();
            return null;
        }

        const trigger = this.buildTrigger(magnitude, elapsed, handedness);

        // Re-arm against the face now presented, so a flip back is also caught.
        this.phase = 'armed';
        this.armedSign = sign;
        this.steadySince = now;

        return trigger;
    }

    /**
     * Builds the trigger, dated to the zero crossing rather than to now.
     *
     * Confidence blends how decisively the opposite face was reached with how
     * close the rotation was to the middle of the accepted speed range. It
     * drives effect intensity, so a committed flip reads stronger than a
     * marginal one.
     */
    private buildTrigger(
        magnitude: number,
        elapsed: number,
        handedness: Handedness,
    ): GestureTrigger {
        const reach = clamp(magnitude / CONFIG.confirmThreshold, 0, 1);

        const midpoint = (CONFIG.minimumFlipMs + CONFIG.maximumFlipMs) / 2;
        const halfRange = (CONFIG.maximumFlipMs - CONFIG.minimumFlipMs) / 2;
        const speed = 1 - clamp(Math.abs(elapsed - midpoint) / halfRange, 0, 1);

        return {
            gestureId: 'palm-flip',
            effectId: 'glitch',
            at: this.zeroCrossing(),
            handedness,
            confidence: clamp(0.55 * reach + 0.45 * speed, 0, 1),
        };
    }

    reset(): void {
        this.phase = 'idle';
        this.steadySince = 0;
        this.armedSign = 0;
        this.crossedAt = 0;
        this.beforeAt = 0;
        this.beforeMagnitude = 0;
        this.afterAt = 0;
        this.afterMagnitude = 0;
    }
}

export const palmFlip: GestureDetector = {
    id: 'palm-flip',
    label: 'Palm flip',
    instruction: 'Hold an open hand up, then flip it over to show the back.',
    effectId: 'glitch',
    cooldownMs: CONFIG.cooldownMs,
    create: () => new PalmFlipDetector(),
};
