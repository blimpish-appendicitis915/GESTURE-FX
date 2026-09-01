/**
 * File: scripts/config.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * Every tunable constant in the application, collected in one file so that
 * behaviour can be adjusted without reading the modules that consume it.
 *
 * The gesture thresholds are the values a contributor is most likely to want to
 * change. Each one records what it measures and why it holds its current value,
 * because a bare number in a detector is not reviewable.
 */

import type { PortalStyleId } from './effects/portal-styles';

/** Where the MediaPipe runtime and model are fetched from. */
export const TRACKING_ASSETS = {
    /**
     * The WebAssembly runtime directory. jsDelivr is used rather than the
     * repository because the runtime is 11.8 MB, and serving it from a public
     * CDN keeps it off the GitHub Pages bandwidth allowance while giving
     * returning visitors a shared cache.
     *
     * Run `npm run vendor:models` to copy these into the repository instead.
     */
    wasmBase: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',

    /** The hand landmark model: 21 points per hand, float16, 7.8 MB. */
    modelUrl:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',

    /** Approximate model size, used to show a determinate progress bar. */
    modelBytes: 7_819_105,

    /**
     * The face detection model, used only for auto-framing.
     *
     * The short range variant, 230 KB, which is two orders below the hand
     * landmarker and is the correct one for a person at arm's length. It is
     * fetched by path rather than by hand, because at this size a progress bar
     * would finish before it could be read.
     */
    faceModelUrl:
        'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
} as const;

/** Camera capture request. The browser may return something smaller. */
export const CAMERA = {
    width: 1280,
    height: 720,
    frameRate: 30,
} as const;

/** Hand tracking behaviour. */
export const TRACKING = {
    /** Two hands are tracked so a two-handed gesture stays possible later. */
    numHands: 2,

    /**
     * Detection is capped below the render rate. Landmark inference is the most
     * expensive step in the frame, and running it at 24 Hz while the canvas
     * renders at 60 Hz is what keeps mid-range phones smooth. Gesture timing is
     * derived from timestamps rather than frame counts, so the lower rate costs
     * accuracy of the trigger instant, not the ability to detect the gesture.
     */
    targetHz: 24,

    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,

    /** Frames retained per hand for the detectors to inspect. */
    historyLength: 48,

    /** A hand absent for longer than this has its detector state reset. */
    absenceResetMs: 400,
} as const;

/**
 * Gesture thresholds.
 *
 * Every distance here is expressed as a ratio of hand span, which is the
 * distance from the wrist to the base of the middle finger. Working in span
 * units rather than pixels is what makes one threshold serve a child's hand at
 * arm's length and an adult's hand filling the frame.
 */
export const GESTURES = {
    /** Below this hand-span fraction of frame height, a hand is ignored. */
    minimumSpan: 0.06,

    palmFlip: {
        /** |palmSign| above which the palm is considered squarely presented. */
        armThreshold: 0.35,

        /** |palmSign| below which the hand is edge-on: the flip instant. */
        crossThreshold: 0.15,

        /** |palmSign| the opposite face must reach for the flip to confirm. */
        confirmThreshold: 0.3,

        /** The palm must be held steady this long before a flip can arm. */
        armHoldMs: 120,

        /**
         * The shortest crossing that is accepted, in milliseconds.
         *
         * This times the passage through edge-on, not the turn. A hand that
         * takes 300 ms to turn over is edge-on for about 40 ms of it, so a
         * guard set at the duration of a turn rejects most real flips; measured
         * against a corpus with known crossing times, 60 ms rejected almost
         * half of them.
         *
         * What the guard has to exclude is a crossing that begins and ends
         * inside one sample, which is what a single inverted landmark frame
         * produces. Everything longer is already excluded by the confirmation,
         * since one bad frame cannot carry the sign to the opposite face and
         * hold it there.
         */
        minimumFlipMs: 20,

        /**
         * The longest crossing that is accepted.
         *
         * This rejects a hand held edge-on, not a hand turned over slowly. A
         * slow turn still passes through edge-on quickly, and is in any case
         * the same gesture performed at a different speed, so firing on it is
         * correct rather than a false positive.
         */
        maximumFlipMs: 600,

        /** Fingers that must be extended, which excludes a rotating fist. */
        minimumExtendedFingers: 3,

        cooldownMs: 1200,
    },

    fist: {
        /** A fist must be held this long, which excludes a hand mid-grasp. */
        holdMs: 260,
        cooldownMs: 1400,
    },

    swipe: {
        /** Horizontal travel in span units required across the window. */
        minimumTravel: 1.6,

        /** The window over which travel is measured. */
        windowMs: 260,

        /** Vertical travel above this fraction of horizontal is not a swipe. */
        maximumVerticalRatio: 0.6,

        cooldownMs: 1000,
    },

    /**
     * A push rather than a hold.
     *
     * Recognising a merely open palm would be wrong: an open palm is also the
     * pose a flip starts from, so every flip would fire a flash first. Requiring
     * the hand to grow toward the lens separates the two gestures by intent.
     */
    palmPush: {
        /** Hand span must grow by this fraction across the window. */
        growthRatio: 0.25,

        /** The window over which growth is measured. */
        windowMs: 300,

        cooldownMs: 1600,
    },

    /**
     * The two-finger pose.
     *
     * Held longer than the other poses. It is the pose most easily produced by
     * accident, because a partly rotated open palm projects to it, and nothing
     * about the gesture needs to be fast.
     */
    victory: {
        holdMs: 420,
        cooldownMs: 1600,
    },
} as const;

/**
 * The rewind buffer, which holds recent frames so an effect can cut to the
 * past. See scripts/render/rewind-buffer.ts for why it exists.
 *
 * The defaults hold three seconds of history. At a quarter resolution and eight
 * captures a second that is 24 frames of 180 by 320, roughly 5.5 MB of texture
 * memory, which is affordable on a phone.
 */
export const REWIND = {
    /** Fraction of the output resolution each stored frame is kept at. */
    resolutionScale: 0.25,

    /** Frames captured per second. Well below the render rate on purpose. */
    captureHz: 8,

    /** Slots in the ring. captureHz multiplied by the seconds of history. */
    frameCount: 24,

    /** How far back a cut reaches, in milliseconds. */
    delayMs: 2200,

    /** Frames that must exist before a cut is attempted. */
    minimumFramesForCut: 8,
} as const;

/**
 * The finger frame: the rectangle a person forms with both hands, used as a
 * window onto a stylised version of the same scene.
 *
 * The quad is four fingertips, two per hand. Everything else here exists to
 * make it hold still. Raw fingertip landmarks move by a percent of the frame
 * every tick even when the hands do not, and a window whose edges shimmer
 * reads as broken however good the picture inside it is.
 *
 * All distances are fractions of the frame width, and all durations are in
 * milliseconds rather than frames, so the window behaves identically whether
 * tracking is running at 24 Hz or at 12 Hz.
 */
export const FRAME = {
    /**
     * Thumb-to-index separation required, as a multiple of hand span.
     *
     * Hysteresis: opening the frame demands a clear L shape, holding it demands
     * much less. Without the gap, a hand rotating toward the camera
     * foreshortens, crosses one threshold, and the window flickers.
     */
    openSeparation: 0.75,
    holdSeparation: 0.24,

    /** Quad area as a fraction of the frame, with the same hysteresis. */
    openArea: 0.020,
    holdArea: 0.004,

    /**
     * Corner smoothing, expressed as the fraction of the gap closed per
     * 16.7 ms, then rescaled to the real frame interval.
     *
     * The coefficient adapts to speed: a nearly still corner is smoothed hard,
     * which removes the jitter, and a moving corner is barely smoothed, so the
     * window stays glued to the fingers instead of trailing them.
     */
    smoothingSlow: 0.30,
    smoothingFast: 0.85,

    /** Movement, in frame widths per frame, that selects the fast coefficient. */
    fastMovement: 0.05,

    /**
     * A quad that jumps further than this in one update is treated as a
     * mis-detection, which occlusion and crossing hands both produce, and is
     * only accepted once it persists.
     */
    teleportDistance: 0.30,
    teleportConfirmMs: 120,

    /** Tracking may drop for this long before the window begins to close. */
    dropoutHoldMs: 240,

    /** Fade in and out durations for the window. */
    fadeInMs: 140,
    fadeOutMs: 240,
} as const;

/**
 * The surface representation every finger frame style is built on.
 *
 * A cartoon has flat interiors and sharp boundaries. One pass of an
 * edge-preserving filter removes noise; a sequence of them collapses each
 * region onto its own colour and leaves the boundary where it was, which is the
 * property the styles need and the one a single-tap filter cannot supply.
 *
 * See scripts/render/shaders/abstraction.ts for the kernel and
 * scripts/render/renderer.ts for the ping-pong that iterates it.
 */
export const ABSTRACTION = {
    /**
     * Fraction of the output resolution the pass runs at.
     *
     * Chosen for reach rather than for cost. A kernel of a fixed tap count
     * spans twice as much of the full frame here, which is what turns skin and
     * clothing into single regions instead of merely smoothing their grain. The
     * softness the reduction leaves at a boundary is removed again by the
     * quantisation inside each style.
     */
    resolutionScale: 0.5,

    /**
     * The colour width of the range term, one entry per iteration.
     *
     * Coarse to fine. A bilateral filter rejects a neighbour that differs by
     * much more than this width, which is what preserves a boundary and is
     * also what makes a narrow filter keep heavy noise: in a dim room two
     * adjacent pixels of one surface can differ by more than the width, and
     * each grain is then protected as though it were an edge. The first pass is
     * wide enough to average that away and the later passes narrow again, which
     * restores the boundaries the first pass softened.
     *
     * The length of this list is the iteration count.
     */
    rangeSchedule: [0.24, 0.14, 0.09],
} as const;

/**
 * Auto-framing: following the subject by moving the crop.
 *
 * The output frame is already a crop of a wider sensor, so the crop can slide
 * to follow a face without moving anything physical. See
 * scripts/tracking/face.ts for the detector and the smoothing, and
 * scripts/render/renderer.ts for where the offset is applied.
 */
export const AUTO_FRAME = {
    /**
     * Face detections per second.
     *
     * A head crosses a frame in about a second, so eight measurements is more
     * than the smoothing can use, and the saving is the whole cost of running a
     * second model on a phone.
     */
    detectHz: 8,

    minimumConfidence: 0.5,

    /**
     * How much the crop is tightened to buy room to pan.
     *
     * A portrait output from a landscape camera has horizontal room already and
     * no vertical room at all. Tightening by an eighth gives both axes somewhere
     * to go, at a cost in resolution small enough not to be visible in the
     * export. It is the same trade a hardware auto-framing camera makes.
     */
    zoom: 1.14,

    /**
     * Where the face sits vertically, as a fraction from the top of the output.
     *
     * Above the middle. A head centred exactly leaves a band of empty space
     * above it and cuts the shoulders, which is why portraits are not framed
     * that way.
     */
    targetHeight: 0.40,

    /**
     * Motion below this, in frame widths, is not followed at all.
     *
     * Detection jitters by about a percent of the frame while the subject sits
     * still, and a crop that answers each of those is unwatchable.
     */
    deadZone: 0.035,

    /** Fraction of the remaining error closed per 16.7 ms, then rescaled. */
    smoothing: 0.055,

    /** The last framing is held this long after the face is lost. */
    lostHoldMs: 1200,
} as const;

/**
 * Voice control.
 *
 * See scripts/voice/commands.ts, which also documents where the audio goes:
 * this is the one feature in the application that is not local, and the
 * interface says so rather than implying otherwise.
 */
export const VOICE = {
    /**
     * How long after a recognised command the next one is ignored.
     *
     * Interim results are used so a command fires as the word is said rather
     * than a second later, and an interim transcript grows word by word. Without
     * a hold-off, one utterance fires its command on every update.
     */
    cooldownMs: 1500,

    /**
     * Delay before restarting a session the service has ended.
     *
     * Chrome ends one after a few seconds of silence whatever the continuous
     * flag says. Restarting immediately after a permission failure spins.
     */
    restartDelayMs: 250,

    /** Consecutive failures after which listening is abandoned. */
    maximumFailures: 4,

    /**
     * How often a stopped session is noticed and restarted.
     *
     * The lifecycle events are not reliable across engines: a session can end
     * without raising one, and one that failed to start raises neither. A
     * periodic check that listening is wanted but not happening is the only
     * construction that covers both. It also covers the case this feature is
     * most likely to meet, which is a recording taking the microphone.
     */
    watchdogMs: 4_000,

    /**
     * How many words at the end of a transcript a command may appear in.
     *
     * People do not speak in commands. "Okay stop now" and "right, that is
     * enough, cut" both end on a word that means nothing, so a phrase is looked
     * for anywhere in this window rather than only at the end.
     *
     * Three is the width that separates the two cases. It covers the words
     * someone adds after an instruction and excludes one buried in a sentence:
     * "stop now" is heard, and "do not stop the presses just yet" is not.
     */
    commandWindowWords: 3,
} as const;

/**
 * The optional restyle, which uses the user's own Gemini key.
 *
 * Everything else in this application runs on the device and costs nothing.
 * This does neither, which is why it is opt-in at every step: a key has to be
 * entered, a mode has to be armed before the take, and the generation has to be
 * started by hand.
 *
 * See scripts/ai/gemini.ts for the exchange and scripts/ai/composite.ts for
 * what is done with the result.
 */
export const AI = {
    /**
     * The video editing model.
     *
     * Mutable, and editable in the interface, because it is a preview: preview
     * model names change, and a fixed one turns a working feature into a dead
     * one on the day it is renamed. The panel shows the service's own 404 when
     * that happens, which names the problem exactly.
     */
    model: 'gemini-omni-flash-preview',

    /**
     * The largest clip the API accepts inline.
     *
     * Above this the file has to be uploaded separately first, which is a
     * second endpoint and a second failure mode for a feature whose useful
     * clips are a few seconds long. The recording cap below keeps takes under
     * it instead.
     */
    maximumUploadBytes: 15 * 1024 * 1024,

    /**
     * How long a take may run while the restyle mode is armed.
     *
     * At the project's bitrate ten seconds is around seven megabytes, which
     * leaves generous room under the inline limit. It is also about as much as
     * anyone wants to pay for per attempt.
     */
    maximumClipMs: 10_000,

    /** How often the running job is asked whether it has finished. */
    pollIntervalMs: 5_000,

    /** How long to keep asking. Generation is measured in minutes. */
    generationTimeoutSeconds: 900,

    /** Reads of a returned file reference before giving up on it becoming ready. */
    fileReadyAttempts: 60,

    /** Where a key comes from, linked wherever one is asked for. */
    keyUrl: 'https://aistudio.google.com/apikey',
};

/** Recording and export behaviour. */
export const RECORDING = {
    /** Frame rate requested from the canvas capture stream. */
    fps: 30,

    videoBitsPerSecond: 6_000_000,

    /**
     * A timeslice is passed to MediaRecorder.start so that chunks arrive while
     * recording rather than only at the end. Safari has a long-standing defect
     * where the stop event does not always fire; holding chunks as they arrive
     * means a recording can still be salvaged when it does not.
     */
    timesliceMs: 1000,

    /** How long to wait for the stop event before assembling what was received. */
    stopTimeoutMs: 2000,

    /**
     * Container preference, in two lists because the choice depends on whether
     * the take carries sound.
     *
     * A MediaRecorder given an explicit codec list encodes those codecs and no
     * others. A string naming a video codec alone therefore produces a silent
     * file even when an audio track is attached to the stream, and it does so
     * without raising anything: the track is accepted and then ignored. The
     * candidate offered for a take with sound must name an audio codec.
     *
     * MP4 leads both lists because it is the format a phone gallery and every
     * social platform accept without conversion, and it is the only container
     * Safari wrote before version 18.4. Each list ends with a bare container so
     * that a browser which rejects every explicit combination still records.
     */
    mimeCandidatesWithAudio: [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9,vorbis',
        'video/webm',
    ],

    mimeCandidatesSilent: [
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
    ],

    /**
     * Bit rate for the audio track.
     *
     * Speech at 128 kbit/s is transparent for this purpose and costs about a
     * megabyte a minute, which is immaterial beside the video track.
     */
    audioBitsPerSecond: 128_000,

    /** Recording stops automatically here to bound memory use on phones. */
    maximumDurationMs: 60_000,

    /**
     * How long the canvas may go unpainted during a recording before the
     * take is abandoned.
     *
     * A canvas capture stream emits frames only when the canvas is painted,
     * and a browser stops painting a window it considers not visible even
     * when `document.hidden` remains false, which happens when the window is
     * fully occluded on some platforms. The recording then encodes nothing
     * and the failure only surfaces at the end, after the take is lost.
     *
     * Two and a half seconds is comfortably longer than any frame this
     * application draws, and short enough that the user is told while they
     * can still do something about it.
     */
    renderStallMs: 2_500,
} as const;

/** Output framing. Portrait is the default because the output is for phones. */
export const OUTPUT = {
    aspects: {
        portrait: { label: '9:16', width: 720, height: 1280 },
        square: { label: '1:1', width: 1080, height: 1080 },
        landscape: { label: '16:9', width: 1280, height: 720 },
    },
    defaultAspect: 'portrait',
} as const;

export type AspectName = keyof typeof OUTPUT.aspects;

/** Countdown shown before recording starts, in seconds. */
export const COUNTDOWN_SECONDS = 3;

/** The countdown lengths offered in settings. */
export const COUNTDOWN_CHOICES = [0, 3, 5] as const;

/**
 * Named sensitivity presets.
 *
 * The value is a multiplier applied to the gesture thresholds above. A higher
 * number recognises a gesture more readily: magnitude thresholds and hold
 * durations are divided by it, and the time windows a movement may occupy are
 * multiplied by it.
 *
 * The setting exists because the correct trade-off is genuinely personal. A
 * user recording a deliberate, rehearsed take wants the strict end, where
 * nothing fires by accident. A user demonstrating the tool to somebody wants
 * the permissive end, where the gesture works on the first attempt. No single
 * default serves both, so the choice is theirs.
 */
export const SENSITIVITY_PRESETS = {
    precise: { label: 'Precise', multiplier: 0.8 },
    balanced: { label: 'Balanced', multiplier: 1.0 },
    relaxed: { label: 'Relaxed', multiplier: 1.3 },
} as const;

export type SensitivityName = keyof typeof SENSITIVITY_PRESETS;

/**
 * Settings the user controls at runtime.
 *
 * Mutable by design, and the only mutable export in this file. The detectors
 * read it through the helpers in gestures/sensitivity.ts rather than reading it
 * directly, so a preset change takes effect on the very next tracked frame
 * without anything being rebuilt.
 */
export const SETTINGS = {
    sensitivity: 'balanced' as SensitivityName,

    /**
     * What the two-hand window shows.
     *
     * Every style is a shader compiled at start-up, so switching costs a program
     * change rather than a stall, and none of them is more expensive to run than
     * any other from the user's point of view.
     */
    portalStyle: 'anime' as PortalStyleId,
    countdownSeconds: COUNTDOWN_SECONDS as number,

    /**
     * Whether a front camera is presented and recorded mirrored.
     *
     * On by default because a mirrored preview is what a person expects when
     * looking at themselves. Worth switching off when anything in shot carries
     * text, which a mirror renders backwards in the exported file.
     */
    mirrorPreview: true,

    /**
     * Whether the crop follows the subject's face.
     *
     * On by default. The gesture this application is built around occupies both
     * hands, which means the device is propped rather than held, which means it
     * is not pointed accurately. Following the face is the difference between a
     * usable take and a re-take.
     */
    autoFrame: true,

    /**
     * Whether spoken commands start and stop a take.
     *
     * Off by default, and it is the only setting in this file that defaults off
     * for a reason other than taste. Speech recognition in Chrome and Edge sends
     * microphone audio to the browser vendor, and a feature that does that must
     * be chosen rather than discovered.
     */
    voiceControl: false,
};
