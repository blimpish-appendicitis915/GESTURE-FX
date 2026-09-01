/**
 * File: scripts/gestures/detectors/index.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * The gesture registry. This list is the single place the application learns
 * which gestures exist, and the order here is the order shown in the legend.
 *
 * To add a gesture: write one file in this directory against the
 * `GestureDetector` interface, then add it below. The engine, the interface
 * legend and the settings panel all read from this array, so nothing else needs
 * to change. See docs/GESTURES.md for the full procedure.
 */

import type { GestureDetector } from '../types';

import { palmFlip } from './palm-flip';
import { swipe } from './swipe';
import { fist } from './fist';
import { palmPush } from './palm-push';
import { victory } from './victory';

/**
 * Registered gestures, in presentation order.
 *
 * The palm flip is first because it is the gesture the project exists to
 * demonstrate, and it is the one a first-time visitor should try.
 */
export const DETECTORS: readonly GestureDetector[] = [
    palmFlip,
    swipe,
    fist,
    palmPush,
    victory,
];

export { palmFlip, swipe, fist, palmPush, victory };
