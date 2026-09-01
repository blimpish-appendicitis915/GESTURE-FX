/**
 * File: vite.config.ts
 * Author: Amey Thakur
 * GitHub: https://github.com/Amey-Thakur
 * Repository: https://github.com/Amey-Thakur/GESTURE-FX
 * Release Date: August 31 2026
 * License: MIT
 *
 * Tech Stack: Vite 5, TypeScript (ES2022)
 *
 * Description:
 * Build configuration for the GESTURE-FX application. The application root is
 * "Source Code", matching the repository layout, and the production bundle is
 * written to "dist" for the GitHub Pages workflow to publish.
 *
 * The base path defaults to the repository name because GitHub Pages serves
 * project sites from a subdirectory. Set BASE_PATH=/ when deploying to a host
 * that serves from the domain root, such as a Hugging Face Static Space.
 */

import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// This file is an ES module, where `__dirname` does not exist. The directory is
// derived from the module's own URL instead.
const HERE = fileURLToPath(new URL('.', import.meta.url));

const APP_ROOT = resolve(HERE, 'Source Code');
const OUT_DIR = resolve(HERE, 'dist');

export default defineConfig(({ command }) => ({
    root: APP_ROOT,

    // A development server is served from the root; a built site is not.
    base: command === 'build' ? (process.env.BASE_PATH ?? '/GESTURE-FX/') : '/',

    build: {
        outDir: OUT_DIR,
        emptyOutDir: true,
        target: 'es2022',
        sourcemap: true,
        rollupOptions: {
            // The 404 page is a second entry point. Without listing it here it
            // would be absent from the build, and GitHub Pages would fall back
            // to its own generic error page.
            input: {
                index: resolve(APP_ROOT, 'index.html'),
                notFound: resolve(APP_ROOT, '404.html'),
                // The detector evaluation. Published so the figures reported in
                // the paper can be reproduced by opening a page rather than by
                // installing a toolchain.
                evaluation: resolve(APP_ROOT, 'evaluation.html'),
            },
            output: {
                // The MediaPipe vision bundle is the only large chunk. Splitting
                // it lets the interface paint before the tracker has downloaded.
                manualChunks: {
                    mediapipe: ['@mediapipe/tasks-vision'],
                },
            },
        },
    },

    server: {
        host: true,
        port: 5173,
    },

    preview: {
        host: true,
        port: 4173,
    },
}));
