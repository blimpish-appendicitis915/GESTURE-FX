/**
 * File: scripts/ui/theme.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), Web Storage
 *
 * Description:
 * Resolves, applies and remembers the colour theme.
 *
 * Three states rather than two. "System" is the default and is not the same as
 * either fixed choice: it follows the operating system and keeps following it,
 * so a device that switches to dark at sunset takes the application with it.
 * Storing "dark" when the system already says dark would silently break that.
 *
 * The attribute this writes is read only by tokens.css. No JavaScript anywhere
 * else in the project inspects the theme, and no component holds two sets of
 * colours, which is what keeps the two themes from diverging.
 */

export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'gesture-fx.theme';

/** The stored choice, or "system" when nothing valid is stored. */
export function readTheme(): ThemeChoice {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);

        if (stored === 'light' || stored === 'dark' || stored === 'system') {
            return stored;
        }
    } catch {
        // Storage is blocked, as in a private window. The default applies.
    }

    return 'system';
}

/**
 * Applies a choice to the document and remembers it.
 *
 * "System" removes the attribute rather than computing the current preference
 * and writing that, so the media query in tokens.css stays live and the page
 * follows a later change without a reload.
 */
export function applyTheme(choice: ThemeChoice): void {
    const root = document.documentElement;

    if (choice === 'system') {
        root.removeAttribute('data-theme');
    } else {
        root.setAttribute('data-theme', choice);
    }

    updateBrowserChrome();

    try {
        window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
        // The theme still applies for this visit; only persistence is lost.
    }
}

/** Whether the page is currently rendering dark, whatever the choice was. */
export function isDark(): boolean {
    const explicit = document.documentElement.getAttribute('data-theme');

    if (explicit === 'dark') return true;
    if (explicit === 'light') return false;

    // No explicit choice: the system decides, and dark is the fallback when the
    // browser reports no preference at all.
    return !window.matchMedia('(prefers-color-scheme: light)').matches;
}

/**
 * Keeps the browser's own surfaces in step with the page.
 *
 * Without this the address bar on a phone stays dark behind a light page, which
 * is the single most visible sign of a theme that was added rather than built
 * in.
 */
function updateBrowserChrome(): void {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

    if (meta) {
        meta.content = isDark() ? '#06070A' : '#EEF0F4';
    }
}

/**
 * Applies the stored choice and keeps following the system while it is "system".
 *
 * Called once at start-up, before the first paint of the interface.
 */
export function initialiseTheme(): void {
    applyTheme(readTheme());

    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        if (readTheme() === 'system') {
            updateBrowserChrome();
        }
    });
}
