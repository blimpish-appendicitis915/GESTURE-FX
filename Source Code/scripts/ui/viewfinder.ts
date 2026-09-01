/**
 * File: scripts/ui/viewfinder.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), ResizeObserver
 *
 * Description:
 * Sizes the viewfinder to the largest rectangle of the chosen aspect that fits
 * the available space, and sizes the canvas backing store to match.
 *
 * This is done in script rather than with a CSS aspect ratio because the
 * viewfinder is constrained on both axes at once. CSS can hold a ratio against
 * one free axis, but with both bounded it must either overflow or distort, and
 * in a shell that does not scroll an overflow would put part of the frame out
 * of reach. Measuring and assigning is exact at every size.
 *
 * Two resolutions are tracked. The element's CSS size is what the user sees.
 * The canvas backing store is fixed by the selected output preset, because that
 * is the resolution of the recorded file and it must not vary with the size of
 * the browser window.
 */

import { OUTPUT, type AspectName } from '../config';

export class Viewfinder {
    private aspect: AspectName = OUTPUT.defaultAspect;
    private observer: ResizeObserver | null = null;

    constructor(
        private readonly viewport: HTMLElement,
        private readonly element: HTMLElement,
        private readonly canvas: HTMLCanvasElement,
    ) {}

    get aspectName(): AspectName {
        return this.aspect;
    }

    /** The recorded resolution for the current preset. */
    get outputSize(): { width: number; height: number } {
        const preset = OUTPUT.aspects[this.aspect];
        return { width: preset.width, height: preset.height };
    }

    /** Begins tracking the available space. */
    observe(): void {
        this.fit();

        if (typeof ResizeObserver === 'undefined') {
            // Older browsers fall back to window events, which is sufficient
            // because the viewport only changes on resize or rotation there.
            window.addEventListener('resize', this.fit);
            window.addEventListener('orientationchange', this.fit);
            return;
        }

        this.observer = new ResizeObserver(() => this.fit());
        this.observer.observe(this.viewport);
    }

    setAspect(aspect: AspectName): void {
        this.aspect = aspect;
        this.fit();
    }

    /**
     * Assigns the element's size.
     *
     * The candidate width is derived from the available height and compared
     * against the available width; whichever axis binds first decides the size.
     * Values are floored to whole pixels, because a fractional size leaves a
     * seam between the canvas and the rounded corners of its container.
     */
    readonly fit = (): void => {
        const preset = OUTPUT.aspects[this.aspect];
        const ratio = preset.width / preset.height;

        const available = this.viewport.getBoundingClientRect();

        if (available.width === 0 || available.height === 0) {
            return;
        }

        const widthFromHeight = available.height * ratio;

        const width = Math.floor(Math.min(available.width, widthFromHeight));
        const height = Math.floor(width / ratio);

        this.element.style.width = `${width}px`;
        this.element.style.height = `${height}px`;

        // The backing store is the recorded resolution and is independent of
        // the displayed size, so a small window still records at full quality.
        if (this.canvas.width !== preset.width || this.canvas.height !== preset.height) {
            this.canvas.width = preset.width;
            this.canvas.height = preset.height;
        }
    };

    dispose(): void {
        this.observer?.disconnect();
        this.observer = null;

        window.removeEventListener('resize', this.fit);
        window.removeEventListener('orientationchange', this.fit);
    }
}
