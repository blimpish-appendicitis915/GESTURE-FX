/**
 * File: scripts/ui/countdown.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), DOM
 *
 * Description:
 * The three second countdown between pressing record and recording starting.
 *
 * The delay exists because the record control and the gesture need the same
 * hand. Without it the first second of every take is the user withdrawing their
 * arm from the button, and the gesture that follows is rushed.
 *
 * The countdown draws over the viewfinder rather than over the page, so the
 * user's eyes stay on the frame they are about to perform into.
 */

export class Countdown {
    private timer = 0;

    /** Replaced on every tick, so it cannot be readonly. */
    private value: HTMLElement;

    constructor(
        private readonly root: HTMLElement,
        value: HTMLElement,
    ) {
        this.value = value;
    }

    /**
     * Counts down from `seconds` and resolves when it reaches zero.
     *
     * The returned promise resolves rather than the caller polling, so the
     * recording start reads as the next statement after the countdown.
     */
    run(seconds: number): Promise<void> {
        this.cancel();

        return new Promise((resolve) => {
            let remaining = seconds;

            this.root.hidden = false;
            this.render(remaining);

            this.timer = window.setInterval(() => {
                remaining -= 1;

                if (remaining <= 0) {
                    this.cancel();
                    this.root.hidden = true;
                    resolve();
                    return;
                }

                this.render(remaining);
            }, 1000);
        });
    }

    /**
     * Writes the number, replacing the element so its entry animation restarts.
     *
     * Setting `textContent` alone would leave the existing element in place and
     * the CSS animation would not replay, so each tick would appear without the
     * scale that makes the count read as a beat.
     */
    private render(remaining: number): void {
        const replacement = this.value.cloneNode(false) as HTMLElement;
        replacement.textContent = String(remaining);

        this.value.replaceWith(replacement);
        this.value = replacement;
    }

    /** Stops a countdown in progress, for the cancel path and teardown. */
    cancel(): void {
        window.clearInterval(this.timer);
        this.timer = 0;
    }

    hide(): void {
        this.cancel();
        this.root.hidden = true;
    }
}
