/**
 * File: scripts/ui/overlays.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), DOM
 *
 * Description:
 * Owns which full-screen state is visible, and renders the loading and error
 * states.
 *
 * Exactly one overlay can be shown at a time, and the controller enforces that
 * rather than trusting callers to hide what they replaced. Overlapping states
 * were the source of every interface defect during development: an error
 * arriving while the loader was up, or a review panel opening behind the
 * permission card.
 *
 * Errors are rendered as a cause and a remedy, always both. An error message
 * that does not say what to do next is an apology rather than an interface.
 */

import type { LoadStage } from '../tracking/tracker';

export type OverlayName =
    | 'guide'
    | 'settings'
    | 'method'
    | 'restyle'
    | 'loading'
    | 'permission'
    | 'error'
    | 'review'
    | 'none';

/** An error the interface can present: what happened, and what to do. */
export interface PresentableError {
    title: string;
    message: string;
    remedy: string;
}

/** Human wording for each loading stage. */
const STAGE_LABELS: Record<LoadStage, string> = {
    runtime: 'Downloading the vision runtime',
    model: 'Downloading the hand model',
    ready: 'Ready',
};

/** Elements that can hold focus, in document order. */
const FOCUSABLE =
    'button:not([disabled]), [href], select:not([disabled]), input:not([disabled]), '
    + 'textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

export class OverlayController {
    private active: OverlayName = 'none';

    /** What had focus before an overlay opened, so it can be given back. */
    private previouslyFocused: HTMLElement | null = null;

    constructor(
        private readonly overlays: Record<Exclude<OverlayName, 'none'>, HTMLElement>,
    ) {
        // Tab is confined to the open overlay. Without this, a keyboard user
        // tabs from a modal card into the controls behind it, operating a
        // camera they cannot see.
        document.addEventListener('keydown', this.onKeyDown, true);
    }

    get current(): OverlayName {
        return this.active;
    }

    /** Shows one overlay and hides every other. */
    show(name: OverlayName): void {
        const opening = this.active === 'none' && name !== 'none';

        if (opening) {
            this.previouslyFocused = document.activeElement as HTMLElement | null;
        }

        this.active = name;

        for (const [key, element] of Object.entries(this.overlays)) {
            element.hidden = key !== name;
        }

        if (name === 'none') {
            this.restoreFocus();
            return;
        }

        this.focusFirst(name);
    }

    hide(): void {
        this.show('none');
    }

    /**
     * Moves focus into the overlay that has just opened.
     *
     * The primary action is preferred over the first focusable element, so that
     * pressing Enter immediately does the obvious thing: allow the camera, try
     * again, or start.
     */
    private focusFirst(name: Exclude<OverlayName, 'none'>): void {
        const overlay = this.overlays[name];

        const primary = overlay.querySelector<HTMLElement>('.button--primary');
        const fallback = overlay.querySelector<HTMLElement>(FOCUSABLE);

        (primary ?? fallback)?.focus();
    }

    private restoreFocus(): void {
        // Only restore if the element is still in the document; a control that
        // has since been removed would silently send focus to the body.
        if (this.previouslyFocused?.isConnected) {
            this.previouslyFocused.focus();
        }

        this.previouslyFocused = null;
    }

    /** Cycles Tab within the open overlay. */
    private readonly onKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== 'Tab' || this.active === 'none') {
            return;
        }

        const overlay = this.overlays[this.active];
        const focusable = [...overlay.querySelectorAll<HTMLElement>(FOCUSABLE)];

        if (focusable.length === 0) {
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const current = document.activeElement;

        // Wrap at each end, and pull focus back in if it has escaped entirely.
        if (event.shiftKey && (current === first || !overlay.contains(current))) {
            event.preventDefault();
            last.focus();
            return;
        }

        if (!event.shiftKey && (current === last || !overlay.contains(current))) {
            event.preventDefault();
            first.focus();
        }
    };

    /** Updates the loading state's progress bar and labels. */
    setLoading(
        stage: LoadStage,
        ratio: number | null,
        elements: {
            fill: HTMLElement;
            stage: HTMLElement;
            percent: HTMLElement;
        },
    ): void {
        elements.stage.textContent = STAGE_LABELS[stage];

        if (ratio === null) {
            // The runtime download reports no measurable progress, so the bar
            // sweeps rather than claiming a percentage it does not know.
            elements.fill.dataset.indeterminate = 'true';
            elements.fill.style.width = '';
            elements.percent.textContent = '';
            return;
        }

        const percent = Math.round(ratio * 100);

        delete elements.fill.dataset.indeterminate;
        elements.fill.style.width = `${percent}%`;
        elements.percent.textContent = `${percent}%`;
    }

    /** Presents an error, then shows the error state. */
    setError(
        error: PresentableError,
        elements: {
            title: HTMLElement;
            message: HTMLElement;
            remedy: HTMLElement;
        },
    ): void {
        elements.title.textContent = error.title;
        elements.message.textContent = error.message;
        elements.remedy.textContent = error.remedy;

        this.show('error');
    }
}

/**
 * Converts a thrown value into something presentable.
 *
 * The error classes in this project each carry a remedy alongside the message.
 * Anything else, including a value that is not an Error at all, is given a
 * generic remedy rather than being shown to the user raw.
 */
export function toPresentableError(error: unknown, title = 'Something went wrong'): PresentableError {
    if (error && typeof error === 'object' && 'remedy' in error && error instanceof Error) {
        return {
            title,
            message: error.message,
            remedy: String((error as Error & { remedy: string }).remedy),
        };
    }

    return {
        title,
        message: error instanceof Error ? error.message : 'An unexpected error occurred.',
        remedy: 'Reload the page and try again. If it keeps happening, please open an issue on GitHub.',
    };
}
