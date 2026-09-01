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
 * Holds the microphone for the life of the session and lends its tracks to each
 * recording.
 *
 * The microphone is acquired when the camera is, for two reasons. The first is
 * that a browser shows one permission sheet for a request that names both
 * devices and two sheets for two requests, so asking together is a single
 * interruption rather than a pair of them. The second is timing: acquiring a
 * capture device takes a few hundred milliseconds, and a device acquired when
 * the record button is pressed is acquired during the opening of the take. The
 * first moment of the recording is then either missing or silent.
 *
 * A refusal is not an error. The session continues without sound, because a
 * declined microphone should cost the user their audio and not their video.
 */

/** What became of the request, for the interface to report. */
export type MicrophoneState = 'idle' | 'granted' | 'denied' | 'unsupported';

export class Microphone {
    private stream: MediaStream | null = null;
    private state: MicrophoneState = 'idle';

    /** Whether a live audio track is currently held. */
    get isAvailable(): boolean {
        return this.tracks().some((track) => track.readyState === 'live');
    }

    /** The outcome of the last request. */
    get status(): MicrophoneState {
        return this.state;
    }

    /** The live audio tracks, or an empty list when there are none. */
    tracks(): MediaStreamTrack[] {
        return this.stream?.getAudioTracks() ?? [];
    }

    /**
     * Requests the microphone once.
     *
     * Calling it again while a live track is held is a no-op, so it is safe to
     * call on every session start and after a camera switch.
     */
    async acquire(): Promise<MicrophoneState> {
        if (this.isAvailable) {
            return this.state;
        }

        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            this.state = 'unsupported';

            return this.state;
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            this.state = 'granted';
        } catch (error) {
            // Recording without sound is a lesser failure than not recording,
            // so this is reported to the console and to the interface, and
            // nowhere is it thrown.
            console.warn('[gesture-fx] microphone unavailable, takes will be silent', error);

            this.stream = null;
            this.state = 'denied';
        }

        return this.state;
    }

    /** Releases the device, which clears the browser's recording indicator. */
    release(): void {
        for (const track of this.tracks()) {
            track.stop();
        }

        this.stream = null;
        this.state = 'idle';
    }
}
