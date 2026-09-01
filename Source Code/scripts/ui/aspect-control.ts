/**
 * File: scripts/ui/aspect-control.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), DOM, WAI-ARIA
 *
 * Description:
 * The segmented control that selects the shape of the recorded video.
 *
 * Portrait is offered first and selected by default, because a video made by
 * pointing a phone at yourself is going to a feed that expects portrait, and a
 * tool that defaults to landscape quietly costs its user a crop.
 *
 * The control is a radio group rather than a set of buttons, so a keyboard user
 * moves through the options with the arrow keys and a screen reader announces
 * how many shapes exist and which one is chosen.
 */

import { OUTPUT, type AspectName } from '../config';

export type AspectChangeHandler = (aspect: AspectName) => void;

export class AspectControl {
    private readonly options = new Map<AspectName, HTMLButtonElement>();
    private selected: AspectName = OUTPUT.defaultAspect;

    constructor(private readonly container: HTMLElement) {}

    /** Renders one option per configured aspect. */
    build(onChange: AspectChangeHandler): void {
        this.container.replaceChildren();
        this.options.clear();

        for (const [name, preset] of Object.entries(OUTPUT.aspects)) {
            const aspect = name as AspectName;

            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'segmented__option';
            option.setAttribute('role', 'radio');
            option.setAttribute('aria-checked', String(aspect === this.selected));
            option.dataset.tooltip = `Record at ${preset.width} by ${preset.height}`;
            option.setAttribute('aria-label', `${preset.label}, ${preset.width} by ${preset.height}`);
            option.textContent = preset.label;

            option.addEventListener('click', () => {
                this.select(aspect);
                onChange(aspect);
            });

            option.addEventListener('keydown', (event) => {
                this.onKeyDown(event, aspect, onChange);
            });

            this.options.set(aspect, option);
            this.container.append(option);
        }

        this.updateTabStops();
    }

    /**
     * Arrow keys move between options, as a radio group requires.
     *
     * Moving selection also moves focus, which is the expected behaviour: in a
     * radio group the arrow keys choose rather than merely traverse.
     */
    private onKeyDown(event: KeyboardEvent, current: AspectName, onChange: AspectChangeHandler): void {
        const names = [...this.options.keys()];
        const index = names.indexOf(current);

        let nextIndex: number | null = null;

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            nextIndex = (index + 1) % names.length;
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            nextIndex = (index - 1 + names.length) % names.length;
        }

        if (nextIndex === null) {
            return;
        }

        event.preventDefault();

        const next = names[nextIndex];
        this.select(next);
        this.options.get(next)?.focus();
        onChange(next);
    }

    /** Marks one option as chosen. */
    select(aspect: AspectName): void {
        this.selected = aspect;

        this.options.forEach((option, name) => {
            option.setAttribute('aria-checked', String(name === aspect));
        });

        this.updateTabStops();
    }

    /**
     * A radio group is a single tab stop.
     *
     * Only the chosen option is reachable with Tab; the rest are reached with
     * the arrow keys, which is what stops a group of three from costing three
     * presses to move past.
     */
    private updateTabStops(): void {
        this.options.forEach((option, name) => {
            option.tabIndex = name === this.selected ? 0 : -1;
        });
    }

    /** Disables the control, which is done while a recording is running. */
    setDisabled(disabled: boolean): void {
        this.options.forEach((option) => {
            option.disabled = disabled;
        });
    }
}
