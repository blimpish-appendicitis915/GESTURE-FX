/**
 * File: scripts/ui/radio-strip.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: September 1 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), DOM, WAI-ARIA
 *
 * Description:
 * A horizontal strip of mutually exclusive choices, under the viewfinder.
 *
 * Two of these exist: the colour treatment applied to the whole frame, and the
 * medium the two-hand window is drawn in. Both sit directly beneath the picture
 * because both change what is on screen right now, unlike the gesture list,
 * which describes what will happen later.
 *
 * Both remain usable while recording. Changing the output shape mid-take would
 * resize the surface the recorder is capturing and produce a file the encoder
 * cannot describe; changing which shader runs does not, so it is a legitimate
 * move during a take and can be used deliberately as part of one.
 *
 * It is a radio group rather than a row of buttons, so the arrow keys move
 * between options and a screen reader announces how many there are and which is
 * chosen. In a radio group the arrows select rather than merely traverse, which
 * is why moving focus also changes the value.
 *
 * The strip scrolls horizontally rather than wrapping, so adding a choice never
 * changes the height of the stage and never moves the record button.
 */

/** One choice. The value is whatever identifier the registry uses. */
export interface StripOption<T extends string> {
    value: T;
    label: string;
    hint: string;
}

export type StripChangeHandler<T extends string> = (value: T) => void;

export class RadioStrip<T extends string> {
    private readonly options = new Map<T, HTMLButtonElement>();
    private selected: T | null = null;

    constructor(private readonly container: HTMLElement) {}

    get value(): T | null {
        return this.selected;
    }

    /** Renders the strip and reports every change through the handler. */
    build(
        choices: ReadonlyArray<StripOption<T>>,
        initial: T,
        onChange: StripChangeHandler<T>,
    ): void {
        this.container.replaceChildren();
        this.options.clear();
        this.selected = initial;

        for (const choice of choices) {
            const option = document.createElement('button');

            option.type = 'button';
            option.className = 'chip-strip__option';
            option.setAttribute('role', 'radio');
            option.dataset.value = choice.value;
            option.dataset.tooltip = choice.hint;
            option.textContent = choice.label;

            option.addEventListener('click', () => {
                this.select(choice.value);
                onChange(choice.value);
            });

            option.addEventListener('keydown', (event) => {
                this.onKeyDown(event, choice.value, onChange);
            });

            this.options.set(choice.value, option);
            this.container.append(option);
        }

        this.mark();
    }

    private onKeyDown(event: KeyboardEvent, current: T, onChange: StripChangeHandler<T>): void {
        const values = [...this.options.keys()];
        const index = values.indexOf(current);

        let next: number | null = null;

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            next = (index + 1) % values.length;
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            next = (index - 1 + values.length) % values.length;
        }

        if (next === null) {
            return;
        }

        event.preventDefault();

        const value = values[next];
        this.select(value);
        this.options.get(value)?.focus();
        onChange(value);
    }

    /**
     * Selects a value without reporting it.
     *
     * Used when something outside the strip changes the setting, which happens
     * for the frame style: it is also reachable from the settings panel and from
     * a spoken command, and the strip has to agree with both.
     */
    select(value: T): void {
        this.selected = value;
        this.mark();
    }

    /** A radio group is a single tab stop; the rest are reached with arrows. */
    private mark(): void {
        this.options.forEach((option, value) => {
            const chosen = value === this.selected;

            option.setAttribute('aria-checked', String(chosen));
            option.tabIndex = chosen ? 0 : -1;
        });
    }
}
