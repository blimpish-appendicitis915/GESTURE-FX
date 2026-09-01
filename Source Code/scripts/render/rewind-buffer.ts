/**
 * File: scripts/render/rewind-buffer.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), WebGL 2
 *
 * Description:
 * A circular buffer of recent frames, held on the GPU, which lets an effect cut
 * to what the camera saw a few seconds ago.
 *
 * This exists to answer the one thing a browser cannot otherwise do. The social
 * media trend that prompted this project hides a cut between two separately
 * filmed takes behind a hand flip, so the subject appears to change instantly.
 * No amount of shader work reproduces that, because the information is not in
 * the frame.
 *
 * Retaining the recent past does reproduce it, from the other direction. If the
 * last few seconds are still available when the gesture fires, the effect can
 * cut to a moment when the subject was somewhere else in the frame, hold, and
 * cut back. Within a single continuous recording that reads as the same trick,
 * and it is honest, because every frame shown was genuinely recorded.
 *
 * Cost is bounded deliberately. Frames are stored at a fraction of the output
 * resolution and captured well below the render rate, because the cut is brief
 * and its content is what matters rather than its sharpness.
 */

import { REWIND } from '../config';
import { Framebuffer } from './framebuffer';

export class RewindBuffer {
    private readonly frames: Framebuffer[] = [];
    private readonly timestamps: number[] = [];

    /** Index the next captured frame will be written to. */
    private writeIndex = 0;

    /** How many slots have been filled since the buffer was cleared. */
    private filled = 0;

    private lastCaptureAt = 0;

    constructor(
        gl: WebGL2RenderingContext,
        outputWidth: number,
        outputHeight: number,
    ) {
        const width = Math.max(2, Math.round(outputWidth * REWIND.resolutionScale));
        const height = Math.max(2, Math.round(outputHeight * REWIND.resolutionScale));

        for (let index = 0; index < REWIND.frameCount; index += 1) {
            this.frames.push(new Framebuffer(gl, width, height));
            this.timestamps.push(0);
        }
    }

    /** Whether enough history exists for a cut to be worth performing. */
    get isReady(): boolean {
        return this.filled >= REWIND.minimumFramesForCut;
    }

    /** Whether the capture interval has elapsed. */
    shouldCapture(now: number): boolean {
        return now - this.lastCaptureAt >= 1000 / REWIND.captureHz;
    }

    /**
     * Binds the next slot as the draw target.
     *
     * The caller draws the current scene into it and then calls `commit`. The
     * two are separate because the renderer owns the shader program and the
     * geometry, and this class owns only the storage and the rotation.
     */
    beginCapture(now: number): void {
        this.lastCaptureAt = now;
        this.frames[this.writeIndex].bind();
    }

    /** Records the timestamp and advances the write position. */
    commit(now: number): void {
        this.timestamps[this.writeIndex] = now;
        this.writeIndex = (this.writeIndex + 1) % this.frames.length;

        if (this.filled < this.frames.length) {
            this.filled += 1;
        }
    }

    /**
     * The stored frame closest to `delayMs` in the past, or null.
     *
     * The nearest match is returned rather than the oldest, so the delay stays
     * meaningful while the buffer is still filling and does not jump once it
     * wraps.
     */
    frameAt(now: number, delayMs: number): WebGLTexture | null {
        if (this.filled === 0) {
            return null;
        }

        const target = now - delayMs;

        let best: Framebuffer | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (let index = 0; index < this.filled; index += 1) {
            const distance = Math.abs(this.timestamps[index] - target);

            if (distance < bestDistance) {
                bestDistance = distance;
                best = this.frames[index];
            }
        }

        return best?.texture ?? null;
    }

    /** Reallocates for a new output size, discarding the history. */
    resize(outputWidth: number, outputHeight: number): void {
        const width = Math.max(2, Math.round(outputWidth * REWIND.resolutionScale));
        const height = Math.max(2, Math.round(outputHeight * REWIND.resolutionScale));

        if (this.frames[0].width === width && this.frames[0].height === height) {
            return;
        }

        this.frames.forEach((frame) => frame.resize(width, height));
        this.clear();
    }

    /** Discards the history, so a new take cannot cut to the previous one. */
    clear(): void {
        this.writeIndex = 0;
        this.filled = 0;
        this.lastCaptureAt = 0;
        this.timestamps.fill(0);
    }

    dispose(): void {
        this.frames.forEach((frame) => frame.dispose());
        this.frames.length = 0;
    }
}
