/**
 * File: scripts/render/shaders/portal.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: GLSL ES 3.00
 *
 * Description:
 * Composites the finger frame: the scene continues outside the quad the hands
 * form, and inside it the same scene is redrawn in a different medium.
 *
 * The shader is assembled per style rather than branching on one. A style
 * supplies `vec3 styleLook(vec2 uv)`, this file supplies the coverage test and
 * the window furniture, and the renderer compiles one program for each pairing.
 * Selecting a style is then a program change, and no pixel ever evaluates a
 * style it is not showing.
 *
 * The stylised look is computed only for pixels inside the quad. Line work
 * alone costs eighteen texture reads, which would be expensive over a whole 720
 * by 1280 frame and is affordable over the fraction of it a pair of hands
 * encloses.
 *
 * The quad is deliberately allowed to self-intersect. Crossing the hands turns
 * the rectangle into two lobes meeting at a point, and the even-odd coverage
 * test renders exactly that rather than flooding the bounding rectangle. It
 * recovers by itself when the hands uncross, because the corner ordering is
 * stateless.
 */

import { PORTAL_STYLE_HELPERS } from '../../effects/portal-styles';

/** Coverage, geometry and the window furniture, shared by every style. */
const PORTAL_FRAMEWORK = /* glsl */ `
// The four corners, in the anatomical order the tracker emits.
uniform vec2 u_corner0;
uniform vec2 u_corner1;
uniform vec2 u_corner2;
uniform vec2 u_corner3;

// Fade in [0, 1].
uniform float u_presence;

// Output aspect, so distances are uniform rather than stretched with the frame.
uniform float u_aspect;

// The surface representation: the scene after the abstraction pass has
// collapsed each region onto its own colour. Half the output resolution, which
// is why it is read through a helper rather than sampled directly.
uniform sampler2D u_abstract;

/**
 * Reads the surface representation.
 *
 * The reduction is upsampled bilinearly, which softens region boundaries. That
 * is corrected downstream rather than here: quantising a soft ramp between two
 * levels puts a hard step at the crossing, so the boundary returns as an edge
 * rather than as a blur. Contours are taken from the full resolution scene,
 * where the gradients still exist.
 */
vec3 sampleAbstract(vec2 uv) {
    return texture(u_abstract, clamp(uv, 0.0, 1.0)).rgb;
}

// A separately generated version of the same take, shown inside the window by
// the restyled style and by nothing else. Bound only while that style is
// selected; every other program leaves it unread.
uniform sampler2D u_restyled;

/**
 * Reads the restyled clip.
 *
 * The vertical flip is not decoration. This pass addresses a framebuffer, whose
 * origin is the bottom left, while the restyled clip is a video, whose origin is
 * the top left. Sampling it with the framebuffer's own coordinate would show the
 * window upside down inside a frame that was the right way up.
 */
vec3 sampleRestyled(vec2 uv) {
    return texture(u_restyled, vec2(clamp(uv.x, 0.0, 1.0), clamp(1.0 - uv.y, 0.0, 1.0))).rgb;
}

// --- Coverage -------------------------------------------------------------

/**
 * Does a ray cast in +x from p cross the segment a-b?
 *
 * The half-open vertical test, (a.y > p.y) != (b.y > p.y), counts a vertex
 * exactly once however many edges meet there, which is what keeps the parity
 * correct when the ray happens to pass through a corner.
 */
bool crossesEdge(vec2 p, vec2 a, vec2 b) {
    if ((a.y > p.y) == (b.y > p.y)) {
        return false;
    }

    float x = (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x;

    return p.x < x;
}

/**
 * Even-odd containment for the quad, valid whether or not it self-intersects.
 *
 * A triangle fan would be correct only while the quad stays convex. Flipping one
 * hand swaps that hand's two corners and crosses the quad into a bowtie, and the
 * fan then covers almost the entire bounding rectangle instead of the two lobes.
 * Counting crossings has no such failure: odd is inside, and a bowtie's lobes
 * are each crossed once.
 */
bool insideQuad(vec2 p, vec2 c0, vec2 c1, vec2 c2, vec2 c3) {
    bool inside = false;

    if (crossesEdge(p, c0, c1)) inside = !inside;
    if (crossesEdge(p, c1, c2)) inside = !inside;
    if (crossesEdge(p, c2, c3)) inside = !inside;
    if (crossesEdge(p, c3, c0)) inside = !inside;

    return inside;
}

/** Distance from a point to a segment, in aspect-corrected units. */
float segmentDistance(vec2 p, vec2 a, vec2 b) {
    vec2 pa = vec2((p.x - a.x) * u_aspect, p.y - a.y);
    vec2 ba = vec2((b.x - a.x) * u_aspect, b.y - a.y);

    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);

    return length(pa - ba * h);
}

/** Distance to a single point, in the same units. */
float pointDistance(vec2 p, vec2 a) {
    return length(vec2((p.x - a.x) * u_aspect, p.y - a.y));
}
`;

/** The composite, identical for every style. */
const PORTAL_MAIN = /* glsl */ `
void main() {
    vec3 scene = sampleSource(v_uv);

    vec2 p = v_screen;

    bool inside = insideQuad(p, u_corner0, u_corner1, u_corner2, u_corner3);

    float border = min(
        min(segmentDistance(p, u_corner0, u_corner1), segmentDistance(p, u_corner1, u_corner2)),
        min(segmentDistance(p, u_corner2, u_corner3), segmentDistance(p, u_corner3, u_corner0))
    );

    // A soft edge on the coverage test, so the window is not stair-stepped.
    float feather = 1.5 / u_resolution.y;
    float coverage = inside ? 1.0 : 1.0 - smoothstep(0.0, feather * 2.0, border);

    coverage *= u_presence;

    vec3 colour = scene;

    // The style is only evaluated where it will be seen.
    if (coverage > 0.002) {
        colour = mix(scene, styleLook(v_uv), coverage);
    }

    // --- The window's own edge --------------------------------------------

    // Marching ants running around the border.
    float along = (p.x * u_aspect + p.y) * 26.0 - u_time * 1.6;
    float dash = step(0.5, fract(along));

    float lineWidth = 2.2 / u_resolution.y;
    float outline = 1.0 - smoothstep(lineWidth, lineWidth * 2.2, border);
    outline *= mix(0.35, 1.0, dash) * u_presence;

    colour = mix(colour, vec3(1.0), outline * 0.85);

    // Corner marks, one per tracked fingertip.
    float dotRadius = 5.0 / u_resolution.y;
    float corners =
        (1.0 - smoothstep(dotRadius, dotRadius * 1.9, pointDistance(p, u_corner0))) +
        (1.0 - smoothstep(dotRadius, dotRadius * 1.9, pointDistance(p, u_corner1))) +
        (1.0 - smoothstep(dotRadius, dotRadius * 1.9, pointDistance(p, u_corner2))) +
        (1.0 - smoothstep(dotRadius, dotRadius * 1.9, pointDistance(p, u_corner3)));

    colour = mix(colour, vec3(0.18, 0.88, 0.98), clamp(corners, 0.0, 1.0) * u_presence * 0.9);

    fragColour = vec4(colour, 1.0);
}
`;

/**
 * Builds the complete portal fragment body for one style.
 *
 * Order matters: the helpers define what a style may call, the style defines
 * `styleLook`, and `main` calls it. GLSL requires a function to be declared
 * before it is used, and assembling in this order satisfies that without any
 * forward declarations.
 */
export function buildPortalShader(styleShader: string): string {
    return PORTAL_FRAMEWORK + PORTAL_STYLE_HELPERS + styleShader + PORTAL_MAIN;
}
