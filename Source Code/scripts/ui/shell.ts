/**
 * File: scripts/ui/shell.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), DOM
 *
 * Description:
 * Resolves every element the application interacts with, once, into a typed
 * object.
 *
 * Elements are addressed by a `data-role` attribute rather than by class, so
 * the stylesheets can be reorganised without breaking behaviour, and a missing
 * element throws here with its role named rather than surfacing later as a null
 * dereference in whichever module happened to touch it first.
 */

/** Finds a required element by its role, or throws naming the role. */
function role<T extends HTMLElement>(name: string): T {
    const element = document.querySelector<T>(`[data-role="${name}"]`);

    if (!element) {
        throw new Error(`[gesture-fx] the document is missing [data-role="${name}"]`);
    }

    return element;
}

/** Finds every control that performs an action, of which there may be one. */
function every<T extends HTMLElement>(name: string): T[] {
    const elements = Array.from(document.querySelectorAll<T>(`[data-action="${name}"]`));

    if (elements.length === 0) {
        throw new Error(`[gesture-fx] the document has no [data-action="${name}"]`);
    }

    return elements;
}

/** Finds a required control by the action it performs. */
function action<T extends HTMLElement>(name: string): T {
    const element = document.querySelector<T>(`[data-action="${name}"]`);

    if (!element) {
        throw new Error(`[gesture-fx] the document is missing [data-action="${name}"]`);
    }

    return element;
}

export interface Shell {
    // --- Stage ---------------------------------------------------------
    viewport: HTMLElement;
    viewfinder: HTMLElement;
    canvas: HTMLCanvasElement;

    // --- Viewfinder furniture ------------------------------------------
    recordingPill: HTMLElement;
    timer: HTMLElement;
    trackingPill: HTMLElement;
    framePill: HTMLElement;
    trackingLabel: HTMLElement;
    voicePill: HTMLElement;
    aiPill: HTMLElement;
    toast: HTMLElement;
    toastGesture: HTMLElement;
    toastEffect: HTMLElement;
    countdown: HTMLElement;
    countdownValue: HTMLElement;

    // --- Panel ----------------------------------------------------------
    gestureList: HTMLElement;
    fps: HTMLElement;
    panel: HTMLElement;
    panelBackdrop: HTMLElement;
    openGesturesButton: HTMLButtonElement;
    closeGesturesButton: HTMLButtonElement;

    // --- The strips under the viewfinder ---------------------------------
    filterGroup: HTMLElement;
    styleGroup: HTMLElement;

    // --- Settings --------------------------------------------------------
    settingsList: HTMLElement;
    openSettingsButton: HTMLButtonElement;
    closeSettingsButton: HTMLButtonElement;
    shareAppButton: HTMLButtonElement;

    /**
     * Every control that opens the method panel.
     *
     * There is more than one, because the panel is reached both from the
     * masthead and from the guide, and a reader who has just been told what the
     * application does is exactly the reader who wants to know how.
     */
    openMethodButtons: HTMLElement[];
    closeMethodButton: HTMLButtonElement;

    // --- Controls -------------------------------------------------------
    aspectGroup: HTMLElement;
    record: HTMLButtonElement;
    microphoneButton: HTMLButtonElement;
    switchCameraButton: HTMLButtonElement;
    openGuideButton: HTMLButtonElement;
    toggleRestyleButton: HTMLButtonElement;

    // --- Overlays -------------------------------------------------------
    overlayGuide: HTMLElement;
    overlaySettings: HTMLElement;
    overlayMethod: HTMLElement;
    overlayRestyle: HTMLElement;
    overlayLoading: HTMLElement;
    overlayPermission: HTMLElement;
    overlayError: HTMLElement;
    overlayReview: HTMLElement;

    // --- Loading --------------------------------------------------------
    loadingFill: HTMLElement;
    loadingStage: HTMLElement;
    loadingPercent: HTMLElement;
    loadingDetail: HTMLElement;

    // --- Error ----------------------------------------------------------
    errorTitle: HTMLElement;
    errorMessage: HTMLElement;
    errorRemedy: HTMLElement;
    retryButton: HTMLButtonElement;

    // --- Permission -----------------------------------------------------
    requestCameraButton: HTMLButtonElement;

    // --- Review ---------------------------------------------------------
    reviewVideo: HTMLVideoElement;
    reviewDuration: HTMLElement;
    reviewSize: HTMLElement;
    reviewFormat: HTMLElement;
    downloadButton: HTMLButtonElement;
    shareButton: HTMLButtonElement;
    recordAgainButton: HTMLButtonElement;

    // --- Guide ----------------------------------------------------------
    dismissGuideButton: HTMLButtonElement;

    // --- Restyle ---------------------------------------------------------
    openRestyleButton: HTMLButtonElement;
    closeRestyleButton: HTMLButtonElement;
    restyleKeyEntry: HTMLElement;
    restyleKeyInput: HTMLInputElement;
    restyleRemember: HTMLInputElement;
    restyleSaveKey: HTMLButtonElement;
    restyleKeyLoaded: HTMLElement;
    restyleKeyState: HTMLElement;
    restyleForgetKey: HTMLButtonElement;
    restyleKeyLink: HTMLAnchorElement;
    restyleStyles: HTMLElement;
    restyleCustom: HTMLTextAreaElement;
    restyleModel: HTMLInputElement;
    restyleProgress: HTMLElement;
    restyleFill: HTMLElement;
    restyleStatus: HTMLElement;
    restyleError: HTMLElement;
    restyleGenerate: HTMLButtonElement;
    restyleCancel: HTMLButtonElement;
    restyleDownload: HTMLButtonElement;
    restyleFootnote: HTMLElement;

    // --- Shared ---------------------------------------------------------
    tooltip: HTMLElement;
    tutorialOverlay: HTMLElement;
    tutorialHost: HTMLElement;
}

/** Resolves the shell. Called once, before anything else runs. */
export function resolveShell(): Shell {
    return {
        viewport: role('viewport'),
        viewfinder: role('viewfinder'),
        canvas: role<HTMLCanvasElement>('canvas'),

        recordingPill: role('recording-pill'),
        timer: role('timer'),
        trackingPill: role('tracking-pill'),
        framePill: role('frame-pill'),
        trackingLabel: role('tracking-label'),
        voicePill: role('voice-pill'),
        aiPill: role('ai-pill'),
        toast: role('toast'),
        toastGesture: role('toast-gesture'),
        toastEffect: role('toast-effect'),
        countdown: role('countdown'),
        countdownValue: role('countdown-value'),

        gestureList: role('gesture-list'),
        fps: role('fps'),
        panel: role('panel'),
        panelBackdrop: role('panel-backdrop'),
        openGesturesButton: action<HTMLButtonElement>('open-gestures'),
        closeGesturesButton: action<HTMLButtonElement>('close-gestures'),

        filterGroup: role('filter-group'),
        styleGroup: role('style-group'),

        settingsList: role('settings-list'),
        openSettingsButton: action<HTMLButtonElement>('open-settings'),
        closeSettingsButton: action<HTMLButtonElement>('close-settings'),
        shareAppButton: action<HTMLButtonElement>('share-app'),
        openMethodButtons: every('open-method'),
        closeMethodButton: action<HTMLButtonElement>('close-method'),

        aspectGroup: role('aspect-group'),
        record: role<HTMLButtonElement>('record'),
        microphoneButton: action<HTMLButtonElement>('toggle-microphone'),
        switchCameraButton: action<HTMLButtonElement>('switch-camera'),
        openGuideButton: action<HTMLButtonElement>('open-guide'),
        toggleRestyleButton: action<HTMLButtonElement>('toggle-restyle'),

        overlayGuide: role('overlay-guide'),
        overlaySettings: role('overlay-settings'),
        overlayMethod: role('overlay-method'),
        overlayRestyle: role('overlay-restyle'),
        overlayLoading: role('overlay-loading'),
        overlayPermission: role('overlay-permission'),
        overlayError: role('overlay-error'),
        overlayReview: role('overlay-review'),

        loadingFill: role('loading-fill'),
        loadingStage: role('loading-stage'),
        loadingPercent: role('loading-percent'),
        loadingDetail: role('loading-detail'),

        errorTitle: role('error-title'),
        errorMessage: role('error-message'),
        errorRemedy: role('error-remedy'),
        retryButton: action<HTMLButtonElement>('retry'),

        requestCameraButton: action<HTMLButtonElement>('request-camera'),

        reviewVideo: role<HTMLVideoElement>('review-video'),
        reviewDuration: role('review-duration'),
        reviewSize: role('review-size'),
        reviewFormat: role('review-format'),
        downloadButton: action<HTMLButtonElement>('download'),
        shareButton: action<HTMLButtonElement>('share'),
        recordAgainButton: action<HTMLButtonElement>('record-again'),

        dismissGuideButton: action<HTMLButtonElement>('dismiss-guide'),

        openRestyleButton: action<HTMLButtonElement>('open-restyle'),
        closeRestyleButton: action<HTMLButtonElement>('close-restyle'),
        restyleKeyEntry: role('restyle-key-entry'),
        restyleKeyInput: role<HTMLInputElement>('restyle-key'),
        restyleRemember: role<HTMLInputElement>('restyle-remember'),
        restyleSaveKey: action<HTMLButtonElement>('save-key'),
        restyleKeyLoaded: role('restyle-key-loaded'),
        restyleKeyState: role('restyle-key-state'),
        restyleForgetKey: action<HTMLButtonElement>('forget-key'),
        restyleKeyLink: role<HTMLAnchorElement>('restyle-key-link'),
        restyleStyles: role('restyle-styles'),
        restyleCustom: role<HTMLTextAreaElement>('restyle-custom'),
        restyleModel: role<HTMLInputElement>('restyle-model'),
        restyleProgress: role('restyle-progress'),
        restyleFill: role('restyle-fill'),
        restyleStatus: role('restyle-status'),
        restyleError: role('restyle-error'),
        restyleGenerate: action<HTMLButtonElement>('generate'),
        restyleCancel: action<HTMLButtonElement>('cancel-generate'),
        restyleDownload: action<HTMLButtonElement>('download-generated'),
        restyleFootnote: role('restyle-footnote'),

        tooltip: role('tooltip'),
        tutorialOverlay: role('overlay-tutorial'),
        tutorialHost: role('tutorial-host'),
    };
}
