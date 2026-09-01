/**
 * File: scripts/recording/recorder.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), MediaRecorder, Canvas captureStream
 *
 * Description:
 * Records the composited canvas, with optional microphone audio, and returns a
 * finished clip.
 *
 * The source is the canvas rather than the camera. That is what makes the
 * exported file contain the effects: the recorder sees the same pixels the
 * viewer sees, so nothing has to be applied afterwards and there is no editing
 * step to get wrong.
 *
 * Two defensive measures deserve explanation, because both exist to work around
 * documented defects rather than to add features:
 *
 *   A timeslice is passed to `start`, so encoded chunks arrive throughout the
 *   recording instead of only at the end. Safari has a long-standing defect in
 *   which the stop event intermittently never fires; when it does not, the
 *   chunks already received still constitute a playable file.
 *
 *   `stop` resolves on a timer if that event does not arrive. Without it a user
 *   hitting the defect waits on a promise that never settles, and the interface
 *   is stuck on "finishing" with a recording that was in fact complete.
 */

import { RECORDING } from '../config';
import { selectMimeType } from './capabilities';

export interface RecordedClip {
    blob: Blob;
    mimeType: string;
    durationMs: number;
    /** Whether the stop event fired, or the clip was salvaged on the timeout. */
    clean: boolean;
}

export class RecordingError extends Error {
    constructor(message: string, readonly remedy: string) {
        super(message);
        this.name = 'RecordingError';
    }
}

export interface RecorderStartOptions {
    /**
     * Audio tracks to record alongside the canvas.
     *
     * The recorder does not acquire a device. During a live take these are the
     * session microphone's tracks, held since the camera was granted; during a
     * composite they are the tracks of the take being replayed, which already
     * carry the sound recorded with it. Requesting the microphone here instead
     * would record the room a second time over the first.
     *
     * An empty list, or none, records silently.
     */
    audioTracks?: MediaStreamTrack[];
}

export class Recorder {
    private recorder: MediaRecorder | null = null;
    private canvasStream: MediaStream | null = null;
    private recordedAudio = false;

    private chunks: Blob[] = [];
    private startedAt = 0;

    /** The container the last take was written in. */
    private chosenMimeType: string;

    /**
     * @param mimeType Container to fall back on when the browser reports that
     *                 it can write none of the candidates for the track set.
     */
    constructor(private readonly mimeType: string) {
        this.chosenMimeType = mimeType;
    }

    get isRecording(): boolean {
        return this.recorder?.state === 'recording';
    }

    /** Elapsed recording time, for the interface timer. */
    elapsed(now: number): number {
        return this.startedAt === 0 ? 0 : now - this.startedAt;
    }

    /** Whether an audio track was written into this recording. */
    get hasAudio(): boolean {
        return this.recordedAudio;
    }

    /** The container this take was written in. */
    get containerType(): string {
        return this.chosenMimeType;
    }

    async start(canvas: HTMLCanvasElement, options: RecorderStartOptions): Promise<void> {
        if (this.isRecording) {
            return;
        }

        this.chunks = [];

        const canvasStream = canvas.captureStream(RECORDING.fps);

        this.assertUsableVideoTrack(canvasStream);
        this.canvasStream = canvasStream;

        const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

        // Only live tracks are attached. A track whose device was revoked mid
        // session, by a permission change or by the device being unplugged,
        // would otherwise be declared in the container and never written.
        const audioTracks = (options.audioTracks ?? [])
            .filter((track) => track.readyState === 'live');

        tracks.push(...audioTracks);

        this.recordedAudio = audioTracks.length > 0;

        // The container is chosen here rather than at startup because it must
        // name an audio codec exactly when the take has an audio track. A
        // video-only codec string silently discards sound.
        this.chosenMimeType = selectMimeType(this.recordedAudio) ?? this.mimeType;

        const combined = new MediaStream(tracks);

        try {
            this.recorder = new MediaRecorder(combined, {
                mimeType: this.chosenMimeType,
                videoBitsPerSecond: RECORDING.videoBitsPerSecond,
                ...(this.recordedAudio
                    ? { audioBitsPerSecond: RECORDING.audioBitsPerSecond }
                    : {}),
            });
        } catch {
            // A browser may accept a container from `isTypeSupported` and then
            // reject the bitrate or the exact codec string. Falling back to the
            // default configuration is more useful than failing outright.
            try {
                this.recorder = new MediaRecorder(combined);
                this.chosenMimeType = this.recorder.mimeType || this.chosenMimeType;
            } catch {
                this.releaseStreams();

                throw new RecordingError(
                    'A recorder could not be started for this canvas.',
                    'Try a different browser. Live effects continue to work without recording.',
                );
            }
        }

        this.recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                this.chunks.push(event.data);
            }
        };

        this.startedAt = performance.now();
        this.recorder.start(RECORDING.timesliceMs);
    }

    /**
     * Rejects a capture stream that carries no usable video track.
     *
     * Some Safari builds return a stream whose video track exists but never
     * produces frames, which yields an empty or unplayable file with no error.
     * Checking that a live track is present converts a silent failure into a
     * message the interface can show before the user records anything.
     */
    private assertUsableVideoTrack(stream: MediaStream): void {
        const [track] = stream.getVideoTracks();

        if (!track || track.readyState !== 'live') {
            throw new RecordingError(
                'This browser produced no usable video track from the canvas.',
                'Live effects still work. To record, try Chrome, Edge or Firefox.',
            );
        }
    }

    /** Stops recording and resolves with the assembled clip. */
    async stop(): Promise<RecordedClip> {
        const recorder = this.recorder;

        if (!recorder || recorder.state === 'inactive') {
            throw new RecordingError(
                'There is no recording in progress.',
                'Start a recording before stopping one.',
            );
        }

        const durationMs = performance.now() - this.startedAt;

        const clean = await new Promise<boolean>((resolve) => {
            let settled = false;

            const finish = (wasClean: boolean) => {
                if (settled) {
                    return;
                }

                settled = true;
                window.clearTimeout(timer);
                resolve(wasClean);
            };

            // The documented Safari defect: this may never arrive.
            recorder.onstop = () => finish(true);

            const timer = window.setTimeout(() => {
                console.warn('[gesture-fx] the stop event did not arrive; using received chunks');
                finish(false);
            }, RECORDING.stopTimeoutMs);

            try {
                // Flushes anything buffered since the last timeslice.
                recorder.requestData();
                recorder.stop();
            } catch (error) {
                console.warn('[gesture-fx] stopping the recorder threw', error);
                finish(false);
            }
        });

        this.releaseStreams();
        this.recorder = null;
        this.startedAt = 0;

        const blob = new Blob(this.chunks, { type: this.mimeType });
        this.chunks = [];

        if (blob.size === 0) {
            throw new RecordingError(
                'The recording finished but contained no data.',
                'The tab must stay visible and in front while recording, because a browser stops drawing a window it cannot see. If it was in front the whole time, try Chrome, Edge or Firefox.',
            );
        }

        return { blob, mimeType: this.chosenMimeType, durationMs, clean };
    }

    /**
     * Stops the capture stream without producing a clip.
     *
     * The audio tracks are deliberately left running. They belong to the
     * session rather than to this take, and stopping them here would leave
     * every recording after the first one silent.
     */
    private releaseStreams(): void {
        this.canvasStream?.getTracks().forEach((track) => track.stop());
        this.canvasStream = null;
    }

    /** Abandons a recording in progress, for teardown and error paths. */
    cancel(): void {
        if (this.recorder && this.recorder.state !== 'inactive') {
            this.recorder.onstop = null;

            try {
                this.recorder.stop();
            } catch {
                // Already stopping; nothing further is required.
            }
        }

        this.releaseStreams();
        this.recorder = null;
        this.chunks = [];
        this.startedAt = 0;
    }
}
