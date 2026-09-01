/**
 * File: scripts/recording/microphone.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: September 1 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), WebRTC getUserMedia
 *
 * Description:
 * Owns the microphone: asks for it once, then opens and closes it per take.
 *
 * Permission and possession are deliberately separate here, because the
 * application wants one and not the other for most of a session.
 *
 * Permission is asked for when the camera is, for two reasons. A browser shows
 * one sheet for a request naming both devices and two sheets for two requests,
 * so asking together is a single interruption. And a device first acquired when
 * the record button is pressed is acquired during the opening of the take, so
 * the first moment of the recording is missing or silent.
 *
 * Possession is held only while recording. An open capture is not free: speech
 * recognition wants the same device, and a microphone held for the whole session
 * both keeps the browser's recording indicator lit and can starve the recogniser
 * of audio. Between takes the device is closed and the granted permission is
 * remembered, so re-opening it costs no prompt and is effectively immediate.
 *
 * A refusal is not an error. The session continues without sound, because a
 * declined microphone should cost the user their audio and not their video.
 */

/** What became of the request. Sticky: it survives the device being closed. */
export type MicrophonePermission = 'unknown' | 'granted' | 'denied' | 'unsupported';

export class Microphone {
    private stream: MediaStream | null = null;
    private granted: MicrophonePermission = 'unknown';

    /** Whether the device is open right now. */
    get isOpen(): boolean {
        return this.tracks().some((track) => track.readyState === 'live');
    }

    /**
     * Whether sound can be recorded, whether or not the device is open.
     *
     * This is what the interface reflects. Asking `isOpen` there would show the
     * control as off between takes, which is exactly when the user looks at it.
     */
    get isAvailable(): boolean {
        return this.granted === 'granted';
    }

    /** The outcome of the last request. */
    get permission(): MicrophonePermission {
        return this.granted;
    }

    /** The live audio tracks, or an empty list when the device is closed. */
    tracks(): MediaStreamTrack[] {
        return this.stream?.getAudioTracks() ?? [];
    }

    /**
     * Asks for the microphone once, and closes it again.
     *
     * Called alongside the camera. The point is the permission and the
     * confirmation that a device exists, not the stream, so the stream is
     * released immediately and re-opened when a take starts.
     */
    async prime(): Promise<MicrophonePermission> {
        const outcome = await this.open();

        this.close();

        return outcome;
    }

    /**
     * Opens the device, or confirms it is already open.
     *
     * Safe to call before every take. Once permission has been granted the
     * browser does not prompt again, so this is a fast path rather than an
     * interruption.
     */
    async open(): Promise<MicrophonePermission> {
        if (this.isOpen) {
            return this.granted;
        }

        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            this.granted = 'unsupported';

            return this.granted;
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            this.granted = 'granted';
        } catch (error) {
            // Recording without sound is a lesser failure than not recording,
            // so this is reported and never thrown.
            console.warn('[gesture-fx] microphone unavailable, takes will be silent', error);

            this.stream = null;
            this.granted = 'denied';
        }

        return this.granted;
    }

    /**
     * Closes the device, keeping the permission.
     *
     * This is what hands the microphone back to speech recognition and clears
     * the browser's recording indicator between takes.
     */
    close(): void {
        for (const track of this.tracks()) {
            track.stop();
        }

        this.stream = null;
    }

    /** Closes the device and forgets the permission, for teardown. */
    release(): void {
        this.close();
        this.granted = 'unknown';
    }
}
