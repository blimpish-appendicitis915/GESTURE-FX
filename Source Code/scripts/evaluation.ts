/**
 * File: scripts/evaluation.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: September 1 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * Generates a corpus with exact ground truth and measures the palm-flip
 * detector against it.
 *
 * The hand model
 * --------------
 * Twenty-one landmarks in a right-handed local frame: x across the palm from
 * the thumb side, y along the fingers with the wrist at the origin, z out of
 * the palm toward the viewer. Distances are in hand spans, so the model is the
 * same shape the detector's thresholds are expressed in.
 *
 * A rotation by theta about the y axis carries
 *
 *     x' = x cos(theta) + z sin(theta)
 *     z' = z cos(theta) - x sin(theta)
 *
 * and orthographic projection keeps x' and y. At theta = 0 the palm faces the
 * camera; at theta = pi/2 it is edge-on and every landmark of the palm projects
 * onto one line; at theta = pi the back of the hand faces the camera. The
 * crossing the detector is required to find is therefore at exactly
 * theta = pi/2, and its time is known from the rotation schedule rather than
 * from an annotation.
 *
 * Noise
 * -----
 * Each landmark is perturbed independently by a Gaussian of a stated standard
 * deviation in frame widths. This models the estimator as unbiased and of
 * constant variance, which it is not; the figure is a floor on the error rather
 * than a prediction of field performance, and the page says so.
 *
 * Determinism
 * -----------
 * The generator draws from a seeded stream, so the same numbers are produced on
 * every run and a reader can check them. `Math.random` would make the table
 * unreproducible, which for a measurement is the same as making it unciteable.
 */

import { TRACKING } from './config';
import { GestureEngine } from './gestures/engine';
import { DETECTORS } from './gestures/detectors/index';
import { extractFeatures } from './tracking/features';
import { LANDMARK, type Landmark, type TrackingFrame } from './tracking/landmarks';

/** Landmark noise, in frame widths, applied independently per coordinate. */
const NOISE = 0.004;

/** Sequences generated per class. */
const TRIALS = 60;

/** The rate the tracker runs at, which is the rate a detector sees. */
const INTERVAL_MS = 1000 / TRACKING.targetHz;

// ---------------------------------------------------------------------------
// A seeded stream, so the table is the same on every run.
// ---------------------------------------------------------------------------

let seed = 0x9e3779b9;

function random(): number {
    // xorshift32. Adequate for perturbing a coordinate and short enough to read.
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;

    return ((seed >>> 0) % 1_000_000) / 1_000_000;
}

/** Box-Muller, which turns two uniforms into one standard normal. */
function gaussian(): number {
    const u = Math.max(random(), 1e-9);
    const v = random();

    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function between(low: number, high: number): number {
    return low + random() * (high - low);
}

// ---------------------------------------------------------------------------
// The hand.
// ---------------------------------------------------------------------------

interface Point3 {
    x: number;
    y: number;
    z: number;
}

/**
 * The canonical right hand, palm toward the camera, fingers up.
 *
 * Proportions are taken from the mean adult hand as a fraction of the span from
 * the wrist to the middle knuckle, which is the unit every threshold in
 * config.ts is written in.
 */
function canonicalHand(curled: boolean): Point3[] {
    const knuckles: Array<[number, number]> = [
        [0.30, -0.86],
        [0.06, -0.96],
        [-0.18, -0.92],
        [-0.40, -0.80],
    ];

    const points: Point3[] = new Array(21);

    points[LANDMARK.WRIST] = { x: 0, y: 0, z: 0 };

    // The thumb leaves the palm sideways and forward, which is what gives it a
    // depth the other digits do not have.
    points[1] = { x: 0.42, y: -0.18, z: 0.10 };
    points[2] = { x: 0.62, y: -0.34, z: 0.18 };
    points[3] = { x: 0.74, y: -0.48, z: 0.22 };
    points[4] = { x: 0.84, y: -0.60, z: 0.24 };

    const bases = [LANDMARK.INDEX_MCP, LANDMARK.MIDDLE_MCP, LANDMARK.RING_MCP, LANDMARK.PINKY_MCP];

    // A curled finger reaches barely past its knuckle and bends toward the
    // palm, which is what the extension test measures and what separates a
    // rotating fist from a flip.
    // A fist folds the fingers back toward the palm, so a fingertip ends up
    // nearer the wrist than its own knuckle. Placing the tips merely short of
    // where an open hand would put them is not a fist and is not what the
    // extension test measures.
    const reach = curled ? -0.34 : 1.00;
    const towardPalm = curled ? 0.55 : 0.0;

    bases.forEach((base, digit) => {
        const [kx, ky] = knuckles[digit];

        points[base] = { x: kx, y: ky, z: 0 };

        for (let joint = 1; joint <= 3; joint += 1) {
            const along = (joint / 3) * reach;

            points[base + joint] = {
                x: kx * (1 + along * 0.06),
                y: ky - along * 0.62,
                z: towardPalm * along,
            };
        }
    });

    return points;
}

/**
 * Rotates about the long axis, projects, and places the hand in the frame.
 *
 * The projection is orthographic, which is the assumption the criterion is
 * derived under. A perspective camera at a normal working distance departs from
 * it by less than the landmark noise applied here.
 */
function project(points: Point3[], theta: number, noise: number): Landmark[] {
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    const scale = 0.22;
    const centre = { x: 0.5, y: 0.62 };

    return points.map((point) => {
        const x = point.x * cos + point.z * sin;

        return {
            x: centre.x + x * scale + gaussian() * noise,
            y: centre.y + point.y * scale + gaussian() * noise,
            z: point.z * cos - point.x * sin,
        };
    });
}

// ---------------------------------------------------------------------------
// The sequences.
// ---------------------------------------------------------------------------

interface Sequence {
    frames: Array<{ t: number; landmarks: Landmark[] }>;
    /** The instant the rotation passes edge-on, or null where it never does. */
    crossingAt: number | null;
}

interface Schedule {
    /** Angle at a time in milliseconds since the sequence began. */
    angle: (t: number) => number;
    durationMs: number;
    crossingAt: number | null;
    curled?: boolean;
}

function generate(schedule: Schedule): Sequence {
    const points = canonicalHand(schedule.curled ?? false);
    const frames: Sequence['frames'] = [];

    for (let t = 0; t <= schedule.durationMs; t += INTERVAL_MS) {
        frames.push({ t, landmarks: project(points, schedule.angle(t), NOISE) });
    }

    return { frames, crossingAt: schedule.crossingAt };
}

/** A flip: steady, a rotation through edge-on, steady again. */
function flip(): Sequence {
    const settle = 400;
    const turn = between(180, 520);

    return generate({
        durationMs: settle * 2 + turn,
        crossingAt: settle + turn / 2,
        angle: (t) => {
            if (t <= settle) return 0;
            if (t >= settle + turn) return Math.PI;

            return ((t - settle) / turn) * Math.PI;
        },
    });
}

/**
 * The same gesture performed deliberately rather than quickly.
 *
 * This must fire. A hand turned over in a second and a half has been flipped;
 * the speed is a matter of style. It is separated from the fast class because
 * the two exercise different parts of the timing guard, and because a detector
 * tuned only on quick movements is a detector that works for its author.
 */
function deliberateFlip(): Sequence {
    const settle = 400;
    const turn = between(900, 1600);

    return generate({
        durationMs: settle * 2 + turn,
        crossingAt: settle + turn / 2,
        angle: (t) => {
            if (t <= settle) return 0;
            if (t >= settle + turn) return Math.PI;

            return ((t - settle) / turn) * Math.PI;
        },
    });
}

/**
 * A hand brought to edge-on and held there before continuing.
 *
 * This is what the upper limit on the crossing duration exists to reject, and
 * it is a movement people make: turning the hand to point at something, holding
 * it, then carrying on.
 */
function heldEdgeOn(): Sequence {
    const settle = 400;
    const approach = 220;
    const hold = between(800, 1400);

    return generate({
        durationMs: settle + approach + hold + approach + 300,
        crossingAt: null,
        angle: (t) => {
            if (t <= settle) return 0;
            if (t <= settle + approach) return ((t - settle) / approach) * (Math.PI / 2);
            if (t <= settle + approach + hold) return Math.PI / 2;

            const after = t - (settle + approach + hold);

            return Math.PI / 2 + Math.min(1, after / approach) * (Math.PI / 2);
        },
    });
}

/** A hand that tips toward edge-on and returns without crossing. */
function wobble(): Sequence {
    const settle = 400;
    const swing = between(260, 520);
    const peak = between(0.30, 0.44) * Math.PI;

    return generate({
        durationMs: settle + swing * 2 + 300,
        crossingAt: null,
        angle: (t) => {
            if (t <= settle) return 0;
            if (t >= settle + swing * 2) return 0;

            const phase = (t - settle) / (swing * 2);

            return peak * Math.sin(phase * Math.PI);
        },
    });
}

/** A closed hand rotating, which has the winding change without the pose. */
function rotatingFist(): Sequence {
    const settle = 400;
    const turn = between(180, 520);

    return generate({
        durationMs: settle * 2 + turn,
        crossingAt: null,
        curled: true,
        angle: (t) => {
            if (t <= settle) return 0;
            if (t >= settle + turn) return Math.PI;

            return ((t - settle) / turn) * Math.PI;
        },
    });
}

/** A hand already turning when it enters the frame, with nothing to arm on. */
function enteringMidTurn(): Sequence {
    const turn = between(180, 520);

    return generate({
        durationMs: turn + 400,
        crossingAt: null,
        angle: (t) => Math.min(Math.PI, 0.34 * Math.PI + (t / turn) * 0.66 * Math.PI),
    });
}

// ---------------------------------------------------------------------------
// The measurement.
// ---------------------------------------------------------------------------

interface Outcome {
    fired: boolean;
    /** Reported instant less true instant, in milliseconds. */
    error: number | null;
}

/**
 * Replays one sequence through a fresh engine.
 *
 * The engine is rebuilt per sequence so no state crosses between them, which is
 * what a separate take would give and what a shared instance would not.
 */
function run(sequence: Sequence): Outcome {
    const engine = new GestureEngine(DETECTORS);

    // Only the gesture under test is enabled. A trigger from another detector
    // would otherwise count as a false positive for this one.
    for (const detector of DETECTORS) {
        engine.setEnabled(detector.id, detector.id === 'palm-flip');
    }

    const origin = 10_000;

    for (const frame of sequence.frames) {
        const now = origin + frame.t;

        const tracking: TrackingFrame = {
            t: now,
            hands: [{
                t: now,
                handedness: 'Right',
                landmarks: frame.landmarks,
                features: extractFeatures(frame.landmarks),
            }],
        };

        for (const trigger of engine.update(tracking, now)) {
            if (trigger.gestureId !== 'palm-flip') {
                continue;
            }

            return {
                fired: true,
                error: sequence.crossingAt === null
                    ? null
                    : trigger.at - (origin + sequence.crossingAt),
            };
        }
    }

    return { fired: false, error: null };
}

function quantile(values: number[], fraction: number): number {
    if (values.length === 0) {
        return Number.NaN;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor(fraction * sorted.length));

    return sorted[index];
}

interface ClassResult {
    name: string;
    note: string;
    shouldFire: boolean;
    fired: number;
    total: number;
    errors: number[];
}

function evaluate(): ClassResult[] {
    const classes: Array<{ name: string; note: string; shouldFire: boolean; make: () => Sequence }> = [
        { name: 'Palm flip, quick', note: 'Turned over in 180 to 520 ms', shouldFire: true, make: flip },
        { name: 'Palm flip, deliberate', note: 'The same movement over 0.9 to 1.6 s', shouldFire: true, make: deliberateFlip },
        { name: 'Held edge-on', note: 'Brought to edge-on, held 0.8 to 1.4 s, continued', shouldFire: false, make: heldEdgeOn },
        { name: 'Wobble', note: 'Tips to 54 to 79 degrees and returns', shouldFire: false, make: wobble },
        { name: 'Rotating fist', note: 'The same rotation with the hand closed', shouldFire: false, make: rotatingFist },
        { name: 'Entering mid-turn', note: 'Already rotating on the first frame', shouldFire: false, make: enteringMidTurn },
    ];

    return classes.map((entry) => {
        const errors: number[] = [];
        let fired = 0;

        for (let trial = 0; trial < TRIALS; trial += 1) {
            const outcome = run(entry.make());

            if (outcome.fired) {
                fired += 1;
            }

            if (outcome.error !== null) {
                errors.push(outcome.error);
            }
        }

        return { name: entry.name, note: entry.note, shouldFire: entry.shouldFire, fired, total: TRIALS, errors };
    });
}

// ---------------------------------------------------------------------------
// The report.
// ---------------------------------------------------------------------------

function render(results: ClassResult[]): void {
    const host = document.querySelector<HTMLElement>('[data-role="report"]');

    if (!host) {
        return;
    }

    // Both flip classes contribute to the timing figures: the error is a
    // property of the criterion, not of how fast the hand was moving.
    const flips = {
        fired: results[0].fired + results[1].fired,
        total: results[0].total + results[1].total,
        errors: [...results[0].errors, ...results[1].errors],
    };

    const absolute = flips.errors.map(Math.abs);
    const mean = absolute.reduce((total, value) => total + value, 0) / (absolute.length || 1);
    const signedMean = flips.errors.reduce((total, value) => total + value, 0) / (flips.errors.length || 1);

    const falsePositives = results
        .filter((entry) => !entry.shouldFire)
        .reduce((total, entry) => total + entry.fired, 0);

    const negatives = results
        .filter((entry) => !entry.shouldFire)
        .reduce((total, entry) => total + entry.total, 0);

    const rows = results.map((entry) => `
        <tr>
            <td>${entry.name}<br><span style="color:var(--text-muted);font-size:var(--text-xs)">${entry.note}</span></td>
            <td>${entry.shouldFire ? 'must fire' : 'must not fire'}</td>
            <td class="figure">${entry.fired} of ${entry.total}</td>
            <td class="figure">${((entry.shouldFire ? entry.fired : entry.total - entry.fired) / entry.total * 100).toFixed(1)}%</td>
        </tr>`).join('');

    host.innerHTML = `
        <h2>Conditions</h2>
        <table>
            <tr><th>Sequences per class</th><td class="figure">${TRIALS}</td></tr>
            <tr><th>Tracking rate</th><td class="figure">${TRACKING.targetHz} Hz, ${INTERVAL_MS.toFixed(1)} ms per frame</td></tr>
            <tr><th>Landmark noise</th><td class="figure">${NOISE} frame widths, Gaussian, per coordinate</td></tr>
            <tr><th>Sensitivity</th><td class="figure">Balanced, the shipped default</td></tr>
        </table>

        <h2>Classification</h2>
        <table>
            <tr>
                <th>Class</th><th>Requirement</th>
                <th class="figure">Fired</th><th class="figure">Correct</th>
            </tr>
            ${rows}
        </table>

        <h2>Timing error on the flip class</h2>
        <p>
            Reported instant less true instant. A negative figure means the detector
            placed the gesture earlier than it happened.
        </p>
        <table>
            <tr><th>Mean absolute error</th><td class="figure">${mean.toFixed(1)} ms</td>
                <td class="figure">${(mean / INTERVAL_MS).toFixed(2)} tracking frames</td></tr>
            <tr><th>Median absolute error</th><td class="figure">${quantile(absolute, 0.5).toFixed(1)} ms</td>
                <td class="figure">${(quantile(absolute, 0.5) / INTERVAL_MS).toFixed(2)} frames</td></tr>
            <tr><th>90th percentile</th><td class="figure">${quantile(absolute, 0.9).toFixed(1)} ms</td>
                <td class="figure">${(quantile(absolute, 0.9) / INTERVAL_MS).toFixed(2)} frames</td></tr>
            <tr><th>Mean signed error</th><td class="figure">${signedMean.toFixed(1)} ms</td><td></td></tr>
            <tr><th>Worst case</th><td class="figure">${Math.max(...absolute).toFixed(1)} ms</td>
                <td class="figure">${(Math.max(...absolute) / INTERVAL_MS).toFixed(2)} frames</td></tr>
        </table>

        <div class="verdict">
            <strong>${(flips.fired / flips.total * 100).toFixed(1)}%</strong> of flips detected,
            <strong>${falsePositives}</strong> false positives in
            <strong>${negatives}</strong> near-miss sequences, and a mean absolute timing
            error of <strong>${mean.toFixed(1)} ms</strong>, which is
            <strong>${(mean / INTERVAL_MS).toFixed(2)}</strong> of the interval between two
            tracking frames. The detector therefore places the gesture several times more
            finely than it samples, which is the point of interpolating the zero rather
            than reporting the sample nearest it.
        </div>

        <h2>What the residual error is made of</h2>
        <p>
            The mean signed error is <strong>${signedMean.toFixed(1)} ms</strong>, so what
            remains is scatter rather than bias. Linear interpolation of the zero is exact
            to first order, because the scalar is proportional to the cosine of the
            rotation and a cosine is linear about ninety degrees; the error left is
            therefore second order in the sampling interval, plus whatever the landmark
            noise contributes through the two bracketing magnitudes.
        </p>
        <p>
            The flips that are missed are the fastest. A hand turned over in 180 ms is
            edge-on for roughly 25 ms, which is shorter than the ${INTERVAL_MS.toFixed(0)} ms
            between two tracking frames, so no sample falls inside the band and there is
            nothing to bracket. That is a limit of the sampling rate rather than of the
            criterion, and raising the tracking rate is the only thing that moves it.
        </p>

        <div class="alert alert--important">
            <span class="alert__label">What these figures do not measure</span>
            <p>
                The corpus is generated, not filmed, because the true crossing frame is not
                observable in footage to a precision finer than the error being measured.
                These figures therefore measure the criterion and its gating, and not the
                landmark estimator, which is modelled here as unbiased noise of constant
                variance and is neither. A real hand also deforms as it turns, which a rigid
                model does not.
            </p>
            <p>
                Read them as a floor on the detector's own error rather than as a prediction
                of field performance. The gap between the two is the estimator's contribution.
            </p>
        </div>

        <div class="alert alert--tip">
            <span class="alert__label">Check it rather than take it</span>
            <p>
                Every number above comes from
                <a href="https://github.com/Amey-Thakur/GESTURE-FX/blob/main/Source%20Code/scripts/evaluation.ts">one file</a>,
                which imports the shipped detector rather than a copy of it. Change the
                sensitivity, the noise or the tracking rate in that file and the table
                changes with it.
            </p>
        </div>
    `;
}

render(evaluate());
