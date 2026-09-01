/**
 * File: scripts/ui/restyle.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: September 1 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), DOM, WAI-ARIA
 *
 * Description:
 * The restyle panel: where a key is entered, a look is chosen, and the job is
 * run.
 *
 * The panel owns the whole sequence rather than reporting a button press
 * upward, because the sequence is one thing with one progress indicator and one
 * cancellation, and splitting it across two modules would put half of a state
 * machine in each. What it does not own is the take: the application supplies
 * that, along with the surface to composite on, through a context object read
 * at the moment Generate is pressed rather than held.
 *
 * Three points of care
 * --------------------
 * Nothing is sent until Generate is pressed. Entering a key does not validate
 * it, because validating it would be a request, and a request the user did not
 * ask for is exactly what this feature must not make.
 *
 * The key input is a password field that is cleared the moment the key is
 * accepted. Leaving a secret in a form field means it is in the DOM, in the
 * accessibility tree, and in whatever the browser decides to restore on a
 * back-forward navigation.
 *
 * A failure names what the service said. The panel adds a remedy underneath but
 * never replaces the message, because the difference between a refused key and
 * a renamed preview model is the whole of what the user needs to know.
 */

import { AI } from '../config';
import { canCarryAudio, compositeRestyled } from '../ai/composite';
import { clearKey, isPlausible, presence, setKey } from '../ai/credentials';
import { RestyleError, restyle, type RestyleProgress } from '../ai/gemini';
import {
    DEFAULT_RESTYLE_STYLE,
    RESTYLE_STYLES,
    buildPrompt,
} from '../ai/styles';
import { downloadRecording } from '../recording/export';
import type { RecordedClip } from '../recording/recorder';
import type { Renderer } from '../render/renderer';
import type { QuadTrack } from '../tracking/quad-track';

const MODEL_STORAGE_KEY = 'gesture-fx.gemini.model';

/** What the application supplies at the moment a job starts. */
export interface RestyleContext {
    /** The raw take, or null when the last take was not recorded raw. */
    raw: Blob | null;
    track: QuadTrack | null;
    mimeType: string;
    canvas: HTMLCanvasElement;
    renderer: Renderer | null;
}

export interface RestyleElements {
    keyEntry: HTMLElement;
    keyInput: HTMLInputElement;
    keyRemember: HTMLInputElement;
    keySave: HTMLButtonElement;
    keyLoaded: HTMLElement;
    keyState: HTMLElement;
    keyForget: HTMLButtonElement;
    keyLink: HTMLAnchorElement;
    styles: HTMLElement;
    custom: HTMLTextAreaElement;
    model: HTMLInputElement;
    progress: HTMLElement;
    fill: HTMLElement;
    status: HTMLElement;
    error: HTMLElement;
    generate: HTMLButtonElement;
    cancel: HTMLButtonElement;
    download: HTMLButtonElement;
    footnote: HTMLElement;
}

export interface RestyleHandlers {
    /** The composited take, ready to replace what the review panel is showing. */
    onComplete: (clip: RecordedClip, generated: Blob) => void;
    /** Called whenever a key is added or forgotten. */
    onKeyChange: () => void;
}

export class RestylePanel {
    private styleId = DEFAULT_RESTYLE_STYLE;
    private running: AbortController | null = null;
    private handlers: RestyleHandlers | null = null;

    /**
     * The model's output, kept as soon as it arrives.
     *
     * A generation has already been paid for by the time compositing starts, so
     * losing it to a failure in a step that runs afterwards would be the worst
     * outcome this panel can produce. It is held, and offered for download, from
     * the moment it exists.
     */
    private generated: Blob | null = null;

    constructor(
        private readonly elements: RestyleElements,
        private readonly context: () => RestyleContext,
    ) {}

    /** Whether a key is loaded, which is what the arm control depends on. */
    get hasKey(): boolean {
        return presence().present;
    }

    get isRunning(): boolean {
        return this.running !== null;
    }

    build(handlers: RestyleHandlers): void {
        this.handlers = handlers;

        this.elements.keyLink.href = AI.keyUrl;
        this.elements.model.value = readModel();
        AI.model = this.elements.model.value;

        this.buildStyles();
        this.bind();
        this.refresh();
    }

    private buildStyles(): void {
        this.elements.styles.replaceChildren();

        for (const style of RESTYLE_STYLES) {
            const option = document.createElement('button');

            option.type = 'button';
            option.className = 'chips__option';
            option.setAttribute('role', 'radio');
            option.dataset.value = style.id;
            option.dataset.tooltip = style.description;
            option.textContent = style.label;

            const chosen = style.id === this.styleId;
            option.setAttribute('aria-checked', String(chosen));
            option.tabIndex = chosen ? 0 : -1;

            option.addEventListener('click', () => this.selectStyle(style.id));

            this.elements.styles.append(option);
        }
    }

    private selectStyle(id: string): void {
        this.styleId = id;

        for (const option of this.elements.styles.querySelectorAll<HTMLButtonElement>('.chips__option')) {
            const chosen = option.dataset.value === id;
            option.setAttribute('aria-checked', String(chosen));
            option.tabIndex = chosen ? 0 : -1;
        }

        this.elements.custom.hidden = id !== 'custom';

        if (id === 'custom') {
            this.elements.custom.focus();
        }
    }

    private bind(): void {
        this.elements.keySave.addEventListener('click', () => this.saveKey());

        this.elements.keyInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.saveKey();
            }
        });

        this.elements.keyForget.addEventListener('click', () => {
            clearKey();
            this.refresh();
            this.handlers?.onKeyChange();
        });

        this.elements.model.addEventListener('change', () => {
            const value = this.elements.model.value.trim();
            AI.model = value || AI.model;
            this.elements.model.value = AI.model;
            writeModel(AI.model);
        });

        this.elements.generate.addEventListener('click', () => void this.run());
        this.elements.cancel.addEventListener('click', () => this.cancel());

        this.elements.download.addEventListener('click', () => {
            if (this.generated) {
                downloadRecording({ blob: this.generated, mimeType: this.generated.type || 'video/mp4' });
            }
        });
    }

    private saveKey(): void {
        const value = this.elements.keyInput.value.trim();

        if (!value) {
            return;
        }

        if (!isPlausible(value)) {
            this.showError(
                'That does not look like a Gemini API key.',
                'A key is a single line of about forty characters with no spaces.',
            );

            return;
        }

        setKey(value, this.elements.keyRemember.checked);

        // Cleared immediately. A secret left in a form field is in the DOM, in
        // the accessibility tree, and in whatever the browser restores on a
        // back-forward navigation.
        this.elements.keyInput.value = '';

        this.clearError();
        this.refresh();
        this.handlers?.onKeyChange();
    }

    /** Re-reads everything the panel displays about its own state. */
    refresh(): void {
        const key = presence();

        this.elements.keyEntry.hidden = key.present;
        this.elements.keyLoaded.hidden = !key.present;

        this.elements.keyState.textContent = key.present
            ? `Ending ${key.tail}. ${key.remembered ? 'Remembered on this device.' : 'This tab only.'}`
            : '';

        const context = this.context();
        const hasTake = context.raw !== null && context.track !== null;

        this.elements.generate.disabled = this.isRunning || !key.present || !hasTake;

        this.elements.footnote.textContent = footnoteFor(key.present, hasTake);
    }

    private async run(): Promise<void> {
        if (this.isRunning) {
            return;
        }

        const context = this.context();

        if (!context.raw || !context.track || !context.renderer) {
            this.showError(
                'There is no raw take to restyle.',
                'Switch the restyle control on before recording, then record again.',
            );

            return;
        }

        let prompt: string;

        try {
            prompt = buildPrompt(this.styleId, this.elements.custom.value);
        } catch (error) {
            this.showError(
                error instanceof Error ? error.message : 'The prompt is empty.',
                'Choose a look, or describe one in the box.',
            );

            return;
        }

        this.clearError();
        this.setRunning(true);

        const controller = new AbortController();
        this.running = controller;

        try {
            const generated = await restyle(
                context.raw,
                prompt,
                (progress) => this.report(progress),
                controller.signal,
            );

            // Offered from here on, whatever happens next.
            this.generated = generated;
            this.elements.download.hidden = false;

            this.setStatus('Compositing the window over the generated take…', 0);

            const clip = await compositeRestyled({
                raw: context.raw,
                generated,
                track: context.track,
                canvas: context.canvas,
                renderer: context.renderer,
                mimeType: context.mimeType,
                onProgress: ({ fraction }) => {
                    this.setStatus('Compositing the window over the generated take…', fraction);
                },
                signal: controller.signal,
            });

            this.handlers?.onComplete(clip, generated);
            this.setStatus('Done.', 1);
        } catch (error) {
            if (controller.signal.aborted) {
                this.setStatus('Cancelled.', 0);
            } else if (error instanceof RestyleError) {
                this.showError(error.message, error.remedy);
            } else if (error instanceof Error && 'remedy' in error) {
                this.showError(error.message, String((error as { remedy: unknown }).remedy));
            } else {
                this.showError(
                    'The restyle did not complete.',
                    'The developer console carries the detail.',
                );

                console.error('[gesture-fx] restyle failed', error);
            }
        } finally {
            this.running = null;
            this.setRunning(false);
            this.refresh();
        }
    }

    private cancel(): void {
        this.running?.abort(new DOMException('Cancelled by the user', 'AbortError'));
    }

    private setRunning(running: boolean): void {
        this.elements.generate.disabled = running;
        this.elements.cancel.hidden = !running;
        this.elements.progress.hidden = !running;
        this.elements.model.disabled = running;

        for (const option of this.elements.styles.querySelectorAll<HTMLButtonElement>('.chips__option')) {
            option.disabled = running;
        }
    }

    private report(progress: RestyleProgress): void {
        const messages: Record<RestyleProgress['stage'], string> = {
            encoding: 'Encoding the take…',
            submitting: 'Sending it to Google…',
            generating: `Generating. This takes minutes, not seconds. ${Math.round(progress.elapsedSeconds)}s${progress.detail ? ` (${progress.detail})` : ''}`,
            downloading: 'Downloading the generated take…',
        };

        // Generation reports no completion fraction, so the bar sweeps rather
        // than filling. A bar that guesses at a percentage is worse than one
        // that admits it does not know.
        this.setStatus(messages[progress.stage], progress.stage === 'generating' ? null : 0);
    }

    private setStatus(message: string, fraction: number | null): void {
        this.elements.progress.hidden = false;
        this.elements.status.textContent = message;

        if (fraction === null) {
            this.elements.fill.dataset.indeterminate = 'true';
            this.elements.fill.style.width = '';
            return;
        }

        delete this.elements.fill.dataset.indeterminate;
        this.elements.fill.style.width = `${Math.round(fraction * 100)}%`;
    }

    private showError(message: string, remedy: string): void {
        this.elements.error.hidden = false;
        this.elements.error.textContent = `${message} ${remedy}`;
        this.elements.progress.hidden = true;
    }

    private clearError(): void {
        this.elements.error.hidden = true;
        this.elements.error.textContent = '';
    }
}

function footnoteFor(hasKey: boolean, hasTake: boolean): string {
    if (!hasKey) {
        return 'A key is needed before anything can be generated. Nothing is sent while you are entering one.';
    }

    if (!hasTake) {
        return 'Switch the restyle control on beside the record button, then record a take. It is recorded without the window so the model has a clean picture to redraw.';
    }

    return canCarryAudio()
        ? 'The composite is recorded in real time, so it takes as long as the take, and carries the take’s sound.'
        : 'The composite is recorded in real time, so it takes as long as the take. This browser cannot carry the take’s sound across, so the result is silent.';
}

function readModel(): string {
    try {
        return window.localStorage.getItem(MODEL_STORAGE_KEY) || AI.model;
    } catch {
        return AI.model;
    }
}

function writeModel(model: string): void {
    try {
        window.localStorage.setItem(MODEL_STORAGE_KEY, model);
    } catch {
        // The choice still applies for this visit.
    }
}
