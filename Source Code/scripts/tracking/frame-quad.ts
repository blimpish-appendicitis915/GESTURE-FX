/**
 * File: scripts/tracking/frame-quad.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * Tracks the rectangle a person forms with both hands, which the renderer uses
 * as a window onto a stylised version of the same scene.
 *
 * Prior art: the two-hand framing gesture was popularised in the browser by
 * sophiamyang/finger-frame-effect. That project carries no licence, so nothing
 * here is taken from it; the gesture and the general shape of the problem are
 * the common ground, and this is an independent implementation.
 *
 * Where this one differs, and why
 * -------------------------------
 * It works in normalised coordinates rather than pixels, so a change of output
 * resolution does not change the thresholds.
 *
 * It is driven by elapsed time rather than by frame counts. Tracking in this
 * application is capped at 24 Hz while the display runs at 60 Hz, so a hold or
 * a fade counted in frames would last a different real duration depending on
 * the device. Every duration here is milliseconds, and the smoothing
 * coefficient is rescaled to the actual interval between updates.
 *
 * The output is a quad and a presence value. It is deliberately not a gesture
 * trigger: the frame is a state that persists while the hands hold it, not an
 * event that fires once, so it does not go through the gesture engine.
 */

import { FRAME } from '../config';
import { distance, type Vec2 } from '../core/geometry';
import { LANDMARK, type TrackingFrame } from './landmarks';

/** The tracked window, in normalised image coordinates. */
export interface FrameQuad {
    /**
     * Four corners in anatomical order, each belonging to a specific fingertip
     * for the whole life of the frame.
     *
     * Order is [left index, right index, right thumb, left thumb], where left
     * and right are on-screen wrist positions. Because a corner is always the
     * same fingertip, smoothing can be applied to matching pairs without any
     * correspondence search, and crossing the hands produces a crossed quad
     * that uncrosses by itself rather than a state the tracker has to unpick.
     */
    corners: readonly Vec2[];

    /** Fade value in [0, 1]. The window is drawn at this opacity. */
    presence: number;
}

/** Twice the signed area of a polygon, by the shoelace formula. */
function shoelace(points: readonly Vec2[]): number {
    let total = 0;

    for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        total += a.x * b.y - b.x * a.y;
    }

    return total / 2;
}

/**
 * The area the four points span, independent of the order they are given in.
 *
 * Sorting by angle about the centroid yields the simple polygon through the
 * four points, whose area is what "how big is the frame" means. The anatomical
 * order is kept for rendering; this is only the gate.
 */
function spannedArea(points: readonly Vec2[]): number {
    const centreX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const centreY = points.reduce((sum, p) => sum + p.y, 0) / points.length;

    const ordered = [...points].sort(
        (a, b) => Math.atan2(a.y - centreY, a.x - centreX) - Math.atan2(b.y - centreY, b.x - centreX),
    );

    return Math.abs(shoelace(ordered));
}

export class FingerFrameTracker {
    private corners: Vec2[] | null = null;
    private presence = 0;

    /** True once the window has opened, which relaxes every threshold. */
    private active = false;

    private lastSeenAt = 0;
    private lastUpdateAt = 0;

    /** When the current suspected mis-detection began, or 0. */
    private teleportSince = 0;

    /** The window, or null when nothing should be drawn. */
    get current(): FrameQuad | null {
        if (!this.corners || this.presence <= 0.001) {
            return null;
        }

        return { corners: this.corners, presence: this.presence };
    }

    /**
     * Advances the tracker.
     *
     * `frame` is null when inference was skipped, which is not the same as the
     * hands being gone, so only elapsed time closes the window.
     */
    update(frame: TrackingFrame | null, now: number): void {
        const elapsed = this.lastUpdateAt === 0 ? 16.7 : Math.min(now - this.lastUpdateAt, 250);
        this.lastUpdateAt = now;

        const candidate = frame ? this.detect(frame) : null;

        if (candidate) {
            this.lastSeenAt = now;
            this.accept(candidate, elapsed);
            return;
        }

        // A dropout holds the last window briefly. Hands leave the frame for a
        // few tracked frames constantly, and closing on the first miss makes
        // the window blink throughout a steady hold.
        const missingFor = now - this.lastSeenAt;

        if (this.corners && missingFor <= FRAME.dropoutHoldMs) {
            this.fade(elapsed, 1);
            return;
        }

        this.fade(elapsed, 0);

        if (this.presence <= 0.001) {
            this.corners = null;
            this.active = false;
            this.teleportSince = 0;
        }
    }

    /**
     * Builds the candidate quad, or returns null if the hands are not framing.
     *
     * Both gates carry hysteresis. Opening the window demands an unambiguous
     * gesture; holding it demands much less, because a hand rotating toward the
     * camera foreshortens and would otherwise cross the opening threshold
     * downward and make the window flicker.
     */
    private detect(frame: TrackingFrame): Vec2[] | null {
        if (frame.hands.length !== 2) {
            return null;
        }

        const separationGate = this.active ? FRAME.holdSeparation : FRAME.openSeparation;

        const hands = frame.hands.map((hand) => ({
            index: hand.landmarks[LANDMARK.INDEX_TIP] as Vec2,
            thumb: hand.landmarks[LANDMARK.THUMB_TIP] as Vec2,
            wristX: hand.landmarks[LANDMARK.WRIST].x,
            span: Math.max(hand.features.span, 1e-6),
        }));

        for (const hand of hands) {
            // Span is measured across the palm, so it does not foreshorten with
            // the fingers and remains a fair scale whichever way they point.
            if (distance(hand.thumb, hand.index) / hand.span < separationGate) {
                return null;
            }
        }

        // On-screen position decides which hand is which. Handedness from the
        // model is not used, because it is occasionally wrong and a swap would
        // exchange two corners and tear the window across the screen.
        hands.sort((a, b) => a.wristX - b.wristX);

        const [left, right] = hands;
        const corners = [left.index, right.index, right.thumb, left.thumb];

        const areaGate = this.active ? FRAME.holdArea : FRAME.openArea;

        if (spannedArea(corners) < areaGate) {
            return null;
        }

        return corners.map((point) => ({ x: point.x, y: point.y }));
    }

    /** Smooths the candidate into the tracked corners. */
    private accept(candidate: Vec2[], elapsed: number): void {
        if (!this.corners) {
            this.corners = candidate;
            this.active = true;
            this.teleportSince = 0;
            this.fade(elapsed, 1);
            return;
        }

        const movement =
            this.corners.reduce((sum, corner, i) => sum + distance(corner, candidate[i]), 0) / 4;

        if (this.isSuspectedMisdetection(movement, elapsed)) {
            this.fade(elapsed, 1);
            return;
        }

        this.active = true;

        // Adaptive gain. A corner that has barely moved is smoothed hard, which
        // removes landmark jitter; one that has genuinely moved is followed at
        // high gain, so the window stays on the fingers rather than trailing.
        const speed = Math.min(movement / FRAME.fastMovement, 1);
        const perFrame = FRAME.smoothingSlow + (FRAME.smoothingFast - FRAME.smoothingSlow) * speed;

        // Rescale the per-frame coefficient to the interval that actually
        // elapsed, so smoothing is the same at 24 Hz as at 60 Hz.
        const alpha = 1 - (1 - perFrame) ** (elapsed / 16.667);

        this.corners = this.corners.map((corner, i) => ({
            x: corner.x + (candidate[i].x - corner.x) * alpha,
            y: corner.y + (candidate[i].y - corner.y) * alpha,
        }));

        this.fade(elapsed, 1);
    }

    /**
     * Whether a jump is more likely a tracking error than a hand.
     *
     * Occluded or crossing hands produce single updates in which the landmarks
     * land somewhere else entirely. A hand cannot cross a third of the frame
     * between updates, so a jump that large is rejected until it persists, at
     * which point it was a real movement after all.
     */
    private isSuspectedMisdetection(movement: number, elapsed: number): boolean {
        if (movement <= FRAME.teleportDistance) {
            this.teleportSince = 0;
            return false;
        }

        this.teleportSince += elapsed;

        if (this.teleportSince >= FRAME.teleportConfirmMs) {
            this.teleportSince = 0;
            return false;
        }

        return true;
    }

    /** Moves presence toward the target at the configured rate. */
    private fade(elapsed: number, target: 0 | 1): void {
        const duration = target === 1 ? FRAME.fadeInMs : FRAME.fadeOutMs;
        const step = elapsed / duration;

        this.presence = target === 1
            ? Math.min(1, this.presence + step)
            : Math.max(0, this.presence - step);
    }

    /** Clears everything. Called when a recording starts. */
    reset(): void {
        this.corners = null;
        this.presence = 0;
        this.active = false;
        this.lastSeenAt = 0;
        this.lastUpdateAt = 0;
        this.teleportSince = 0;
    }
}
