/**
 * File: scripts/render/shaders/abstraction.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: GLSL ES 3.00
 *
 * Description:
 * The surface representation: an edge-preserving abstraction of the scene, run
 * as its own pass so every style inside the finger frame can share it.
 *
 * A cartoon is not a photograph with an outline drawn over it. It is a picture
 * whose interiors are flat and whose boundaries are sharp, and that is a
 * property no single-tap filter can produce. Reaching it needs the smoothing to
 * be applied repeatedly, because one pass of a bilateral filter reduces noise
 * while a sequence of them collapses a region onto its mean and leaves the
 * boundary where it was. Winnemoller, Olsen and Gooch established this for real
 * time video, and the finger frame uses the same construction.
 *
 * Kernel
 * ------
 * Twenty-five taps, weighted by the product of two Gaussians:
 *
 *     w = exp(-|dx|^2 / 2s^2) . exp(-|dc|^2 / 2r^2)
 *
 * The first term is the fixed 5x5 footprint. The second falls off with colour
 * distance, so a neighbour on the far side of a boundary contributes almost
 * nothing and the boundary survives every iteration.
 *
 * Coarse to fine
 * --------------
 * The colour width r is not the same on every iteration. A bilateral filter
 * rejects any neighbour that differs by much more than r, which is what
 * preserves a boundary and is also what makes it keep heavy noise: in a dim
 * room the difference between two adjacent pixels of the same surface can
 * exceed r, and the filter then treats each grain as an edge and protects it.
 * Widening r on the first pass averages that noise away, and narrowing it on
 * the passes that follow puts the boundaries back where they were.
 *
 * Half resolution
 * ---------------
 * The pass runs at half the output size. That is not only three times cheaper:
 * a filter of a given tap count reaches twice as far in the full frame, which
 * is what makes skin and clothing collapse into single regions rather than
 * merely losing their grain. The softness the reduction introduces at region
 * boundaries is removed again downstream, because quantising a soft ramp
 * between two levels puts a hard step at the crossing. The contour is taken
 * from the unreduced frame, where the gradients still exist.
 *
 * The pass runs only while the finger frame is open, so a session that never
 * makes the gesture never pays for it.
 */

export const ABSTRACTION_SHADER = /* glsl */ `
// One texel of the buffer being read, so the footprint is measured in samples
// rather than in fractions of the frame.
uniform vec2 u_step;

// Spatial falloff, in taps. Slightly under the 2-tap radius, so the corner
// samples still carry weight and the kernel is not effectively a 3x3.
const float SPATIAL_SIGMA = 1.7;

// Colour falloff, supplied per iteration. See ABSTRACTION.rangeSchedule in
// scripts/config.ts for why it is not one number.
uniform float u_range;

void main() {
    vec3 centre = sampleSource(v_uv);

    vec3 total = vec3(0.0);
    float weightTotal = 0.0;

    for (int y = -2; y <= 2; y++) {
        for (int x = -2; x <= 2; x++) {
            vec2 offset = vec2(float(x), float(y));

            vec3 neighbour = sampleSource(v_uv + offset * u_step);

            float spatial = exp(-dot(offset, offset) / (2.0 * SPATIAL_SIGMA * SPATIAL_SIGMA));

            vec3 separation = neighbour - centre;
            float range = exp(-dot(separation, separation) / (2.0 * u_range * u_range));

            float weight = spatial * range;

            total += neighbour * weight;
            weightTotal += weight;
        }
    }

    // The centre tap always carries weight 1, so the denominator can never be
    // zero and the guard is a statement of that rather than a precaution.
    fragColour = vec4(total / max(weightTotal, 1e-4), 1.0);
}
`;
