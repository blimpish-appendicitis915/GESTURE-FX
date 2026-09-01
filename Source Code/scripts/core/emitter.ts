/**
 * File: scripts/core/emitter.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022)
 *
 * Description:
 * A typed publish and subscribe emitter used as the only communication channel
 * between the application layers. The camera, tracker, gesture engine, renderer
 * and recorder never hold references to one another; they exchange events here.
 *
 * The application has fewer than a dozen event types in total, so this replaces
 * a state management library rather than supplementing one.
 */

export type Listener<TPayload> = (payload: TPayload) => void;

export type Unsubscribe = () => void;

export class Emitter<TEvents extends Record<string, unknown>> {
    private readonly listeners = new Map<keyof TEvents, Set<Listener<never>>>();

    /**
     * Registers a listener and returns the function that removes it. Callers
     * are expected to keep the returned handle for teardown.
     */
    on<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): Unsubscribe {
        let group = this.listeners.get(event);

        if (!group) {
            group = new Set<Listener<never>>();
            this.listeners.set(event, group);
        }

        group.add(listener as Listener<never>);

        return () => this.off(event, listener);
    }

    /** Registers a listener that removes itself after the first delivery. */
    once<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): Unsubscribe {
        const unsubscribe = this.on(event, (payload) => {
            unsubscribe();
            listener(payload);
        });

        return unsubscribe;
    }

    off<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): void {
        this.listeners.get(event)?.delete(listener as Listener<never>);
    }

    /**
     * Delivers a payload to every listener. A listener that throws is reported
     * and skipped: one broken subscriber must not stop the render loop.
     */
    emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
        const group = this.listeners.get(event);

        if (!group) {
            return;
        }

        // Iterate over a copy so a listener may unsubscribe itself during delivery.
        for (const listener of [...group]) {
            try {
                (listener as Listener<TEvents[K]>)(payload);
            } catch (error) {
                console.error(`[gesture-fx] listener for "${String(event)}" threw`, error);
            }
        }
    }

    /** Removes every listener. Called when the application tears down. */
    clear(): void {
        this.listeners.clear();
    }
}
