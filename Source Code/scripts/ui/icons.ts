/**
 * File: scripts/ui/icons.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), SVG
 *
 * Description:
 * One line-art glyph per gesture, drawn to a common 24 unit grid with a
 * consistent stroke weight so the gesture list reads as a set.
 *
 * The icons are inline rather than loaded from a sprite or an icon package,
 * which keeps the application free of a runtime dependency for five small
 * drawings and means they inherit their colour from the surrounding text.
 */

import type { GestureId } from '../gestures/types';

/** Shared attributes, so every glyph has identical weight and joinery. */
const ATTRIBUTES =
    'width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

/** Wraps a path set in the shared SVG element. */
function glyph(body: string): string {
    return `<svg ${ATTRIBUTES}>${body}</svg>`;
}

export const GESTURE_ICONS: Record<GestureId, string> = {
    /** An open hand with a rotation arc around it. */
    'palm-flip': glyph(`
        <path d="M9 12V6a1.4 1.4 0 0 1 2.8 0v6" />
        <path d="M11.8 12V5a1.4 1.4 0 0 1 2.8 0v7" />
        <path d="M14.6 12V6.5a1.4 1.4 0 0 1 2.8 0V14a6 6 0 0 1-6 6 5 5 0 0 1-4.3-2.4L5 14.4" />
        <path d="M9 12V9.5a1.4 1.4 0 0 0-2.8 0V14" />
        <path d="M4 5.5A7 7 0 0 1 9 3" />
        <path d="M4 3v2.6h2.6" />
    `),

    /** A hand with motion lines trailing behind it. */
    swipe: glyph(`
        <path d="M13 12V6.2a1.4 1.4 0 0 1 2.8 0V13" />
        <path d="M15.8 13V7.4a1.4 1.4 0 0 1 2.8 0V15a5.5 5.5 0 0 1-5.5 5.5 5 5 0 0 1-4.2-2.3L6 14.6" />
        <path d="M13 12V9.6a1.4 1.4 0 0 0-2.8 0V14" />
        <path d="M6 8H2M6.5 11.5H3.5" />
    `),

    /** A closed fist. */
    fist: glyph(`
        <path d="M6 11.5V9a1.5 1.5 0 0 1 3 0v1.5" />
        <path d="M9 10.5V8.6a1.5 1.5 0 0 1 3 0v1.9" />
        <path d="M12 10.5V9a1.5 1.5 0 0 1 3 0v1.5" />
        <path d="M15 10.8V9.8a1.4 1.4 0 0 1 2.8 0V14a6 6 0 0 1-6 6H11a5 5 0 0 1-5-5v-3.5" />
    `),

    /** An open palm with an outward arrow. */
    'palm-push': glyph(`
        <path d="M11 11V5.4a1.4 1.4 0 0 1 2.8 0V11" />
        <path d="M13.8 11V4.6a1.4 1.4 0 0 1 2.8 0V11" />
        <path d="M16.6 11.4V6.4a1.4 1.4 0 0 1 2.8 0V14a6 6 0 0 1-6 6 5 5 0 0 1-4.3-2.4L7 14.4" />
        <path d="M11 11V8.6a1.4 1.4 0 0 0-2.8 0V13" />
        <path d="M4.5 9.5 2 12l2.5 2.5" />
    `),

    /** Two raised fingers. */
    victory: glyph(`
        <path d="m9.5 10.5-1.2-4a1.4 1.4 0 0 1 2.7-.8l1.3 4.4" />
        <path d="M13.2 10.4 14 5.8a1.4 1.4 0 0 1 2.8.4l-.6 5.3" />
        <path d="M16.2 11.5V9.8a1.4 1.4 0 0 1 2.8 0V14a6 6 0 0 1-6 6 5.5 5.5 0 0 1-4.7-2.6L6 13.6" />
    `),
};
