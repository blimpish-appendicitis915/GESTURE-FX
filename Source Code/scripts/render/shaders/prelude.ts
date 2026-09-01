/**
 * File: scripts/render/shaders/prelude.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: GLSL ES 3.00
 *
 * Description:
 * The header prepended to every effect's fragment shader.
 *
 * It declares the uniform set the renderer supplies, so an effect file contains
 * only the `main` function and whatever helpers it needs. That keeps each
 * effect short enough to read in one screen and guarantees every effect sees
 * the same interface, which is what makes them interchangeable.
 */

export const FRAGMENT_PRELUDE = /* glsl */ `#version 300 es

precision highp float;

in vec2 v_uv;
in vec2 v_screen;

out vec4 fragColour;

// The camera frame, or the held frame when an effect freezes the source.
uniform sampler2D u_source;

// A frame captured a couple of seconds ago, supplied by the rewind buffer.
// Only the rewind cut reads it. It is always bound, so every effect compiles
// against the same interface.
uniform sampler2D u_past;

// 1.0 when u_past holds a genuine recalled frame, 0.0 when too little history
// exists yet. An effect that samples u_past must multiply by this.
uniform float u_hasPast;

// Output size in device pixels, for effects that scale with resolution.
uniform vec2 u_resolution;

// Seconds since the renderer started. Continuous across effect firings.
uniform float u_time;

// Linear progress through this firing, from 0.0 at the trigger to 1.0 at the end.
uniform float u_progress;

// Progress shaped into an attack and decay curve. Effects should drive their
// strength from this rather than from u_progress, so the peak lands just after
// the gesture instead of halfway through the effect.
uniform float u_envelope;

// Gesture confidence in [0, 1]. A committed gesture produces a stronger effect.
uniform float u_intensity;

// Direction of the causing movement in [-1, 1], where an effect has one.
uniform float u_direction;

// Per-firing random value, so two triggers of one effect do not look identical.
uniform float u_seed;

// Cheap hash used for noise, band selection and speckle.
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// Luminance under the Rec. 709 coefficients.
float luminance(vec3 colour) {
    return dot(colour, vec3(0.2126, 0.7152, 0.0722));
}

// Samples the source with coordinates clamped, so a displaced lookup reads the
// edge pixel rather than wrapping to the far side of the frame.
vec3 sampleSource(vec2 uv) {
    return texture(u_source, clamp(uv, 0.0, 1.0)).rgb;
}
`;
