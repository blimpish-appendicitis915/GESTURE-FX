/**
 * File: scripts/render/gl.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), WebGL 2
 *
 * Description:
 * The thin WebGL layer: context acquisition, shader compilation, program
 * linking, the full-screen triangle and video textures.
 *
 * Nothing here knows about gestures or effects. The separation exists so that
 * a shader compilation failure is reported as a shader compilation failure,
 * with the driver's log and the offending source, rather than surfacing later
 * as a blank canvas with no explanation.
 */

/** A failure in context creation, compilation or linking. */
export class RenderError extends Error {
    constructor(message: string, readonly remedy: string) {
        super(message);
        this.name = 'RenderError';
    }
}

/**
 * Creates the drawing context.
 *
 * `preserveDrawingBuffer` is enabled deliberately. It costs a little fill rate,
 * but without it the buffer may be cleared before `captureStream` reads it, and
 * the recorded file comes out black on some drivers. Correct recordings are
 * worth more here than the fill rate.
 *
 * `alpha` is disabled because the camera frame is opaque; leaving it on forces
 * the compositor to blend the canvas against the page for no visible benefit.
 */
export function createContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
    const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
    });

    if (!gl) {
        throw new RenderError(
            'This browser does not support WebGL 2.',
            'Open the page in a current version of Chrome, Edge, Firefox or Safari, and confirm that hardware acceleration is enabled.',
        );
    }

    return gl;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);

    if (!shader) {
        throw new RenderError(
            'A shader object could not be created.',
            'Reload the page. If this persists, graphics memory may be exhausted.',
        );
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) ?? 'no log was provided by the driver';
        gl.deleteShader(shader);

        // The numbered source accompanies the log because a driver reports a
        // line number and nothing else, which is not actionable on its own.
        console.error(`[gesture-fx] shader compilation failed\n${log}\n${numberLines(source)}`);

        throw new RenderError(
            'A visual effect failed to compile on this device.',
            'Report this with your browser and device model; the compiler log is in the developer console.',
        );
    }

    return shader;
}

/** Links a vertex and fragment shader pair into a usable program. */
export function createProgram(
    gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string,
): WebGLProgram {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

    const program = gl.createProgram();

    if (!program) {
        throw new RenderError(
            'A shader program could not be created.',
            'Reload the page and try again.',
        );
    }

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);

    // The shaders are flagged for deletion immediately. They are kept alive by
    // their attachment to the program and freed when the program is deleted.
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) ?? 'no log was provided by the driver';
        gl.deleteProgram(program);

        throw new RenderError(
            `A shader program failed to link: ${log}`,
            'Reload the page. If this persists, please report it with your browser and device model.',
        );
    }

    return program;
}

/**
 * Creates the geometry every program draws: one triangle covering the viewport.
 *
 * The vertices reach beyond the clip volume so the triangle's interior spans
 * the whole screen after clipping. This replaces the conventional two-triangle
 * quad, whose shared diagonal is shaded twice.
 */
export function createFullscreenTriangle(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
    const vertexArray = gl.createVertexArray();
    const buffer = gl.createBuffer();

    if (!vertexArray || !buffer) {
        throw new RenderError(
            'Geometry buffers could not be created.',
            'Reload the page and try again.',
        );
    }

    gl.bindVertexArray(vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
    );

    // Attribute location 0 is bound by convention; every program declares
    // `a_position` first, so no per-program lookup is required.
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    return vertexArray;
}

/**
 * Creates a texture configured for video frames.
 *
 * Clamping matters: effects displace their lookups past the edge of the frame,
 * and a repeating wrap would fold the far side of the image into the tear
 * rather than smearing the edge pixel as intended.
 */
export function createVideoTexture(gl: WebGL2RenderingContext): WebGLTexture {
    const texture = gl.createTexture();

    if (!texture) {
        throw new RenderError(
            'A video texture could not be created.',
            'Reload the page and try again.',
        );
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return texture;
}

/** Uploads the current video frame into a texture. */
export function uploadVideoFrame(
    gl: WebGL2RenderingContext,
    texture: WebGLTexture,
    video: HTMLVideoElement,
): void {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
}

/** Prefixes each line with its number, for readable compiler diagnostics. */
function numberLines(source: string): string {
    return source
        .split('\n')
        .map((line, index) => `${(index + 1).toString().padStart(4, ' ')} | ${line}`)
        .join('\n');
}
