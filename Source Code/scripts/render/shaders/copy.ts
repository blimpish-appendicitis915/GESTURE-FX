/**
 * File: scripts/render/shaders/copy.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: GLSL ES 3.00
 *
 * Description:
 * An unmodified copy of the source texture.
 *
 * It serves two purposes. It is the second pass when no effect is playing, and
 * it is the blit that writes a scaled-down frame into the rewind buffer.
 *
 * It applies nothing at all, not even a vignette. Any treatment belongs to the
 * selected filter, which has already run by the time this shader sees the
 * image; adding anything here would apply it twice to a recalled frame.
 */

export const COPY_SHADER = /* glsl */ `
void main() {
    fragColour = vec4(sampleSource(v_uv), 1.0);
}
`;
