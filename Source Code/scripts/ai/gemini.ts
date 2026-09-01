/**
 * File: scripts/ai/gemini.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: September 1 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), Fetch, Gemini API
 *
 * Description:
 * Sends a recorded take to Google's video editing model with the user's own key
 * and returns the restyled clip.
 *
 * This is the only module in the project that opens a network connection to
 * anything other than the two static assets fetched at start-up, and it is the
 * only one that handles a secret. Both facts are stated at every layer above
 * it, and neither is hidden here.
 *
 * The shape of the exchange
 * -------------------------
 *   POST v1beta/interactions      the clip, inline and base64, plus the prompt
 *   GET  v1beta/interactions/:id  polled until it settles
 *   GET  v1beta/files/:name       only when the result arrives as a reference
 *
 * The key travels in the `x-goog-api-key` header rather than in the query
 * string, so it does not end up in a proxy log or a browser history entry.
 *
 * Reading the result defensively
 * ------------------------------
 * The interactions endpoint is a preview and its response has more than one
 * documented shape. The output video has been observed both at the top level
 * and inside a step, and delivered both inline and as a file reference. Rather
 * than assume one, `findVideo` searches the places it is known to appear, and a
 * failure to find it reports the payload so the next shape can be added.
 *
 * Errors are surfaced with Google's own message rather than replaced with a
 * generic one. A rejected key, an unavailable preview model, an exhausted quota
 * and a rejected prompt are four different problems with four different fixes,
 * and only the service knows which one happened.
 */

import { AI } from '../config';
import { keyForRequest } from './credentials';

export type RestyleStage = 'encoding' | 'submitting' | 'generating' | 'downloading';

export interface RestyleProgress {
    stage: RestyleStage;
    /** Seconds elapsed since submission, while generating. */
    elapsedSeconds: number;
    /** Whatever the service calls its current state, when it says. */
    detail: string;
}

export type RestyleProgressHandler = (progress: RestyleProgress) => void;

export class RestyleError extends Error {
    constructor(message: string, readonly remedy: string) {
        super(message);
        this.name = 'RestyleError';
    }
}

/** A response object whose shape is only partly known. */
type Loose = Record<string, unknown>;

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * States the service reports while it is still working.
 *
 * Matched by substring, because the vocabulary has changed between revisions of
 * the preview and an unrecognised state is better treated as "still going" than
 * as "finished with nothing".
 */
const PENDING = ['pending', 'progress', 'process', 'running', 'queued', 'working'];

export async function restyle(
    clip: Blob,
    prompt: string,
    onProgress: RestyleProgressHandler,
    signal: AbortSignal,
): Promise<Blob> {
    const key = keyForRequest();

    if (!key) {
        throw new RestyleError(
            'No Gemini key is loaded.',
            'Add your own key in the restyle panel. It stays in this browser.',
        );
    }

    if (clip.size > AI.maximumUploadBytes) {
        throw new RestyleError(
            `The take is ${(clip.size / 1_048_576).toFixed(1)} MB, above the ${(AI.maximumUploadBytes / 1_048_576).toFixed(0)} MB the API accepts inline.`,
            'Record a shorter take. A few seconds is enough, and it costs less.',
        );
    }

    onProgress({ stage: 'encoding', elapsedSeconds: 0, detail: '' });

    const encoded = await toBase64(clip);

    onProgress({ stage: 'submitting', elapsedSeconds: 0, detail: '' });

    let interaction = await request(key, 'interactions', signal, {
        method: 'POST',
        body: JSON.stringify({
            model: AI.model,
            input: [
                { type: 'video', mime_type: baseMediaType(clip.type), data: encoded },
                { type: 'text', text: prompt },
            ],
        }),
    });

    const id = String(interaction.id ?? interaction.name ?? '');

    // The service may answer the first call with a finished result or with a
    // handle to poll. Both are normal, so the loop is entered either way and
    // exits immediately when there is nothing to wait for.
    let waited = 0;

    while (isPending(interaction) && waited < AI.generationTimeoutSeconds) {
        if (!id) {
            throw new RestyleError(
                'The service reported the job as running but returned no identifier for it.',
                'Try again. If it persists, the preview model may have changed its response.',
            );
        }

        await delay(AI.pollIntervalMs, signal);
        waited += AI.pollIntervalMs / 1000;

        onProgress({
            stage: 'generating',
            elapsedSeconds: waited,
            detail: statusOf(interaction),
        });

        interaction = await request(key, `interactions/${id}`, signal);
    }

    if (isPending(interaction)) {
        throw new RestyleError(
            `The generation was still running after ${Math.round(AI.generationTimeoutSeconds / 60)} minutes.`,
            'The job may still finish on Google’s side. Try again with a shorter take.',
        );
    }

    const video = findVideo(interaction);

    if (!video) {
        console.error('[gesture-fx] no video in the interaction response', interaction);

        throw new RestyleError(
            'The service returned no video.',
            'The full response is in the developer console. A refused prompt is the usual cause.',
        );
    }

    onProgress({ stage: 'downloading', elapsedSeconds: waited, detail: '' });

    return collect(key, video, signal);
}

/**
 * One call, with the key in a header and the service's own error message kept.
 *
 * A failed request here is almost always actionable by the user, and only the
 * service can say how. Replacing "API key not valid" with "the request failed"
 * would remove the one piece of information that matters.
 */
async function request(
    key: string,
    path: string,
    signal: AbortSignal,
    init: RequestInit = {},
): Promise<Loose> {
    let response: Response;

    try {
        response = await fetch(`${BASE}/${path}`, {
            ...init,
            signal,
            headers: {
                'x-goog-api-key': key,
                ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            },
        });
    } catch (error) {
        if (signal.aborted) {
            throw error;
        }

        throw new RestyleError(
            'The request to Google did not complete.',
            'Check the network connection. A blocked or offline connection will also cause this.',
        );
    }

    if (!response.ok) {
        throw new RestyleError(
            `Google returned ${response.status}: ${await messageOf(response)}`,
            remedyFor(response.status),
        );
    }

    return (await response.json()) as Loose;
}

/** The service's own error text, when it sends one. */
async function messageOf(response: Response): Promise<string> {
    try {
        const body = (await response.json()) as { error?: { message?: string } };
        const message = body?.error?.message;

        if (message) {
            return message.length > 300 ? `${message.slice(0, 300)}…` : message;
        }
    } catch {
        // A non-JSON error body, which some gateways return. The status alone
        // still identifies the class of problem.
    }

    return response.statusText || 'no message';
}

function remedyFor(status: number): string {
    if (status === 400) {
        return 'The request was rejected. A prompt the safety filter refused, or a clip in a container the model does not accept, are the usual causes.';
    }

    if (status === 401 || status === 403) {
        return 'The key was refused. Check it is a Gemini API key from aistudio.google.com and that the Generative Language API is enabled for its project.';
    }

    if (status === 404) {
        return 'The model was not found. It is a preview and its name changes; set another in the restyle panel.';
    }

    if (status === 429) {
        return 'The quota for this key is exhausted. Wait, or use a key on a billed project.';
    }

    if (status >= 500) {
        return 'The service failed on its side. Waiting a minute and trying again usually works.';
    }

    return 'The message above is Google’s own. It names what to change.';
}

function statusOf(interaction: Loose): string {
    return String(interaction.status ?? interaction.state ?? '').toLowerCase();
}

function isPending(interaction: Loose): boolean {
    const status = statusOf(interaction);

    if (!status) {
        // No status at all means the response is the result. A job that is
        // still running always says so.
        return false;
    }

    return PENDING.some((token) => status.includes(token));
}

/**
 * Finds the output video wherever this revision of the preview put it.
 *
 * Checked in the order they have been observed: a named field at the top level,
 * then any list of outputs, then the contents of each step. A step of type
 * `model_output` is where it currently arrives.
 */
function findVideo(interaction: Loose): Loose | null {
    const named = interaction.output_video ?? interaction.outputVideo;

    if (isObject(named)) {
        return named;
    }

    const lists: unknown[][] = [];

    for (const candidate of [interaction.outputs, interaction.output, interaction.content]) {
        if (Array.isArray(candidate)) {
            lists.push(candidate);
        }
    }

    if (Array.isArray(interaction.steps)) {
        for (const step of interaction.steps) {
            if (isObject(step) && Array.isArray(step.content)) {
                lists.push(step.content);
            }
        }
    }

    for (const list of lists) {
        for (const entry of list) {
            if (!isObject(entry)) {
                continue;
            }

            const type = String(entry.type ?? '');
            const mime = String(entry.mime_type ?? entry.mimeType ?? '');

            if (type.includes('video') || mime.startsWith('video')) {
                return isObject(entry.video) ? entry.video : entry;
            }

            if (isObject(entry.video)) {
                return entry.video;
            }
        }
    }

    return null;
}

/**
 * Turns the reference the service returned into bytes.
 *
 * Inline data is decoded directly. A file reference has to be waited on: the
 * output is uploaded asynchronously and reading it before it reports ACTIVE
 * returns an error rather than a partial file.
 */
async function collect(key: string, video: Loose, signal: AbortSignal): Promise<Blob> {
    const mime = String(video.mime_type ?? video.mimeType ?? 'video/mp4');
    const inline = video.data;

    if (typeof inline === 'string' && inline.length > 0) {
        return new Blob([decodeBase64(inline)], { type: mime });
    }

    const reference = String(video.uri ?? video.file_uri ?? video.fileUri ?? video.url ?? '');

    if (!reference) {
        throw new RestyleError(
            'The service returned a video with neither data nor a location.',
            'The full response is in the developer console.',
        );
    }

    const name = reference.includes('/files/')
        ? `files/${reference.split('/files/')[1].split(/[?#]/)[0]}`
        : reference;

    for (let attempt = 0; attempt < AI.fileReadyAttempts; attempt += 1) {
        const file = await request(key, name, signal);

        if (String(file.state ?? '').includes('ACTIVE')) {
            break;
        }

        await delay(AI.pollIntervalMs, signal);
    }

    const url = /^https?:/.test(reference) ? reference : `${BASE}/${name}:download?alt=media`;
    const response = await fetch(url, { signal, headers: { 'x-goog-api-key': key } });

    if (!response.ok) {
        throw new RestyleError(
            `The finished video could not be downloaded: ${response.status}.`,
            'Try generating again. The job itself succeeded, so this is a transfer failure.',
        );
    }

    return response.blob();
}

function isObject(value: unknown): value is Loose {
    return typeof value === 'object' && value !== null;
}

function decodeBase64(encoded: string): Uint8Array<ArrayBuffer> {
    const binary = atob(encoded);

    // Backed by an explicit ArrayBuffer rather than the default, so the result
    // is a Blob part. The default is typed as possibly shared, which a Blob
    // cannot take.
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));

    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

/**
 * Encodes the clip for the inline upload.
 *
 * `FileReader` rather than a manual loop over the bytes: it runs off the main
 * thread, and a manual encode of several megabytes blocks the interface for
 * long enough to be noticed.
 */
/**
 * The media type without its parameters.
 *
 * A recorder is told which codecs to write and reports them back on the blob,
 * so the type of a take with sound reads `video/mp4;codecs=avc1.42E01E,
 * mp4a.40.2`. The service is being told what kind of file it is receiving, for
 * which the container alone is the answer.
 */
function baseMediaType(type: string): string {
    const base = type.split(';')[0]?.trim();

    return base || 'video/mp4';
}

function toBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const result = String(reader.result);

            // The header is separated from the payload by ';base64,' and not
            // simply by a comma. A recorded clip's type names its codecs, and
            // a codec list contains commas of its own, so taking the first one
            // returns the tail of that list with the payload attached to it.
            const marker = result.indexOf(';base64,');

            if (marker === -1) {
                reject(new RestyleError(
                    'The recording could not be encoded for upload.',
                    'Record the take again.',
                ));

                return;
            }

            resolve(result.slice(marker + ';base64,'.length));
        };

        reader.onerror = () => reject(new RestyleError(
            'The recording could not be read.',
            'Record the take again.',
        ));

        reader.readAsDataURL(blob);
    });
}

/** A wait that a cancellation can interrupt. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(signal.reason);
            return;
        }

        const timer = window.setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);

        function onAbort() {
            window.clearTimeout(timer);
            reject(signal.reason);
        }

        signal.addEventListener('abort', onAbort, { once: true });
    });
}
