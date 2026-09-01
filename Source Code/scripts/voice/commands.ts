/**
 * File: scripts/voice/commands.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: September 1 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), Web Speech API
 *
 * Description:
 * Starts and stops a take, and changes the frame style, by voice.
 *
 * The gesture that makes this project interesting occupies both hands. Reaching
 * for the record button is therefore the one moment the subject has to stop
 * doing the thing they are recording, and it is the moment a countdown only
 * partly solves. Saying the word instead removes it.
 *
 * Honesty about where the audio goes
 * ----------------------------------
 * Everything else in this application runs on the device. This does not. The Web
 * Speech API is implemented in Chrome and Edge by sending the microphone audio
 * to the browser vendor's own speech service, and no page can change that or
 * observe it. Safari runs on-device recognition on recent systems, and Firefox
 * does not implement the interface at all.
 *
 * The consequences are handled rather than hidden. The feature is off until it
 * is switched on, the setting states plainly what it does, and the interface
 * shows while it is listening. `providerNote` returns the sentence the settings
 * panel prints, and it names the vendor rather than saying something vague.
 *
 * Recognising a command inside a sentence
 * ---------------------------------------
 * A first version matched only when the transcript ended with a phrase. It
 * worked in a quiet room and failed in use, because people do not speak in
 * commands: "okay stop now" and "right, that's enough, cut" both end on a word
 * that means nothing, and the utterance is delivered whole once the recogniser
 * finalises it. The matcher therefore looks for a phrase anywhere in the last
 * few words, and scans backwards so the most recent instruction wins. A
 * hold-off after each recognised command stops the growing interim transcript
 * firing the same one repeatedly.
 *
 * Words are compared whole. Without that, "recording" contains "record" and
 * every announcement of what the application is doing would start another take.
 *
 * Holding on to the microphone
 * ----------------------------
 * Recognition and recording both want the microphone, and starting a recording
 * with audio takes it while a session is open. Some builds end the session at
 * that point and some simply stop returning results, so the session is
 * deliberately restarted whenever something else acquires or releases the
 * device, and a watchdog restarts it if it stops for any reason not otherwise
 * noticed. Without those two, voice control appears to work until the first
 * take begins and then silently stops, which is the worst failure available:
 * the user is talking to something that is no longer listening.
 */

import { VOICE } from '../config';
import { PORTAL_STYLES, type PortalStyleId } from '../effects/portal-styles';

/** What a recognised phrase asks for. */
export type VoiceCommand =
    | { kind: 'record' }
    | { kind: 'stop' }
    | { kind: 'style'; style: PortalStyleId };

export type VoiceCommandHandler = (command: VoiceCommand) => void;
export type VoiceStateHandler = (listening: boolean) => void;
export type VoiceErrorHandler = (message: string) => void;

/**
 * The phrases, longest first within each command.
 *
 * More than one wording per command, because the word a person reaches for
 * under a countdown is not the one a menu would have chosen. Longer phrases are
 * listed first so that "stop recording" is recognised as a whole rather than as
 * "stop" followed by a word that happens to contain a command.
 *
 * Nothing here is a word that occurs naturally in conversation on its own.
 * "Go" was tried and removed: it fires on the first half of "going to".
 */
const PHRASES: ReadonlyArray<{ command: VoiceCommand; spoken: readonly string[] }> = [
    {
        command: { kind: 'record' },
        spoken: ['start recording', 'start the recording', 'record', 'action', 'rolling'],
    },
    {
        command: { kind: 'stop' },
        spoken: ['stop recording', 'stop the recording', 'stop', 'cut', 'finish', 'wrap'],
    },
    // Longest phrase first within each style, so "pen and ink" is heard whole
    // rather than as "ink" preceded by two words that meant something else.
    ...PORTAL_STYLES.filter((style) => !style.internal).map((style) => ({
        command: { kind: 'style', style: style.id } as VoiceCommand,
        spoken: [...style.spoken].sort(
            (a, b) => b.split(' ').length - a.split(' ').length,
        ) as readonly string[],
    })),
];

/**
 * Errors that mean "try again", not "give up".
 *
 * Silence is the normal state of a room. A lost microphone is what happens when
 * a recording starts. A network blip is transient by definition. Counting any
 * of the three toward the failure limit switches voice control off during
 * ordinary use.
 */
const TRANSIENT = ['no-speech', 'aborted', 'network'];

// The interface is not in the DOM type library, because it has never left
// draft. Only the members this module uses are declared.
interface SpeechRecognitionLike extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
    onstart: (() => void) | null;
}

interface SpeechRecognitionResultEventLike {
    resultIndex: number;
    results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function constructor(): SpeechRecognitionConstructor | null {
    const scope = window as unknown as {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };

    return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** Whether this browser implements the interface at all. */
export function isVoiceSupported(): boolean {
    return constructor() !== null;
}

/**
 * The language to recognise in.
 *
 * English, because the phrases are English. The browser's own setting is used
 * when it is an English variant, so a British or Indian English speaker gets the
 * model trained for them rather than an American one.
 */
export function recognitionLanguage(): string {
    const preferred = (typeof navigator !== 'undefined' && navigator.language) || '';

    return /^en(-|$)/i.test(preferred) ? preferred : VOICE.language;
}

/**
 * The sentence the settings panel prints under the switch.
 *
 * Written from what the browser actually does rather than from a general
 * warning, because a user deciding whether to switch this on is entitled to
 * know which of the two cases they are in.
 */
export function providerNote(): string {
    if (!isVoiceSupported()) {
        return 'This browser does not offer speech recognition. Chrome, Edge and Safari do.';
    }

    // Chrome and Edge send the audio to Google's speech service. Safari
    // recognises on the device on recent systems. The two are distinguished by
    // the engine rather than by the brand string, which a user agent can lie
    // about far more easily.
    const isWebKit = 'webkitSpeechRecognition' in window && !('chrome' in window);

    return isWebKit
        ? 'Safari recognises speech on this device. Nothing else in this application uses the network.'
        : 'This browser sends microphone audio to its vendor’s speech service while listening. Nothing else in this application leaves your device.';
}

export class VoiceCommands {
    private recognition: SpeechRecognitionLike | null = null;

    /** Set while the user wants this on, whether or not a session is live. */
    private wanted = false;

    /** Set between `onstart` and `onend`, which is when results can arrive. */
    private live = false;

    /**
     * When the last command fired, for the hold-off.
     *
     * Negative infinity rather than zero, because zero is a real instant on the
     * performance clock and means "a command fired as the page loaded". That
     * suppressed every command for the first cooldown after load, which is a
     * window a user can easily be inside and which made the behaviour depend on
     * how fast the page happened to start.
     */
    private lastCommandAt = Number.NEGATIVE_INFINITY;

    /** Consecutive failures, used to give up rather than restart forever. */
    private failures = 0;

    /**
     * Consecutive capture failures outside a recording.
     *
     * Counted separately from `failures` because a lost device is worth
     * retrying indefinitely and worth reporting once.
     */
    private captureFailures = 0;

    /** Set while a recording legitimately holds the microphone. */
    private deviceBusy = false;

    private watchdog = 0;

    constructor(
        private readonly onCommand: VoiceCommandHandler,
        private readonly onState: VoiceStateHandler,
        private readonly onError: VoiceErrorHandler,
        private readonly onUnmatched: (transcript: string) => void = () => {},
    ) {}

    get isListening(): boolean {
        return this.wanted;
    }

    /**
     * Begins listening.
     *
     * The microphone permission prompt is raised by the browser on the first
     * call. The camera has already been granted by this point in the session,
     * which is deliberate: two permission prompts at once is the fastest way to
     * have both refused.
     */
    start(): void {
        const Recognition = constructor();

        if (!Recognition) {
            this.onError('This browser does not offer speech recognition.');
            return;
        }

        if (this.wanted) {
            return;
        }

        this.wanted = true;
        this.failures = 0;

        this.recognition = new Recognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;
        this.recognition.lang = recognitionLanguage();

        this.recognition.onstart = () => {
            this.live = true;
            this.onState(true);
        };

        this.recognition.onresult = (event) => this.consume(event);
        this.recognition.onerror = (event) => this.handleError(event.error);
        this.recognition.onend = () => {
            this.live = false;
            this.restart();
        };

        this.begin();
        this.startWatchdog();
    }

    /** Stops listening and releases the microphone. */
    stop(): void {
        this.wanted = false;
        this.live = false;
        this.stopWatchdog();

        if (this.recognition) {
            this.recognition.onend = null;
            this.recognition.abort();
            this.recognition = null;
        }

        this.onState(false);
    }

    /**
     * Declares whether something else is legitimately using the microphone.
     *
     * A recording takes the device, and the capture errors that follow are
     * expected for as long as it runs. Outside that window the same error means
     * the device has been lost, which the user needs to be told about rather
     * than left to infer from commands that never fire.
     */
    setDeviceBusy(busy: boolean): void {
        this.deviceBusy = busy;

        if (!busy) {
            this.captureFailures = 0;
        }
    }

    /**
     * Restarts the session because something else took the microphone.
     *
     * Called when a recording starts and again when it ends. Aborting raises
     * `onend`, which schedules the restart through the ordinary path, so this
     * is one line rather than a second lifecycle.
     */
    reacquire(): void {
        if (!this.wanted || !this.recognition) {
            return;
        }

        try {
            this.recognition.abort();
        } catch {
            // Already stopping. The watchdog covers the rest.
        }
    }

    private begin(): void {
        try {
            this.recognition?.start();
        } catch {
            // Calling start twice throws. The session is already running, which
            // is the state that was wanted.
        }
    }

    /**
     * Restarts after the service ends the session.
     *
     * Chrome ends one after a few seconds of silence whatever `continuous` says,
     * so a listener that is not restarted stops working a moment after it is
     * switched on. The restart is delayed a little, because an immediate one
     * after a permission failure spins.
     */
    private restart(): void {
        if (!this.wanted) {
            return;
        }

        this.onState(false);

        window.setTimeout(() => {
            if (this.wanted && !this.live) {
                this.begin();
            }
        }, VOICE.restartDelayMs);
    }

    /**
     * Restarts a session that has stopped without saying so.
     *
     * The events are not reliable across engines: a session can end without
     * `onend`, and one that failed to start raises neither. A periodic check
     * that listening is wanted but not happening is the only construction that
     * covers both, and it costs one comparison every few seconds.
     */
    private startWatchdog(): void {
        this.stopWatchdog();

        this.watchdog = window.setInterval(() => {
            if (this.wanted && !this.live) {
                this.begin();
            }
        }, VOICE.watchdogMs);
    }

    private stopWatchdog(): void {
        window.clearInterval(this.watchdog);
        this.watchdog = 0;
    }

    private handleError(error: string): void {
        if (error === 'audio-capture') {
            // Expected for as long as a recording holds the device.
            if (this.deviceBusy) {
                return;
            }

            this.captureFailures += 1;

            if (this.captureFailures === VOICE.captureFailureNotice) {
                this.onError(
                    'The microphone is not reaching speech recognition, so no command '
                    + 'can be heard. Close anything else using it, or switch voice '
                    + 'control off and on again.',
                );
            }

            // Retried regardless: the device may come back on its own.
            return;
        }

        if (TRANSIENT.includes(error)) {
            // Not a failure. Silence and a network blip are both ordinary, and
            // the restart path already handles them.
            return;
        }

        if (error === 'not-allowed' || error === 'service-not-allowed') {
            this.stop();
            this.onError('Microphone access was refused, so voice control is off.');
            return;
        }

        this.failures += 1;

        if (this.failures >= VOICE.maximumFailures) {
            this.stop();
            this.onError('Speech recognition kept failing, so voice control is off.');
        }
    }

    /**
     * Matches the newest transcript against the phrase list.
     *
     * Only results from `resultIndex` onward are read, so a long session does
     * not rescan everything already said. A recognised command holds off the
     * next one for a moment, which is what stops an interim transcript that
     * grows word by word from firing the same command on every update.
     */
    private consume(event: SpeechRecognitionResultEventLike): void {
        const now = performance.now();

        if (now - this.lastCommandAt < VOICE.cooldownMs) {
            return;
        }

        for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            const spoken = result?.[0]?.transcript;

            if (!spoken) {
                continue;
            }

            const command = match(spoken);

            if (command) {
                this.lastCommandAt = now;
                this.failures = 0;
                this.captureFailures = 0;
                this.onCommand(command);
                return;
            }

            // A finished utterance that matched nothing is reported rather than
            // dropped. Without this the only difference between "misheard" and
            // "not listening" is invisible, which is the state this feature was
            // in when it was reported broken. Interim results are skipped: they
            // change on every syllable and would be noise.
            if (result?.isFinal) {
                this.onUnmatched(spoken.trim());
            }
        }
    }
}

/**
 * Finds the most recent phrase in a transcript.
 *
 * Only the last few words are considered, because a command is short and an
 * instruction given thirty seconds ago should not fire again as the transcript
 * lengthens. Within that window the scan runs backwards, so "record, no, stop"
 * stops rather than records.
 */
function match(transcript: string): VoiceCommand | null {
    const words = transcript
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) {
        return null;
    }

    const tail = words.slice(-VOICE.commandWindowWords);

    for (let start = tail.length - 1; start >= 0; start -= 1) {
        for (const entry of PHRASES) {
            for (const phrase of entry.spoken) {
                const wanted = phrase.split(' ');

                if (start + wanted.length > tail.length) {
                    continue;
                }

                if (wanted.every((word, offset) => tail[start + offset] === word)) {
                    return entry.command;
                }
            }
        }
    }

    return null;
}

/** The phrases, for the settings panel and the guide to list. */
export function spokenPhrases(): ReadonlyArray<{ action: string; words: string }> {
    return [
        { action: 'Start recording', words: '“record”, “action”, “rolling”' },
        { action: 'Stop recording', words: '“stop”, “cut”, “finish”' },
        {
            action: 'Change the frame style',
            words: PORTAL_STYLES
                .filter((style) => !style.internal)
                .map((style) => `“${style.spoken[0]}”`)
                .join(', '),
        },
    ];
}
