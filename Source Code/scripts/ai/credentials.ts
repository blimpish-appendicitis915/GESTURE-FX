/**
 * File: scripts/ai/credentials.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: September 1 2026
 * License: MIT
 *
 * Tech Stack: TypeScript (ES2022), Web Storage
 *
 * Description:
 * Holds the user's own Gemini key for as long as they want it held.
 *
 * The key is a secret that belongs to the person who typed it, and this project
 * has no server to keep it on, so the only question is how long it stays in the
 * browser. The default answer is: until the tab closes.
 *
 * Two places, one deliberate
 * --------------------------
 * In memory, always. In `localStorage`, only when the user ticks the box that
 * says so. Persisting by default would be the convenient choice and the wrong
 * one: a key written to disk on a shared or borrowed machine outlives the
 * session that put it there, and nothing in the interface would remind anyone
 * it was still present.
 *
 * The module exposes no getter that returns the key for display. The interface
 * needs to know whether a key exists and what its last four characters are, and
 * both of those are answered without handing the secret back out. The value
 * itself leaves only through the request that uses it.
 *
 * Nothing here logs. A key printed to the console survives in the developer
 * tools long after it has been forgotten everywhere else.
 */

const STORAGE_KEY = 'gesture-fx.gemini.key';

/** What the interface is allowed to know about a stored key. */
export interface KeyPresence {
    present: boolean;
    /** The last four characters, for recognising which key is loaded. */
    tail: string;
    /** Whether it will survive the tab closing. */
    remembered: boolean;
}

let inMemory: string | null = null;
let remembered = false;

/**
 * Reads any key persisted by a previous visit.
 *
 * Called once at start-up. A stored value that is not shaped like a key is
 * discarded rather than kept, because the only way it could have got there is
 * a change of format on our side or tampering, and neither is worth carrying.
 */
export function restoreKey(): void {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);

        if (stored && isPlausible(stored)) {
            inMemory = stored;
            remembered = true;
        }
    } catch {
        // Storage is blocked, as in a private window. The session simply starts
        // without a key, which is the same state as a first visit.
    }
}

/**
 * Whether a string could be a Google API key.
 *
 * A shape check, not a validity check. Only Google can say whether a key works,
 * and the first request finds out; this exists to catch the paste that picked
 * up a stray line of a terminal rather than to gate anything.
 */
export function isPlausible(candidate: string): boolean {
    const trimmed = candidate.trim();

    return trimmed.length >= 30 && trimmed.length <= 120 && /^[A-Za-z0-9_-]+$/.test(trimmed);
}

/** Stores a key for this session, and on this device if asked. */
export function setKey(key: string, persist: boolean): void {
    inMemory = key.trim();
    remembered = persist;

    if (!persist) {
        forgetStored();
        return;
    }

    try {
        window.localStorage.setItem(STORAGE_KEY, inMemory);
    } catch {
        // The key still works for this session. Only persistence is lost, and
        // the interface reports what actually happened rather than what was
        // asked for, because `presence` reads the same flags this sets.
        remembered = false;
    }
}

/** Discards the key from memory and from the device. */
export function clearKey(): void {
    inMemory = null;
    remembered = false;
    forgetStored();
}

function forgetStored(): void {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing further can be done, and nothing further is owed: the key is
        // already gone from memory, so this session cannot use it.
    }
}

/** What the interface may know. Never the key itself. */
export function presence(): KeyPresence {
    return {
        present: inMemory !== null,
        tail: inMemory ? inMemory.slice(-4) : '',
        remembered,
    };
}

/**
 * The key, for the one module that sends it.
 *
 * Deliberately awkward to reach and deliberately named. A caller that wants
 * this is about to put a secret on the network, and that should read as what it
 * is at the call site.
 */
export function keyForRequest(): string | null {
    return inMemory;
}
