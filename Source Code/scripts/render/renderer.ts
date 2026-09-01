/**
 * File: scripts/render/renderer.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), WebGL 2, GLSL ES 3.00
 *
 * Description:
 * Draws the camera frame through the selected filter and the effect that is
 * currently playing.
 *
 * The canvas this renders into is the canvas that gets recorded. That is the
 * property the whole project depends on: because the recorder captures this
 * surface rather than the camera stream, the effect is present in the exported
 * file as pixels, and no editing step is needed to put it there.
 *
 * Two passes
 * ----------
 *   Pass 1  camera  ──filter──►  scene buffer      (crop, mirror, colour)
 *   Blit    scene   ──copy────►  rewind buffer     (reduced, periodic)
 *   Pass 2  scene   ──effect──►  canvas            (the gesture event)
 *
 * Separating the filter from the effect is what allows any filter to combine
 * with any effect. Writing them as one shader would require a program for every
 * pairing, which is six filters multiplied by seven effects.
 *
 * The blit in the middle is what makes the rewind cut possible: it costs one
 * small draw eight times a second and gives the effect layer access to what the
 * camera saw seconds ago.
 *
 * Every program is compiled at start-up rather than on first use. Compiling a
 * shader takes milliseconds and would otherwise drop frames at the exact moment
 * a gesture fires, which is the one moment that must not stutter.
 */

import { ABSTRACTION, AUTO_FRAME, REWIND } from '../config';
import type { EffectTimeline } from '../effects/timeline';
import type { FilterDefinition, FilterId } from '../effects/filters';
import type { EffectDefinition } from '../effects/types';
import { Framebuffer } from './framebuffer';
import {
    createContext,
    createFullscreenTriangle,
    createProgram,
    createVideoTexture,
    uploadVideoFrame,
} from './gl';
import { RewindBuffer } from './rewind-buffer';
import { ABSTRACTION_SHADER } from './shaders/abstraction';
import type { FrameQuad } from '../tracking/frame-quad';
import type { FramingTarget } from '../tracking/face';
import { PORTAL_STYLES, type PortalStyleId } from '../effects/portal-styles';
import { COPY_SHADER } from './shaders/copy';
import { buildPortalShader } from './shaders/portal';
import { FRAGMENT_PRELUDE } from './shaders/prelude';
import { VERTEX_SHADER } from './shaders/vertex';

/** Confines a value to a range. */
function clamp(value: number, low: number, high: number): number {
    return Math.min(Math.max(value, low), high);
}

/** A compiled program with its uniform locations resolved once. */
interface CompiledProgram {
    program: WebGLProgram;
    uniforms: Record<string, WebGLUniformLocation | null>;
}

/**
 * Texture coordinate parameters for a pass that reads an offscreen buffer.
 *
 * The vertex shader always flips Y, because its usual input is a video frame
 * whose origin is top left. A framebuffer texture already has the origin WebGL
 * expects, so the flip is cancelled by scaling Y by -1 and offsetting by 1
 * rather than by adding a second vertex shader.
 */
const IDENTITY_UV = {
    scale: { x: 1, y: -1 },
    offset: { x: 0, y: 1 },
} as const;

export class Renderer {
    private readonly gl: WebGL2RenderingContext;
    private readonly vertexArray: WebGLVertexArrayObject;

    /** The live camera frame. */
    private readonly sourceTexture: WebGLTexture;

    /** A copy held while a freezing effect plays. */
    private readonly frozenTexture: WebGLTexture;

    /**
     * A frame of the separately generated clip, for the composite pass.
     *
     * Allocated with the others rather than on demand: it is one texture object
     * whose storage is not reserved until a frame is uploaded into it, so an
     * unused one costs nothing worth deferring.
     */
    private readonly restyledTexture: WebGLTexture;

    /** The filtered, cropped scene, which both later stages read. */
    private scene: Framebuffer | null = null;

    /**
     * The scene with the finger frame composited over it.
     *
     * Allocated only when the frame is first used, so a session that never
     * makes the gesture never pays for the buffer.
     */
    private portalTarget: Framebuffer | null = null;

    /**
     * The two halves of the abstraction ping-pong.
     *
     * Three iterations of a bilateral filter cannot be run in one pass, because
     * each reads the whole output of the last. Two targets are alternated
     * instead, which is the standard construction and costs one extra texture
     * rather than one per iteration. Both are allocated on first use, so a
     * session that never opens the finger frame never pays for them.
     */
    private abstractA: Framebuffer | null = null;
    private abstractB: Framebuffer | null = null;

    /** Recent frames, for the rewind cut. */
    private rewind: RewindBuffer | null = null;

    private readonly effectPrograms = new Map<string, CompiledProgram>();
    private readonly filterPrograms = new Map<string, CompiledProgram>();
    private copy!: CompiledProgram;

    /** One program per portal style, so selecting one is a program change. */
    private readonly portalPrograms = new Map<PortalStyleId, CompiledProgram>();

    /** The iterated edge-preserving smoothing every portal style reads. */
    private abstraction!: CompiledProgram;

    /** The effect the frozen texture was captured for, so it is captured once. */
    private frozenFor: unknown = null;

    private viewportWidth = 0;
    private viewportHeight = 0;

    /** The crop and mirror the first pass applied, for mapping landmarks. */
    private lastCoverTransform = {
        scale: { x: 1, y: 1 },
        offset: { x: 0, y: 0 },
        mirrored: false,
    };

    private readonly startedAt = performance.now();

    constructor(readonly canvas: HTMLCanvasElement) {
        this.gl = createContext(canvas);
        this.vertexArray = createFullscreenTriangle(this.gl);
        this.sourceTexture = createVideoTexture(this.gl);
        this.frozenTexture = createVideoTexture(this.gl);
        this.restyledTexture = createVideoTexture(this.gl);
    }

    /** Compiles the copy program, one program per filter and one per effect. */
    compile(effects: readonly EffectDefinition[], filters: readonly FilterDefinition[]): void {
        this.copy = this.build(COPY_SHADER);
        this.abstraction = this.build(ABSTRACTION_SHADER);

        for (const style of PORTAL_STYLES) {
            this.portalPrograms.set(style.id, this.build(buildPortalShader(style.shader)));
        }

        for (const filter of filters) {
            this.filterPrograms.set(filter.id, this.build(filter.fragmentShader));
        }

        for (const effect of effects) {
            this.effectPrograms.set(effect.id, this.build(effect.fragmentShader));
        }
    }

    private build(fragmentBody: string): CompiledProgram {
        const { gl } = this;
        const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_PRELUDE + fragmentBody);

        const names = [
            'u_source',
            'u_past',
            'u_hasPast',
            'u_resolution',
            'u_time',
            'u_progress',
            'u_envelope',
            'u_intensity',
            'u_direction',
            'u_seed',
            'u_uvScale',
            'u_uvOffset',
            'u_mirror',
            'u_corner0',
            'u_corner1',
            'u_corner2',
            'u_corner3',
            'u_presence',
            'u_aspect',
            'u_abstract',
            'u_step',
            'u_range',
            'u_restyled',
        ];

        const uniforms: Record<string, WebGLUniformLocation | null> = {};

        for (const name of names) {
            uniforms[name] = gl.getUniformLocation(program, name);
        }

        return { program, uniforms };
    }

    /** Discards the recent history, so a new take cannot cut into the last one. */
    clearHistory(): void {
        this.rewind?.clear();
    }

    /**
     * Draws one frame.
     *
     * Called from the application's animation loop at the display refresh rate,
     * independently of how often hand tracking runs.
     */
    render(
        video: HTMLVideoElement,
        timeline: EffectTimeline,
        now: number,
        mirrored: boolean,
        filterId: FilterId,
        quad: FrameQuad | null = null,
        portalStyle: PortalStyleId = 'anime',
        framing: FramingTarget | null = null,
    ): void {
        if (video.videoWidth === 0 || video.videoHeight === 0) {
            return;
        }

        this.syncSize();

        const scene = this.scene;
        const rewind = this.rewind;

        if (!scene || !rewind) {
            return;
        }

        const instance = timeline.current;
        const freezing = instance?.definition.freezesSource ?? false;

        // A freezing effect captures the camera frame once, at its first drawn
        // frame, and samples that copy for the rest of its life. The live
        // texture is left un-updated meanwhile, which is what stops the picture
        // moving while the camera keeps running underneath.
        if (freezing) {
            if (this.frozenFor !== instance) {
                uploadVideoFrame(this.gl, this.frozenTexture, video);
                this.frozenFor = instance;
            }
        } else {
            uploadVideoFrame(this.gl, this.sourceTexture, video);
            this.frozenFor = null;
        }

        this.renderScene(video, scene, filterId, freezing, mirrored, now, framing);

        // The finger frame draws over the scene before any effect is applied,
        // so a gesture effect treats the window as part of the picture rather
        // than compositing over the top of it.
        const source = quad
            ? this.renderPortal(scene, this.renderAbstraction(scene), quad, now, portalStyle)
            : scene;

        // A frozen frame is not recorded into the history. Doing so would fill
        // the buffer with copies of one moment and destroy the very history a
        // later rewind cut would want to reach into.
        if (!freezing && rewind.shouldCapture(now)) {
            this.captureHistory(rewind, scene, now);
        }

        this.renderToScreen(source, rewind, timeline, instance, now);
    }

    /**
     * Draws one frame of the composite: the recorded take, with the window
     * revealing a separately generated version of it.
     *
     * The two clips are the same shot, so no crop or mirror is applied here.
     * The take was recorded from this canvas and already carries both, and the
     * generated clip was produced under a constraint that it stay pixel aligned
     * with it. Applying either again would move one against the other.
     *
     * Called from the compositor, once per output frame, with both videos
     * already seeked to the same instant. It does not run on the animation
     * loop and does not touch the rewind buffer, which belongs to a live take
     * and would otherwise be filled with frames from a finished one.
     */
    composite(
        raw: HTMLVideoElement,
        restyled: HTMLVideoElement,
        quad: FrameQuad | null,
        now: number,
    ): void {
        if (raw.videoWidth === 0) {
            return;
        }

        this.syncSize();

        const scene = this.scene;

        if (!scene) {
            return;
        }

        uploadVideoFrame(this.gl, this.sourceTexture, raw);

        if (restyled.videoWidth > 0) {
            uploadVideoFrame(this.gl, this.restyledTexture, restyled);
        }

        this.renderScene(raw, scene, 'none', false, false, now, null);

        const source = quad
            ? this.renderPortal(scene, this.renderAbstraction(scene), quad, now, 'restyled')
            : scene;

        this.blitToScreen(source);
    }

    /**
     * The window's corners in canvas pixels, for interface drawn over the frame.
     *
     * The restyle mode needs the outline on screen while keeping it out of the
     * recording, so it is drawn in the document rather than by the shader. That
     * only works if the document agrees with the shader about where the corners
     * are, which means going through the same crop, mirror and framing the first
     * pass applied. Recomputing it in the interface would be a second copy of
     * the same arithmetic, and the two would eventually disagree.
     */
    projectQuad(quad: FrameQuad): Array<{ x: number; y: number }> {
        return quad.corners.map((corner) => {
            const point = this.toOutputSpace(corner);

            return {
                x: point.x * this.canvas.width,
                // Screen space runs upward and the document runs downward.
                y: (1 - point.y) * this.canvas.height,
            };
        });
    }

    /** Copies a buffer to the canvas, applying nothing. */
    private blitToScreen(buffer: Framebuffer): void {
        const { gl } = this;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        gl.useProgram(this.copy.program);
        gl.bindVertexArray(this.vertexArray);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, buffer.texture);
        gl.uniform1i(this.copy.uniforms.u_source, 0);

        gl.uniform2f(this.copy.uniforms.u_uvScale, IDENTITY_UV.scale.x, IDENTITY_UV.scale.y);
        gl.uniform2f(this.copy.uniforms.u_uvOffset, IDENTITY_UV.offset.x, IDENTITY_UV.offset.y);
        gl.uniform1f(this.copy.uniforms.u_mirror, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
    }

    /**
     * Builds the surface representation the portal styles read.
     *
     * A short sequence of bilateral filters at half the output resolution, each
     * with its own colour width. One pass removes noise; a sequence of them
     * collapses each region onto its own colour while leaving boundaries where
     * they were, and it is that flatness rather than any outline that makes the
     * window read as drawn.
     *
     * Half resolution is chosen for reach rather than for cost. A kernel of a
     * fixed tap count spans twice as much of the full frame there, which is what
     * lets skin and clothing become single regions instead of merely losing
     * their grain. The softness the reduction leaves at a boundary is removed
     * again by the quantisation inside each style, and contours are taken from
     * the full resolution scene, where the gradients survive.
     *
     * Called only while the finger frame is open.
     */
    private renderAbstraction(scene: Framebuffer): Framebuffer {
        const { gl } = this;

        const width = Math.max(2, Math.round(scene.width * ABSTRACTION.resolutionScale));
        const height = Math.max(2, Math.round(scene.height * ABSTRACTION.resolutionScale));

        if (!this.abstractA || !this.abstractB) {
            this.abstractA = new Framebuffer(gl, width, height);
            this.abstractB = new Framebuffer(gl, width, height);
        }

        const first = this.abstractA;
        const second = this.abstractB;

        first.resize(width, height);
        second.resize(width, height);

        gl.useProgram(this.abstraction.program);
        gl.bindVertexArray(this.vertexArray);

        gl.uniform2f(this.abstraction.uniforms.u_uvScale, IDENTITY_UV.scale.x, IDENTITY_UV.scale.y);
        gl.uniform2f(this.abstraction.uniforms.u_uvOffset, IDENTITY_UV.offset.x, IDENTITY_UV.offset.y);
        gl.uniform1f(this.abstraction.uniforms.u_mirror, 0);
        gl.uniform2f(this.abstraction.uniforms.u_resolution, width, height);
        gl.uniform1i(this.abstraction.uniforms.u_source, 0);
        gl.uniform2f(this.abstraction.uniforms.u_step, 1 / width, 1 / height);

        this.setEventUniforms(this.abstraction, 0, 0, 0, 0, 0);

        // The first iteration reads the scene and each later one reads what the
        // last wrote. Targets alternate, so no pass samples the texture it is
        // writing into, which is undefined rather than merely slow.
        let read: WebGLTexture = scene.texture;
        let write = first;

        for (const range of ABSTRACTION.rangeSchedule) {
            write.bind();

            // Wide on the first pass, narrower on the ones that follow. See
            // ABSTRACTION.rangeSchedule for why.
            gl.uniform1f(this.abstraction.uniforms.u_range, range);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, read);

            gl.drawArrays(gl.TRIANGLES, 0, 3);

            read = write.texture;
            write = write === first ? second : first;
        }

        // The cursor has already advanced past the target the last pass filled.
        return write === first ? second : first;
    }

    /**
     * Draws the finger frame over the scene and returns the buffer holding the
     * result.
     *
     * The corners arrive in normalised image coordinates with the camera's own
     * orientation. The scene has already been cropped to the output aspect and
     * mirrored if the camera is a front one, so the corners are put through the
     * same transform here; otherwise the window would sit somewhere other than
     * on the hands.
     */
    private renderPortal(
        scene: Framebuffer,
        surface: Framebuffer,
        quad: FrameQuad,
        now: number,
        portalStyle: PortalStyleId,
    ): Framebuffer {
        const { gl } = this;

        if (!this.portalTarget) {
            this.portalTarget = new Framebuffer(gl, scene.width, scene.height);
        }

        this.portalTarget.resize(scene.width, scene.height);
        this.portalTarget.bind();

        const compiled = this.portalPrograms.get(portalStyle) ?? this.copy;

        gl.useProgram(compiled.program);
        gl.bindVertexArray(this.vertexArray);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, scene.texture);
        gl.uniform1i(compiled.uniforms.u_source, 0);

        // Unit 2 rather than 1, because unit 1 carries the recalled frame and
        // every program is compiled against one uniform set.
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, surface.texture);
        gl.uniform1i(compiled.uniforms.u_abstract, 2);

        // Bound for every style, so the sampler is never left pointing at
        // whatever the last program happened to leave on the unit. Only the
        // restyled style reads it.
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.restyledTexture);
        gl.uniform1i(compiled.uniforms.u_restyled, 3);

        gl.uniform2f(compiled.uniforms.u_uvScale, IDENTITY_UV.scale.x, IDENTITY_UV.scale.y);
        gl.uniform2f(compiled.uniforms.u_uvOffset, IDENTITY_UV.offset.x, IDENTITY_UV.offset.y);
        gl.uniform1f(compiled.uniforms.u_mirror, 0);
        gl.uniform2f(compiled.uniforms.u_resolution, scene.width, scene.height);
        gl.uniform1f(compiled.uniforms.u_time, (now - this.startedAt) / 1000);
        gl.uniform1f(compiled.uniforms.u_presence, quad.presence);
        gl.uniform1f(compiled.uniforms.u_aspect, scene.width / scene.height);

        const names = ['u_corner0', 'u_corner1', 'u_corner2', 'u_corner3'];

        for (let i = 0; i < 4; i += 1) {
            const point = this.toOutputSpace(quad.corners[i]);
            gl.uniform2f(compiled.uniforms[names[i]], point.x, point.y);
        }

        this.setEventUniforms(compiled, 0, 0, 0, 0, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 3);

        return this.portalTarget;
    }

    /**
     * Maps a normalised camera coordinate into the output frame.
     *
     * The inverse of the crop the first pass applies, plus the mirror, so a
     * fingertip at the edge of a cropped-away region lands outside the frame
     * rather than being clamped onto its border.
     */
    private toOutputSpace(point: { x: number; y: number }): { x: number; y: number } {
        const { scale, offset, mirrored } = this.lastCoverTransform;

        // The vertex shader builds the source coordinate as
        //     u = mirror(screen.x) * scale.x + offset.x
        //     v = (1 - screen.y)   * scale.y + offset.y
        // so inverting it has to undo the vertical flip as well as the crop.
        // Omitting that flip places the window, and the corner marks, at the
        // reflection of the fingers about the middle of the frame.
        const u = (point.x - offset.x) / scale.x;
        const v = (point.y - offset.y) / scale.y;

        return {
            x: mirrored ? 1 - u : u,
            y: 1 - v,
        };
    }

    /** Pass 1: the camera frame, cropped, mirrored and filtered. */
    private renderScene(
        video: HTMLVideoElement,
        scene: Framebuffer,
        filterId: FilterId,
        freezing: boolean,
        mirrored: boolean,
        now: number,
        framing: FramingTarget | null,
    ): void {
        const { gl } = this;
        const compiled = this.filterPrograms.get(filterId) ?? this.copy;

        scene.bind();

        gl.useProgram(compiled.program);
        gl.bindVertexArray(this.vertexArray);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, freezing ? this.frozenTexture : this.sourceTexture);
        gl.uniform1i(compiled.uniforms.u_source, 0);

        const { uvScale, uvOffset } = this.coverTransform(video, scene, framing);

        this.lastCoverTransform = { scale: uvScale, offset: uvOffset, mirrored };

        gl.uniform2f(compiled.uniforms.u_uvScale, uvScale.x, uvScale.y);
        gl.uniform2f(compiled.uniforms.u_uvOffset, uvOffset.x, uvOffset.y);
        gl.uniform1f(compiled.uniforms.u_mirror, mirrored ? 1 : 0);
        gl.uniform2f(compiled.uniforms.u_resolution, scene.width, scene.height);
        gl.uniform1f(compiled.uniforms.u_time, (now - this.startedAt) / 1000);

        // A filter reads none of the event uniforms, but they are set so that a
        // contributor who reaches for one finds a defined value rather than
        // whichever number the previous program happened to leave behind.
        this.setEventUniforms(compiled, 0, 0, 0, 0, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /** Blit: a reduced copy of the scene into the next rewind slot. */
    private captureHistory(rewind: RewindBuffer, scene: Framebuffer, now: number): void {
        const { gl } = this;

        rewind.beginCapture(now);

        gl.useProgram(this.copy.program);
        gl.bindVertexArray(this.vertexArray);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, scene.texture);
        gl.uniform1i(this.copy.uniforms.u_source, 0);

        gl.uniform2f(this.copy.uniforms.u_uvScale, IDENTITY_UV.scale.x, IDENTITY_UV.scale.y);
        gl.uniform2f(this.copy.uniforms.u_uvOffset, IDENTITY_UV.offset.x, IDENTITY_UV.offset.y);
        gl.uniform1f(this.copy.uniforms.u_mirror, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 3);

        rewind.commit(now);
    }

    /** Pass 2: the scene through the playing effect, onto the canvas. */
    private renderToScreen(
        scene: Framebuffer,
        rewind: RewindBuffer,
        timeline: EffectTimeline,
        instance: ReturnType<EffectTimeline['trigger']> | null,
        now: number,
    ): void {
        const { gl } = this;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        const compiled = instance
            ? this.effectPrograms.get(instance.definition.id) ?? this.copy
            : this.copy;

        gl.useProgram(compiled.program);
        gl.bindVertexArray(this.vertexArray);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, scene.texture);
        gl.uniform1i(compiled.uniforms.u_source, 0);

        // The recalled frame is always bound, so every program has a complete
        // sampler set. `u_hasPast` tells the shader whether it is real.
        const past = rewind.isReady ? rewind.frameAt(now, REWIND.delayMs) : null;

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, past ?? scene.texture);
        gl.uniform1i(compiled.uniforms.u_past, 1);
        gl.uniform1f(compiled.uniforms.u_hasPast, past ? 1 : 0);

        gl.uniform2f(compiled.uniforms.u_uvScale, IDENTITY_UV.scale.x, IDENTITY_UV.scale.y);
        gl.uniform2f(compiled.uniforms.u_uvOffset, IDENTITY_UV.offset.x, IDENTITY_UV.offset.y);
        gl.uniform1f(compiled.uniforms.u_mirror, 0);
        gl.uniform2f(compiled.uniforms.u_resolution, this.canvas.width, this.canvas.height);
        gl.uniform1f(compiled.uniforms.u_time, (now - this.startedAt) / 1000);

        if (instance) {
            this.setEventUniforms(
                compiled,
                timeline.progressOf(instance, now),
                timeline.envelopeOf(instance, now),
                instance.intensity,
                instance.direction,
                instance.seed,
            );
        } else {
            this.setEventUniforms(compiled, 0, 0, 0, 0, 0);
        }

        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
    }

    private setEventUniforms(
        compiled: CompiledProgram,
        progress: number,
        envelope: number,
        intensity: number,
        direction: number,
        seed: number,
    ): void {
        const { gl } = this;

        gl.uniform1f(compiled.uniforms.u_progress, progress);
        gl.uniform1f(compiled.uniforms.u_envelope, envelope);
        gl.uniform1f(compiled.uniforms.u_intensity, intensity);
        gl.uniform1f(compiled.uniforms.u_direction, direction);
        gl.uniform1f(compiled.uniforms.u_seed, seed);
    }

    /**
     * Matches every buffer to the canvas backing store.
     *
     * The backing store is owned by the viewfinder, which resizes it when the
     * output preset changes. WebGL does not observe that: the viewport keeps
     * whatever dimensions it was given, and drawing continues into a corner of
     * the larger buffer. Reconciling here, every frame, means they cannot drift
     * apart no matter who resizes the canvas or when.
     */
    private syncSize(): void {
        const { width, height } = this.canvas;

        if (width === this.viewportWidth && height === this.viewportHeight) {
            return;
        }

        this.viewportWidth = width;
        this.viewportHeight = height;

        if (this.scene) {
            this.scene.resize(width, height);
        } else {
            this.scene = new Framebuffer(this.gl, width, height);
        }

        if (this.rewind) {
            this.rewind.resize(width, height);
        } else {
            this.rewind = new RewindBuffer(this.gl, width, height);
        }
    }

    /**
     * Computes the crop that fills the output frame without distorting it.
     *
     * The camera is typically landscape while the output is typically portrait,
     * so the difference is large and must be resolved by cropping rather than
     * by stretching. The narrower axis is scaled down and centred, which is the
     * behaviour of a CSS `cover` fit expressed in texture coordinates.
     */
    private coverTransform(
        video: HTMLVideoElement,
        scene: Framebuffer,
        framing: FramingTarget | null,
    ): { uvScale: { x: number; y: number }; uvOffset: { x: number; y: number } } {
        const sourceAspect = video.videoWidth / video.videoHeight;
        const outputAspect = scene.width / scene.height;

        // The narrower axis is scaled down and the overflow is cropped, which
        // is a CSS cover fit expressed in texture coordinates.
        let scaleX = 1;
        let scaleY = 1;

        if (sourceAspect > outputAspect) {
            scaleX = outputAspect / sourceAspect;
        } else {
            scaleY = sourceAspect / outputAspect;
        }

        if (!framing) {
            return {
                uvScale: { x: scaleX, y: scaleY },
                uvOffset: { x: (1 - scaleX) / 2, y: (1 - scaleY) / 2 },
            };
        }

        // Auto-framing tightens the crop before moving it. A portrait output
        // from a landscape camera already has horizontal room and none at all
        // vertically, so without this the framing could follow a face sideways
        // and never up or down.
        scaleX /= AUTO_FRAME.zoom;
        scaleY /= AUTO_FRAME.zoom;

        // The vertex shader builds the source coordinate as
        //     u = mirror(screen.x) * scaleX + offsetX
        //     v = (1 - screen.y)   * scaleY + offsetY
        // so putting the face at the centre horizontally, and at a fraction of
        // the height vertically, inverts to these two offsets. Clamping keeps
        // the crop inside the sensor, which is what stops a face near the edge
        // dragging a black band into the frame.
        const offsetX = clamp(framing.x - scaleX / 2, 0, 1 - scaleX);
        const offsetY = clamp(framing.y - scaleY * AUTO_FRAME.targetHeight, 0, 1 - scaleY);

        return {
            uvScale: { x: scaleX, y: scaleY },
            uvOffset: { x: offsetX, y: offsetY },
        };
    }

    /** Releases every GPU resource this renderer created. */
    dispose(): void {
        const { gl } = this;

        this.effectPrograms.forEach((compiled) => gl.deleteProgram(compiled.program));
        this.filterPrograms.forEach((compiled) => gl.deleteProgram(compiled.program));
        this.effectPrograms.clear();
        this.filterPrograms.clear();

        if (this.copy) {
            gl.deleteProgram(this.copy.program);
        }

        this.portalPrograms.forEach((compiled) => gl.deleteProgram(compiled.program));
        this.portalPrograms.clear();

        if (this.abstraction) {
            gl.deleteProgram(this.abstraction.program);
        }

        this.scene?.dispose();
        this.portalTarget?.dispose();
        this.abstractA?.dispose();
        this.abstractB?.dispose();
        this.rewind?.dispose();

        gl.deleteTexture(this.sourceTexture);
        gl.deleteTexture(this.frozenTexture);
        gl.deleteTexture(this.restyledTexture);
        gl.deleteVertexArray(this.vertexArray);
    }
}
