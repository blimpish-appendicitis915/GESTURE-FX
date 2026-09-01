/**
 * File: scripts/effects/timeline.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * Holds the effects currently playing and reports which one the renderer should
 * draw, together with its progress.
 *
 * This is the component that decouples detection from rendering, which is the
 * central architectural decision of the project. A gesture produces one trigger
 * and then plays out on wall-clock time, so an effect runs at the display's
 * frame rate regardless of how slowly hand tracking happens to be running. On a
 * device tracking at 15 Hz the gesture is recognised later, but the effect is
 * still smooth, because nothing about its playback is tied to inference.
 *
 * Only the most recent effect is drawn. Compositing two at once was tried and
 * rejected: overlapping displacement shaders produce mud rather than a richer
 * image, and a firm replacement reads as an intentional cut.
 */

import { envelope } from '../core/geometry';
import type { GestureTrigger } from '../gestures/types';
import { effectById } from './registry';
import type { EffectInstance } from './types';

/**
 * The furthest an effect may be started in the past, in milliseconds.
 *
 * A trigger is dated to the instant the gesture happened, which is earlier than
 * the instant it was confirmed. Honouring that date keeps an effect aligned
 * with its cause in the recorded file. Without a bound, however, a slow
 * confirmation would begin an effect already past its attack, and the viewer
 * would never see it start. Clamping keeps the alignment while guaranteeing the
 * onset is always visible.
 */
const MAXIMUM_BACKDATE_MS = 120;

export class EffectTimeline {
    private instances: EffectInstance[] = [];

    /** Effects playing right now, most recent last. */
    get active(): readonly EffectInstance[] {
        return this.instances;
    }

    /** The effect the renderer should draw, or null for the plain camera. */
    get current(): EffectInstance | null {
        return this.instances.at(-1) ?? null;
    }

    get isEmpty(): boolean {
        return this.instances.length === 0;
    }

    /** Starts an effect from a gesture trigger and returns the new instance. */
    trigger(trigger: GestureTrigger, now: number): EffectInstance {
        const definition = effectById(trigger.effectId);

        const instance: EffectInstance = {
            definition,
            startedAt: Math.max(trigger.at, now - MAXIMUM_BACKDATE_MS),
            intensity: trigger.confidence,
            direction: trigger.direction ?? 0,
            // Varies the noise pattern between firings so a repeated gesture
            // does not produce a visibly identical effect.
            seed: Math.random(),
        };

        this.instances.push(instance);

        return instance;
    }

    /** Removes finished effects. Called once per rendered frame. */
    update(now: number): void {
        if (this.instances.length === 0) {
            return;
        }

        this.instances = this.instances.filter(
            (instance) => now - instance.startedAt < instance.definition.durationMs,
        );
    }

    /** Linear progress through an effect, from 0 at the trigger to 1 at the end. */
    progressOf(instance: EffectInstance, now: number): number {
        const elapsed = now - instance.startedAt;
        const ratio = elapsed / instance.definition.durationMs;

        return ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
    }

    /** The attack and decay curve most effects drive their strength from. */
    envelopeOf(instance: EffectInstance, now: number): number {
        return envelope(this.progressOf(instance, now));
    }

    /** Discards every playing effect. Called when a recording starts or stops. */
    clear(): void {
        this.instances = [];
    }
}
