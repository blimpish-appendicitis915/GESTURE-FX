/**
 * File: scripts/recording/capabilities.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), MediaRecorder, Canvas captureStream
 *
 * Description:
 * Determines whether this browser can record the canvas, and which container
 * it should be asked for.
 *
 * The probe runs before the interface is built so that a browser which can
 * apply effects but cannot record them presents as a live effects tool with the
 * record control absent, rather than offering a button that fails when pressed.
 *
 * Container preference is deliberate. MP4 is requested first because it is what
 * a phone's photo library and every social platform accept without conversion,
 * and because Safari wrote nothing else before version 18.4. WebM follows for
 * the browsers that prefer it.
 */

import { RECORDING } from '../config';

export interface RecordingSupport {
    /** Whether a recording can be attempted at all. */
    supported: boolean;

    /** The container to request, or null when nothing is usable. */
    mimeType: string | null;

    /** Why recording is unavailable, for the interface to explain. */
    reason?: string;
}

/** Whether the page can capture a media stream from a canvas element. */
export function isCanvasCaptureSupported(): boolean {
    return typeof HTMLCanvasElement !== 'undefined'
        && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

/** Whether this browser exposes the recording API. */
export function isMediaRecorderSupported(): boolean {
    return typeof MediaRecorder !== 'undefined';
}

/**
 * Selects the first container the browser reports it can write.
 *
 * The candidate list depends on whether the take carries sound, because a
 * container string that names only a video codec yields a silent file when an
 * audio track is present. Selection therefore happens per take, once the track
 * set is known, and not once at startup.
 *
 * `isTypeSupported` is absent on a small number of older builds. Where it is,
 * the first candidate is returned unchecked and a failure surfaces when the
 * recorder is constructed, which the recorder handles.
 */
export function selectMimeType(withAudio = false): string | null {
    if (!isMediaRecorderSupported()) {
        return null;
    }

    const candidates = withAudio
        ? RECORDING.mimeCandidatesWithAudio
        : RECORDING.mimeCandidatesSilent;

    if (typeof MediaRecorder.isTypeSupported !== 'function') {
        return candidates[0];
    }

    for (const candidate of candidates) {
        if (MediaRecorder.isTypeSupported(candidate)) {
            return candidate;
        }
    }

    return null;
}

/** Runs the full probe. Called once, before the interface is built. */
export function probeRecording(): RecordingSupport {
    if (!isCanvasCaptureSupported()) {
        return {
            supported: false,
            mimeType: null,
            reason: 'This browser cannot capture a video stream from a canvas.',
        };
    }

    if (!isMediaRecorderSupported()) {
        return {
            supported: false,
            mimeType: null,
            reason: 'This browser does not provide the MediaRecorder interface.',
        };
    }

    const mimeType = selectMimeType();

    if (!mimeType) {
        return {
            supported: false,
            mimeType: null,
            reason: 'This browser offers no video container that can be written.',
        };
    }

    return { supported: true, mimeType };
}
