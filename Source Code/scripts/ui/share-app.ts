/**
 * File: scripts/ui/share-app.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), Web Share API, Clipboard API
 *
 * Description:
 * Shares a link to the application itself, which is a different action from
 * sharing a recording and belongs in a different place.
 *
 * A person who has just made something with a tool wants to tell someone about
 * the tool, and the only thing worth sending is the address. Three routes are
 * tried in order of how well each works on the device in hand: the operating
 * system's share sheet, the clipboard, and finally a prompt the user can copy
 * from by hand. The last exists because the Clipboard API requires a secure
 * context and a recent user gesture, and silently failing to copy is worse than
 * showing the address.
 *
 * Nothing is sent anywhere by this module. It hands a string to the operating
 * system and stops.
 */

/** What is shared. The description is written to be readable on its own. */
const SHARE_PAYLOAD = {
    title: 'GESTURE-FX',
    text: 'Flip your hand and the recording glitches. Gesture-triggered camera effects that run entirely in your browser.',
} as const;

export type ShareOutcome = 'shared' | 'copied' | 'shown' | 'dismissed';

/** Whether the operating system's share sheet is available for a link. */
export function canShareLink(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * Shares the application's address.
 *
 * Returns which route succeeded, so the caller can confirm the right thing:
 * "link copied" and "shared" are different outcomes and a single message for
 * both would be wrong in one of the two cases.
 */
export async function shareApplication(): Promise<ShareOutcome> {
    // The canonical address is preferred over the current one, so a link shared
    // from a local development server still points somewhere useful.
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const url = canonical?.href ?? window.location.href;

    if (canShareLink()) {
        try {
            await navigator.share({ ...SHARE_PAYLOAD, url });
            return 'shared';
        } catch (error) {
            // A dismissed sheet is a deliberate choice, not a failure, and must
            // not fall through to quietly copying something instead.
            if (error instanceof DOMException && error.name === 'AbortError') {
                return 'dismissed';
            }
        }
    }

    try {
        await navigator.clipboard.writeText(url);
        return 'copied';
    } catch {
        // Clipboard access can be refused outright. Showing the address is the
        // last useful thing that can be done with it.
        window.prompt('Copy the link to GESTURE-FX', url);
        return 'shown';
    }
}
