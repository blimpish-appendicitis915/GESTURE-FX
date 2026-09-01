/**
 * File: scripts/gestures/recording-cue.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: September 1 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * Starts and stops a take from a held hand pose.
 *
 * The gesture this application is built around occupies both hands, so the
 * record button is the one control the subject cannot reach while doing the
 * thing they are recording. Voice solves that when the browser offers speech
 * recognition and the user is willing to send audio to its vendor. This solves
 * the same problem without either condition: it is the camera, on the device,
 * and it works in a browser that has no speech interface at all.
 *
 * Two poses, chosen to be things nobody does by accident
 * -----------------------------------------------------
 * A ring, the thumb and index tips meeting with the other three fingers
 * extended, starts a take. An open palm held still, all five fingers spread,
 * ends it.
 *
 * Neither collides with the five gestures bound to effects. A ring is not a
 * flip, a swipe, a fist, a push or a V, and the three raised fingers separate
 * it from a merely relaxed hand. A held open palm is distinguishable from the
 * palm flip, which is defined by a sign change rather than a pose, and from the
 * palm push, which requires motion toward the camera. It is also disjoint from
 * the two-hand frame, where the thumb lies across the palm rather than meeting
 * the index and where the ring and little fingers are curled.
 *
 * Why a pose must be held
 * ----------------------
 * A hand passes through many shapes on its way between two others, and several
 * of those shapes are momentarily a ring. Requiring the pose to persist for a
 * fixed time turns a shape the hand passes through into a shape the hand is
 * put into, which is the difference between a control and a hazard. The hold
 * is counted in observed frames as well as elapsed time, so a pose cannot be
 * inferred from two sightings far apart. A frame on which the tracker made no
 * observation at all is neither: it is skipped, because the alternative is a
 * hold that the tracker's own rate limit resets before it can complete.
 *
 * Why there is a lock-out after firing
 * -----------------------------------
 * The hand is still in the pose the moment after it fires, and the pose that
 * ends a take is one the hand may well still be in when the take ends. Without
 * a lock-out a single held palm would stop a take and the release would be read
 * as the start of the next one.
 */

import { RECORDING_GESTURES } from '../config';
import { isRing, isStopPalm } from '../tracking/features';
import type { HandFrame, TrackingFrame } from '../tracking/landmarks';

/** What the pose asks the recorder to do. */
export type RecordingCue = 'start' | 'stop';

/** The pose being held, or none. */
type Pose = 'ring' | 'palm' | null;

export class RecordingCueDetector {
    /** The pose currently being held, and when it was first seen. */
    private pose: Pose = null;
    private heldSince = 0;

    /** Frames the current pose has been seen on, consecutively. */
    private frames = 0;

    /** When the last cue fired, for the lock-out. */
    private firedAt = 0;

    /** Forgets any pose in progress. Called whenever a take begins or ends. */
    reset(now: number): void {
        this.pose = null;
        this.heldSince = 0;
        this.frames = 0;
        this.firedAt = now;
    }

    /**
     * How far through the hold the current pose is, in [0, 1].
     *
     * The interface draws this, because a control with a delay and no progress
     * reads as a control that is not working.
     */
    progress(now: number): number {
        if (this.pose === null || this.heldSince === 0) {
            return 0;
        }

        const elapsed = now - this.heldSince;

        return Math.max(0, Math.min(1, elapsed / RECORDING_GESTURES.holdMs));
    }

    /** The pose being held, for the interface to name. */
    get held(): Pose {
        return this.pose;
    }

    /**
     * Reads one tracking frame and reports a cue on the frame the hold completes.
     *
     * `recording` decides which pose is meaningful: only a ring can start a
     * take and only a palm can end one, so the pose that is not currently
     * useful is never even a candidate. That halves the surface on which a
     * false positive can occur, and it means the palm a user is holding while
     * recording cannot start a second take.
     */
    update(tracking: TrackingFrame | null, now: number, recording: boolean): RecordingCue | null {
        // A null frame is the tracker staying inside its rate budget, not the
        // hand leaving. Inference is capped at 24 Hz while this is called at the
        // display refresh rate, so most frames are null; treating one as an
        // absence clears the hold several times a second and makes it
        // unreachable. Nothing is observed, so nothing changes.
        if (!tracking) {
            return null;
        }

        if (tracking.hands.length === 0) {
            this.pose = null;
            this.frames = 0;

            return null;
        }

        if (now - this.firedAt < RECORDING_GESTURES.lockoutMs) {
            // Still in the lock-out. The pose is cleared rather than tracked,
            // so the hold starts from zero once the lock-out ends.
            this.pose = null;
            this.frames = 0;

            return null;
        }

        const wanted: Pose = recording ? 'palm' : 'ring';
        const showing = this.poseOf(tracking.hands, wanted);

        if (showing !== wanted) {
            this.pose = null;
            this.frames = 0;

            return null;
        }

        if (this.pose !== wanted) {
            this.pose = wanted;
            this.heldSince = now;
            this.frames = 0;
        }

        this.frames += 1;

        const longEnough = now - this.heldSince >= RECORDING_GESTURES.holdMs;
        const steadyEnough = this.frames >= RECORDING_GESTURES.minimumFrames;

        if (!longEnough || !steadyEnough) {
            return null;
        }

        this.firedAt = now;
        this.pose = null;
        this.frames = 0;

        return recording ? 'stop' : 'start';
    }

    /**
     * Whether any tracked hand is holding the pose being looked for.
     *
     * Either hand will do. Requiring a particular one would make the feature
     * useless to half its users, and requiring both would make it impossible
     * while the other hand is doing anything at all.
     */
    private poseOf(hands: readonly HandFrame[], wanted: Pose): Pose {
        for (const hand of hands) {
            if (wanted === 'ring' && isRing(hand.features)) {
                return 'ring';
            }

            // A palm must not also be a ring. For a real hand the two cannot
            // coincide, because a ring curls the index down to meet the thumb
            // and an open palm needs four fingers up. That is a consequence of
            // two thresholds rather than a rule, so the rule is stated here:
            // the pose that ends a take must never be satisfied by the pose
            // that starts one.
            if (wanted === 'palm' && isStopPalm(hand.features) && !isRing(hand.features)) {
                return 'palm';
            }
        }

        return null;
    }
}
