# Third-party notices

The root MIT license applies to original Little Lens code. Preserve the existing licenses of bundled dependencies:

- Sites Vite plugin: MIT, OpenAI; `build/sites-vite-plugin.LICENSE`.
- WebEyeTrack preprocessing and BlazeGaze weights: MIT; `lib/vendor/webeyetrack/LICENSE`, its README, and `public/vision/blazegaze/LICENSE`. Source: https://github.com/RedForestAI/WebEyeTrack. Our adapter differs from the paper's pipeline.
- MediaPipe Tasks Vision and face-landmark assets: `public/vision/LICENSE.txt` and `public/vision/NOTICE.txt`. Source: https://github.com/google-ai-edge/mediapipe.
- TensorFlow.js WASM: Apache-2.0; `public/vision/tf-wasm/LICENSE.txt` and `NOTICE.txt`. Source: https://github.com/tensorflow/tfjs.
- Generated worker dependencies: `public/vision/compare-worker.js.LEGAL.txt` and the corresponding npm package licenses.
- shadcn/Tailwind stylesheet: `vendor/shadcn-tailwind-4.13.0.LICENSE.md`.

Other npm dependencies retain their package licenses, available in installed packages. The lockfile identifies the dependency versions. No upstream endorsement is implied.
