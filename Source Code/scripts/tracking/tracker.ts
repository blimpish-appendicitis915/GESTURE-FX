/**
 * File: scripts/tracking/tracker.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), MediaPipe Tasks Vision, WebAssembly
 *
 * Description:
 * Loads the MediaPipe hand landmark model and runs inference against the camera
 * frames, emitting a `TrackingFrame` of invariant features per detected hand.
 *
 * Two decisions in this module matter more than the rest.
 *
 * The model is fetched by hand rather than by path so that download progress
 * can be reported. The asset is 7.8 MB and the runtime beside it is 11.8 MB, so
 * a first visit on a mobile connection is a wait that must be shown honestly
 * rather than hidden behind an indeterminate spinner.
 *
 * Inference is throttled below the render rate. Landmark detection is the most
 * expensive operation in the frame, and decoupling it from rendering is what
 * keeps the canvas at 60 fps on hardware that can only track at 24 Hz.
 */

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

import { TRACKING, TRACKING_ASSETS } from '../config';
import { extractFeatures } from './features';
import type { Handedness, Landmark, TrackingFrame } from './landmarks';

/** Stages reported to the loading interface, in the order they occur. */
export type LoadStage = 'runtime' | 'model' | 'ready';

export interface LoadProgress {
    stage: LoadStage;
    /** Fraction complete for the current stage, or null when indeterminate. */
    ratio: number | null;
}

export type LoadProgressHandler = (progress: LoadProgress) => void;

export class TrackerError extends Error {
    constructor(message: string, readonly remedy: string) {
        super(message);
        this.name = 'TrackerError';
    }
}

export class HandTracker {
    private landmarker: HandLandmarker | null = null;

    /**
     * The resolved WebAssembly fileset.
     *
     * Kept so a second task can be built on the same 11.8 MB runtime instead of
     * resolving it again. Auto-framing adds a face detector, and downloading the
     * runtime twice to run it would cost more than the model does.
     */
    private resolvedFileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;

    /** Timestamp of the last inference, used to enforce the target rate. */
    private lastInferenceAt = 0;

    /**
     * The last `video.currentTime` submitted. MediaPipe rejects a timestamp it
     * has already seen, and a paused or stalled element repeats its time, so
     * frames are skipped rather than resubmitted.
     */
    private lastVideoTime = -1;

    private readonly minimumInterval = 1000 / TRACKING.targetHz;

    get isReady(): boolean {
        return this.landmarker !== null;
    }

    /** The runtime, for another task to be built on. Null before `load`. */
    get fileset(): Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null {
        return this.resolvedFileset;
    }

    /**
     * Downloads the runtime and the model and constructs the landmarker.
     *
     * The GPU delegate is attempted first and falls back to CPU. The fallback is
     * not cosmetic: a browser with WebGL disabled, or a device whose driver is
     * blocklisted, fails only at this call, and a CPU tracker at a reduced rate
     * is a far better outcome than a page that does not start.
     */
    async load(onProgress: LoadProgressHandler = () => undefined): Promise<void> {
        if (this.landmarker) {
            return;
        }

        onProgress({ stage: 'runtime', ratio: null });

        let fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

        try {
            fileset = await FilesetResolver.forVisionTasks(TRACKING_ASSETS.wasmBase);
        } catch (error) {
            throw new TrackerError(
                'The hand tracking runtime could not be downloaded.',
                'Check the network connection and reload. A blocked content delivery network will also cause this.',
            );
        }

        onProgress({ stage: 'model', ratio: 0 });

        const modelBuffer = await this.fetchModel((ratio) => {
            onProgress({ stage: 'model', ratio });
        });

        this.resolvedFileset = fileset;
        this.landmarker = await this.createLandmarker(fileset, modelBuffer);

        onProgress({ stage: 'ready', ratio: 1 });
    }

    /**
     * Fetches the model as bytes, reporting progress from the response stream.
     *
     * `Content-Length` is preferred, with the published size from config.ts as
     * the fallback, because a proxy that strips the header would otherwise leave
     * the progress bar at zero for the whole download.
     */
    private async fetchModel(onRatio: (ratio: number) => void): Promise<ArrayBuffer> {
        let response: Response;

        try {
            response = await fetch(TRACKING_ASSETS.modelUrl);
        } catch {
            throw new TrackerError(
                'The hand tracking model could not be downloaded.',
                'Check the network connection and reload the page.',
            );
        }

        if (!response.ok) {
            throw new TrackerError(
                `The hand tracking model returned status ${response.status}.`,
                'Reload the page. If this persists, the model host may be unreachable from this network.',
            );
        }

        const declared = Number(response.headers.get('content-length'));
        const total = Number.isFinite(declared) && declared > 0 ? declared : TRACKING_ASSETS.modelBytes;

        // A response without a readable body cannot be measured, so it is taken
        // whole and reported as complete.
        if (!response.body) {
            const buffer = await response.arrayBuffer();
            onRatio(1);
            return buffer;
        }

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;

        for (;;) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            chunks.push(value);
            received += value.byteLength;
            onRatio(Math.min(received / total, 1));
        }

        const merged = new Uint8Array(received);
        let offset = 0;

        for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.byteLength;
        }

        onRatio(1);

        return merged.buffer;
    }

    private async createLandmarker(
        fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
        modelBuffer: ArrayBuffer,
    ): Promise<HandLandmarker> {
        const build = (delegate: 'GPU' | 'CPU') =>
            HandLandmarker.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetBuffer: new Uint8Array(modelBuffer),
                    delegate,
                },
                runningMode: 'VIDEO',
                numHands: TRACKING.numHands,
                minHandDetectionConfidence: TRACKING.minHandDetectionConfidence,
                minHandPresenceConfidence: TRACKING.minHandPresenceConfidence,
                minTrackingConfidence: TRACKING.minTrackingConfidence,
            });

        try {
            return await build('GPU');
        } catch (gpuError) {
            console.warn('[gesture-fx] GPU delegate unavailable, falling back to CPU', gpuError);

            try {
                return await build('CPU');
            } catch {
                throw new TrackerError(
                    'Hand tracking could not be initialised on this device.',
                    'Update the browser, or try a different one. Hardware acceleration may also be disabled.',
                );
            }
        }
    }

    /**
     * Runs inference if the frame is new and the rate budget allows it.
     *
     * Returns null when the frame was skipped, which the caller treats as "no
     * new information" rather than "no hands", so a gesture in progress is not
     * interrupted by a throttled frame.
     */
    detect(video: HTMLVideoElement, now: number): TrackingFrame | null {
        if (!this.landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            return null;
        }

        if (now - this.lastInferenceAt < this.minimumInterval) {
            return null;
        }

        if (video.currentTime === this.lastVideoTime) {
            return null;
        }

        this.lastInferenceAt = now;
        this.lastVideoTime = video.currentTime;

        let result: ReturnType<HandLandmarker['detectForVideo']>;

        try {
            result = this.landmarker.detectForVideo(video, now);
        } catch (error) {
            // A transient inference failure must not stop the render loop; the
            // next frame is usually fine.
            console.warn('[gesture-fx] inference failed for one frame', error);
            return null;
        }

        const hands = result.landmarks.map((landmarks, index) => ({
            t: now,
            handedness: (result.handedness[index]?.[0]?.categoryName ?? 'Right') as Handedness,
            landmarks: landmarks as Landmark[],
            features: extractFeatures(landmarks as Landmark[]),
        }));

        return { t: now, hands };
    }

    /** Releases the WebAssembly instance and its GPU resources. */
    close(): void {
        this.landmarker?.close();
        this.landmarker = null;
        this.lastVideoTime = -1;
        this.lastInferenceAt = 0;
    }
}
