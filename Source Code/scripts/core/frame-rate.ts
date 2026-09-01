/**
 * File: scripts/core/frame-rate.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * A frame rate meter for the diagnostics readout beside the gesture list.
 *
 * The reading is smoothed with an exponential moving average rather than
 * counting frames across a fixed second. A per-second count updates too slowly
 * to show the cost of a gesture firing, and an unsmoothed instantaneous figure
 * fluctuates too quickly to read. The average settles within a few frames and
 * still moves visibly when the load changes.
 *
 * This exists because the honest answer to "will this run on my phone" is a
 * number the visitor can watch, not a claim in a README.
 */

/** Weight given to each new sample. Lower is smoother and slower to react. */
const SMOOTHING = 0.1;

export class FrameRateMeter {
    private lastFrameAt = 0;
    private average = 0;

    /** Records a frame and returns the current smoothed rate. */
    sample(now: number): number {
        if (this.lastFrameAt === 0) {
            this.lastFrameAt = now;
            return this.average;
        }

        const delta = now - this.lastFrameAt;
        this.lastFrameAt = now;

        // A tab restored from the background reports an enormous gap. Folding
        // it into the average would peg the reading near zero for seconds.
        if (delta <= 0 || delta > 1000) {
            return this.average;
        }

        const instant = 1000 / delta;

        this.average = this.average === 0
            ? instant
            : this.average + (instant - this.average) * SMOOTHING;

        return this.average;
    }

    get value(): number {
        return this.average;
    }

    reset(): void {
        this.lastFrameAt = 0;
        this.average = 0;
    }
}
