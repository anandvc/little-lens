import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('public/vision/tf-wasm',{recursive:true});
for(const file of ['tfjs-backend-wasm.wasm','tfjs-backend-wasm-simd.wasm','tfjs-backend-wasm-threaded-simd.wasm'])await copyFile('node_modules/@tensorflow/tfjs-backend-wasm/dist/'+file,'public/vision/tf-wasm/'+file);
await build({entryPoints:['lib/gaze-compare-worker.ts'],outfile:'public/vision/compare-worker.js',bundle:true,format:'iife',platform:'browser',target:'es2020',minify:true,legalComments:'linked'});
