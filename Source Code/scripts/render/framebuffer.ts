/**
 * File: scripts/render/framebuffer.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), WebGL 2
 *
 * Description:
 * An offscreen render target: a texture with a framebuffer bound to it.
 *
 * The renderer draws in two passes. The first applies the selected filter and
 * the aspect crop and writes here; the second reads this texture and applies
 * the gesture effect to the screen. Separating them is what allows a filter and
 * an effect to combine without writing a shader for every pairing, which would
 * otherwise be six filters multiplied by seven effects.
 *
 * The same type backs the rewind buffer's frames, at a reduced size.
 */

import { RenderError } from './gl';

export class Framebuffer {
    readonly texture: WebGLTexture;
    readonly framebuffer: WebGLFramebuffer;

    private currentWidth = 0;
    private currentHeight = 0;

    constructor(private readonly gl: WebGL2RenderingContext, width: number, height: number) {
        const texture = gl.createTexture();
        const framebuffer = gl.createFramebuffer();

        if (!texture || !framebuffer) {
            throw new RenderError(
                'An offscreen render target could not be created.',
                'Reload the page. If this persists, graphics memory may be exhausted.',
            );
        }

        this.texture = texture;
        this.framebuffer = framebuffer;

        // Clamped and linear, matching the video textures, so an effect that
        // samples past the edge reads the edge pixel rather than wrapping.
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        this.resize(width, height);

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            throw new RenderError(
                'An offscreen render target was rejected by the graphics driver.',
                'Reload the page, or try a different browser.',
            );
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    get width(): number {
        return this.currentWidth;
    }

    get height(): number {
        return this.currentHeight;
    }

    /** Reallocates the texture. A no-op when the size is unchanged. */
    resize(width: number, height: number): void {
        if (width === this.currentWidth && height === this.currentHeight) {
            return;
        }

        const { gl } = this;

        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindTexture(gl.TEXTURE_2D, null);

        this.currentWidth = width;
        this.currentHeight = height;
    }

    /** Directs subsequent draw calls into this target. */
    bind(): void {
        const { gl } = this;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.viewport(0, 0, this.currentWidth, this.currentHeight);
    }

    dispose(): void {
        this.gl.deleteFramebuffer(this.framebuffer);
        this.gl.deleteTexture(this.texture);
    }
}
