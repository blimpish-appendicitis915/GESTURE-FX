/**
 * File: scripts/ai/composite.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: September 1 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), WebGL 2, MediaRecorder
 *
 * Description:
 * Replays a finished take with the generated clip showing through the window
 * the hands drew, and records the result.
 *
 * What is being put back together
 * -------------------------------
 * Three things were kept from the take: the raw recording, the geometry of the
 * window at every instant, and, once the model answers, a redrawn version of
 * the same shot. This module runs all three past each other.
 *
 *     raw take        outside the window
 *     generated clip  inside it
 *     quad track      where the boundary was, at this instant
 *
 * Real time, not frame stepping
 * -----------------------------
 * The obvious construction is to step frame by frame: seek both videos, draw,
 * push a frame, repeat. It does not work here. `MediaRecorder` timestamps what
 * it receives by the clock, not by an index, so three hundred frames pushed as
 * fast as they can be decoded become a two second video of a ten second take.
 * There is no interface for supplying a timestamp.
 *
 * So both clips are played at their own speed and the canvas is captured at the
 * recording rate, exactly as a live take is captured. The duration is then
 * right by construction. The cost is that compositing takes as long as the take
 * does, which for a clip of a few seconds is not worth engineering around.
 *
 * Keeping the two clips together
 * ------------------------------
 * Two media elements playing at once drift. The raw take is treated as the
 * clock and the generated clip is pulled back to it whenever it slips by more
 * than a couple of frames, which is seldom and is invisible when it happens.
 * Correcting on every frame instead would seek continuously and stutter.
 *
 * The sound of the original take is carried across where the browser can hand
 * it over. Where it cannot the composite is silent, which is stated rather than
 * left to be discovered.
 */

import { RECORDING } from '../config';
import { Recorder, type RecordedClip } from '../recording/recorder';
import type { Renderer } from '../render/renderer';
import type { QuadTrack } from '../tracking/quad-track';

/** How far the generated clip may drift before it is pulled back, in seconds. */
const DRIFT_TOLERANCE = 0.08;

/** Guard on a clip whose metadata never arrives. */
const METADATA_TIMEOUT_MS = 8_000;

export interface CompositeProgress {
    /** Fraction of the take replayed, in [0, 1]. */
    fraction: number;
}

export class CompositeError extends Error {
    constructor(message: string, readonly remedy: string) {
        super(message);
        this.name = 'CompositeError';
    }
}

export interface CompositeRequest {
    raw: Blob;
    generated: Blob;
    track: QuadTrack;
    canvas: HTMLCanvasElement;
    renderer: Renderer;
    mimeType: string;
    onProgress: (progress: CompositeProgress) => void;
    signal: AbortSignal;
}

export async function compositeRestyled(request: CompositeRequest): Promise<RecordedClip> {
    const { raw, generated, track, canvas, renderer, mimeType, onProgress, signal } = request;

    const rawUrl = URL.createObjectURL(raw);
    const generatedUrl = URL.createObjectURL(generated);

    const rawVideo = element(rawUrl);
    const generatedVideo = element(generatedUrl);

    // The canvas is resized to the take rather than the take to the canvas. The
    // output preset may have been changed since the recording, and a composite
    // that re-crops the take would move the window off the hands.
    const restoreWidth = canvas.width;
    const restoreHeight = canvas.height;

    const recorder = new Recorder(mimeType);

    try {
        await Promise.all([ready(rawVideo), ready(generatedVideo)]);

        canvas.width = rawVideo.videoWidth;
        canvas.height = rawVideo.videoHeight;

        const duration = Number.isFinite(rawVideo.duration) && rawVideo.duration > 0
            ? rawVideo.duration
            : 0;

        await recorder.start(canvas, { audioTracks: audioFrom(rawVideo) });

        rawVideo.currentTime = 0;
        generatedVideo.currentTime = 0;

        await Promise.all([rawVideo.play(), generatedVideo.play()]);

        await replay({
            rawVideo,
            generatedVideo,
            track,
            renderer,
            duration,
            onProgress,
            signal,
        });

        return await recorder.stop();
    } catch (error) {
        recorder.cancel();

        if (signal.aborted) {
            throw error;
        }

        if (error instanceof CompositeError) {
            throw error;
        }

        throw new CompositeError(
            'The generated take could not be composited.',
            'The generated clip is still downloadable on its own. Recording a shorter take usually avoids this.',
        );
    } finally {
        rawVideo.pause();
        generatedVideo.pause();

        URL.revokeObjectURL(rawUrl);
        URL.revokeObjectURL(generatedUrl);

        canvas.width = restoreWidth;
        canvas.height = restoreHeight;
    }
}

interface ReplayRequest {
    rawVideo: HTMLVideoElement;
    generatedVideo: HTMLVideoElement;
    track: QuadTrack;
    renderer: Renderer;
    duration: number;
    onProgress: (progress: CompositeProgress) => void;
    signal: AbortSignal;
}

/** Draws every frame of the take until the raw clip runs out. */
function replay(request: ReplayRequest): Promise<void> {
    const { rawVideo, generatedVideo, track, renderer, duration, onProgress, signal } = request;

    return new Promise<void>((resolve, reject) => {
        let handle = 0;

        const stop = () => {
            cancelAnimationFrame(handle);
            rawVideo.removeEventListener('ended', onEnded);
            signal.removeEventListener('abort', onAbort);
        };

        const onEnded = () => {
            stop();
            resolve();
        };

        const onAbort = () => {
            stop();
            reject(signal.reason);
        };

        rawVideo.addEventListener('ended', onEnded, { once: true });
        signal.addEventListener('abort', onAbort, { once: true });

        const frame = (now: number) => {
            handle = requestAnimationFrame(frame);

            const time = rawVideo.currentTime;

            // The raw take is the clock. The generated clip is pulled back to it
            // only when it has slipped, because seeking every frame stutters.
            if (Math.abs(generatedVideo.currentTime - time) > DRIFT_TOLERANCE) {
                generatedVideo.currentTime = time;
            }

            renderer.composite(rawVideo, generatedVideo, track.at(time * 1000), now);

            onProgress({ fraction: duration > 0 ? Math.min(1, time / duration) : 0 });
        };

        handle = requestAnimationFrame(frame);
    });
}

function element(url: string): HTMLVideoElement {
    const video = document.createElement('video');

    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    return video;
}

/**
 * Waits for a clip to report its dimensions.
 *
 * A recording assembled from `MediaRecorder` chunks sometimes reports no
 * duration, which is a known container defect and not a failure, so only the
 * dimensions are waited on. The timeout exists because a clip the browser
 * cannot decode at all raises no event of any kind.
 */
function ready(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve, reject) => {
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) {
            resolve();
            return;
        }

        const timer = window.setTimeout(() => {
            cleanup();
            reject(new CompositeError(
                'One of the two clips could not be read by this browser.',
                'The generated clip may be in a container this browser cannot decode. Download it and composite elsewhere.',
            ));
        }, METADATA_TIMEOUT_MS);

        const onReady = () => {
            cleanup();
            resolve();
        };

        const onError = () => {
            cleanup();
            reject(new CompositeError(
                'One of the two clips failed to load.',
                'Try generating again.',
            ));
        };

        const cleanup = () => {
            window.clearTimeout(timer);
            video.removeEventListener('loadedmetadata', onReady);
            video.removeEventListener('error', onError);
        };

        video.addEventListener('loadedmetadata', onReady);
        video.addEventListener('error', onError);
    });
}

/**
 * The original take's audio, where the browser will hand it over.
 *
 * `captureStream` on a media element is unevenly implemented: Firefox spells it
 * differently and Safari does not offer it at all. A composite without sound is
 * a smaller loss than no composite, so a failure here returns nothing and the
 * interface says the sound was not carried across.
 */
function audioFrom(video: HTMLVideoElement): MediaStreamTrack[] {
    const capture = (video as HTMLVideoElement & {
        captureStream?: () => MediaStream;
        mozCaptureStream?: () => MediaStream;
    });

    const take = capture.captureStream ?? capture.mozCaptureStream;

    if (!take) {
        return [];
    }

    try {
        return take.call(video).getAudioTracks();
    } catch {
        return [];
    }
}

/** Whether the composite will carry the take's sound on this browser. */
export function canCarryAudio(): boolean {
    const probe = document.createElement('video') as HTMLVideoElement & {
        captureStream?: unknown;
        mozCaptureStream?: unknown;
    };

    return typeof probe.captureStream === 'function' || typeof probe.mozCaptureStream === 'function';
}

/** Frames a second the composite is captured at, for the interface to state. */
export const COMPOSITE_FPS = RECORDING.fps;
