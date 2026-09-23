let tracker, guard, frames=0, faceCount=0;
self.onmessage=async e=>{const m=e.data;try{
 if(m.type==='init'){
  const {FaceLandmarker,FilesetResolver}=await import('./vision_bundle.mjs');
  const files=await FilesetResolver.forVisionTasks(new URL('./wasm',self.location.href).href);
  const options={baseOptions:{modelAssetPath:new URL('./face_landmarker.task',self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',minFaceDetectionConfidence:.7,minFacePresenceConfidence:.7,minTrackingConfidence:.7,outputFacialTransformationMatrixes:true};
  tracker=await FaceLandmarker.createFromOptions(files,{...options,numFaces:m.smoothing?1:2});
  // A separate periodic guard retains multi-person rejection when single-face smoothing is tested.
  if(m.smoothing)guard=await FaceLandmarker.createFromOptions(files,{...options,numFaces:2,outputFacialTransformationMatrixes:false});
  self.postMessage({type:'ready'});
 }else if(m.type==='frame'){
  const start=performance.now();
  try{
   const r=tracker.detectForVideo(m.frame,m.time);
   if(guard){if(frames++%10===0)faceCount=guard.detectForVideo(m.frame,m.time).faceLandmarks.length;}else faceCount=r.faceLandmarks.length;
   self.postMessage({type:'result',time:m.time,count:faceCount,points:faceCount===1?r.faceLandmarks[0]||[]:[],matrix:r.facialTransformationMatrixes?.[0]?.data||[],inferenceMs:performance.now()-start,stamp:m.stamp});
  }finally{m.frame.close();}
 }
}catch(err){self.postMessage({type:'error',message:String(err)});}};
