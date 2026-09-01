/**
 * File: scripts/render/shaders/vertex.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: GLSL ES 3.00
 *
 * Description:
 * The single vertex shader shared by every effect. It draws one full-screen
 * triangle and prepares the two coordinate spaces the fragment shaders use.
 *
 * A triangle is drawn rather than a quad because a quad's diagonal seam causes
 * the shared edge to be shaded twice, and one triangle covering the viewport
 * avoids that at no cost.
 *
 * Two varyings are emitted because effects need both spaces. `v_uv` addresses
 * the camera texture with the aspect-fill crop and any mirroring already
 * applied, so an effect that displaces the image works in source space.
 * `v_screen` addresses the output canvas, so an effect that draws scanlines or
 * a vignette aligns them to the frame the viewer sees rather than to the crop.
 */

export const VERTEX_SHADER = /* glsl */ `#version 300 es

// Location 0 is pinned so the shared vertex array object binds to every
// program without a per-program attribute lookup.
layout(location = 0) in vec2 a_position;

// Aspect-fill crop: scales and offsets the camera texture so it covers the
// output frame without distortion, cropping the overflow.
uniform vec2 u_uvScale;
uniform vec2 u_uvOffset;

// 1.0 when the source is a front camera and must be un-mirrored.
uniform float u_mirror;

out vec2 v_uv;
out vec2 v_screen;

void main() {
    // The triangle is supplied in clip space. Mapping to [0, 1] gives the
    // output coordinate directly.
    vec2 screen = a_position * 0.5 + 0.5;
    v_screen = screen;

    vec2 uv = screen;

    // A front camera is presented mirrored so the preview reads as a mirror.
    uv.x = mix(uv.x, 1.0 - uv.x, u_mirror);

    // The texture origin is bottom left and the video origin is top left.
    uv.y = 1.0 - uv.y;

    v_uv = uv * u_uvScale + u_uvOffset;

    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
