/**
 * File: scripts/effects/filters.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), GLSL ES 3.00
 *
 * Description:
 * Persistent colour treatments applied to every frame, underneath the
 * gesture-triggered effects.
 *
 * Filters and effects are separate concepts and are kept separate in the
 * pipeline. A filter is a look the user chooses and that stays for the whole
 * recording; an effect is a momentary event a gesture causes. Because the
 * renderer applies filters in a first pass and effects in a second, the two
 * combine freely: six filters and seven effects give forty-two combinations
 * without a single shader written for a pairing.
 *
 * A filter shader receives the cropped, correctly oriented camera frame and
 * returns a colour. It has no access to time or to gesture state, which is what
 * keeps it a look rather than an animation.
 */

export type FilterId = 'none' | 'mono' | 'warm' | 'cool' | 'neon' | 'vhs';

export interface FilterDefinition {
    readonly id: FilterId;

    /** Name shown in the filter selector. */
    readonly label: string;

    /** One line for the control's tooltip. */
    readonly description: string;

    /** The fragment shader body, sharing the standard prelude. */
    readonly fragmentShader: string;
}

/**
 * The identity filter.
 *
 * A slight vignette is applied here rather than in the passthrough effect, so
 * that the frame keeps its boundary against the interface at the corners under
 * every filter rather than only under this one.
 */
const none: FilterDefinition = {
    id: 'none',
    label: 'None',
    description: 'The camera image, untreated.',
    fragmentShader: /* glsl */ `
void main() {
    vec3 colour = sampleSource(v_uv);

    float radius = length(v_screen - 0.5) * 1.41421356;
    colour *= 1.0 - 0.10 * smoothstep(0.55, 1.0, radius);

    fragColour = vec4(colour, 1.0);
}
`,
};

/**
 * Black and white with a lifted contrast curve.
 *
 * Luminance uses the Rec. 709 coefficients rather than an average of the
 * channels, so skin and sky separate the way a panchromatic film renders them
 * instead of flattening together.
 */
const mono: FilterDefinition = {
    id: 'mono',
    label: 'Mono',
    description: 'Black and white with lifted contrast.',
    fragmentShader: /* glsl */ `
void main() {
    vec3 colour = sampleSource(v_uv);

    float grey = luminance(colour);
    grey = clamp((grey - 0.5) * 1.18 + 0.5, 0.0, 1.0);

    // A trace of warmth stops the result reading as a flat grey screen.
    vec3 toned = vec3(grey) * vec3(1.02, 1.0, 0.98);

    float radius = length(v_screen - 0.5) * 1.41421356;
    toned *= 1.0 - 0.16 * smoothstep(0.45, 1.0, radius);

    fragColour = vec4(toned, 1.0);
}
`,
};

/** A warm grade: lifted highlights, amber shadows. */
const warm: FilterDefinition = {
    id: 'warm',
    label: 'Warm',
    description: 'Amber shadows and a soft, lifted highlight.',
    fragmentShader: /* glsl */ `
void main() {
    vec3 colour = sampleSource(v_uv);

    // Channel gain tints the image, then the shadows are lifted toward amber
    // rather than toward grey, which is what makes it read as light quality.
    colour *= vec3(1.09, 1.01, 0.90);
    colour = mix(colour, colour + vec3(0.06, 0.03, 0.0), 1.0 - luminance(colour));

    float radius = length(v_screen - 0.5) * 1.41421356;
    colour *= 1.0 - 0.12 * smoothstep(0.5, 1.0, radius);

    fragColour = vec4(clamp(colour, 0.0, 1.0), 1.0);
}
`,
};

/** A cool grade: cyan shadows, a slight desaturation. */
const cool: FilterDefinition = {
    id: 'cool',
    label: 'Cool',
    description: 'Cyan shadows and a restrained palette.',
    fragmentShader: /* glsl */ `
void main() {
    vec3 colour = sampleSource(v_uv);

    colour *= vec3(0.90, 1.00, 1.10);

    // Pulling saturation down slightly keeps the tint from reading as a fault.
    float grey = luminance(colour);
    colour = mix(vec3(grey), colour, 0.88);

    float radius = length(v_screen - 0.5) * 1.41421356;
    colour *= 1.0 - 0.14 * smoothstep(0.45, 1.0, radius);

    fragColour = vec4(clamp(colour, 0.0, 1.0), 1.0);
}
`,
};

/**
 * A high-saturation grade with an edge glow.
 *
 * The glow is a cheap difference of two samples rather than a true edge
 * detector: sampling the frame at a small offset and taking the difference
 * approximates a gradient for a fraction of the cost, which is what keeps this
 * affordable at 60 fps on a phone.
 */
const neon: FilterDefinition = {
    id: 'neon',
    label: 'Neon',
    description: 'Saturated colour with a glow along the edges.',
    fragmentShader: /* glsl */ `
void main() {
    vec3 colour = sampleSource(v_uv);

    vec2 texel = 1.5 / u_resolution;

    vec3 right = sampleSource(v_uv + vec2(texel.x, 0.0));
    vec3 down = sampleSource(v_uv + vec2(0.0, texel.y));

    float edge = length(colour - right) + length(colour - down);

    float grey = luminance(colour);
    vec3 saturated = mix(vec3(grey), colour, 1.55);

    // The glow is tinted toward the brand cyan and magenta, so the filter and
    // the interface share a palette.
    vec3 glow = mix(vec3(0.18, 0.88, 0.98), vec3(1.0, 0.30, 0.62), colour.r);

    fragColour = vec4(clamp(saturated + glow * edge * 2.2, 0.0, 1.0), 1.0);
}
`,
};

/**
 * A video tape look: scanlines, channel bleed and a soft edge.
 *
 * The channel offset here is fixed and small, unlike the chromatic split
 * effect, because a tape's registration error is constant rather than an event.
 */
const vhs: FilterDefinition = {
    id: 'vhs',
    label: 'Tape',
    description: 'Scanlines, channel bleed and a soft, worn edge.',
    fragmentShader: /* glsl */ `
void main() {
    float bleed = 1.6 / u_resolution.x;

    vec3 colour = vec3(
        sampleSource(v_uv + vec2(bleed, 0.0)).r,
        sampleSource(v_uv).g,
        sampleSource(v_uv - vec2(bleed, 0.0)).b
    );

    // Scanlines are tied to the output height so their spacing is constant on
    // screen rather than varying with the recording resolution.
    float scanline = sin(v_screen.y * u_resolution.y * 1.5) * 0.5 + 0.5;
    colour *= 1.0 - 0.10 * scanline;

    // Static, fixed rather than animated: a tape's grain sits in the picture.
    float grain = hash(v_screen * u_resolution);
    colour += (grain - 0.5) * 0.045;

    colour = clamp((colour - 0.5) * 1.06 + 0.5, 0.0, 1.0);
    colour *= vec3(1.02, 1.0, 0.97);

    float radius = length(v_screen - 0.5) * 1.41421356;
    colour *= 1.0 - 0.24 * smoothstep(0.4, 1.05, radius);

    fragColour = vec4(colour, 1.0);
}
`,
};

/** Registered filters, in presentation order. */
export const FILTERS: readonly FilterDefinition[] = [none, mono, warm, cool, neon, vhs];

export const DEFAULT_FILTER: FilterId = 'none';

const BY_ID = new Map<FilterId, FilterDefinition>(FILTERS.map((filter) => [filter.id, filter]));

/** Returns a filter definition, throwing on an identifier that was never registered. */
export function filterById(id: FilterId): FilterDefinition {
    const filter = BY_ID.get(id);

    if (!filter) {
        throw new Error(`[gesture-fx] no filter is registered under the identifier "${id}"`);
    }

    return filter;
}
