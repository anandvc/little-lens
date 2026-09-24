import * as tf from '@tensorflow/tfjs';
import {setWasmPaths,setThreadsCount} from '@tensorflow/tfjs-backend-wasm';
import {Matrix} from 'ml-matrix';
import {createPerspectiveMatrix,createIntrinsicsMatrix,translateMatrix,obtainEyePatch,estimateFaceWidth,faceReconstruction,computeFaceOrigin3D,getHeadVector} from './vendor/webeyetrack/mathUtils.js';
// One frame and one landmark pass feed both algorithms. No clickstream learning,
// target labels, output clamping or temporal gaze smoothing in this worker.
let tracker:any,model:tf.LayersModel,canvas:OffscreenCanvas,context:OffscreenCanvasRenderingContext2D;
let faceWidth=0,depth=60;
self.onmessage=async(e:MessageEvent)=>{
 const m=e.data;
 try{
  if(m.type==='init'){
   const path=new URL('./vision_bundle.mjs',self.location.href).href;
   const {FaceLandmarker,FilesetResolver}=await import(/* @vite-ignore */ path);
   tracker=await FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(new URL('./wasm',self.location.href).href),{baseOptions:{modelAssetPath:new URL('./face_landmarker.task',self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',numFaces:2,outputFacialTransformationMatrixes:true,minFaceDetectionConfidence:.7,minFacePresenceConfidence:.7,minTrackingConfidence:.7});
   setWasmPaths(new URL('./tf-wasm/',self.location.href).href);setThreadsCount(1);await tf.setBackend('wasm');await tf.ready();
   model=await tf.loadLayersModel(new URL('./blazegaze/model.json',self.location.href).href);
   // Exercise real weights once before accepting camera input.
   const warm=tf.tidy(()=>model.predict([tf.zeros([1,128,512,3]),tf.tensor2d([[0,0,1]]),tf.tensor2d([[0,0,60]])]) as tf.Tensor);
   const values=await warm.data();warm.dispose();if(!Array.from(values).every(Number.isFinite))throw Error('Model returned invalid values');
   self.postMessage({type:'ready',backend:tf.getBackend()});return;
  }
  if(m.type==='frame'){
   const start=performance.now();
   try{
    const r=tracker.detectForVideo(m.frame,m.time),points=r.faceLandmarks.length===1?r.faceLandmarks[0]:[],matrix=r.facialTransformationMatrixes?.[0]?.data||[];
    let neural:number[]|null=null;
    if(points.length>=478&&matrix.length===16){
     try{
      if(!canvas||canvas.width!==m.frame.width||canvas.height!==m.frame.height){canvas=new OffscreenCanvas(m.frame.width,m.frame.height);context=canvas.getContext('2d',{willReadFrequently:true})!;faceWidth=0;depth=60;}
      context.drawImage(m.frame,0,0);const frame=context.getImageData(0,0,canvas.width,canvas.height);
      const pixels=points.map((p:any)=>[Math.floor(p.x*frame.width),Math.floor(p.y*frame.height)]);
      const rt=translateMatrix({rows:4,columns:4,data:matrix});
      if(!faceWidth)faceWidth=estimateFaceWidth(pixels);
      const [,metricFace]=faceReconstruction(createPerspectiveMatrix(frame.width/frame.height),points.map((p:any)=>[p.x,p.y]),rt,createIntrinsicsMatrix(frame.width,frame.height),faceWidth,frame.width,frame.height,depth);
      const origin=computeFaceOrigin3D(metricFace),head=getHeadVector(rt),patch=obtainEyePatch(frame,pixels);
      if(origin.every(Number.isFinite)&&head.every(Number.isFinite)){
       depth=origin[2];const output=tf.tidy(()=>model.predict([tf.browser.fromPixels(patch).toFloat().div(255).expandDims(0),tf.tensor2d([head]),tf.tensor2d([origin])]) as tf.Tensor);
       const values=Array.from(await output.data());output.dispose();if(values.length===2&&values.every(Number.isFinite))neural=values;
      }
     }catch{/* Invalid crop/geometry: an explicitly missing neural sample, never a fabricated gaze. */}
    }
    self.postMessage({type:'frame',points,matrix,neural,count:r.faceLandmarks.length,stamp:m.stamp,inferenceMs:performance.now()-start});
   }finally{m.frame.close();}
  }
 }catch(err){self.postMessage({type:'error',message:String(err)});}
};
