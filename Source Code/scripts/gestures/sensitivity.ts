/**
 * File: scripts/gestures/sensitivity.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * Applies the user's sensitivity preset to the gesture thresholds.
 *
 * Every detector reads its thresholds through these three functions rather than
 * from `config.ts` directly. The indirection is what makes the setting take
 * effect on the next tracked frame with nothing rebuilt and no detector state
 * discarded, and it keeps the preset from being scattered as a multiplier
 * through a dozen call sites.
 *
 * Three functions rather than one, because the three kinds of threshold move in
 * opposite directions as a gesture is made easier to recognise:
 *
 *   A magnitude a movement must exceed gets SMALLER.
 *   A duration a pose must be held gets SHORTER.
 *   A window a movement may occupy gets LONGER.
 *
 * Collapsing them into one multiplier would make a "relaxed" setting stricter
 * on the windows, which is the opposite of what the name promises.
 */

import { SENSITIVITY_PRESETS, SETTINGS } from '../config';

/** The multiplier for the preset currently selected. */
function multiplier(): number {
    return SENSITIVITY_PRESETS[SETTINGS.sensitivity].multiplier;
}

/**
 * A magnitude the evidence must exceed, such as a palm orientation or a
 * distance travelled. Higher sensitivity lowers the bar.
 */
export function threshold(base: number): number {
    return base / multiplier();
}

/**
 * A duration a pose must be sustained before it counts. Higher sensitivity
 * shortens the wait.
 */
export function hold(base: number): number {
    return base / multiplier();
}

/**
 * An allowance the evidence is permitted to fall within: the time a movement may
 * occupy, or the margin around a value it may sit inside. Higher sensitivity
 * widens it, so a slower or less committed movement still qualifies.
 */
export function allowance(base: number): number {
    return base * multiplier();
}
