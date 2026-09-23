// Vendored from WebEyeTrack, MIT. See LICENSE and README.md in this directory.
import { SVD } from 'ml-matrix';
/**
 * Calls SVD with autoTranspose disabled and suppresses the known warning.
 */
export function safeSVD(A) {
    const originalWarn = console.warn;
    console.warn = function (...args) {
        const msg = args[0];
        if (typeof msg === 'string' && msg.includes('autoTranspose')) {
            return; // suppress only this specific message
        }
        originalWarn.apply(console, args);
    };
    const result = new SVD(A, { autoTranspose: false });
    console.warn = originalWarn;
    return result;
}
