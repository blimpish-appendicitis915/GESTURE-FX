/**
 * File: scripts/ui/settings.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), DOM, WAI-ARIA, Web Storage
 *
 * Description:
 * The settings panel, and the persistence of what it changes.
 *
 * The rows are generated from one declarative list, so adding a setting is a
 * single entry rather than a block of markup plus a block of wiring. Each row
 * is a radio group, which gives arrow key navigation and a correct screen
 * reader announcement without any of it being written by hand.
 *
 * Only settings that genuinely change behaviour are offered. A panel of options
 * that mostly do nothing is worse than no panel, because it teaches the user
 * that the controls here are decorative.
 */

import { COUNTDOWN_CHOICES, SENSITIVITY_PRESETS, SETTINGS, type SensitivityName } from '../config';
import { SELECTABLE_PORTAL_STYLES, type PortalStyleId } from '../effects/portal-styles';
import { isVoiceSupported, providerNote, spokenPhrases } from '../voice/commands';
import { applyTheme, readTheme, type ThemeChoice } from './theme';

const STORAGE_KEY = 'gesture-fx.settings';

/** One selectable value within a setting. */
interface Choice {
    value: string;
    label: string;
    hint: string;
}

/** One row of the panel. */
interface Row {
    key: string;
    label: string;
    description: string;
    choices: Choice[];
    read: () => string;
    write: (value: string) => void;
}

export type SettingsChangeHandler = () => void;

export class SettingsPanel {
    private readonly rows: Row[];

    /**
     * One per row, called to re-read the setting and re-mark the chosen option.
     *
     * The panel is not the only thing that writes a setting: a spoken command
     * changes the frame style, and a device that cannot run auto-framing turns
     * it off. Without this the panel would keep showing whichever value it last
     * wrote and the interface would disagree with the application.
     */
    private readonly refreshers: Array<() => void> = [];

    constructor(private readonly container: HTMLElement) {
        this.rows = this.defineRows();
    }

    /**
     * The rows, in the order a user is most likely to want them.
     *
     * Theme first because it is the one people look for; sensitivity second
     * because it is the one that most changes how the application behaves.
     */
    private defineRows(): Row[] {
        return [
            {
                key: 'theme',
                label: 'Appearance',
                description: 'Dark keeps attention on the picture. System follows your device.',
                choices: [
                    { value: 'system', label: 'System', hint: 'Follow the device setting' },
                    { value: 'dark', label: 'Dark', hint: 'Always dark' },
                    { value: 'light', label: 'Light', hint: 'Always light' },
                ],
                read: () => readTheme(),
                write: (value) => applyTheme(value as ThemeChoice),
            },
            {
                key: 'frameStyle',
                label: 'Frame style',
                description:
                    'What the two-hand window shows. Each is a shader, so all of them run at full rate.',
                choices: SELECTABLE_PORTAL_STYLES.map((style) => ({
                    value: style.id,
                    label: style.label,
                    hint: style.description,
                })),
                read: () => SETTINGS.portalStyle,
                write: (value) => {
                    SETTINGS.portalStyle = value as PortalStyleId;
                },
            },
            {
                key: 'autoFrame',
                label: 'Keep the face centred',
                description:
                    'Follows the subject by sliding the crop, so a propped phone still frames you. Tightens the picture slightly to leave room to move.',
                choices: [
                    { value: 'true', label: 'On', hint: 'Follow the face, once the detector has loaded' },
                    { value: 'false', label: 'Off', hint: 'Keep the crop centred on the lens' },
                ],
                read: () => String(SETTINGS.autoFrame),
                write: (value) => {
                    SETTINGS.autoFrame = value === 'true';
                },
            },
            {
                key: 'voiceControl',
                label: 'Voice control',
                description: `Say ${spokenPhrases()[0].words} to start and ${spokenPhrases()[1].words} to stop, without reaching for the button. ${providerNote()}`,
                choices: [
                    { value: 'false', label: 'Off', hint: 'The microphone is not listened to' },
                    {
                        value: 'true',
                        label: 'On',
                        hint: isVoiceSupported()
                            ? 'Listen for spoken commands while the camera is live'
                            : 'Unavailable in this browser',
                    },
                ],
                read: () => String(SETTINGS.voiceControl && isVoiceSupported()),
                write: (value) => {
                    SETTINGS.voiceControl = value === 'true' && isVoiceSupported();
                },
            },
            {
                key: 'recordingGestures',
                label: 'Start and stop with a gesture',
                description:
                    'Make a ring with your thumb and index finger, other three fingers up, '
                    + 'and hold it to start a take. Hold an open palm to stop. Nothing is sent '
                    + 'anywhere: this is the camera you have already allowed.',
                choices: [
                    { value: 'false', label: 'Off', hint: 'Only the button, voice and keyboard start a take' },
                    { value: 'true', label: 'On', hint: 'A held ring starts a take, a held palm ends it' },
                ],
                read: () => String(SETTINGS.recordingGestures),
                write: (value) => {
                    SETTINGS.recordingGestures = value === 'true';
                },
            },
            {
                key: 'sensitivity',
                label: 'Gesture sensitivity',
                description:
                    'Precise needs a deliberate movement. Relaxed recognises sooner and may fire by accident.',
                choices: Object.entries(SENSITIVITY_PRESETS).map(([value, preset]) => ({
                    value,
                    label: preset.label,
                    hint: `Thresholds scaled by ${preset.multiplier.toFixed(2)}`,
                })),
                read: () => SETTINGS.sensitivity,
                write: (value) => {
                    SETTINGS.sensitivity = value as SensitivityName;
                },
            },
            {
                key: 'countdown',
                label: 'Countdown',
                description: 'Time between pressing record and recording starting.',
                choices: COUNTDOWN_CHOICES.map((seconds) => ({
                    value: String(seconds),
                    label: seconds === 0 ? 'Off' : `${seconds}s`,
                    hint: seconds === 0 ? 'Start immediately' : `Wait ${seconds} seconds`,
                })),
                read: () => String(SETTINGS.countdownSeconds),
                write: (value) => {
                    SETTINGS.countdownSeconds = Number(value);
                },
            },
            {
                key: 'mirror',
                label: 'Mirror front camera',
                description:
                    'On looks like a mirror. Off records text the right way round.',
                choices: [
                    { value: 'true', label: 'On', hint: 'Mirror the preview and the recording' },
                    { value: 'false', label: 'Off', hint: 'Record exactly what the lens sees' },
                ],
                read: () => String(SETTINGS.mirrorPreview),
                write: (value) => {
                    SETTINGS.mirrorPreview = value === 'true';
                },
            },
        ];
    }

    /** Applies anything stored from a previous visit. Call before build. */
    restore(): void {
        let stored: Record<string, string> = {};

        try {
            stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
        } catch {
            stored = {};
        }

        for (const row of this.rows) {
            const value = stored[row.key];

            // A stored value from an older release may name a choice that no
            // longer exists, so it is validated rather than trusted.
            if (value && row.choices.some((choice) => choice.value === value)) {
                row.write(value);
            }
        }
    }

    private persist(): void {
        const state: Record<string, string> = {};

        for (const row of this.rows) {
            state[row.key] = row.read();
        }

        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {
            // Settings still apply for this visit; only persistence is lost.
        }
    }

    /** Renders the panel. */
    build(onChange: SettingsChangeHandler): void {
        this.container.replaceChildren();
        this.refreshers.length = 0;

        for (const row of this.rows) {
            this.container.append(this.createRow(row, onChange));
        }
    }

    /**
     * Re-marks every row from the settings as they now are.
     *
     * Called after something outside the panel writes one, so the controls say
     * what the application is actually doing.
     */
    refresh(): void {
        for (const apply of this.refreshers) {
            apply();
        }
    }

    private createRow(row: Row, onChange: SettingsChangeHandler): HTMLElement {
        const section = document.createElement('div');

        // Four or more choices will not sit beside a description at any width
        // worth supporting, so the row says so and the stylesheet gives the
        // control its own full-width line.
        section.className = row.choices.length > 3 ? 'setting setting--wide' : 'setting';

        const heading = document.createElement('div');
        heading.className = 'setting__text';

        const label = document.createElement('span');
        label.className = 'setting__label';
        label.id = `setting-${row.key}-label`;
        label.textContent = row.label;

        const description = document.createElement('span');
        description.className = 'setting__description';
        description.textContent = row.description;

        heading.append(label, description);

        const group = document.createElement('div');
        group.className = 'segmented';
        group.setAttribute('role', 'radiogroup');
        group.setAttribute('aria-labelledby', label.id);

        const options: HTMLButtonElement[] = [];

        const mark = () => {
            const value = row.read();

            options.forEach((option) => {
                const chosen = option.dataset.value === value;
                option.setAttribute('aria-checked', String(chosen));
                option.tabIndex = chosen ? 0 : -1;
            });
        };

        this.refreshers.push(mark);

        const select = (value: string) => {
            row.write(value);
            this.persist();

            // Marked from what the setting now reads rather than from what was
            // asked for, because a write can be refused: voice control cannot be
            // switched on in a browser that does not offer it.
            mark();

            onChange();
        };

        for (const choice of row.choices) {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'segmented__option';
            option.setAttribute('role', 'radio');
            option.dataset.value = choice.value;
            option.dataset.tooltip = choice.hint;
            option.textContent = choice.label;

            const chosen = row.read() === choice.value;
            option.setAttribute('aria-checked', String(chosen));
            option.tabIndex = chosen ? 0 : -1;

            option.addEventListener('click', () => select(choice.value));

            option.addEventListener('keydown', (event) => {
                const index = row.choices.findIndex((candidate) => candidate.value === choice.value);
                let next: number | null = null;

                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                    next = (index + 1) % row.choices.length;
                } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                    next = (index - 1 + row.choices.length) % row.choices.length;
                }

                if (next === null) {
                    return;
                }

                event.preventDefault();
                select(row.choices[next].value);
                options[next].focus();
            });

            options.push(option);
            group.append(option);
        }

        section.append(heading, group);

        return section;
    }
}
