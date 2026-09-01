/**
 * File: scripts/core/geometry.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * Scalar and two-dimensional vector helpers shared by the landmark feature
 * extractor, the gesture detectors and the effect timeline.
 *
 * The two functions that carry the most weight are `cross`, whose sign encodes
 * the winding order that the palm-flip detector depends on, and `envelope`,
 * which shapes every effect so a trigger reads as an impact rather than a fade.
 */

/** A point or direction in normalised image coordinates. */
export interface Vec2 {
    x: number;
    y: number;
}

export function subtract(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x - b.x, y: a.y - b.y };
}

export function magnitude(v: Vec2): number {
    return Math.hypot(v.x, v.y);
}

export function distance(a: Vec2, b: Vec2): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The z component of the three-dimensional cross product of two vectors lifted
 * into the XY plane.
 *
 * Only the sign matters to the gesture layer: it states the winding order of
 * the triangle the two vectors span, and that order reverses the moment a hand
 * rotates past edge-on to the camera.
 */
export function cross(a: Vec2, b: Vec2): number {
    return a.x * b.y - a.y * b.x;
}

export function clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

export function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

/** Maps a value from the given range onto [0, 1], clamped at both ends. */
export function normalise(value: number, min: number, max: number): number {
    if (max === min) return 0;
    return clamp((value - min) / (max - min), 0, 1);
}

/** Cubic ease used to shape effect envelopes and interface transitions. */
export function smoothstep(t: number): number {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
}

/**
 * An attack and decay envelope over [0, 1].
 *
 * The value rises across the first `attack` fraction of an effect's life and
 * falls across the remainder. Effects are driven by this rather than by raw
 * progress so that the peak lands immediately after the trigger, which is what
 * makes a gesture read as having caused the effect.
 */
export function envelope(progress: number, attack = 0.15): number {
    if (progress <= 0 || progress >= 1) {
        return 0;
    }

    if (progress < attack) {
        return smoothstep(progress / attack);
    }

    return 1 - smoothstep((progress - attack) / (1 - attack));
}
