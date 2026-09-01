/**
 * File: scripts/ui/guide.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), Web Storage
 *
 * Description:
 * Decides whether the intro guide is shown, and remembers that it has been.
 *
 * The guide appears before the camera is requested rather than after. A
 * permission prompt that arrives with no explanation is the most common reason
 * a camera request is refused, and a refusal cannot be retried without the user
 * changing a browser setting, so the explanation has to come first.
 *
 * The stored flag is the only thing this application writes to the device. It
 * records a single boolean and holds nothing that identifies anyone.
 */

const STORAGE_KEY = 'gesture-fx.guide.seen';

/**
 * Whether the guide has been dismissed before.
 *
 * Storage access throws rather than returning null in a browser configured to
 * block site data, and in a Safari private window. The guide is shown in that
 * case, which is the correct outcome: it is better to explain twice than to
 * fail to explain at all.
 */
export function hasSeenGuide(): boolean {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

/** Records that the guide has been dismissed. */
export function markGuideSeen(): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
        // Storage is unavailable. The guide will be shown again next visit,
        // which is a smaller cost than failing to start.
    }
}
