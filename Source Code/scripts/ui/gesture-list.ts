/**
 * File: scripts/ui/gesture-list.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), DOM
 *
 * Description:
 * Builds the gesture list beside the viewfinder, lights a row when its gesture
 * fires, and lets the user choose which effect each gesture triggers.
 *
 * The list is not decoration. It is the only place the available gestures are
 * visible while recording, and the brief highlight when one fires is what tells
 * the user which movement was recognised, which matters when an effect could
 * plausibly have come from either of two gestures.
 *
 * Each row carries two controls. The first is a switch, because a gesture that
 * keeps firing by accident should be removable without leaving the page, which
 * is more useful than any threshold this project could pick on the user's
 * behalf. The second is a menu binding the gesture to an effect, which exists
 * because gestures and effects are genuinely independent registries; exposing
 * that in the interface is the honest presentation of the architecture rather
 * than a feature bolted onto it.
 */

import { EFFECTS } from '../effects/registry';
import type { EffectId } from '../effects/types';
import type { GestureDetector, GestureId } from '../gestures/types';
import { GESTURE_ICONS } from './icons';

/** How long a row stays lit after its gesture fires, in milliseconds. */
const FLASH_MS = 700;

export type GestureToggleHandler = (id: GestureId, enabled: boolean) => void;
export type EffectBindingHandler = (id: GestureId, effectId: EffectId) => void;

export interface GestureListHandlers {
    onToggle: GestureToggleHandler;
    onRebind: EffectBindingHandler;
}

export class GestureList {
    private readonly rows = new Map<GestureId, HTMLElement>();
    private readonly timers = new Map<GestureId, number>();

    constructor(private readonly container: HTMLElement) {}

    /** Renders one row per registered gesture. */
    build(detectors: readonly GestureDetector[], handlers: GestureListHandlers): void {
        this.container.replaceChildren();
        this.rows.clear();

        for (const detector of detectors) {
            const row = this.createRow(detector, handlers);
            this.rows.set(detector.id, row);
            this.container.append(row);
        }
    }

    private createRow(detector: GestureDetector, handlers: GestureListHandlers): HTMLElement {
        const row = document.createElement('div');
        row.className = 'chip';
        row.dataset.gesture = detector.id;

        row.append(
            this.createToggle(detector, handlers.onToggle, row),
            this.createEffectMenu(detector, handlers.onRebind),
        );

        return row;
    }

    /** The icon, the name, and the switch that enables the gesture. */
    private createToggle(
        detector: GestureDetector,
        onToggle: GestureToggleHandler,
        row: HTMLElement,
    ): HTMLButtonElement {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'chip__toggle';
        toggle.setAttribute('aria-pressed', 'true');
        toggle.dataset.tooltip = `${detector.instruction} Select to switch this gesture off.`;
        toggle.setAttribute('aria-label', `${detector.label}. ${detector.instruction}`);

        const icon = document.createElement('span');
        icon.className = 'chip__icon';
        icon.innerHTML = GESTURE_ICONS[detector.id];

        const label = document.createElement('span');
        label.className = 'chip__label';
        label.textContent = detector.label;

        toggle.append(icon, label);

        toggle.addEventListener('click', () => {
            const enabled = toggle.getAttribute('aria-pressed') === 'true';
            toggle.setAttribute('aria-pressed', String(!enabled));
            row.dataset.enabled = String(!enabled);
            onToggle(detector.id, !enabled);
        });

        row.dataset.enabled = 'true';

        return toggle;
    }

    /** The menu that binds this gesture to an effect. */
    private createEffectMenu(
        detector: GestureDetector,
        onRebind: EffectBindingHandler,
    ): HTMLSelectElement {
        const menu = document.createElement('select');
        menu.className = 'chip__select';
        menu.setAttribute('aria-label', `Effect fired by ${detector.label}`);
        menu.dataset.tooltip = `Choose the effect ${detector.label.toLowerCase()} fires.`;

        for (const effect of EFFECTS) {
            const option = document.createElement('option');
            option.value = effect.id;
            option.textContent = effect.label;
            option.selected = effect.id === detector.effectId;
            menu.append(option);
        }

        menu.addEventListener('change', () => {
            onRebind(detector.id, menu.value as EffectId);
        });

        return menu;
    }

    /** Lights the row for a gesture that has just fired. */
    flash(id: GestureId): void {
        const row = this.rows.get(id);

        if (!row) {
            return;
        }

        window.clearTimeout(this.timers.get(id));
        row.dataset.fired = 'true';

        this.timers.set(
            id,
            window.setTimeout(() => {
                delete row.dataset.fired;
                this.timers.delete(id);
            }, FLASH_MS),
        );
    }

    /** Clears every highlight, used when a recording ends. */
    clearHighlights(): void {
        this.timers.forEach((timer) => window.clearTimeout(timer));
        this.timers.clear();
        this.rows.forEach((row) => delete row.dataset.fired);
    }

    /** Disables the effect menus, which is done while a recording runs. */
    setMenusDisabled(disabled: boolean): void {
        this.container.querySelectorAll<HTMLSelectElement>('.chip__select').forEach((menu) => {
            menu.disabled = disabled;
        });
    }
}
