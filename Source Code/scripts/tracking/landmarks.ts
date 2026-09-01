/**
 * File: scripts/tracking/landmarks.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), MediaPipe Hand Landmarker
 *
 * Description:
 * Type definitions for the hand tracking layer, together with named indices
 * into MediaPipe's 21-point hand model.
 *
 * The named indices exist so that no detector contains a bare array subscript.
 * `landmarks[LANDMARK.INDEX_MCP]` states what is being read; `landmarks[5]`
 * does not, and a wrong number in a detector is invisible during review.
 */

/** One landmark in normalised image coordinates, with relative depth in z. */
export interface Landmark {
    x: number;
    y: number;
    z: number;
}

export type Handedness = 'Left' | 'Right';

/**
 * Indices into the MediaPipe hand landmark model.
 *
 * The model emits the wrist first, then each digit from thumb to little finger,
 * and within a digit from the knuckle outward to the tip.
 */
export const LANDMARK = {
    WRIST: 0,

    THUMB_CMC: 1,
    THUMB_MCP: 2,
    THUMB_IP: 3,
    THUMB_TIP: 4,

    INDEX_MCP: 5,
    INDEX_PIP: 6,
    INDEX_DIP: 7,
    INDEX_TIP: 8,

    MIDDLE_MCP: 9,
    MIDDLE_PIP: 10,
    MIDDLE_DIP: 11,
    MIDDLE_TIP: 12,

    RING_MCP: 13,
    RING_PIP: 14,
    RING_DIP: 15,
    RING_TIP: 16,

    PINKY_MCP: 17,
    PINKY_PIP: 18,
    PINKY_DIP: 19,
    PINKY_TIP: 20,
} as const;

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

/**
 * Scale and rotation invariant descriptors, computed once per hand per frame.
 *
 * Detectors read only these, never raw landmarks. That boundary is what allows
 * a threshold tuned against one webcam to hold for a different hand size, a
 * different distance from the lens and a different capture resolution.
 */
export interface HandFeatures {
    /**
     * Signed palm orientation in [-1, 1], the load-bearing feature of this
     * project.
     *
     * It is the two-dimensional cross product of (INDEX_MCP - WRIST) and
     * (PINKY_MCP - WRIST) divided by the product of their lengths, which is the
     * sine of the angle between those palm edges as projected onto the image.
     *
     * Its sign is the winding order of that triangle in projection. Rotating a
     * hand past edge-on reverses the winding, so the sign changes. Its
     * magnitude falls toward zero at that same instant, because an edge-on palm
     * projects to a line.
     *
     * A flip is therefore a zero crossing of a single scalar, which is both
     * cheaper and more reliable than classifying two poses and comparing them.
     * The derivation is set out in docs/GESTURES.md.
     */
    palmSign: number;

    /** Wrist to middle knuckle. The unit every other distance is divided by. */
    span: number;

    /** Palm centroid, in normalised image coordinates. */
    centre: { x: number; y: number };

    /** In-plane hand rotation in radians, from the wrist to the middle knuckle. */
    angle: number;

    /** Per-finger extension as a ratio of span. Roughly 0.5 curled, 1.0 straight. */
    extension: Record<FingerName, number>;

    /** How many fingers are extended, from 0 to 5. */
    extendedCount: number;

    /** Fingertip separation relative to span, which separates a spread palm. */
    spread: number;

    /**
     * Index to middle fingertip separation, in hand spans.
     *
     * Distinguishes a deliberate V from two fingers held together, which the
     * projection produces from an open palm seen at an angle.
     */
    victorySeparation: number;

    /** Fraction of the frame covered by the hand's bounding box. */
    coverage: number;
}

/** A single tracked hand at a single instant. */
export interface HandFrame {
    /** Timestamp from `performance.now()`, in milliseconds. */
    t: number;
    handedness: Handedness;
    landmarks: readonly Landmark[];
    features: HandFeatures;
}

/** The result of one inference pass over one video frame. */
export interface TrackingFrame {
    t: number;
    hands: readonly HandFrame[];
}
