/**
 * File: scripts/effects/portal-styles.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), GLSL ES 3.00
 *
 * Description:
 * The seven media the finger frame can redraw the scene in.
 *
 * Each entry supplies one GLSL function, `vec3 styleLook(vec2 uv)`, which the
 * portal shader calls for pixels inside the quad and nowhere else. The renderer
 * compiles one portal program per style at start-up, so switching style is a
 * program change rather than a branch inside the fragment shader.
 *
 * Three constructions are shared, and they are what separate these from colour
 * grades.
 *
 * Surface. The abstraction pass has already collapsed each region onto its own
 * colour while keeping boundaries sharp. Every style takes its tone and its
 * colour from that result, so none of them is quantising photographic noise.
 *
 * Structure. Tone is quantised in luminance and the colour is scaled by the
 * ratio of quantised to original luminance. Rounding the three channels
 * independently, which is what a posterise does, drags hues toward the corners
 * of the colour cube and turns skin green. Scaling by a luminance ratio flattens
 * the shading and holds the hue, which is what cel painting does. The step is
 * softened by a hyperbolic tangent, so a band boundary is a sharp edge rather
 * than an aliased one.
 *
 * Texture. Line work is a difference of Gaussians rather than a gradient
 * magnitude. A Sobel response is proportional to local contrast, so it draws a
 * thick smear across a soft edge and speckles across a noisy flat region. A
 * difference of two Gaussians of equal weight is identically zero over any
 * region of constant brightness, whatever that brightness is, and changes sign
 * at a contour. That gives lines of even weight that follow form, and it is the
 * construction the extended difference of Gaussians of Winnemoller et al. is
 * built on. It is read from the surface rather than from the raw frame, because
 * on a camera the two responses to sensor noise and to a weak contour are the
 * same size.
 *
 * The seven are deliberately far apart. One keeps hue and flattens it, one
 * separates the image into process inks and screens them, one discards colour
 * entirely for graphite, one replaces the palette with four fixed inks, and one
 * reduces the frame to black lines on paper. A viewer should be able to name the
 * style from a still with no caption.
 */

export type PortalStyleId =
    | 'anime'
    | 'oil'
    | 'comic'
    | 'poster'
    | 'neon'
    | 'sketch'
    | 'ink'
    | 'restyled';

export interface PortalStyle {
    readonly id: PortalStyleId;
    readonly label: string;
    readonly description: string;

    /**
     * What a person says to select this style by voice.
     *
     * The label is what the button reads, which is not always the word that
     * comes to mind: someone looking at the pencil-drawn window asks for
     * "pencil", and someone who wants the painted one asks for "oil". Each
     * entry is compared as whole words, so none may be a word that occurs on
     * its own in ordinary speech about recording.
     */
    readonly spoken: readonly string[];
    /** A GLSL body defining `vec3 styleLook(vec2 uv)`. */
    readonly shader: string;
    /**
     * Set on a style that is not a choice the user makes.
     *
     * The restyled window is selected by the compositor, never from the
     * settings panel, because it means nothing without a generated clip behind
     * it. It is registered like any other style so it compiles and binds
     * through the same path, and hidden so it is not offered.
     */
    readonly internal?: boolean;
}

/**
 * Helpers shared by every style, prepended once to each portal program.
 *
 * The mark-making helpers work in device pixels, so a halftone or a hatch keeps
 * the same spacing whatever the recording resolution rather than growing with
 * it. A print does not get a coarser screen because it was scanned larger.
 */
export const PORTAL_STYLE_HELPERS = /* glsl */ `
// --- Structure ------------------------------------------------------------

/**
 * Quantises a tone into bands with a controlled edge.
 *
 * The nearest band centre is found, then the offset from it is passed through a
 * hyperbolic tangent. A large sharpness gives a hard cel step that is still
 * antialiased across one band width; a small one gives a soft gradation. A bare
 * floor gives neither, and stair-steps visibly on a face.
 */
float softQuantise(float tone, float bands, float sharpness) {
    float delta = 1.0 / bands;
    float nearest = delta * floor(tone / delta + 0.5);

    return nearest + (delta * 0.5) * tanh(sharpness * (tone - nearest) / delta);
}

/**
 * The tone a band boundary is decided from.
 *
 * A five tap average of the surface rather than a single sample. Quantisation
 * amplifies whatever variation reaches it: a hard step has a slope of several
 * times one at the boundary, so a tone sitting near a band edge turns a
 * variation the eye cannot see into a step it certainly can, and a large flat
 * area then shimmers. Deciding the band from a slightly wider neighbourhood
 * removes that without softening the colour, which is still read per pixel.
 */
float surfaceTone(vec2 uv) {
    vec2 texel = 2.0 / u_resolution;

    float total =
        luminance(sampleAbstract(uv)) * 2.0 +
        luminance(sampleAbstract(uv + vec2(texel.x, 0.0))) +
        luminance(sampleAbstract(uv - vec2(texel.x, 0.0))) +
        luminance(sampleAbstract(uv + vec2(0.0, texel.y))) +
        luminance(sampleAbstract(uv - vec2(0.0, texel.y)));

    return total / 6.0;
}

/** Rescales a colour to a new luminance, holding its hue and saturation. */
vec3 retone(vec3 colour, float from, float to) {
    return clamp(colour * (to / max(from, 1e-3)), 0.0, 1.0);
}

/** Pushes a colour away from its own grey. Above 1.0 saturates. */
vec3 saturate(vec3 colour, float amount) {
    return clamp(mix(vec3(luminance(colour)), colour, amount), 0.0, 1.0);
}

// --- Texture --------------------------------------------------------------

/**
 * The luminance the contour operator reads.
 *
 * Mostly the surface representation, with a small share of the raw frame mixed
 * back in. Reading the raw frame alone does not work on a camera: a difference
 * of Gaussians responds to sensor noise with about the same amplitude as a weak
 * contour, so a flat wall comes back covered in short marks. The abstraction has
 * already removed that noise while leaving the boundaries, which is exactly what
 * a contour operator wants.
 *
 * The share of raw frame restores the fine detail the half resolution reduction
 * cannot carry. It is deliberately small: the noise it readmits is amplified by
 * the same threshold that sharpens the line, so a share large enough to matter
 * for detail is already large enough to speckle a flat wall. A sixth is measured
 * to leave the flat regions clean while keeping an eyelid and a lip.
 */
float contourLuminance(vec2 uv) {
    return luminance(mix(sampleAbstract(uv), sampleSource(uv), 0.16));
}

/** Contour luminance under a 3x3 Gaussian, at a given spacing in texels. */
float blurredLuminance(vec2 uv, float radius) {
    vec2 texel = radius / u_resolution;

    float total =
        contourLuminance(uv + vec2(-texel.x, -texel.y)) * 1.0 +
        contourLuminance(uv + vec2(0.0, -texel.y)) * 2.0 +
        contourLuminance(uv + vec2(texel.x, -texel.y)) * 1.0 +
        contourLuminance(uv + vec2(-texel.x, 0.0)) * 2.0 +
        contourLuminance(uv) * 4.0 +
        contourLuminance(uv + vec2(texel.x, 0.0)) * 2.0 +
        contourLuminance(uv + vec2(-texel.x, texel.y)) * 1.0 +
        contourLuminance(uv + vec2(0.0, texel.y)) * 2.0 +
        contourLuminance(uv + vec2(texel.x, texel.y)) * 1.0;

    return total / 16.0;
}

/**
 * Ink coverage in [0, 1], where 1 is a line and 0 is bare paper.
 *
 * The difference of two Gaussians of ratio 1.6 approximates the Laplacian of a
 * Gaussian, whose zero crossings are the contours. The two are given equal
 * weight on purpose: the difference is then identically zero across any region
 * of constant brightness, so one threshold selects lines on a dark jacket and on
 * a lit face alike. Weighting the outer term below one, which the sharpening
 * form of the operator does, leaves a residue proportional to brightness, and
 * the line weight then drifts with exposure.
 *
 * The value is negative on the dark side of a contour, so a negative threshold
 * selects lines and rejects flat noise.
 *
 * The threshold is a ramp rather than a hyperbolic tangent, and that is not a
 * detail. A tangent approaches its limits without reaching them: at a difference
 * of zero it returns a coverage of one half less half of tanh(sharpness times
 * the bias), which is a small but nonzero amount of ink laid over every flat
 * region in the frame. The effect is a wash that lowers the contrast of every
 * style, and in one that adds its line to a dark ground rather than mixing it
 * in, the wash becomes the picture. A ramp is exactly zero above the bias, which
 * is what the equal weighting of the two kernels was chosen to make possible.
 *
 * The radius sets the line weight, the bias how much contrast a line must carry,
 * and the softness the range of contrast over which it fades in.
 */
float contour(vec2 uv, float radius, float bias, float softness) {
    float inner = blurredLuminance(uv, radius);
    float outer = blurredLuminance(uv, radius * 1.6);

    float difference = inner - outer;

    // Written this way round because smoothstep is undefined when its first
    // edge is not below its second.
    return 1.0 - smoothstep(bias - softness, bias, difference);
}

// --- Marks ----------------------------------------------------------------

/** Position in device pixels, so patterns do not scale with the resolution. */
vec2 screenDots() {
    return v_screen * u_resolution;
}

/**
 * One printing screen: dot coverage for an ink density, at a grid angle.
 *
 * Dot area rather than dot radius is proportional to density, so the radius
 * carries a square root. A cell is fully covered when the radius reaches half
 * its diagonal, which is where the 0.71 comes from.
 *
 * The angle matters as much as the pitch. Four plates printed on one grid moire
 * against each other; offset by fifteen degrees they interleave into a rosette,
 * which is the texture a printed page actually has.
 */
float screenDot(float density, float angle, float pitch) {
    vec2 p = screenDots() / pitch;

    float s = sin(angle);
    float c = cos(angle);
    vec2 rotated = vec2(p.x * c - p.y * s, p.x * s + p.y * c);

    float toCentre = length(fract(rotated) - 0.5);
    float radius = sqrt(clamp(density, 0.0, 1.0)) * 0.71;

    return smoothstep(radius + 0.06, radius - 0.06, toCentre);
}

/**
 * Mean and variance of one quadrant of a square neighbourhood.
 *
 * The building block of the Kuwahara filter. Four overlapping quadrants are
 * measured and the least variant is kept, which is the one that does not
 * straddle a boundary; its mean is therefore a colour belonging to a single
 * region. The result is a filter that flattens without ever averaging across an
 * edge, and whose regions take the shape of the neighbourhood rather than of the
 * pixel grid, which is what makes the output look brushed rather than blurred.
 *
 * Returned as a vec4: the mean in rgb, the variance in w. Variance is the mean
 * of the three per-channel variances, so a boundary in any one channel counts.
 */
vec4 quadrantStatistics(vec2 uv, vec2 direction, float radius) {
    vec2 texel = radius / u_resolution;

    vec3 total = vec3(0.0);
    float squares = 0.0;

    for (int y = 0; y <= 2; y++) {
        for (int x = 0; x <= 2; x++) {
            vec3 tap = sampleSource(uv + vec2(float(x), float(y)) * direction * texel);

            total += tap;
            squares += dot(tap, tap) / 3.0;
        }
    }

    vec3 mean = total / 9.0;

    return vec4(mean, squares / 9.0 - dot(mean, mean) / 3.0);
}

/**
 * One set of pencil strokes, returning the graphite it lays in [0, 1].
 *
 * A set contributes nothing above the tone it is assigned, then its strokes
 * widen and darken as the tone falls further below it. Density is built by
 * laying another set at a new angle over the last, which is how hatching
 * actually works, rather than by darkening one set until it becomes a fill.
 *
 * The projection is perturbed by a slow sine so the strokes waver. Perfectly
 * straight parallel lines read as a printed screen, not as a hand.
 */
float strokeSet(float tone, float angle, float pitch, float enters) {
    float strength = clamp((enters - tone) / max(enters, 1e-3), 0.0, 1.0);

    if (strength <= 0.0) {
        return 0.0;
    }

    vec2 p = screenDots();
    float projected = p.x * cos(angle) + p.y * sin(angle);

    projected += sin(dot(p, vec2(0.019, 0.023))) * 1.8;

    float across = abs(fract(projected / pitch) - 0.5) * 2.0;
    float width = mix(0.10, 0.60, strength);

    float mark = 1.0 - smoothstep(width - 0.16, width + 0.16, across);

    // A stroke laid lightly leaves less graphite than one pressed hard.
    return mark * mix(0.30, 1.0, strength);
}
`;

/**
 * Cel animation, as an explicit three-representation decomposition.
 *
 * White-box cartoon representation separates a cartoon image into a surface
 * carrying smooth shading, a structure carrying flat colour regions, and a
 * texture carrying line detail, then recombines them. The learned formulation
 * requires a network; the decomposition itself does not, and each part has a
 * counterpart a fragment shader can evaluate:
 *
 *   surface     edge-preserving smoothing     iterated bilateral filter
 *   structure   flat regions, hue preserved   soft luminance quantisation
 *   texture     contours                      difference of Gaussians
 *
 * Composing the three explicitly is what makes this read as drawn rather than
 * as filtered. The structure is quantised from the surface, so band boundaries
 * fall where regions actually are; the texture is taken from the raw frame,
 * because smoothing is precisely what destroys the gradients a contour is made
 * of.
 *
 * The colour terms after the decomposition are painting rather than image
 * processing. Cel paint is laid down more saturated than the reference it is
 * painted from, and its light is warmer and its shadow cooler than the
 * photograph, because a painter separates the two by hue and not only by value.
 */
const anime: PortalStyle = {
    id: 'anime',
    spoken: ['cartoon', 'anime', 'toon', 'animated'],
    label: 'Cartoon',
    description: 'Flat cel colour under a clean contour. Hue held, shading stepped.',
    shader: /* glsl */ `
vec3 styleLook(vec2 uv) {
    // Surface: regions already collapsed onto their own colour.
    vec3 surface = sampleAbstract(uv);
    float tone = surfaceTone(uv);

    // Structure: four bands, stepped hard and antialiased across the step.
    // Four is the count a cel background is painted in, and going higher
    // returns the photograph one band at a time.
    float stepped = softQuantise(tone, 4.0, 7.0);
    vec3 structure = saturate(retone(surface, tone, stepped), 1.70);

    // Painted light: warm in the lit bands, cool in the shadowed ones.
    structure *= mix(vec3(0.76, 0.85, 1.16), vec3(1.14, 1.04, 0.86), stepped);

    // A rim on the brightest band only, which is what gives a cel figure its
    // separation from the background without any depth information.
    structure += vec3(0.10, 0.08, 0.03) * smoothstep(0.80, 1.0, stepped);

    // Texture: the contour, drawn from far less contrast than the other styles
    // ask for. A cel drawing is line first and paint second, and the threshold
    // still sits about five standard deviations above the operator's response
    // to sensor noise, which is where it has to stay.
    float line = contour(uv, 1.4, -0.0016, 0.0032);

    // The line is tinted toward the colour it borders rather than being pure
    // black, which is how cel line art avoids looking stamped onto the paint.
    vec3 nib = mix(vec3(0.05, 0.04, 0.08), structure * 0.22, 0.35);

    return clamp(mix(structure, nib, line), 0.0, 1.0);
}
`,
};

/**
 * Printed comic, as a genuine four-plate separation.
 *
 * The image is converted to ink densities, the grey the three colours share is
 * removed into a black plate, each density is rounded to a screen percentage a
 * studio actually stocks, and the four plates are laid on their own rotated
 * grids at the angles a press uses: yellow at zero degrees, cyan at fifteen,
 * black at forty-five and magenta at seventy-five. The plates then multiply onto
 * paper in ink colours rather than in primaries, because ink absorbs light
 * rather than emitting it.
 *
 * Two details carry the look. Rounding to fixed percentages is what produces
 * areas of bare paper and areas of solid ink instead of a dot everywhere, which
 * is the difference between a comic and a photograph with a dot filter over it.
 * The four screen angles are what produce a rosette rather than a moire, and the
 * colour comes from where the dots of different plates overlap.
 */
const comic: PortalStyle = {
    id: 'comic',
    spoken: ['comic', 'comic book', 'halftone'],
    label: 'Comic',
    description: 'Four ink plates on rotated screens, over newsprint, hand inked.',
    shader: /* glsl */ `
vec3 styleLook(vec2 uv) {
    // Flatten first, so a plate carries regions rather than photographic noise.
    vec3 surface = sampleAbstract(uv);
    float tone = surfaceTone(uv);

    float stepped = softQuantise(tone, 4.0, 7.0);
    vec3 flattened = saturate(retone(surface, tone, stepped), 1.30);

    // Ink density is what the paper does not reflect. A comic is printed light:
    // the page is mostly paper, and the ink is what is added to it, so the
    // density is pulled back before any of it reaches a plate.
    vec3 density = clamp(1.0 - flattened, 0.0, 1.0) * 0.82;

    // Under colour removal: the grey the three inks share is printed once, in
    // black, rather than three times. Without it the shadows go muddy brown,
    // which is the exact failure a black plate exists to prevent. The floor
    // keeps light greys off the black plate, so mid tones stay coloured.
    float black = max(min(density.r, min(density.g, density.b)) - 0.26, 0.0);
    vec3 process = clamp(density - black, 0.0, 1.0);

    // The densities are not rounded. The screen is already the quantiser: a
    // density of zero leaves bare paper and a density of one lays solid ink,
    // and rounding the three colours separately beforehand only shifts hues,
    // which turned a blue-grey wall green.
    float pitch = 5.2;

    float plateC = screenDot(process.r, 0.2618, pitch);
    float plateM = screenDot(process.g, 1.3090, pitch);
    float plateY = screenDot(process.b, 0.0000, pitch);
    float plateK = screenDot(black, 0.7854, pitch);

    // Newsprint, not white.
    vec3 colour = vec3(0.972, 0.955, 0.900);

    colour *= mix(vec3(1.0), vec3(0.09, 0.72, 0.90), plateC);
    colour *= mix(vec3(1.0), vec3(0.93, 0.15, 0.52), plateM);
    colour *= mix(vec3(1.0), vec3(1.00, 0.88, 0.12), plateY);
    colour *= mix(vec3(1.0), vec3(0.10, 0.09, 0.13), plateK);

    // The pen line is drawn before the screens are laid and is not screened
    // itself, so it is thresholded hard rather than blended.
    float line = contour(uv, 1.3, -0.0032, 0.0055);
    colour = mix(colour, vec3(0.05, 0.04, 0.07), step(0.55, line));

    return clamp(colour, 0.0, 1.0);
}
`,
};

/**
 * Graphite on paper, with no colour at all.
 *
 * Removing the colour is the point. A tinted drawing reads as a photograph with
 * a texture over it; a monochrome one reads as a drawing, because the viewer has
 * to accept tone as the only description of the subject.
 *
 * Density is built by laying successive stroke sets rather than by darkening
 * one. Each set enters at its own tone, at its own angle and pitch, and widens
 * and darkens as the tone falls further below where it entered, so the drawing
 * keeps bare paper in the highlights and reaches four crossed sets only in the
 * deepest shadow. The paper carries a fibre grain and the strokes waver, because
 * neither a real sheet nor a real hand is uniform.
 */
const sketch: PortalStyle = {
    id: 'sketch',
    spoken: ['sketch', 'pencil', 'drawing', 'sketched'],
    label: 'Sketch',
    description: 'Pencil crosshatching on grained paper. No colour at all.',
    shader: /* glsl */ `
vec3 styleLook(vec2 uv) {
    // Tone from the surface, so the hatching follows form rather than grain.
    float measured = surfaceTone(uv);

    // A drawing has more range than a photograph: the paper is left bare in the
    // highlights and the shadows are pushed toward solid, so the tone is opened
    // out about the middle before any stroke is laid.
    float tone = clamp((measured - 0.5) * 1.75 + 0.56, 0.0, 1.0);

    // Paper: warm, slightly uneven, never pure white.
    float fibre = hash(floor(screenDots() * 0.5)) * 0.030;
    vec3 paper = vec3(0.976, 0.966, 0.944) - fibre;

    vec3 graphite = vec3(0.19, 0.18, 0.22);

    // Four sets. The first two are the angles a right hand makes comfortably,
    // and the last two cross them once the tone calls for more density.
    float laid = 0.0;
    laid += strokeSet(tone, -0.62, 10.0, 0.66);
    laid += strokeSet(tone, 0.70, 9.0, 0.44);
    laid += strokeSet(tone, 0.05, 8.0, 0.25);
    laid += strokeSet(tone, 1.52, 7.0, 0.11);

    vec3 colour = mix(paper, graphite, clamp(laid, 0.0, 1.0));

    // The contour, drawn softly. A pencil outline is a change of pressure, not
    // a separate object, so it is blended rather than thresholded.
    float line = contour(uv, 1.1, -0.0030, 0.0110);

    return clamp(mix(colour, graphite, line * 0.90), 0.0, 1.0);
}
`,
};

/**
 * Screen print: four fixed inks, pulled by hand.
 *
 * The palette is fixed rather than derived from the frame. That is the whole
 * difference between a print and a colour grade: a print has as many colours as
 * it has screens, and the photograph has to be reduced to them. Skin becomes
 * whichever ink its value falls in, which is why the style is recognisable at a
 * glance and why it cannot be mistaken for the cartoon.
 *
 * The plates are separated by hard steps antialiased over a single pixel, using
 * the screen space derivative of the tone. A wide smoothstep would put a
 * gradient between two inks, and a screen print has no gradient anywhere.
 *
 * The key plate is pulled a couple of pixels off the colours. A hand-pulled
 * print never registers perfectly, and that small misalignment between the line
 * and the fill is the most recognisable thing about one.
 */
const poster: PortalStyle = {
    id: 'poster',
    spoken: ['poster', 'screen print', 'posterise', 'posterize'],
    label: 'Poster',
    description: 'Four fixed inks, hard separations, key plate off register.',
    shader: /* glsl */ `
vec3 styleLook(vec2 uv) {
    float tone = surfaceTone(uv);

    vec3 shadow = vec3(0.05, 0.09, 0.24);
    vec3 midDark = vec3(0.78, 0.12, 0.31);
    vec3 midLight = vec3(0.99, 0.51, 0.13);
    vec3 highlight = vec3(1.00, 0.93, 0.72);

    // One pixel of antialiasing and no more, so every boundary is an edge.
    float edge = fwidth(tone) * 0.75 + 1e-4;

    vec3 colour = shadow;
    colour = mix(colour, midDark, smoothstep(0.26 - edge, 0.26 + edge, tone));
    colour = mix(colour, midLight, smoothstep(0.48 - edge, 0.48 + edge, tone));
    colour = mix(colour, highlight, smoothstep(0.70 - edge, 0.70 + edge, tone));

    // The key plate, pulled off register, in the darkest ink.
    vec2 slip = vec2(2.0, -1.4) / u_resolution;
    float line = contour(uv + slip, 1.7, -0.0026, 0.0050);

    return clamp(mix(colour, shadow * 0.5, step(0.5, line)), 0.0, 1.0);
}
`,
};

/**
 * Pen and ink: black lines on paper, and nothing between.
 *
 * The most extreme of the seven, and the one that settles what the window is.
 * Everything the viewer reads has to be carried by marks, so shadow is described
 * by hatching rather than by grey and only the deepest values fill solid. Two
 * line weights are drawn: a firm contour that follows the subject and a finer
 * one that picks up interior detail, which is how a pen drawing separates
 * silhouette from surface.
 */
const ink: PortalStyle = {
    id: 'ink',
    spoken: ['ink', 'pen and ink', 'line art'],
    label: 'Ink',
    description: 'Black lines on paper, shadow described by hatching.',
    shader: /* glsl */ `
vec3 styleLook(vec2 uv) {
    float tone = surfaceTone(uv);

    vec3 paper = vec3(0.974, 0.966, 0.950);
    vec3 nib = vec3(0.05, 0.05, 0.08);

    // Two weights: the silhouette, and the interior detail beneath it.
    float heavy = contour(uv, 1.5, -0.0032, 0.0055);
    float fine = contour(uv, 0.8, -0.0014, 0.0060) * 0.55;

    // Shadow is hatched, not greyed, and only in the lower third of the range.
    float shade = strokeSet(tone, 0.7854, 6.0, 0.30) + strokeSet(tone, -0.7854, 6.0, 0.14);

    vec3 colour = mix(paper, nib, clamp(max(heavy, fine) + shade, 0.0, 1.0));

    // The deepest values fill solid, which stops a line drawing of a face
    // reading as an empty oval.
    return clamp(mix(colour, nib, 1.0 - smoothstep(0.04, 0.12, tone)), 0.0, 1.0);
}
`,
};


/**
 * Oil paint, by Kuwahara filtering.
 *
 * The only style that does not read the abstraction, and the reason is that the
 * two do the same job. An iterated bilateral filter has already flattened every
 * region by the time a style sees it, so running a second edge-preserving
 * operator over the result leaves nothing to find. This one is therefore given
 * the unsmoothed frame and does its own abstraction, of a different kind.
 *
 * The difference is what makes it worth having. A bilateral filter averages a
 * neighbourhood weighted by colour distance, which produces regions bounded by
 * the image; a Kuwahara filter picks whichever quadrant of the neighbourhood
 * varies least and takes its mean, which produces regions bounded by the shape
 * of the quadrant. Those regions read as brush strokes, because a brush stroke
 * is also a patch of one colour with a shape of its own.
 *
 * Nothing is outlined. Paint has no line around it, and adding one is the single
 * commonest way of making a painting filter look like a cartoon instead.
 */
const oil: PortalStyle = {
    id: 'oil',
    spoken: ['paint', 'painting', 'painted', 'oil', 'oil paint'],
    label: 'Paint',
    description: 'Oil on canvas: brushed regions, warm light, cool shade, no line.',
    shader: /* glsl */ `
vec3 styleLook(vec2 uv) {
    // Four overlapping quadrants of one neighbourhood.
    vec4 upperLeft = quadrantStatistics(uv, vec2(-1.0, -1.0), 5.0);
    vec4 upperRight = quadrantStatistics(uv, vec2(1.0, -1.0), 5.0);
    vec4 lowerLeft = quadrantStatistics(uv, vec2(-1.0, 1.0), 5.0);
    vec4 lowerRight = quadrantStatistics(uv, vec2(1.0, 1.0), 5.0);

    vec4 chosen = upperLeft;
    if (upperRight.w < chosen.w) chosen = upperRight;
    if (lowerLeft.w < chosen.w) chosen = lowerLeft;
    if (lowerRight.w < chosen.w) chosen = lowerRight;

    vec3 paint = saturate(chosen.rgb, 1.48);

    // Pigment is warmer in the light and cooler in the shade than the
    // photograph is. A painter separates the two by hue as well as by value,
    // and further than a photograph ever does.
    float value = luminance(paint);
    paint *= mix(vec3(0.80, 0.89, 1.14), vec3(1.16, 1.04, 0.86), value);

    // Values are pushed apart about the middle, the way a painter mixes from a
    // limited palette rather than matching what is in front of them.
    paint = clamp((paint - 0.5) * 1.14 + 0.5, 0.0, 1.0);

    // The weave of the cloth, and the ridge a loaded brush leaves where it
    // changes direction. Both are drawn from the same coordinates, so the
    // stroke and the canvas beneath it stay in register.
    vec2 p = screenDots();
    float weave = sin(p.x * 0.85) * sin(p.y * 0.85) * 0.5 + 0.5;
    float bristle = sin((p.x + p.y) * 0.42 + weave * 2.0) * 0.5 + 0.5;
    float ridge = contour(uv, 3.0, -0.0011, 0.0070);

    paint *= 0.90 + 0.07 * weave + 0.05 * bristle;
    paint = mix(paint, paint * 0.68, ridge * 0.62);

    // Where a ridge stands in the light it catches it, which is the whole of
    // why an oil painting looks thick rather than printed.
    paint += vec3(0.07, 0.065, 0.05) * ridge * smoothstep(0.52, 0.95, value);

    return clamp(paint, 0.0, 1.0);
}
`,
};

/**
 * Neon: the subject drawn as lit tube on a dark ground.
 *
 * A glow is the same contour operator evaluated at several widths and summed. A
 * thin core carries the drawing, and two wider, weaker responses carry the
 * halo. Blurring a line after drawing it would be the usual construction and is
 * the wrong one here: it costs a separate pass, and the wide Gaussians a halo
 * needs are the ones the operator already computes.
 *
 * Two details decide whether it reads as light rather than as a coloured line.
 * The result is added to the ground rather than mixed into it, because light
 * adds. And the core is pushed toward white by a quadratic term, so a tube
 * saturates at its centre while its halo keeps the hue, which is what a
 * photograph of a real one does.
 *
 * The ground is not black. A trace of the scene, heavily darkened and pushed
 * cool, keeps the subject legible in the places no contour was found.
 */
const neon: PortalStyle = {
    id: 'neon',
    spoken: ['neon', 'glow', 'glowing'],
    label: 'Neon',
    description: 'Lit tube on a dark ground, with the halo a real one has.',
    shader: /* glsl */ `
vec3 styleLook(vec2 uv) {
    vec3 surface = sampleAbstract(uv);
    float tone = surfaceTone(uv);

    // One operator at three widths: the core, and two haloes around it.
    float core = contour(uv, 1.0, -0.0026, 0.0055);
    float inner = contour(uv, 2.4, -0.0014, 0.0090);
    float outer = contour(uv, 5.0, -0.0008, 0.0120);

    float glow = clamp(core + inner * 0.55 + outer * 0.30, 0.0, 1.4);

    // The tube's colour runs across the frame and drifts, so one subject is not
    // a single flat hue. Cyan to magenta, which is the palette the rest of the
    // application is built from.
    float sweep = fract(v_screen.x * 0.55 + v_screen.y * 0.32 + u_time * 0.05);
    vec3 hue = mix(vec3(0.16, 0.88, 1.00), vec3(1.00, 0.28, 0.72), sweep);

    vec3 ground = mix(vec3(0.02, 0.03, 0.07), surface * 0.17, smoothstep(0.15, 0.78, tone));

    // Additive, with a quadratic term that whitens the core of a bright tube.
    vec3 colour = ground + hue * glow + vec3(glow * glow * 0.34);

    return clamp(colour, 0.0, 1.0);
}
`,
};

/**
 * A window onto a separately generated version of the same take.
 *
 * The only style that does not compute its look. A video model has already
 * redrawn the whole frame, and the window's job is simply to reveal it, so this
 * is a texture read and nothing else.
 *
 * It is worth being exact about why the composite is done this way round. The
 * model restyles the entire picture, including the hands; revealing that
 * through the tracked quad puts the generated world inside the frame and leaves
 * the real hands, and the rest of the real scene, untouched around it. Asking a
 * model to restyle only the interior would instead require it to respect a
 * boundary that moves every frame, which is not something it can be told.
 */
const restyled: PortalStyle = {
    id: 'restyled',
    spoken: [],
    label: 'Generated',
    description: 'A window onto a version of the take redrawn by a video model.',
    internal: true,
    shader: /* glsl */ `
vec3 styleLook(vec2 uv) {
    return sampleRestyled(uv);
}
`,
};

/**
 * Registered styles, in presentation order.
 *
 * Ordered by how much of the photograph survives: the two that keep its colour
 * and its shading, then the two that reduce it to inks, then the one that
 * replaces the light, then the two that discard colour altogether.
 */
export const PORTAL_STYLES: readonly PortalStyle[] =
    [anime, oil, comic, poster, neon, sketch, ink, restyled];

/** The styles the user chooses between. */
export const SELECTABLE_PORTAL_STYLES: readonly PortalStyle[] =
    PORTAL_STYLES.filter((style) => !style.internal);

export const DEFAULT_PORTAL_STYLE: PortalStyleId = 'anime';

const BY_ID = new Map<PortalStyleId, PortalStyle>(
    PORTAL_STYLES.map((style) => [style.id, style]),
);

/** Returns a style, throwing on an identifier that was never registered. */
export function portalStyleById(id: PortalStyleId): PortalStyle {
    const style = BY_ID.get(id);

    if (!style) {
        throw new Error(`[gesture-fx] no portal style is registered under "${id}"`);
    }

    return style;
}
