/**
 * File: scripts/ai/styles.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: September 1 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * The prompts sent to the video model, and the constraint every one of them
 * carries.
 *
 * Why alignment is the whole problem
 * ----------------------------------
 * The restyled clip is not the output. It is a texture, revealed through a
 * window whose corners were tracked from the original footage. If the model
 * moves the subject by even a few percent, recentres the shot, or changes the
 * field of view, the window no longer sits where the hands were and the
 * composite falls apart. A generative video model left to itself will do all
 * three, because reframing usually improves the shot it is asked for.
 *
 * So every prompt is a style instruction followed by the same alignment
 * constraint. The style is what the user chose; the constraint is what makes it
 * usable, and it is not optional or editable.
 *
 * The same requirement is imposed by the published finger-frame video app,
 * which is where the approach of restyling first and compositing afterwards was
 * demonstrated. The wording here is this project's own.
 */

/** One offered look. */
export interface RestyleStyle {
    readonly id: string;
    readonly label: string;
    /** Shown under the choice, so the user knows what they are buying. */
    readonly description: string;
    /** The style half of the prompt. Empty for the custom entry. */
    readonly instruction: string;
}

/**
 * The constraint appended to every prompt.
 *
 * Written as a sequence of prohibitions rather than as a description, because a
 * model asked to "preserve the framing" will still improve it, and a model told
 * not to zoom, not to crop and not to recentre generally does not.
 */
export const ALIGNMENT_CONSTRAINT =
    'This is a strictly pixel-aligned restyle of the source video, not a new shot. '
    + 'Do not zoom, crop, recentre, rotate, stabilise or change the field of view. '
    + 'Every person and object must stay at exactly the same position and the same '
    + 'size in the frame as in the source, on every frame: eyes, nose and mouth must '
    + 'remain at the same screen coordinates throughout. Reproduce the performance '
    + 'exactly rather than interpreting it. Match head position, gaze direction, '
    + 'blinks and eyebrow position frame for frame. Preserve how far the mouth is '
    + 'open at each moment, and add no speech or mouth movement that is not already '
    + 'there. Keep the same duration, the same timing and the same background '
    + 'layout. Change the visual style and nothing else.';

/**
 * The presets.
 *
 * Four named looks and one free entry. The named ones exist because a good
 * prompt for a video model is longer than anyone wants to type at the moment
 * they want to press the button, and because a generation costs money: a
 * preset that works is worth more than a text box that usually does not.
 */
export const RESTYLE_STYLES: readonly RestyleStyle[] = [
    {
        id: 'animated',
        label: '3D animated',
        description: 'A feature animation look: sculpted forms, large eyes, soft key light.',
        instruction:
            'Restyle the person as a character from a modern 3D animated feature film. '
            + 'Sculpted, slightly stylised proportions, large expressive eyes, clean '
            + 'subsurface skin shading, soft key lighting and a gentle rim light. Render '
            + 'the background in the same animated idiom.',
    },
    {
        id: 'anime',
        label: 'Anime',
        description: 'Cel animation: flat colour, hard shadow shapes, drawn line work.',
        instruction:
            'Restyle the footage as hand-drawn cel animation in a contemporary anime '
            + 'idiom. Flat painted colour, hard-edged shadow shapes rather than gradients, '
            + 'clean dark line work over the paint, and a painted background.',
    },
    {
        id: 'clay',
        label: 'Claymation',
        description: 'Stop motion in plasticine: fingerprints, matte surfaces, real lighting.',
        instruction:
            'Restyle the footage as stop-motion animation with plasticine puppets on a '
            + 'built set. Matte modelling clay surfaces with visible thumbprints and tool '
            + 'marks, slightly uneven forms, and practical studio lighting with real '
            + 'shadows.',
    },
    {
        id: 'watercolour',
        label: 'Watercolour',
        description: 'Wet-on-wet paint on rough paper, with the grain showing through.',
        instruction:
            'Restyle the footage as a watercolour painting on rough cotton paper. Wet '
            + 'edges where washes meet, pigment pooling at the boundaries of shapes, paper '
            + 'grain visible through the lighter passages, and loose ink line work.',
    },
    {
        id: 'custom',
        label: 'Your own',
        description: 'Describe the look yourself. The alignment constraint is added for you.',
        instruction: '',
    },
];

export const DEFAULT_RESTYLE_STYLE = 'animated';

/** Assembles the prompt actually sent. */
export function buildPrompt(styleId: string, custom: string): string {
    const style = RESTYLE_STYLES.find((candidate) => candidate.id === styleId);
    const instruction = styleId === 'custom' ? custom.trim() : style?.instruction ?? '';

    if (!instruction) {
        throw new Error('Describe the look you want before generating.');
    }

    return `${instruction}\n\n${ALIGNMENT_CONSTRAINT}`;
}
