/**
 * File: scripts/ui/review.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), Object URLs
 *
 * Description:
 * Presents a finished recording for playback, and manages the object URL that
 * backs it.
 *
 * The URL management is the substance here. A recording is tens of megabytes,
 * and an object URL keeps its blob alive until it is explicitly revoked. A user
 * who records ten takes without the previous URL being released holds every one
 * of them in memory, which is enough to have the tab discarded on a phone. The
 * previous URL is therefore revoked whenever a new clip is presented and again
 * when the panel closes.
 */

import { formatBytes, formatDuration } from '../core/format';
import type { RecordedClip } from '../recording/recorder';

export class ReviewPanel {
    private objectUrl: string | null = null;

    constructor(
        private readonly video: HTMLVideoElement,
        private readonly durationSlot: HTMLElement,
        private readonly sizeSlot: HTMLElement,
        private readonly formatSlot: HTMLElement,
    ) {}

    /** Loads a clip into the player and fills in its details. */
    present(clip: RecordedClip): void {
        this.release();

        this.objectUrl = URL.createObjectURL(clip.blob);
        this.video.src = this.objectUrl;
        this.video.load();

        this.repairDuration();

        this.durationSlot.textContent = formatDuration(clip.durationMs);
        this.sizeSlot.textContent = formatBytes(clip.blob.size);
        this.formatSlot.textContent = describeContainer(clip.mimeType);
    }

    /**
     * Forces the player to establish the recording's duration.
     *
     * A file written by MediaRecorder carries no duration in its container
     * header, because the recorder cannot know the length until it stops and
     * does not rewrite what it has already emitted. Players therefore report a
     * duration of Infinity, the scrubber is dead, and the timecode reads
     * "0:00 / 0:00" beside a video that plays perfectly well.
     *
     * Seeking far past the end makes the player scan to the last frame and
     * compute the real duration, after which it is restored to the start. This
     * is the established remedy for the defect and costs one seek.
     */
    private repairDuration(): void {
        const video = this.video;

        const onMetadata = () => {
            if (Number.isFinite(video.duration)) {
                return;
            }

            const onSeeked = () => {
                video.removeEventListener('timeupdate', onSeeked);
                video.currentTime = 0;
            };

            video.addEventListener('timeupdate', onSeeked);

            // Any value beyond the possible length works; this one is far past
            // the maximum recording length by many orders of magnitude.
            video.currentTime = 1e9;
        };

        video.addEventListener('loadedmetadata', onMetadata, { once: true });
    }

    /** Stops playback and frees the blob. Called when the panel closes. */
    release(): void {
        this.video.pause();
        this.video.removeAttribute('src');
        this.video.load();

        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = null;
        }
    }
}

/** Turns a recorder MIME type into something worth showing a person. */
function describeContainer(mimeType: string): string {
    if (mimeType.includes('mp4')) return 'MP4';
    if (mimeType.includes('webm')) return 'WebM';
    return 'Video';
}
