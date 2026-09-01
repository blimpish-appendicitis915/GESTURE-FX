/**
 * File: scripts/tracking/face.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), MediaPipe Tasks Vision, WebAssembly
 *
 * Description:
 * Keeps the subject in the middle of the frame by moving the crop rather than
 * the camera.
 *
 * A phone held at arm's length, or propped against something while both hands
 * are busy making a rectangle, does not stay pointed at the person using it.
 * The output frame is already a crop of a wider sensor, so there is room to
 * slide that crop sideways and follow the face, and doing so costs nothing but
 * the detection.
 *
 * Three things separate this from naively centring on the detection.
 *
 * Room to move. A portrait output from a landscape camera has horizontal room
 * and no vertical room at all, so the crop is first tightened by a small factor.
 * That is what buys the freedom to pan in both axes, and it is the same trade a
 * hardware auto-framing camera makes.
 *
 * A soft dead zone. Detection jitters by a percent of the frame while the
 * subject sits still, and a crop that answers every one of those is unwatchable.
 * Motion smaller than the dead zone is ignored entirely, and motion larger than
 * it is followed less the dead zone rather than in full, so the framing crosses
 * the boundary continuously instead of snapping the moment it is exceeded.
 *
 * Rate independence. The smoothing coefficient is written per 16.7 ms and then
 * rescaled to the interval that actually elapsed, so the framing settles at the
 * same speed at 24 Hz and at 120 Hz.
 */

import { FaceDetector, type FilesetResolver } from '@mediapipe/tasks-vision';

import { AUTO_FRAME, TRACKING_ASSETS } from '../config';

/** A point in normalised camera coordinates, origin at the top left. */
export interface FramingTarget {
    x: number;
    y: number;
}

export class FaceFramer {
    private detector: FaceDetector | null = null;

    /** The smoothed framing target, or null while no face has been seen. */
    private smoothed: FramingTarget | null = null;

    private lastDetectionAt = 0;
    private lastFaceAt = 0;
    private lastVideoTime = -1;
    private lastUpdateAt = 0;

    private readonly minimumInterval = 1000 / AUTO_FRAME.detectHz;

    get isReady(): boolean {
        return this.detector !== null;
    }

    /**
     * Loads the face detection model.
     *
     * Called only when auto-framing is switched on, so a user who does not want
     * it never downloads it. The short range model is a quarter of a megabyte,
     * two orders below the hand landmarker, and is the correct one here: this is
     * a person at arm's length, not a crowd across a room.
     */
    async load(fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>): Promise<void> {
        if (this.detector) {
            return;
        }

        const build = (delegate: 'GPU' | 'CPU') =>
            FaceDetector.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetPath: TRACKING_ASSETS.faceModelUrl,
                    delegate,
                },
                runningMode: 'VIDEO',
                minDetectionConfidence: AUTO_FRAME.minimumConfidence,
            });

        try {
            this.detector = await build('GPU');
        } catch {
            // Auto-framing is a convenience. A device that cannot run it on the
            // GPU falls back rather than failing, and a device that cannot run
            // it at all keeps a centred crop.
            this.detector = await build('CPU');
        }
    }

    /**
     * Runs detection if the rate budget allows, and advances the smoothing.
     *
     * Detection is capped far below the render rate. A head crosses a frame in
     * about a second, so eight measurements a second is more than the smoothing
     * can use, and the saving is the whole cost of a second model on a phone.
     */
    update(video: HTMLVideoElement, now: number): void {
        if (!this.detector || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            return;
        }

        const elapsed = this.lastUpdateAt === 0 ? 16.7 : Math.min(now - this.lastUpdateAt, 200);
        this.lastUpdateAt = now;

        this.measure(video, now);
        this.advance(elapsed);
    }

    /** Takes one measurement, subject to the rate budget and a fresh frame. */
    private measure(video: HTMLVideoElement, now: number): void {
        if (now - this.lastDetectionAt < this.minimumInterval) {
            return;
        }

        if (video.currentTime === this.lastVideoTime) {
            return;
        }

        this.lastDetectionAt = now;
        this.lastVideoTime = video.currentTime;

        let detections: ReturnType<FaceDetector['detectForVideo']>['detections'];

        try {
            detections = this.detector!.detectForVideo(video, now).detections;
        } catch {
            // One failed inference must not stop the render loop.
            return;
        }

        const face = this.largest(detections, video);

        if (!face) {
            return;
        }

        this.lastFaceAt = now;

        if (!this.smoothed) {
            // The first sighting is adopted outright. Easing in from the centre
            // of the frame would swing the picture across on every start.
            this.smoothed = face;
            return;
        }

        this.target = face;
    }

    /** The measurement the smoothing is currently heading toward. */
    private target: FramingTarget | null = null;

    /**
     * Picks the face to follow.
     *
     * The largest box, which is the nearest person, and the one holding the
     * device. Following the highest confidence instead would hand the frame to
     * whoever happens to be better lit in the background.
     *
     * The bounding box arrives in pixels of the input image, so it is divided by
     * the video's own dimensions rather than assumed to be normalised.
     */
    private largest(
        detections: ReturnType<FaceDetector['detectForVideo']>['detections'],
        video: HTMLVideoElement,
    ): FramingTarget | null {
        let best: FramingTarget | null = null;
        let bestArea = 0;

        for (const detection of detections) {
            const box = detection.boundingBox;

            if (!box) {
                continue;
            }

            const area = box.width * box.height;

            if (area <= bestArea) {
                continue;
            }

            bestArea = area;
            best = {
                x: (box.originX + box.width / 2) / video.videoWidth,
                y: (box.originY + box.height / 2) / video.videoHeight,
            };
        }

        return best;
    }

    /**
     * Moves the framing toward the target for one frame.
     *
     * The dead zone is applied to the error rather than to the target, so a
     * subject who drifts slowly across the frame is followed the whole way,
     * always trailing by the dead zone, instead of being caught in a series of
     * jumps as the threshold is crossed and reset.
     */
    private advance(elapsed: number): void {
        if (!this.smoothed || !this.target) {
            return;
        }

        const errorX = this.target.x - this.smoothed.x;
        const errorY = this.target.y - this.smoothed.y;
        const distance = Math.hypot(errorX, errorY);

        if (distance <= AUTO_FRAME.deadZone) {
            return;
        }

        // Everything beyond the dead zone is followed, and the dead zone itself
        // never is, which is what makes the boundary continuous.
        const reach = (distance - AUTO_FRAME.deadZone) / distance;

        // The coefficient is written per 16.7 ms and rescaled, so the framing
        // settles at the same speed whatever the frame rate is.
        const alpha = 1 - (1 - AUTO_FRAME.smoothing) ** (elapsed / 16.667);

        this.smoothed = {
            x: this.smoothed.x + errorX * reach * alpha,
            y: this.smoothed.y + errorY * reach * alpha,
        };
    }

    /**
     * The point the crop should be centred on, or null to leave it centred.
     *
     * The last framing is held for a short while after the face is lost, so a
     * subject who turns away or is briefly occluded does not send the picture
     * gliding back to the middle and out again.
     */
    framing(now: number): FramingTarget | null {
        if (!this.smoothed) {
            return null;
        }

        if (now - this.lastFaceAt > AUTO_FRAME.lostHoldMs) {
            return null;
        }

        return this.smoothed;
    }

    /** Forgets the current framing, used when the camera changes. */
    reset(): void {
        this.smoothed = null;
        this.target = null;
        this.lastFaceAt = 0;
        this.lastVideoTime = -1;
    }

    close(): void {
        this.detector?.close();
        this.detector = null;
        this.reset();
    }
}
