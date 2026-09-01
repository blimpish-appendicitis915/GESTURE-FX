/**
 * File: scripts/main.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * The entry point. It constructs the application, starts it, and installs the
 * two last-resort handlers that catch anything the application did not.
 *
 * Those handlers exist because the alternative to a caught failure here is a
 * blank page and a message in a console the user will never open. A visitor who
 * hits an unforeseen error should still be told what happened and offered a way
 * out, even when the fault is one this project did not anticipate.
 */

import { Application } from './app/application';
import { initialiseTheme } from './ui/theme';
import { isObserverCascadeNotice, toPresentableError } from './ui/overlays';

/**
 * Presents a failure that escaped the application.
 *
 * The error overlay is addressed directly rather than through the overlay
 * controller, because reaching this point means the application itself may not
 * have been constructed.
 */
function presentFatalError(error: unknown): void {
    console.error('[gesture-fx] unhandled failure', error);

    const overlay = document.querySelector<HTMLElement>('[data-role="overlay-error"]');
    const title = document.querySelector<HTMLElement>('[data-role="error-title"]');
    const message = document.querySelector<HTMLElement>('[data-role="error-message"]');
    const remedy = document.querySelector<HTMLElement>('[data-role="error-remedy"]');

    if (!overlay || !title || !message || !remedy) {
        return;
    }

    const presentable = toPresentableError(error, 'The application could not start');

    title.textContent = presentable.title;
    message.textContent = presentable.message;
    remedy.textContent = presentable.remedy;

    overlay.hidden = false;
}

function boot(): void {
    // The theme is applied before the application is constructed, so the first
    // paint is already in the right palette and there is no flash of the wrong
    // one on a device set to light.
    initialiseTheme();

    let application: Application;

    try {
        application = new Application();
    } catch (error) {
        presentFatalError(error);
        return;
    }

    void application.start().catch(presentFatalError);

    // Releasing the camera on unload turns the device's recording indicator off
    // immediately rather than when the browser gets around to collecting the
    // page, which matters for a tool that holds a camera.
    window.addEventListener('pagehide', () => application.dispose());
}

// The script is a module and therefore deferred, so the document has already
// been parsed. The readiness check covers the case of it being loaded another
// way, for example by a bookmarklet or an embedding page.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
    boot();
}

window.addEventListener('error', (event) => {
    // The browser's notice about cascading observers is not a failure and has
    // no remedy to offer, so it does not get the failure screen.
    if (isObserverCascadeNotice(event)) {
        return;
    }

    presentFatalError(event.error);
});
window.addEventListener('unhandledrejection', (event) => presentFatalError(event.reason));
