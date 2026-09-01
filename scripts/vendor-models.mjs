/**
 * File: scripts/vendor-models.mjs
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: Node 18, ES modules
 *
 * Description:
 * Copies the hand tracking runtime and model into the repository, so the
 * application can serve them from its own origin instead of fetching them from
 * a content delivery network.
 *
 * By default they are fetched at runtime, which keeps roughly 19.7 MB off the
 * GitHub Pages bandwidth allowance and lets returning visitors share a cache.
 * Vendoring is the right choice in three situations:
 *
 *   The deployment must make no third party requests at all.
 *   The network blocks jsDelivr or Google's storage.
 *   The application has to work fully offline from a first visit.
 *
 * Run:
 *     npm run vendor:models
 *
 * The files land in Source Code/assets/models/ and are excluded by .gitignore,
 * so committing them is a deliberate act rather than an accident.
 */

import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TARGET_DIR = join(ROOT, 'Source Code', 'assets', 'models');

/** Pinned to the version in package.json, so this cannot drift from the code. */
const VERSION = '1.0.1';
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;

const ASSETS = [
    {
        name: 'vision_wasm_internal.js',
        url: `${WASM_BASE}/vision_wasm_internal.js`,
        note: 'the SIMD runtime loader',
    },
    {
        name: 'vision_wasm_internal.wasm',
        url: `${WASM_BASE}/vision_wasm_internal.wasm`,
        note: 'the SIMD runtime',
    },
    {
        name: 'vision_wasm_nosimd_internal.js',
        url: `${WASM_BASE}/vision_wasm_nosimd_internal.js`,
        note: 'the fallback loader, for a browser without SIMD',
    },
    {
        name: 'vision_wasm_nosimd_internal.wasm',
        url: `${WASM_BASE}/vision_wasm_nosimd_internal.wasm`,
        note: 'the fallback runtime',
    },
    {
        name: 'hand_landmarker.task',
        url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        note: 'the hand landmark model, float16',
    },
];

function formatBytes(bytes) {
    return bytes < 1024 * 1024
        ? `${Math.round(bytes / 1024)} KB`
        : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function download(asset) {
    const target = join(TARGET_DIR, asset.name);

    // Already present files are skipped, so an interrupted run resumes cheaply
    // rather than fetching 20 MB again.
    try {
        const existing = await stat(target);

        if (existing.size > 0) {
            console.log(`  skip  ${asset.name.padEnd(34)} ${formatBytes(existing.size).padStart(8)}  already present`);
            return existing.size;
        }
    } catch {
        // Not there yet, which is the normal case.
    }

    const response = await fetch(asset.url);

    if (!response.ok || !response.body) {
        throw new Error(`${asset.name}: the server returned ${response.status}`);
    }

    await pipeline(Readable.fromWeb(response.body), createWriteStream(target));

    const written = await stat(target);
    console.log(`  saved ${asset.name.padEnd(34)} ${formatBytes(written.size).padStart(8)}  ${asset.note}`);

    return written.size;
}

async function main() {
    console.log(`\nVendoring MediaPipe tasks-vision ${VERSION} into Source Code/assets/models\n`);

    await mkdir(TARGET_DIR, { recursive: true });

    let total = 0;

    for (const asset of ASSETS) {
        total += await download(asset);
    }

    console.log(`\n  ${formatBytes(total)} in ${ASSETS.length} files.\n`);

    console.log('To serve them from this origin, set these two values in');
    console.log('Source Code/scripts/config.ts, inside TRACKING_ASSETS:\n');
    console.log("    wasmBase: './assets/models',");
    console.log("    modelUrl: './assets/models/hand_landmarker.task',\n");
    console.log('These files are excluded by .gitignore. Committing them is a');
    console.log('deliberate choice: it adds roughly 20 MB to every clone.\n');
}

main().catch((error) => {
    console.error(`\nFailed: ${error.message}\n`);
    process.exitCode = 1;
});
