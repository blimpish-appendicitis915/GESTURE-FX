/**
 * File: scripts/recording/export.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), Web Share API, Object URLs
 *
 * Description:
 * Delivers a finished recording to the user, and nowhere else.
 *
 * Two routes exist because the platforms differ in what actually works. On a
 * desktop, an anchor with a download attribute saves the file where the user
 * expects it. On a phone, that route is unreliable and lands the file somewhere
 * the user cannot easily find, whereas the Web Share API hands the video to the
 * photo library or straight to another application, which is where a video for
 * social media is going anyway.
 *
 * Neither route uploads anything. The blob is held in the page's own memory and
 * passed to the operating system by reference; no network request is made at
 * any point in this module, which is the whole of the privacy claim in the
 * README made concrete.
 */

import { buildFileName, extensionForMimeType } from '../core/format';

export interface ExportTarget {
    blob: Blob;
    mimeType: string;
}

/**
 * Whether this browser can hand a video file to the operating system.
 *
 * `canShare` is called with a representative file rather than trusted from the
 * presence of `share`, because several browsers expose the API while refusing
 * files, and the difference is only visible through this check.
 */
export function canShareVideo(mimeType: string): boolean {
    if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') {
        return false;
    }

    try {
        const probe = new File([new Blob([], { type: mimeType })], 'probe.mp4', { type: mimeType });
        return navigator.canShare({ files: [probe] });
    } catch {
        return false;
    }
}

/** Saves the recording through the browser's download mechanism. */
export function downloadRecording(target: ExportTarget): string {
    const fileName = buildFileName(extensionForMimeType(target.mimeType));
    const url = URL.createObjectURL(target.blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';

    // The anchor must be in the document for the click to be honoured in
    // Firefox; it is removed again immediately.
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    // The object URL is released on the next turn of the event loop. Revoking
    // it synchronously cancels the download that was just started.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);

    return fileName;
}

/**
 * Passes the recording to the operating system's share sheet.
 *
 * Returns false when the user dismisses the sheet, which is a normal outcome
 * and not an error, so the caller can leave the review panel open rather than
 * reporting a failure.
 */
export async function shareRecording(target: ExportTarget): Promise<boolean> {
    const fileName = buildFileName(extensionForMimeType(target.mimeType));
    const file = new File([target.blob], fileName, { type: target.mimeType });

    try {
        await navigator.share({
            files: [file],
            title: 'Recorded with GESTURE-FX',
        });

        return true;
    } catch (error) {
        // A dismissed share sheet rejects with AbortError.
        if (error instanceof DOMException && error.name === 'AbortError') {
            return false;
        }

        throw error;
    }
}
