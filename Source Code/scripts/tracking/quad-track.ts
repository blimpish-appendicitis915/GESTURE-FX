/**
 * File: scripts/tracking/quad-track.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: September 1 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * Records where the finger frame was, for the whole of a take, so the window
 * can be drawn again later over a different picture.
 *
 * Why the geometry has to be kept
 * -------------------------------
 * The restyle path records the raw camera and sends it away to be redrawn. The
 * window is not in that recording, and the hands that defined it are no longer
 * being tracked by the time the restyled clip comes back. Compositing then
 * needs the quad at every instant of the take, and the only moment it is known
 * is while the take is running.
 *
 * Re-running the tracker over the finished recording would be the alternative.
 * It is worse: it costs a second full pass of inference, and it can disagree
 * with what the user saw, because the live pass had the benefit of temporal
 * state the second pass would have to rebuild from a compressed video.
 *
 * Interpolation
 * -------------
 * Samples arrive at whatever rate the display refreshes. The composite runs at
 * a fixed rate that is not the same one, so a sample is almost never asked for
 * at a time it was taken. Corners are therefore interpolated linearly between
 * the two samples that bracket the request, which is correct here because the
 * corners are already smoothed and a straight line between two smoothed points
 * is closer to the truth than the nearer of the two.
 *
 * The track is small. Ten seconds at 60 Hz is six hundred samples of four
 * points, well under a hundred kilobytes, and it never leaves the page.
 */

import type { Vec2 } from '../core/geometry';
import type { FrameQuad } from './frame-quad';

/** One observation: where the window was, and when. */
interface Sample {
    /** Milliseconds since the take began. */
    t: number;
    corners: Vec2[];
    presence: number;
}

export class QuadTrack {
    private samples: Sample[] = [];
    private origin = 0;

    /** Discards any previous take and marks the start of a new one. */
    begin(now: number): void {
        this.samples = [];
        this.origin = now;
    }

    get length(): number {
        return this.samples.length;
    }

    /** Whether the window was open at any point during the take. */
    get everOpened(): boolean {
        return this.samples.some((sample) => sample.presence > 0.01);
    }

    /**
     * Records the window at this instant.
     *
     * A closed window is recorded as a zero presence rather than skipped. The
     * absence of a sample would otherwise be indistinguishable from a dropped
     * frame, and interpolation across the gap would fade the window through the
     * moment it was actually shut.
     *
     * A run of closed frames is stored as its two ends rather than as every
     * frame in it, and rather than as its first frame alone. Both ends are
     * needed: keeping only the first would leave the next open sample adjacent
     * to a point seconds earlier, and the window would then be interpolated into
     * existence across the whole of a stretch it was shut for.
     */
    capture(quad: FrameQuad | null, now: number): void {
        const t = now - this.origin;

        if (!quad || quad.presence <= 0) {
            const count = this.samples.length;
            const last = this.samples[count - 1];
            const previous = this.samples[count - 2];

            // Already two closed samples: extend the run rather than growing it.
            if (last?.presence === 0 && previous?.presence === 0) {
                last.t = t;
                return;
            }

            this.samples.push({ t, corners: last ? last.corners : blank(), presence: 0 });

            return;
        }

        this.samples.push({
            t,
            corners: quad.corners.map((corner) => ({ x: corner.x, y: corner.y })),
            presence: quad.presence,
        });
    }

    /**
     * The window at a time within the take, or null if it was shut then.
     *
     * Times before the first sample and after the last resolve to the nearest
     * end rather than to nothing, because a composite frame at t = 0 would
     * otherwise fall off the front of a track whose first sample is at 8 ms.
     */
    at(t: number): FrameQuad | null {
        if (this.samples.length === 0) {
            return null;
        }

        if (t <= this.samples[0].t) {
            return toQuad(this.samples[0]);
        }

        const last = this.samples[this.samples.length - 1];

        if (t >= last.t) {
            return toQuad(last);
        }

        const index = this.bracket(t);
        const before = this.samples[index];
        const after = this.samples[index + 1];

        const span = after.t - before.t;
        const fraction = span > 0 ? (t - before.t) / span : 0;

        // A closed window at either end of the interval is not blended toward
        // the open one. The presence fade already covers opening and closing,
        // and interpolating geometry against a blank corner set would drag the
        // window toward the origin as it shut.
        if (before.presence === 0 || after.presence === 0) {
            return toQuad(before.presence === 0 ? after : before, fraction, before, after);
        }

        return {
            corners: before.corners.map((corner, i) => ({
                x: corner.x + (after.corners[i].x - corner.x) * fraction,
                y: corner.y + (after.corners[i].y - corner.y) * fraction,
            })),
            presence: before.presence + (after.presence - before.presence) * fraction,
        };
    }

    /** Binary search for the sample at or before t. */
    private bracket(t: number): number {
        let low = 0;
        let high = this.samples.length - 1;

        while (low < high) {
            const middle = (low + high + 1) >> 1;

            if (this.samples[middle].t <= t) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }

        return Math.min(low, this.samples.length - 2);
    }
}

/**
 * A quad from one sample, with the presence alone interpolated when the
 * interval spans an opening or a closing.
 */
function toQuad(sample: Sample, fraction?: number, before?: Sample, after?: Sample): FrameQuad | null {
    const presence = fraction === undefined || !before || !after
        ? sample.presence
        : before.presence + (after.presence - before.presence) * fraction;

    if (presence <= 0.001) {
        return null;
    }

    return { corners: sample.corners, presence };
}

function blank(): Vec2[] {
    return [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
    ];
}
