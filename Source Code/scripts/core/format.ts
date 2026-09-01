/**
 * File: scripts/core/format.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * Presentation helpers that turn raw numbers into the strings shown in the
 * interface: the recording timer, the file size in the review panel, the frame
 * rate in the diagnostics readout and the timestamped export file name.
 */

/** Formats a duration in milliseconds as m:ss for the recording timer. */
export function formatDuration(milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Formats a byte count for the review panel, at one decimal place from 1 MB. */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${Math.round(bytes / 1024)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Formats a frame rate for the diagnostics readout. */
export function formatFps(fps: number): string {
    return `${Math.round(fps)} fps`;
}

/**
 * Builds the download file name, for example `gesture-fx-20260831-142530.mp4`.
 *
 * A sortable local timestamp is used rather than an ISO string because colons
 * are not valid in file names on Windows.
 */
export function buildFileName(extension: string, at: Date = new Date()): string {
    const pad = (value: number) => value.toString().padStart(2, '0');

    const stamp = [
        at.getFullYear(),
        pad(at.getMonth() + 1),
        pad(at.getDate()),
        '-',
        pad(at.getHours()),
        pad(at.getMinutes()),
        pad(at.getSeconds()),
    ].join('');

    return `gesture-fx-${stamp}.${extension}`;
}

/** Derives a file extension from a MediaRecorder MIME type. */
export function extensionForMimeType(mimeType: string): string {
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('webm')) return 'webm';
    return 'bin';
}
