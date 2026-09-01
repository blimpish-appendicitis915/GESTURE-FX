/**
 * File: scripts/camera/camera.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), WebRTC getUserMedia
 *
 * Description:
 * Acquires the camera stream and owns the hidden video element that the tracker
 * and the renderer both read from.
 *
 * The substance of this module is the error translation. A browser reports the
 * single user-visible condition "the camera is not usable" through at least six
 * different DOMException names, and each one needs a different instruction to
 * be actionable, so each is mapped to a cause and a remedy rather than surfaced
 * as a raw message.
 */

import { CAMERA } from '../config';

export type FacingMode = 'user' | 'environment';

export type CameraErrorKind =
    | 'insecure-context'
    | 'unsupported'
    | 'permission-denied'
    | 'not-found'
    | 'in-use'
    | 'no-frames'
    | 'unknown';

/** A camera failure carrying both a cause and the action that resolves it. */
export class CameraError extends Error {
    constructor(
        readonly kind: CameraErrorKind,
        message: string,
        readonly remedy: string,
    ) {
        super(message);
        this.name = 'CameraError';
    }
}

export interface CameraStartOptions {
    facingMode?: FacingMode;
    width?: number;
    height?: number;
}

/** Whether this browser exposes the capture API at all. */
export function isCameraSupported(): boolean {
    return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * Whether the page is allowed to ask for the camera.
 *
 * Capture is gated on a secure context. Localhost qualifies, so the development
 * server works, but a plain HTTP address on a local network does not, which is
 * the most common cause of a camera that works on a desktop and fails on the
 * phone testing against the same machine.
 */
export function isSecureContext(): boolean {
    return window.isSecureContext;
}

/** Maps a getUserMedia rejection onto a cause and a remedy. */
function translate(error: unknown): CameraError {
    const name = error instanceof DOMException ? error.name : '';

    switch (name) {
        case 'NotAllowedError':
        case 'SecurityError':
            return new CameraError(
                'permission-denied',
                'Camera permission was denied.',
                'Select the padlock in the address bar, allow camera access, then reload the page.',
            );

        case 'NotFoundError':
        case 'OverconstrainedError':
            return new CameraError(
                'not-found',
                'No camera was found on this device.',
                'Connect a camera, or open the page on a device that has one.',
            );

        case 'NotReadableError':
        case 'AbortError':
            return new CameraError(
                'in-use',
                'The camera could not be started.',
                'Another application or browser tab may be holding it. Close the others and try again.',
            );

        default:
            return new CameraError(
                'unknown',
                error instanceof Error ? error.message : 'The camera could not be started.',
                'Reload the page and try again.',
            );
    }
}

export class Camera {
    /** The element every other layer reads frames from. It is never displayed. */
    readonly video: HTMLVideoElement;

    private stream: MediaStream | null = null;
    private facing: FacingMode = 'user';

    constructor() {
        const video = document.createElement('video');

        // Both attributes are mandatory on iOS. Without them Safari refuses to
        // play the stream inline and takes it fullscreen instead, which removes
        // the canvas the application is built around.
        video.playsInline = true;
        video.muted = true;
        video.autoplay = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');

        this.video = video;
    }

    get facingMode(): FacingMode {
        return this.facing;
    }

    /** Front cameras are presented mirrored, which the renderer reverses. */
    get isMirrored(): boolean {
        return this.facing === 'user';
    }

    get isRunning(): boolean {
        return this.stream !== null;
    }

    get resolution(): { width: number; height: number } {
        return {
            width: this.video.videoWidth,
            height: this.video.videoHeight,
        };
    }

    async start(options: CameraStartOptions = {}): Promise<void> {
        if (!isSecureContext()) {
            throw new CameraError(
                'insecure-context',
                'Camera access requires a secure connection.',
                'Open this page over HTTPS, or over http://localhost while developing.',
            );
        }

        if (!isCameraSupported()) {
            throw new CameraError(
                'unsupported',
                'This browser does not support camera capture.',
                'Open the page in a current version of Chrome, Edge, Firefox or Safari.',
            );
        }

        this.stop();
        this.facing = options.facingMode ?? this.facing;

        const constraints: MediaStreamConstraints = {
            audio: false,
            video: {
                facingMode: this.facing,
                width: { ideal: options.width ?? CAMERA.width },
                height: { ideal: options.height ?? CAMERA.height },
                frameRate: { ideal: CAMERA.frameRate },
            },
        };

        this.stream = await this.request(constraints);
        this.video.srcObject = this.stream;

        await this.waitForFirstFrame();
    }

    /**
     * Requests the stream, retrying once without a facing constraint.
     *
     * A device with a single camera rejects a facing mode it cannot satisfy, so
     * a laptop with only a front camera fails the rear-camera request. Dropping
     * the constraint and accepting whatever exists is the correct recovery.
     */
    private async request(constraints: MediaStreamConstraints): Promise<MediaStream> {
        try {
            return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
            const isConstraintFailure =
                error instanceof DOMException && error.name === 'OverconstrainedError';

            if (!isConstraintFailure) {
                throw translate(error);
            }

            try {
                return await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
            } catch (retryError) {
                throw translate(retryError);
            }
        }
    }

    /**
     * Resolves once the element reports real pixel dimensions.
     *
     * Waiting on `loadedmetadata` alone is not sufficient: Safari fires it while
     * `videoWidth` is still zero, and uploading a zero-sized frame as a WebGL
     * texture throws. The resize event is included because a camera that
     * renegotiates its resolution reports the change only through that event.
     */
    private async waitForFirstFrame(): Promise<void> {
        const { video } = this;

        // Autoplay can reject before the first user gesture. Frames still
        // arrive, so the rejection is not treated as a failure.
        await video.play().catch(() => undefined);

        if (video.videoWidth > 0) {
            return;
        }

        await new Promise<void>((resolve, reject) => {
            const events = ['loadedmetadata', 'loadeddata', 'resize'] as const;

            const cleanup = () => {
                window.clearTimeout(timer);
                events.forEach((event) => video.removeEventListener(event, onReady));
            };

            const onReady = () => {
                if (video.videoWidth === 0) {
                    return;
                }

                cleanup();
                resolve();
            };

            const timer = window.setTimeout(() => {
                cleanup();
                reject(
                    new CameraError(
                        'no-frames',
                        'The camera opened but never produced a frame.',
                        'Reload the page, and confirm no other application is holding the camera.',
                    ),
                );
            }, 10_000);

            events.forEach((event) => video.addEventListener(event, onReady));
        });
    }

    /**
     * Whether a second camera exists, which decides if the flip control shows.
     *
     * Labels are empty until permission is granted, but the device count is
     * available regardless, and the count is all this needs.
     */
    async hasMultipleCameras(): Promise<boolean> {
        if (!navigator.mediaDevices?.enumerateDevices) {
            return false;
        }

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.filter((device) => device.kind === 'videoinput').length > 1;
        } catch {
            return false;
        }
    }

    async switchFacing(): Promise<void> {
        await this.start({ facingMode: this.facing === 'user' ? 'environment' : 'user' });
    }

    /** Releases the hardware. The camera indicator light goes out here. */
    stop(): void {
        this.stream?.getTracks().forEach((track) => track.stop());
        this.stream = null;
        this.video.srcObject = null;
    }
}
