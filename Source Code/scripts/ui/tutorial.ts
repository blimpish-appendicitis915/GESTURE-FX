/**
 * File: scripts/ui/tutorial.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: September 1 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), DOM, Web Audio
 *
 * Description:
 * A short walkthrough that teaches the controls and tests them at the same time.
 *
 * It exists because this application asks the user to do things with their hands
 * and their voice, and until one of those works there is no way to tell whether
 * the fault is the user's movement, their hardware, their browser's permissions,
 * or the code. Reading an instruction does not settle that. Performing the
 * gesture and watching the step go green does.
 *
 * Every step is therefore a real observation, not a description:
 *
 *   the camera step passes when tracking is live;
 *   a gesture step passes when that detector fires, through the shipped engine;
 *   a pose step passes when the recording cue completes its hold;
 *   the microphone step passes when the input level actually rises, measured
 *   from the live track rather than inferred from a granted permission;
 *   the voice step passes when a transcript arrives, and prints what was heard.
 *
 * The last two are the reason this was built. A refused microphone, a browser
 * listening in the wrong language and a working setup are indistinguishable from
 * the outside, and each of them produces the same silence. Here they produce
 * three visibly different results.
 *
 * Every step can be skipped, and the whole thing can be dismissed, because a
 * walkthrough that has to be completed is a wall rather than an introduction.
 */

import type { GestureId } from '../gestures/types';

/** What the walkthrough asks for, in order. */
export type TutorialStepId =
    | 'camera'
    | 'hand'
    | GestureId
    | 'ring'
    | 'palm'
    | 'microphone'
    | 'voice';

/** How a step ended. */
type Outcome = 'waiting' | 'passed' | 'skipped';

interface Step {
    id: TutorialStepId;
    title: string;
    body: string;
    /** Shown while the step waits, when there is something useful to show. */
    meter?: boolean;
}

/** The level above which the microphone counts as hearing something. */
const SPEAKING_LEVEL = 0.06;

/** How long a level must stay above that, so a click does not pass the step. */
const SPEAKING_MS = 250;

export interface TutorialHandlers {
    /** Called when the walkthrough opens, so the caller can start listening. */
    onOpen: () => void;
    /** Called when it closes, so the caller can put everything back. */
    onClose: () => void;
}

const STEPS: readonly Step[] = [
    {
        id: 'camera',
        title: 'The camera',
        body: 'Nothing to do. This passes as soon as tracking is running.',
    },
    {
        id: 'hand',
        title: 'Show one hand',
        body: 'Hold either hand up where the camera can see it, fingers apart.',
    },
    {
        id: 'palm-flip',
        title: 'Turn your hand over',
        body: 'Palm toward the camera, then turn it to show the back. The effect fires on the frame your hand is edge-on.',
    },
    {
        id: 'victory',
        title: 'Two fingers',
        body: 'Index and middle up, the other two folded, held apart.',
    },
    {
        id: 'fist',
        title: 'Make a fist',
        body: 'Curl every finger in and hold it for a moment.',
    },
    {
        id: 'swipe',
        title: 'Swipe across',
        body: 'Move an open hand sideways, quickly, across the frame.',
    },
    {
        id: 'palm-push',
        title: 'Push toward the camera',
        body: 'Open palm facing the lens, then push it toward the camera.',
    },
    {
        id: 'ring',
        title: 'Hold a ring',
        body: 'Thumb and index tips together, the other three fingers up. Hold it for about a second. This is what starts a take without touching anything.',
    },
    {
        id: 'palm',
        title: 'Hold an open palm',
        body: 'All five fingers spread, held still for about a second. This is what ends a take.',
    },
    {
        id: 'microphone',
        title: 'Say something',
        body: 'Anything at all. The bar moves with what the microphone is actually receiving, so if it stays flat the microphone is not reaching this page.',
        meter: true,
    },
    {
        id: 'voice',
        title: 'Say “record”',
        body: 'Speech recognition sends audio to your browser vendor while it listens. What it heard is printed below, so a misheard word looks different from nothing at all.',
    },
];

/**
 * Space left between the foot of the frame and the top of the card.
 *
 * Without it the correction lands them flush, and two rounded edges meeting
 * with nothing between them read as one stuck shape. Twelve is the third step
 * of the spacing scale the rest of the interface is built on.
 */
const COACH_GAP = 12;

export class Tutorial {
    private index = 0;
    private open = false;

    private readonly outcomes = new Map<TutorialStepId, Outcome>();

    /** Set while the microphone level has been above the threshold. */
    private loudSince = 0;

    private lastHeard = '';

    /**
     * Watches the card, whose height changes with each step's wording, and the
     * stage, whose height changes with the screen.
     */
    private sizes: ResizeObserver | null = null;

    /** A pending frame in which to write the reserve, if one is booked. */
    private booked = 0;

    constructor(
        private readonly root: HTMLElement,
        private readonly host: HTMLElement,
        private readonly handlers: TutorialHandlers,
    ) {}

    get isOpen(): boolean {
        return this.open;
    }

    /** The step currently being asked for, or null when closed or finished. */
    get current(): TutorialStepId | null {
        return this.open && this.index < STEPS.length ? STEPS[this.index].id : null;
    }

    start(): void {
        this.index = 0;
        this.outcomes.clear();
        this.lastHeard = '';
        this.loudSince = 0;
        this.open = true;

        this.root.hidden = false;
        document.documentElement.dataset.coach = 'open';

        this.handlers.onOpen();
        this.render();
        this.watchSize();
    }

    close(): void {
        if (!this.open) {
            return;
        }

        this.open = false;
        this.root.hidden = true;

        this.unwatchSize();
        delete document.documentElement.dataset.coach;
        document.documentElement.style.removeProperty('--coach-reserve');

        this.handlers.onClose();
    }

    /**
     * Reserves room at the foot of the stage so the frame ends where the card
     * begins.
     *
     * The target is the cell the frame is measured in, not the stage. The
     * strips sit inside the stage below that cell and the cell is centred in
     * what remains, so the stage's own bottom edge is far below the picture and
     * aiming at it takes hundreds of pixels that were never in the way.
     *
     * The cell is the stage's only flexible row, so it absorbs the whole of any
     * padding placed on the stage: a pixel of padding moves its foot by exactly
     * a pixel. That makes this a correction rather than a guess. Read what is
     * applied, add the amount the cell currently overshoots the card by, and
     * the result is the answer; on the next evaluation the overshoot is zero
     * and the value stands.
     */
    private reserveSpace(): void {
        const card = this.root.firstElementChild;
        const stage = document.querySelector('.stage');
        const cell = document.querySelector('.stage__viewport');

        if (!(card instanceof HTMLElement)
            || !(stage instanceof HTMLElement)
            || !(cell instanceof HTMLElement)) {
            return;
        }

        // What the stylesheet is applying right now, which is zero on the
        // screens where the card is docked beside the picture instead.
        const applied = Number.parseFloat(getComputedStyle(stage).paddingBottom) || 0;
        const overshoot = cell.getBoundingClientRect().bottom
            - card.getBoundingClientRect().top
            + COACH_GAP;

        /*
         * Bounded, because below a certain height nothing fits. On a 560 pixel
         * screen the unbounded figure left the frame too small to see a hand
         * in, which is a worse outcome than a panel that overlaps its foot.
         * On any screen with room for both, the cap is far above what is asked
         * for and has no effect.
         */
        const reserve = Math.min(
            Math.max(0, Math.round(applied + overshoot)),
            Math.round(stage.getBoundingClientRect().height / 3),
        );

        document.documentElement.style.setProperty('--coach-reserve', `${reserve}px`);
    }

    private watchSize(): void {
        this.reserveSpace();

        if (!('ResizeObserver' in window)) {
            return;
        }

        this.sizes = new ResizeObserver(() => this.bookReserve());

        const card = this.root.firstElementChild;
        const stage = document.querySelector('.stage');

        if (card instanceof HTMLElement) {
            this.sizes.observe(card);
        }

        // Safe to watch even though the padding is written into it: the stage
        // sits in a fixed grid row, so its border box is unmoved by its own
        // padding and this cannot feed back on itself.
        if (stage instanceof HTMLElement) {
            this.sizes.observe(stage);
        }
    }

    /**
     * Defers the write to the next frame.
     *
     * Writing the padding from inside the observer's own callback resizes the
     * frame's cell while the browser is still delivering that round of
     * observations, and the cell's observer is then due in the same round. The
     * engine calls that a cascade, defers what it cannot deliver and says so on
     * the window. Moving the write into the next frame puts the two deliveries
     * in separate rounds, and one frame is imperceptible against a panel the
     * user is reading.
     */
    private bookReserve(): void {
        if (this.booked) {
            return;
        }

        this.booked = requestAnimationFrame(() => {
            this.booked = 0;
            this.reserveSpace();
        });
    }

    private unwatchSize(): void {
        this.sizes?.disconnect();
        this.sizes = null;

        if (this.booked) {
            cancelAnimationFrame(this.booked);
            this.booked = 0;
        }
    }

    /** Marks the current step done and moves on. */
    private advance(outcome: Outcome): void {
        const step = STEPS[this.index];

        if (!step) {
            return;
        }

        this.outcomes.set(step.id, outcome);
        this.index += 1;
        this.loudSince = 0;

        this.render();
    }

    skip(): void {
        if (this.open && this.index < STEPS.length) {
            this.advance('skipped');
        }
    }

    /**
     * Reports an observation.
     *
     * Only the step being asked for can be satisfied, so a gesture fired while
     * a different one is being asked for does not tick the wrong box.
     */
    observe(id: TutorialStepId): void {
        if (this.open && this.current === id) {
            this.advance('passed');
        }
    }

    /** The microphone level, from the live track, in [0, 1]. */
    setLevel(level: number, now: number): void {
        if (!this.open || this.current !== 'microphone') {
            return;
        }

        const bar = this.host.querySelector<HTMLElement>('[data-role="tutorial-level"]');

        if (bar) {
            bar.style.width = `${Math.round(Math.min(1, level) * 100)}%`;
        }

        if (level < SPEAKING_LEVEL) {
            this.loudSince = 0;
            return;
        }

        if (this.loudSince === 0) {
            this.loudSince = now;
            return;
        }

        // Sustained rather than instantaneous, so one tap on the desk is not a
        // passing grade for a microphone.
        if (now - this.loudSince >= SPEAKING_MS) {
            this.advance('passed');
        }
    }

    /** A transcript, matched or not. The voice step passes on any of them. */
    heard(transcript: string): void {
        if (!this.open || this.current !== 'voice') {
            return;
        }

        this.lastHeard = transcript;
        this.advance('passed');
    }

    /** Whether the camera step can pass, polled by the caller each frame. */
    cameraReady(): void {
        this.observe('camera');
    }

    private render(): void {
        if (this.index >= STEPS.length) {
            this.renderSummary();
            return;
        }

        const step = STEPS[this.index];

        this.host.innerHTML = `
            <p class="tutorial__count">Step ${this.index + 1} of ${STEPS.length}</p>
            <h2 class="tutorial__title">${step.title}</h2>
            <p class="tutorial__body">${step.body}</p>
            ${step.meter ? `
                <div class="tutorial__meter" role="img" aria-label="Microphone input level">
                    <span class="tutorial__level" data-role="tutorial-level"></span>
                </div>
            ` : ''}
            <p class="tutorial__hint">Waiting for you. Skip this one if it is not working.</p>
        `;
    }

    private renderSummary(): void {
        const rows = STEPS.map((step) => {
            const outcome = this.outcomes.get(step.id) ?? 'skipped';

            return `
                <tr>
                    <th>${step.title}</th>
                    <td class="tutorial__outcome" data-outcome="${outcome}">
                        ${outcome === 'passed' ? 'Works' : 'Skipped'}
                    </td>
                </tr>
            `;
        }).join('');

        const heard = this.lastHeard
            ? `<p class="tutorial__body">The recogniser heard “${this.lastHeard}”.</p>`
            : '';

        const skipped = [...STEPS].filter(
            (step) => (this.outcomes.get(step.id) ?? 'skipped') !== 'passed',
        );

        const closing = skipped.length === 0
            ? 'Everything on this device works. Nothing here needs your attention.'
            : `${skipped.length} of ${STEPS.length} were skipped or did not fire. `
              + 'A skipped step is not a failure, but if you meant to complete it, '
              + 'that is where to look.';

        this.host.innerHTML = `
            <p class="tutorial__count">Done</p>
            <h2 class="tutorial__title">What works on this device</h2>
            <table class="tutorial__table">${rows}</table>
            ${heard}
            <p class="tutorial__body">${closing}</p>
        `;
    }
}
