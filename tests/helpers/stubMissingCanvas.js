/**
 * Test-only preload (`node -r`). `canvas` (pulled in by pdf-img-convert for PDF
 * uploads) is a native module that does not compile on every dev machine. When
 * its binary is missing, resolve it to an inert stub so server.js can still boot
 * for the realtime tests. Never loaded in production.
 */
const path = require('path');
const Module = require('module');
const { pathToFileURL } = require('url');

let nativeAvailable = true;
try {
    require('canvas');
} catch (_) {
    nativeAvailable = false;
}

if (!nativeAvailable && typeof Module.registerHooks === 'function') {
    const stubUrl = pathToFileURL(path.join(__dirname, 'canvasStub.cjs')).href;
    // Covers both require('canvas') and `import ... from 'canvas'`.
    Module.registerHooks({
        resolve(specifier, context, nextResolve) {
            if (specifier === 'canvas') return { url: stubUrl, shortCircuit: true, format: 'commonjs' };
            return nextResolve(specifier, context);
        }
    });
}
