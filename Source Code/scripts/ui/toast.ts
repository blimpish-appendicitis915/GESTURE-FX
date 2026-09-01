/**
 * File: scripts/ui/toast.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), DOM
 *
 * Description:
 * The confirmation shown inside the viewfinder when a gesture fires, naming the
 * gesture and the effect it produced.
 *
 * It sits over the preview but not over the recording. The canvas is what gets
 * captured, and this element is a sibling of the canvas rather than something
 * drawn into it, so the message is visible to the person recording and absent
 * from the file they export. That separation is the reason the interface draws
 * status in the DOM rather than in the render loop.
 */

/** How long the message stays on screen, in milliseconds. */
const VISIBLE_MS = 1500;

export class Toast {
    private timer = 0;

    constructor(
        private readonly root: HTMLElement,
        private readonly gestureSlot: HTMLElement,
        private readonly effectSlot: HTMLElement,
    ) {}

    /** Announces a gesture and the effect it fired. */
    show(gestureLabel: string, effectLabel: string): void {
        this.gestureSlot.textContent = gestureLabel;
        this.effectSlot.textContent = ` ${effectLabel}`;

        this.root.dataset.visible = 'true';

        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.hide(), VISIBLE_MS);
    }

    hide(): void {
        window.clearTimeout(this.timer);
        this.root.dataset.visible = 'false';
    }
}
