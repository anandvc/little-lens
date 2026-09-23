'use client';
import {CameraResults} from './camera-results';
import {HeadPositionGuide,type HeadGuideState} from './head-position-guide';
import {headGuide} from '@/lib/gaze-calibration';
import {useEffect,useRef,useState} from 'react';
import {BlazeCameraSession} from './gaze-comparison';
import {checkReasons} from '@/lib/gaze-comparison';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle} from '@/components/ui/dialog';
import {suiteCatalog,type SuiteRecord} from '@/lib/suite';
import {cameraTarget,cameraTiming,stationarySampleAllowed,pursuitScored,distance,type Point} from '@/lib/gaze';
import {calibrationTargets,freshValidation,richFeatures,selectMapping,predictMapping,stableWindow,validationPass,validationStats,sameSurface,targetAt,retryTargets,median,poseReference,poseMatches,validationMetrics,pairedValidationMetrics,type TargetSamples,type TimedFeature,type Validation,type Surface,type TargetStamp} from '@/lib/gaze-calibration';

type Phase='intro'|'loading'|'benchmark'|'preview'|'calibrate'|'validate'|'ready'|'run'|'postReady'|'post'|'review'|'done';
type Stats=ReturnType<typeof validationStats>;
type Choice=ReturnType<typeof selectMapping>;
type Benchmark={width:number;height:number;fps:number;inference:number;eyePixels:number};
type Frame={time:number;count:number;points:Point[];matrix:number[];inferenceMs:number;stamp:{time:number;clock:string;sent:number;phase:Phase;generation:number}};
const avg=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
const resolutions=[{width:640,height:480},{width:1280,height:720},{width:1920,height:1080}];
const activePhases:Phase[]=['calibrate','validate','ready','run','postReady','post'];

type CameraProps={initial:SuiteRecord;onSave:(s:SuiteRecord)=>Promise<boolean>;onClose:()=>void};
export function CameraSession(props:CameraProps){const [compare,setCompare]=useState(true),[session,setSession]=useState(props.initial);return compare?<BlazeCameraSession {...props} initial={session} onBasic={()=>{setSession({...props.initial,id:crypto.randomUUID(),date:new Date().toISOString()});setCompare(false);}}/>:<BasicCameraSession {...props} initial={session} onCompare={()=>{setSession({...props.initial,id:crypto.randomUUID(),date:new Date().toISOString()});setCompare(true);}}/>;}
function BasicCameraSession({initial,onSave,onClose,onCompare}:CameraProps & {onCompare:()=>void}){
 const meta=suiteCatalog[initial.kind];
 const [phase,setPhase]=useState<Phase>('intro'),[message,setMessage]=useState(''),[quality,setQuality]=useState('Camera off'),[consent,setConsent]=useState(false),[smoothing,setSmoothing]=useState(false),[resolution,setResolution]=useState('auto'),[step,setStep]=useState(0),[progress,setProgress]=useState(0),[busy,setBusy]=useState(false),[result,setResult]=useState<SuiteRecord|null>(null),[stats,setStats]=useState<Stats|null>(null),[benchmarks,setBenchmarks]=useState<Benchmark[]>([]),[retryList,setRetryList]=useState<Point[]>([]),[modelLabel,setModelLabel]=useState(''),[elapsedSeconds,setElapsedSeconds]=useState(0),[positionReady,setPositionReady]=useState(false);
 const [guide,setGuide]=useState<HeadGuideState|null>(null);
 const video=useRef<HTMLVideoElement>(null),surface=useRef<HTMLDivElement>(null),dot=useRef<HTMLSpanElement>(null),stream=useRef<MediaStream|null>(null),worker=useRef<Worker|null>(null),alive=useRef(true),generation=useRef(0),pending=useRef(false),frameId=useRef(0),animId=useRef(0),lastVideoTime=useRef(-1),onSaveRef=useRef(onSave),onCloseRef=useRef(onClose);
 onSaveRef.current=onSave;onCloseRef.current=onClose;
 const state=useRef({phase:'intro' as Phase,smoothing:false,phaseStarted:0,targetStarted:0,lastFrame:0,total:0,valid:0,visible:0,headRejected:0,phaseFeatures:[] as number[][],preDiagnostics:{} as SuiteRecord['metrics'],runDiagnostics:{} as SuiteRecord['metrics'],preTargets:[] as Point[],step:0,targets:[] as Point[],target:{x:.5,y:.5},window:[] as TimedFeature[],groups:[] as TargetSamples[],validation:[] as Validation[],selection:null as Choice|null,pre:null as Stats|null,rect:null as Surface|null,history:[] as TargetStamp[],pose:[] as number[],latencies:[] as number[],inference:[] as number[],clock:'presentation',retries:0,benchmarks:[] as Benchmark[],benchmarkFrames:[] as {time:number;inference:number;eyePixels:number}[],run:{total:0,valid:0,points:[] as Point[],errors:[] as number[],regions:[0,0,0]},saving:false});
 function transition(next:Phase){const s=state.current;s.phase=next;s.phaseStarted=performance.now();s.total=0;s.valid=0;s.visible=0;s.headRejected=0;s.phaseFeatures=[];s.window=[];setPhase(next);setProgress(0);}
 function stopHardware(){generation.current++;cancelAnimationFrame(frameId.current);if(video.current&&'cancelVideoFrameCallback' in video.current)video.current.cancelVideoFrameCallback(frameId.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;worker.current?.terminate();worker.current=null;pending.current=false;if(video.current)video.current.srcObject=null;setQuality('Camera off');}
 function summaryMetrics():SuiteRecord['metrics']{
  const s=state.current,m:SuiteRecord['metrics']={'Camera protocol':5,'Average validation error limit (%)':20,'Per-target validation error limit (%)':20,'Stationary settling time (ms)':cameraTiming.settleMs,'Validation sampling window (ms)':cameraTiming.validationSampleMs,'Calibration retries':s.retries,'Landmark smoothing enabled':s.smoothing?1:0,'Median inference time (ms)':median(s.inference),'Median frame processing delay (ms)':median(s.latencies)};
  const settings=stream.current?.getVideoTracks()[0]?.getSettings();if(settings?.width)m['Capture width (pixels)']=settings.width;if(settings?.height)m['Capture height (pixels)']=settings.height;
  if(s.rect){m['Target surface width (CSS pixels)']=s.rect.width;m['Target surface height (CSS pixels)']=s.rect.height;}
  if(s.selection){m['Eye-only model (0 linear, 2 quadratic)']=s.selection.model.family==='linear'?0:2;m['Baseline held-out-target error (% surface units)']=s.selection.baseline*100;m['Selected held-out-target error (% surface units)']=s.selection.error*100;}
  s.benchmarks.forEach((b,i)=>{m[`Capture check ${i+1} width (pixels)`]=b.width;m[`Capture check ${i+1} processed frames/sec`]=b.fps;m[`Capture check ${i+1} eye width (pixels)`]=b.eyePixels;});return m;
 }
 function phaseDiagnostics(prefix:string):SuiteRecord['metrics']{
  const s=state.current,m:SuiteRecord['metrics']={[`${prefix} eye-visible frames (%)`]:100*s.visible/Math.max(1,s.total),[`${prefix} pose-rejected frames`]:s.headRejected};
  if(s.phaseFeatures.length&&s.pose.length){const center=poseReference(s.phaseFeatures.map(feature=>({time:0,feature})));m[`${prefix} median head horizontal shift (% image)`]=100*(center[0]-s.pose[0]);m[`${prefix} median head vertical shift (% image)`]=100*(center[1]-s.pose[1]);}
  return m;
 }
 async function storeResult(status:SuiteRecord['status'],reason:string,extra:SuiteRecord['metrics']={},end=true){
  const s=state.current;if(s.saving)return;const metrics={...summaryMetrics(),...s.preDiagnostics,...s.runDiagnostics,...phaseDiagnostics('Last phase'),...(s.pre?validationMetrics(s.pre,'Initial validation'):{}),...extra};if(end)stopHardware();transition(end?'done':'review');
  const record:SuiteRecord={...initial,version:5,status,quality:reason,metrics,notes:`Camera protocol 5; MediaPipe 0.10.32; ${s.selection?.model.family||'unfitted'} eye-only mapping; head position is checked separately, never used as a gaze predictor. Frame clock: ${s.clock}. Delay is from the available frame timestamp, not a measured eye-response latency. Frames, features and calibration are kept only temporarily while this activity is open. No clinical thresholds.`};
  setResult(record);if(status==='incomplete')setStats(null);setMessage('Saving on this device…');s.saving=true;setBusy(true);const ok=await onSaveRef.current(record);s.saving=false;if(!alive.current)return;setBusy(false);setMessage(ok?'Saved on this device.':'Not saved. Retry saving before leaving.');
 }
 function finishStopped(reason='Camera session stopped before completion'){
  if(state.current.phase==='done'||state.current.phase==='intro'){stopHardware();onCloseRef.current();return;}
  if(state.current.phase==='review'){stopHardware();transition('done');return;}
  void storeResult('incomplete',reason);
 }
 function setTarget(p:Point){const s=state.current;s.target=p;s.targetStarted=performance.now();s.window=[];setProgress(0);if(dot.current){dot.current.style.left=`${p.x*100}%`;dot.current.style.top=`${p.y*100}%`;}s.history.push({time:s.targetStarted,point:p});}
 function startTargets(next:'calibrate'|'validate'|'post',targets:Point[]){
  transition(next);const s=state.current;s.targets=targets;s.step=0;s.validation=targets.map(target=>({target,estimates:[]}));setStep(0);setStats(null);setTarget(targets[0]);
 }
 function beginCalibration(targets=calibrationTargets){
  const s=state.current;if(!surface.current)return;const r=surface.current.getBoundingClientRect();if(targets!==calibrationTargets&&s.rect&&!sameSurface(s.rect,r))targets=calibrationTargets;s.rect={left:r.left,top:r.top,width:r.width,height:r.height};s.history=[];s.selection=null;s.pre=null;s.preDiagnostics={};s.runDiagnostics={};s.preTargets=[];
  if(targets===calibrationTargets){s.groups=[];s.pose=[];}else s.groups=s.groups.filter(g=>!targets.some(t=>distance(t,g.target)<.001));
  setMessage('Look at the dot. A point completes after enough steady, blink-free samples.');startTargets('calibrate',targets);
 }
 function validationFinished(){
  const s=state.current,r=s.rect!,elapsed=(performance.now()-s.phaseStarted)/1000,q=validationPass(s.validation,r.width,r.height,s.valid,s.total,s.total/elapsed);setStats(q.stats);
  const metrics={...(s.phase==='post'?pairedValidationMetrics(s.pre,q.stats):validationMetrics(q.stats,'Validation')),...phaseDiagnostics(s.phase==='post'?'Final validation':'Validation'),'Usable frames (%)':100*s.valid/Math.max(1,s.total),'Observed frames per second':s.total/elapsed};
  if(!q.usable){
   setRetryList(s.selection?retryTargets(s.groups,s.selection.perTarget):calibrationTargets);
   const reasons=checkReasons(s.validation,s.total/elapsed,s.valid/Math.max(1,s.total),'Processed frame rate').join(' ');
   void storeResult('unusable',(s.phase==='post'?'Final accuracy check failed. ':'Initial accuracy check failed. ')+reasons+' No reliable task result was produced.',metrics,s.phase==='post');return;
  }
  if(s.phase==='validate'){s.pre=q.stats;s.preTargets=s.targets.map(p=>({...p}));s.preDiagnostics=phaseDiagnostics('Initial validation');transition('ready');setMessage('Accuracy check passed for broad regions. Keep your head and device in place.');return;}
  const run=s.run,coverage=run.valid/Math.max(1,run.total);
  if(coverage<.75||run.valid/24<10){void storeResult('unusable','Too many frames were lost during the task. Assessment not completed.',metrics);return;}
  const resultMetrics={...metrics,...validationMetrics(s.pre!,'Initial validation'),'Usable task frames (%)':coverage*100,'Valid task frames per second':run.valid/24,'Horizontal drift (% width)':100*(q.stats.biasX-s.pre!.biasX),'Vertical drift (% height)':100*(q.stats.biasY-s.pre!.biasY)};
  if(initial.kind==='readingGaze')run.regions.forEach((n,i)=>(resultMetrics as SuiteRecord['metrics'])[ `Time samples in broad row ${i+1} (%)`]=100*n/run.valid);
  else Object.assign(resultMetrics,{'Scored target samples':run.errors.length,...(initial.kind==='pursuit'?{'Unscored moving lead-in per direction (seconds)':cameraTiming.pursuitLeadInSeconds,'Planned scored movement (seconds)':22}:{}),'Mean distance from instructed target (% surface units)':100*avg(run.errors),'Samples within broad target region (%)':100*run.errors.filter(e=>e<=.2).length/Math.max(1,run.errors.length)});
  if(initial.kind==='fixation'){const center={x:avg(run.points.map(p=>p.x)),y:avg(run.points.map(p=>p.y))};Object.assign(resultMetrics,{'Gaze estimate scatter (% surface units)':100*avg(run.points.map(p=>distance(p,center)))});}
  void storeResult('complete','Experimental broad gaze observations. Error and scatter include tracker noise; results do not establish a clinical eye-movement finding.',resultMetrics);
 }
 function advanceTarget(){
  const s=state.current;s.step++;setStep(s.step);
  if(s.step<s.targets.length){setTarget(s.targets[s.step]);return;}
  if(s.phase==='calibrate'){
   try{s.selection=selectMapping(s.groups);setModelLabel(s.selection.model.family);startTargets('validate',freshValidation(initial.seed+s.retries));}
   catch{void storeResult('unusable','Calibration did not contain enough reliable variation. Try the full calibration again.');}
  }else validationFinished();
 }
 function receive(m:Frame){
  const s=state.current;if(m.stamp.generation!==generation.current)return;s.lastFrame=performance.now();s.inference.push(m.inferenceMs);s.latencies.push(Math.max(0,s.lastFrame-m.stamp.time));if(s.inference.length>2000)s.inference.shift();if(s.latencies.length>2000)s.latencies.shift();s.clock=m.stamp.clock;
  const f=richFeatures(m.points,m.matrix),eyePixels=f?Math.hypot(m.points[33].x-m.points[133].x,m.points[33].y-m.points[133].y)*(video.current?.videoWidth||640):0;
  if(s.phase==='benchmark')s.benchmarkFrames.push({time:s.lastFrame,inference:m.inferenceMs,eyePixels});
  let good=!!f&&m.count===1;
  if(f&&s.pose.length&&!['preview','review','benchmark'].includes(s.phase)&&!poseMatches(f,s.pose))good=false;
  setGuide(headGuide(f,s.pose,m.count));
  setPositionReady(good&&s.pose.length>0);
  setQuality(m.count>1?'More than one face — only one person should be visible':!f?'Eyes not clearly visible':!good?'Head position changed — return to your calibrated position':`Eyes visible · approximately ${Math.round(eyePixels)} pixels across one eye`);
  if(!activePhases.includes(s.phase)||['ready','postReady'].includes(s.phase)||m.stamp.phase!==s.phase)return;
  if(s.rect&&surface.current&&!sameSurface(s.rect,surface.current.getBoundingClientRect())){finishStopped('Target area moved or changed size. Restart calibration.');return;}
  s.total++;if(f&&m.count===1){s.visible++;s.phaseFeatures.push(f);if(!good)s.headRejected++;}if(good)s.valid++;
  if(s.phase==='calibrate'||s.phase==='validate'||s.phase==='post'){
   const targetElapsed=m.stamp.time-s.targetStarted;
   if(targetElapsed<cameraTiming.settleMs)return;
   if(s.phase!=='calibrate'&&!stationarySampleAllowed(targetElapsed)){advanceTarget();return;}
   if(good&&f){
    if(s.phase==='calibrate'){
     s.window.push({time:m.stamp.time,feature:f});s.window=s.window.filter(p=>m.stamp.time-p.time<1400);
     const stable=stableWindow(s.window,m.stamp.time);setProgress(Math.min(95,s.window.length/24*100));
     if(stable.length){if(!s.pose.length)s.pose=poseReference(stable);s.groups.push({target:s.target,samples:stable});advanceTarget();}
    }else{
     let group=s.validation[s.step];if(!group){group={target:s.target,estimates:[]};s.validation[s.step]=group;}
     group.estimates.push(predictMapping(s.selection!.model,f));setProgress(Math.min(100,(targetElapsed-cameraTiming.settleMs)/cameraTiming.validationSampleMs*100));
    }
   }else if(s.phase==='calibrate')s.window=[];
   return;
  }
  if(s.phase==='run'){
   s.run.total++;if(good&&f){const gaze=predictMapping(s.selection!.model,f);s.run.valid++;s.run.points.push(gaze);
    if(initial.kind==='readingGaze'){if(gaze.x>=0&&gaze.x<=1&&gaze.y>=0&&gaze.y<=1)s.run.regions[Math.min(2,Math.floor(gaze.y*3))]++;}
    else{const cue=targetAt(s.history,m.stamp.time);const elapsed=(m.stamp.time-s.phaseStarted)/1000;if(cue&&(initial.kind!=='pursuit'||pursuitScored(elapsed))&&(!['gazeShift','antiSaccade'].includes(initial.kind)||elapsed%3>1))s.run.errors.push(distance(gaze,initial.kind==='antiSaccade'?{x:1-cue.x,y:cue.y}:cue));}
   }
  }
 }
 async function benchmark(){
  const s=state.current,token=generation.current,track=stream.current?.getVideoTracks()[0];if(!track)return;
  transition('benchmark');s.benchmarks=[];setBenchmarks([]);
  for(const size of resolution==='auto'?resolutions:[resolutions[Number(resolution)]]){
   if(token!==generation.current)return;setMessage(`Checking ${size.width} × ${size.height} capture…`);
   try{await track.applyConstraints({width:{ideal:size.width},height:{ideal:size.height},frameRate:{ideal:30}});}catch{continue;}
   await new Promise(r=>setTimeout(r,500));if(token!==generation.current)return;s.benchmarkFrames=[];
   await new Promise(r=>setTimeout(r,2000));if(token!==generation.current)return;
   const actual=track.getSettings(),frames=s.benchmarkFrames;s.benchmarks.push({width:actual.width||video.current!.videoWidth,height:actual.height||video.current!.videoHeight,fps:frames.length/2,inference:median(frames.map(f=>f.inference)),eyePixels:median(frames.map(f=>f.eyePixels))});setBenchmarks([...s.benchmarks]);
  }
  if(token!==generation.current)return;
  const usable=s.benchmarks.filter(b=>b.fps>=20),best=(usable.length?usable.sort((a,b)=>b.eyePixels-a.eyePixels||b.width-a.width):[...s.benchmarks].sort((a,b)=>b.fps-a.fps))[0];
  if(!best){void storeResult('unusable','Camera resolution could not be configured. Try another browser or camera.');return;}
  try{await track.applyConstraints({width:{ideal:best.width},height:{ideal:best.height},frameRate:{ideal:30}});}catch{}
  if(token!==generation.current)return;transition('preview');setMessage(`Selected ${best.width} × ${best.height}, about ${best.fps.toFixed(1)} processed frames/sec. This checks image detail and speed, not gaze accuracy. Adjust lighting or position before calibration.`);
 }
 async function enable(){
  const token=++generation.current;state.current.smoothing=smoothing;transition('loading');setMessage('Opening camera and loading the local model…');
  try{
   const media=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},audio:false});
   if(!alive.current||token!==generation.current){media.getTracks().forEach(t=>t.stop());return;}
   stream.current=media;video.current!.srcObject=media;await video.current!.play();if(token!==generation.current)return;
   const w=new Worker('/vision/worker.js');worker.current=w;state.current.lastFrame=performance.now();
   const send=async(now:number,metadata?:{captureTime?:number;presentationTime?:number})=>{
    if(!alive.current||token!==generation.current)return;const v=video.current!;
    if('requestVideoFrameCallback' in v)frameId.current=v.requestVideoFrameCallback(send);else frameId.current=requestAnimationFrame(send);
    if(pending.current||v.readyState<2||v.currentTime===lastVideoTime.current)return;lastVideoTime.current=v.currentTime;pending.current=true;
    try{const frame=await createImageBitmap(v);if(token!==generation.current||!worker.current){frame.close();return;}
     const capture=metadata?.captureTime,presentation=metadata?.presentationTime;const time=Number.isFinite(capture)?capture!:Number.isFinite(presentation)?presentation!:now;
     const stamp={time,clock:Number.isFinite(capture)?'capture':Number.isFinite(presentation)?'presentation (capture unavailable)':'callback (capture unavailable)',sent:performance.now(),phase:state.current.phase,generation:token};
     worker.current.postMessage({type:'frame',frame,time:performance.now(),stamp},[frame]);
    }catch{pending.current=false;void storeResult('unusable','Camera frames could not be processed.');}
   };
   w.onerror=()=>{if(token===generation.current)void storeResult('unusable','The local camera model could not run in this browser.');};
   w.onmessage=e=>{if(token!==generation.current||!alive.current)return;if(e.data.type==='ready'){if(video.current&&'requestVideoFrameCallback' in video.current)frameId.current=video.current.requestVideoFrameCallback(send);else frameId.current=requestAnimationFrame(send);void benchmark();}else if(e.data.type==='result'){pending.current=false;receive(e.data);}else if(e.data.type==='error')void storeResult('unusable','Camera processing failed. Try restarting the camera.');};
   w.postMessage({type:'init',smoothing});
  }catch{stopHardware();transition('intro');setMessage('Camera unavailable or permission denied. Non-camera activities remain available.');}
 }
 useEffect(()=>{
  alive.current=true;
  const tick=()=>{const s=state.current,now=performance.now();
   if(s.phase==='run'){
    const seconds=(now-s.phaseStarted)/1000;setElapsedSeconds(Math.min(24,Math.floor(seconds)));
    if(seconds>=24){s.runDiagnostics=phaseDiagnostics('Task');transition('postReady');setMessage('The task has finished. Keep your head in the same position. The final check uses the same five locations as the passing initial check. Look at each stationary dot when you continue.');}
    else{const cue=cameraTarget(initial.kind,seconds).cue;if(dot.current){dot.current.style.left=`${cue.x*100}%`;dot.current.style.top=`${cue.y*100}%`;}s.history.push({time:now,point:cue});if(s.history.length>300)s.history.shift();}
   }
   animId.current=requestAnimationFrame(tick);
  };animId.current=requestAnimationFrame(tick);
  const watchdog=setInterval(()=>{const s=state.current,now=performance.now();
   if(s.phase==='loading'&&now-s.phaseStarted>45000)void storeResult('unusable','The camera model did not finish loading.');
   else if(['calibrate','validate','post','run','benchmark'].includes(s.phase)&&now-s.lastFrame>8000)void storeResult('unusable','No recent camera frames. Check your camera and retry.');
   else if(s.phase==='calibrate'&&now-s.targetStarted>8000){setRetryList([s.target]);void storeResult('unusable',`Could not collect steady samples at calibration point ${s.step+1}. Adjust lighting, keep your head steady, and retry this point.`,{},false);}
   else if(['validate','post'].includes(s.phase)&&now-s.targetStarted>5000)advanceTarget();
   else if((s.phase==='review'||s.phase==='preview'||s.phase==='ready'||s.phase==='postReady')&&now-s.phaseStarted>60000)finishStopped('Camera switched off after one minute without continuing.');
  },500);
  const hide=()=>{if(document.hidden&&!['intro','done'].includes(state.current.phase))finishStopped('Camera session interrupted: tab hidden');};
  const resize=()=>{if(activePhases.includes(state.current.phase))finishStopped('Screen size changed. Restart calibration.');};
  document.addEventListener('visibilitychange',hide);window.addEventListener('resize',resize);
  return()=>{alive.current=false;generation.current++;clearInterval(watchdog);cancelAnimationFrame(animId.current);cancelAnimationFrame(frameId.current);if(video.current&&'cancelVideoFrameCallback' in video.current)video.current.cancelVideoFrameCallback(frameId.current);stream.current?.getTracks().forEach(t=>t.stop());worker.current?.terminate();document.removeEventListener('visibilitychange',hide);window.removeEventListener('resize',resize);};
 },[]);
 const s=state.current,tracking=['calibrate','validate','post','run'].includes(phase);
 return <Dialog open onOpenChange={()=>{stopHardware();onClose();}}><DialogContent className="camera-dialog camera-v2" showCloseButton={false} aria-describedby={undefined}>
  <div className="camera-v2-head"><DialogTitle>{meta.title}</DialogTitle><Button variant="outline" disabled={busy} onClick={()=>finishStopped()}>Camera off / stop</Button></div>
  <div className="camera-v2-status"><span role="status">{quality}</span><span>{tracking?(phase==='run'?`${24-elapsedSeconds} seconds remaining`:`${phase==='calibrate'?'Calibration':'Accuracy check'} · Point ${Math.min(step+1,s.targets.length)} of ${s.targets.length}`):''}</span></div>
  <div ref={surface} className="gaze-surface camera-v2-surface">
   <span ref={dot} className="gaze-target" hidden={!tracking||(phase==='run'&&initial.kind==='readingGaze')}>●</span>
   {phase==='run'&&initial.kind==='readingGaze'&&<div className="reading-lines"><p>The path curved gently beside the quiet river.</p><p>A small boat rested beneath the wooden bridge.</p><p>Beyond the trees, the afternoon sky was clear.</p></div>}
   <div className="camera-v2-panel" hidden={tracking}>
    <video ref={video} autoPlay playsInline muted className="camera-preview" hidden={!['loading','benchmark','preview'].includes(phase)}/>
    {phase==='intro'&&<>{message&&<p role="status">{message}</p>}<p>{meta.instructions}</p><p>We check capture speed, collect steady calibration samples, then test accuracy at different targets. Allow about two minutes. Camera processing stays on this device; no video is uploaded or saved.</p><label className="suite-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> I agree to local camera processing, with adult help and permission for children.</label><label>Capture resolution<select value={resolution} onChange={e=>setResolution(e.target.value)}><option value="auto">Automatic · compare 480p, 720p and 1080p</option><option value="0">480p</option><option value="1">720p</option><option value="2">1080p</option></select></label><label className="suite-consent"><input type="checkbox" checked={smoothing} onChange={e=>setSmoothing(e.target.checked)}/> Test landmark smoothing (may reduce jitter but add delay)</label><Button disabled={!consent||window.innerWidth<700} onClick={()=>void enable()}>Enable camera</Button><Button variant="outline" onClick={onCompare}>Use BlazeGaze (recommended)</Button><p>Requires a laptop/tablet at least 700 pixels wide. Experimental estimates, not a clinical examination.</p></>}
    {['loading','benchmark'].includes(phase)&&<p>{message}</p>}
    {phase==='preview'&&<><p>{message}</p><p>Use even lighting, reduce reflections on glasses, and make sure both eyes are visible. Keep your position throughout the session.</p><details><summary>Capture comparison</summary><table><thead><tr><th>Actual capture</th><th>Processed fps</th><th>Eye width</th></tr></thead><tbody>{benchmarks.map((b,i)=><tr key={i}><td>{b.width}×{b.height}</td><td>{b.fps.toFixed(1)}</td><td>{Math.round(b.eyePixels)} px</td></tr>)}</tbody></table><p>Higher resolution is selected only when the speed check supports it. This does not establish better gaze accuracy.</p></details><Button onClick={()=>beginCalibration()}>Start calibration</Button></>}
    {phase==='ready'&&<><h2>Ready for the camera task</h2><p>{message}</p><p>{meta.instructions}</p>{initial.kind==='pursuit'&&<p>The first second of horizontal movement and the first second after switching to vertical movement are not scored. Keep following the dot throughout.</p>}<p>Selected eye-only mapping: {modelLabel}. Initial validation error: {s.pre?(100*s.pre.mean).toFixed(1):'—'}% surface units.</p><Button disabled={!positionReady} onClick={()=>{s.run={total:0,valid:0,points:[],errors:[],regions:[0,0,0]};s.history=[];transition('run');setTarget(cameraTarget(initial.kind,0).cue);}}>Begin camera task</Button></>}
    {phase==='postReady'&&<><h2>Task finished — final accuracy check</h2><p>{message}</p><Button disabled={!positionReady} onClick={()=>startTargets('post',s.preTargets)}>Begin final accuracy check</Button><p>This measures camera accuracy again. It does not recalibrate or alter your task result.</p></>}
    {(phase==='review'||phase==='done')&&<><h2>{result?.status==='complete'?'Experimental observations saved':result?.status==='unusable'?'Camera tracking wasn’t accurate enough':'Session stopped'}</h2><p>{message}</p>{result&&<CameraResults record={result}/>}
     {stats&&<details><summary>Accuracy check details</summary>{s.pre&&<p>Initial check passed at {(s.pre.mean*100).toFixed(1)}% average error. The final check is reported below.</p>}<p>{stats.count?`Average measured error: ${(stats.mean*100).toFixed(1)}% surface units (${stats.pixels.toFixed(0)} CSS pixels).`:'Not enough accepted samples to measure accuracy.'} Required: at most 20% average; no target above 20%; samples at every point.</p><table><thead><tr><th>Check point</th><th>Error</th><th>Samples</th></tr></thead><tbody>{stats.perTarget.map((v,i)=><tr key={i}><td>{i+1}</td><td>{v.count?`${(v.error*100).toFixed(1)}%`:'Not measured'}</td><td>{v.count}</td></tr>)}</tbody></table><p>Percent error is distance in normalized target-area coordinates, not percent correct. Eye visibility does not establish gaze accuracy.</p></details>}
     {phase==='review'&&<><p>The camera remains on for a retry and switches off after one minute. Repositioned yourself? Repeat the full calibration.</p><Button disabled={busy} onClick={()=>{s.retries++;if(s.groups.length>=9)beginCalibration(retryList);else {const missing=calibrationTargets.filter(t=>!s.groups.some(g=>distance(g.target,t)<.001));beginCalibration(missing);}}}>Retry weak calibration points</Button><Button variant="outline" disabled={busy} onClick={()=>{s.retries++;beginCalibration();}}>Repeat full calibration</Button></>}
     {message.startsWith('Not saved')&&<Button disabled={busy} onClick={async()=>{if(result){setBusy(true);const ok=await onSaveRef.current(result);setBusy(false);setMessage(ok?'Saved on this device.':'Not saved. Retry saving before leaving.');}}}>Retry save</Button>}
     <details><summary>Technical logs</summary>{result&&Object.entries(result.metrics).map(([k,v])=><p key={k}>{k}: {v.toFixed(1)}</p>)}<p>Calibration model selection uses held-out calibration targets. The separate accuracy check is never used to fit or select the mapping. No clinical accuracy claim.</p></details>
     <Button disabled={busy} onClick={()=>{stopHardware();onClose();}}>Return to workspace</Button></>}
   </div>
  </div>
  <div className="camera-v2-foot camera-guide-foot">{!['intro','loading','done','review'].includes(phase)&&<HeadPositionGuide value={guide} compact={phase==='run'}/>}<div>{tracking?<><p>{phase==='run'?(initial.kind==='pursuit'&&!pursuitScored(elapsedSeconds)?'Follow the dot — settling in (not scored).':meta.instructions):'Look at the dot and keep your head steady. Each new dot allows one second to settle. Accuracy checks then collect 1.8 seconds of samples; calibration waits for steady samples.'}</p>{phase!=='run'&&<progress max="100" value={progress} aria-label="Samples for current point"/>}</>:<p>Camera protocol 5 · Raw frames and calibration are discarded when this activity closes. <a href={meta.source} target="_blank" rel="noreferrer">Research context</a></p>}</div></div>
 </DialogContent></Dialog>;
}
