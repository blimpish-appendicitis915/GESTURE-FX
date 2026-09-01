/**
 * File: scripts/tracking/features.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * Converts 21 raw landmarks into the invariant descriptors the gesture layer
 * reasons about, and provides the three static pose tests shared by detectors.
 *
 * Every measurement is divided by hand span rather than by image size. That one
 * decision is what removes hand size, distance from the lens and capture
 * resolution as variables, so a threshold tuned once holds across users and
 * devices without per-device calibration.
 */

import { clamp, cross, distance, magnitude, subtract, type Vec2 } from '../core/geometry';
import {
    LANDMARK,
    type FingerName,
    type HandFeatures,
    type Landmark,
} from './landmarks';

/** A finger counts as extended at or above this tip-to-origin span ratio. */
export const EXTENDED_THRESHOLD = 0.85;

/** A finger counts as curled below this ratio. The gap between the two is */
/** deliberate: a pose is only recognised when it is unambiguous. */
export const CURLED_THRESHOLD = 0.7;

/**
 * How square the palm must be for the two-finger pose to count.
 *
 * `palmSign` passes through zero during any rotation about the hand's long
 * axis, so this threshold excludes the whole of a flip.
 */
export const VICTORY_MINIMUM_PALM_SIGN = 0.28;

/** Index and middle fingertips must be this far apart, in hand spans. */
export const VICTORY_MINIMUM_SEPARATION = 0.45;

/**
 * Each finger, with the joint its extension is measured from.
 *
 * The thumb is measured from the index knuckle rather than the wrist because it
 * folds across the palm instead of toward the wrist, so wrist distance barely
 * changes between an open and a closed thumb.
 */
const FINGERS: ReadonlyArray<{ name: FingerName; tip: number; origin: number }> = [
    { name: 'thumb', tip: LANDMARK.THUMB_TIP, origin: LANDMARK.INDEX_MCP },
    { name: 'index', tip: LANDMARK.INDEX_TIP, origin: LANDMARK.WRIST },
    { name: 'middle', tip: LANDMARK.MIDDLE_TIP, origin: LANDMARK.WRIST },
    { name: 'ring', tip: LANDMARK.RING_TIP, origin: LANDMARK.WRIST },
    { name: 'pinky', tip: LANDMARK.PINKY_TIP, origin: LANDMARK.WRIST },
];

/** The five points averaged to locate the palm centre. */
const PALM_POINTS = [
    LANDMARK.WRIST,
    LANDMARK.INDEX_MCP,
    LANDMARK.MIDDLE_MCP,
    LANDMARK.RING_MCP,
    LANDMARK.PINKY_MCP,
];

export function extractFeatures(landmarks: readonly Landmark[]): HandFeatures {
    const wrist = landmarks[LANDMARK.WRIST] as Vec2;
    const indexKnuckle = landmarks[LANDMARK.INDEX_MCP] as Vec2;
    const middleKnuckle = landmarks[LANDMARK.MIDDLE_MCP] as Vec2;
    const pinkyKnuckle = landmarks[LANDMARK.PINKY_MCP] as Vec2;

    // Hand span: wrist to middle knuckle. This is the reference length for the
    // whole module. It is measured across the palm rather than to a fingertip
    // because it stays constant while the fingers move.
    const span = Math.max(distance(wrist, middleKnuckle), 1e-6);

    const palmSign = computePalmSign(wrist, indexKnuckle, pinkyKnuckle);

    const extension = {} as Record<FingerName, number>;
    let extendedCount = 0;

    for (const finger of FINGERS) {
        const tip = landmarks[finger.tip] as Vec2;
        const origin = landmarks[finger.origin] as Vec2;
        const ratio = distance(tip, origin) / span;

        extension[finger.name] = ratio;

        if (ratio >= EXTENDED_THRESHOLD) {
            extendedCount += 1;
        }
    }

    return {
        palmSign,
        span,
        centre: computeCentre(landmarks),
        angle: Math.atan2(middleKnuckle.y - wrist.y, middleKnuckle.x - wrist.x),
        extension,
        extendedCount,
        spread:
            distance(landmarks[LANDMARK.INDEX_TIP] as Vec2, landmarks[LANDMARK.PINKY_TIP] as Vec2) /
            span,
        victorySeparation:
            distance(landmarks[LANDMARK.INDEX_TIP] as Vec2, landmarks[LANDMARK.MIDDLE_TIP] as Vec2) /
            span,
        coverage: computeCoverage(landmarks),
    };
}

/**
 * The signed, normalised palm orientation described in landmarks.ts.
 *
 * Dividing the cross product by the two edge lengths turns an area into the
 * sine of the angle between the edges, which bounds the result to [-1, 1] and
 * makes the thresholds in config.ts independent of how large the hand appears.
 */
function computePalmSign(wrist: Vec2, indexKnuckle: Vec2, pinkyKnuckle: Vec2): number {
    const toIndex = subtract(indexKnuckle, wrist);
    const toPinky = subtract(pinkyKnuckle, wrist);

    const denominator = magnitude(toIndex) * magnitude(toPinky);

    if (denominator < 1e-6) {
        return 0;
    }

    return clamp(cross(toIndex, toPinky) / denominator, -1, 1);
}

function computeCentre(landmarks: readonly Landmark[]): { x: number; y: number } {
    let x = 0;
    let y = 0;

    for (const index of PALM_POINTS) {
        x += landmarks[index].x;
        y += landmarks[index].y;
    }

    return { x: x / PALM_POINTS.length, y: y / PALM_POINTS.length };
}

function computeCoverage(landmarks: readonly Landmark[]): number {
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;

    for (const point of landmarks) {
        if (point.x < minX) minX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.x > maxX) maxX = point.x;
        if (point.y > maxY) maxY = point.y;
    }

    return clamp((maxX - minX) * (maxY - minY), 0, 1);
}

/** A flat, open, spread hand: the pose a palm flip begins and ends in. */
export function isOpenPalm(features: HandFeatures): boolean {
    return features.extendedCount >= 4 && features.spread > 0.9;
}

/** Every finger curled into the palm. */
export function isFist(features: HandFeatures): boolean {
    const { extension } = features;

    return (
        extension.index < CURLED_THRESHOLD &&
        extension.middle < CURLED_THRESHOLD &&
        extension.ring < CURLED_THRESHOLD &&
        extension.pinky < CURLED_THRESHOLD
    );
}

/**
 * Index and middle extended, ring and little finger curled, palm square to the
 * camera and the two fingers apart.
 *
 * The last two conditions are not decoration. Extension is measured as
 * tip-to-wrist distance over hand span, and the projection compresses
 * displacement along the axis of rotation. The index and middle fingers extend
 * roughly along the hand and are barely affected by a rotation about its long
 * axis; the ring and little fingers are displaced laterally as well, so theirs
 * shrinks sharply.
 *
 * An open palm partway through a flip therefore reads as index and middle
 * extended with ring and little curled, which is this pose exactly. Requiring
 * the palm to be squarely presented excludes the whole rotation window, since
 * `palmSign` passes through zero during any flip. Requiring the two fingertips
 * to be apart removes the remaining cases, where foreshortening brings them
 * together.
 */
export function isVictory(features: HandFeatures): boolean {
    const { extension, palmSign } = features;

    // Not mid-rotation. This is the condition that does the work.
    if (Math.abs(palmSign) < VICTORY_MINIMUM_PALM_SIGN) {
        return false;
    }

    const raised =
        extension.index >= EXTENDED_THRESHOLD &&
        extension.middle >= EXTENDED_THRESHOLD;

    // A wider margin than the shared curled threshold, because these are the
    // two fingers the projection shortens most.
    const folded = extension.ring < 0.62 && extension.pinky < 0.62;

    return raised && folded && features.victorySeparation >= VICTORY_MINIMUM_SEPARATION;
}
