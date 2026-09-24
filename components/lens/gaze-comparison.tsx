'use client';
import {CameraResults} from './camera-results';
import {HeadPositionGuide,type HeadGuideState} from './head-position-guide';
import {headGuide} from '@/lib/gaze-calibration';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle} from '@/components/ui/dialog';
import {suiteCatalog,type SuiteRecord} from '@/lib/suite';
import {cameraTarget,pursuitScored,distance,type Point} from '@/lib/gaze';
import {selectMapping,richFeatures,poseMatches,poseReference,stableWindow,predictMapping,freshValidation,validationStats,validationMetrics,sameSurface,targetAt,type Mapping,type Surface,type TimedFeature,type TargetStamp} from '@/lib/gaze-calibration';
import {emptyFrameCounts,countFrame,frameMetrics,engineName,repeatedTargets,mergeVisits,visitDisagreement,neuralFeature,groupsFor,checkReasons,fitOffset,correctionDecision,regionTargets,regionStats,type Engine,type Visit,type PairedCheck} from '@/lib/gaze-comparison';

type Phase='intro'|'loading'|'preview'|'calibrate'|'verify'|'driftReady'|'driftFit'|'driftVerify'|'region'|'ready'|'run'|'midReady'|'midCheck'|'resumeReady'|'postReady'|'final'|'postRegion'|'confirmReady'|'confirm'|'done';
type Packet={stamp:{time:number;phase:Phase;step:number;generation:number};points:Point[];matrix:number[];neural:number[]|null;count:number;inferenceMs:number};
const engines:Engine[]=['blaze'];
const collecting:Phase[]=['calibrate','verify','driftFit','driftVerify','region','midCheck','final','postRegion','confirm'];
const average=(a:number[])=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const zero=()=>({x:0,y:0});
const passage=['The path curved beside a quiet garden.','A small bird landed on the wooden gate.','We paused to watch before walking home.'];

export function BlazeCameraSession({initial,onSave,onClose,onBasic}:{initial:SuiteRecord;onSave:(r:SuiteRecord)=>Promise<boolean>;onClose:()=>void;onBasic:()=>void}){
 const [phase,setPhase]=useState<Phase>('intro'),[consent,setConsent]=useState(false),[message,setMessage]=useState(''),[quality,setQuality]=useState('Camera off'),[step,setStep]=useState(0),[seconds,setSeconds]=useState(0),[record,setRecord]=useState<SuiteRecord|null>(null),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[rows,setRows]=useState<{label:string;mean:number;worst:number;count:number;measured:number;expected:number;sufficient:number;reasons:string[]}[]>([]);
 const [guide,setGuide]=useState<HeadGuideState|null>(null);
 const video=useRef<HTMLVideoElement>(null),surface=useRef<HTMLDivElement>(null),dot=useRef<HTMLSpanElement>(null),stream=useRef<MediaStream|null>(null),worker=useRef<Worker|null>(null),frameId=useRef(0),alive=useRef(true),generation=useRef(0),pending=useRef(false),saveRef=useRef(onSave);
 saveRef.current=onSave;
 const state=useRef({phase:'intro' as Phase,frames:emptyFrameCounts(),pointFrames:emptyFrameCounts(),started:0,targetStarted:0,lastFrame:0,step:0,targets:[] as Point[],rect:null as Surface|null,pose:[] as number[],visits:[] as Visit[],window:[] as {time:number;feature:number[];neural:number[]}[],model:null as Mapping|null,selected:'blaze' as Engine,checks:[] as PairedCheck[],total:0,valid:0,paired:0,extraDone:false,offset:zero(),candidate:zero(),candidateValid:false,initialPassed:false,block:0,verifiedTargets:[] as Point[],metrics:{} as Record<string,number>,details:[] as string[],latency:[] as number[],history:[] as TargetStamp[],run:{total:0,valid:0,errors:[] as number[],points:[] as Point[],regions:[0,0,0]},saving:false,finalFailed:false});
 const s=state.current;
 function stopHardware(){generation.current++;pending.current=false;cancelAnimationFrame(frameId.current);if(video.current&&'cancelVideoFrameCallback'in video.current)video.current.cancelVideoFrameCallback(frameId.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;worker.current?.terminate();worker.current=null;if(video.current)video.current.srcObject=null;setQuality('Camera off');}
 function transition(p:Phase){s.phase=p;s.frames=emptyFrameCounts();s.started=performance.now();s.total=0;s.valid=0;s.paired=0;setPhase(p);setSeconds(0);}
 function place(p:Point){s.targetStarted=performance.now();s.pointFrames=emptyFrameCounts();s.window=[];setStep(s.step);if(dot.current){dot.current.style.left=`${p.x*100}%`;dot.current.style.top=`${p.y*100}%`;}s.history.push({time:s.targetStarted,point:p});}
 function startCheck(p:Phase,targets:Point[]){transition(p);s.targets=targets.map(t=>({...t}));s.step=0;s.checks=targets.map(target=>({target,landmark:[],blaze:[]}));setRows([]);place(targets[0]);}
 function statsFor(e:Engine,offset=zero()){return validationStats(groupsFor(s.checks,e,offset),s.rect?.width||1,s.rect?.height||1);}
 function capture(prefix:string){
  const elapsed=Math.max(.001,(performance.now()-s.started)/1000),fps=s.paired/elapsed,coverage=s.total?s.paired/s.total:0;
  Object.assign(s.metrics,frameMetrics(s.frames,elapsed,prefix));
  const result=engines.map(e=>{const groups=groupsFor(s.checks,e),v=statsFor(e),reasons=checkReasons(groups,fps,coverage);Object.assign(s.metrics,validationMetrics(v,`${prefix} ${e}`));return {label:engineName[e],mean:v.mean,worst:v.worst,count:v.count,measured:v.perTarget.filter(p=>p.count>0).length,expected:v.perTarget.length,sufficient:v.perTarget.filter(p=>p.count>=5).length,reasons};});setRows(result);return {fps,coverage};
 }
 async function persist(r:SuiteRecord){if(s.saving)return;s.saving=true;setBusy(true);try{const ok=await saveRef.current(r);if(alive.current){setSaved(ok);setMessage(ok?'Saved on this device.':'Not saved. Use Retry saving before leaving.');}}catch{if(alive.current){setSaved(false);setMessage('Not saved. Use Retry saving before leaving.');}}finally{s.saving=false;if(alive.current)setBusy(false);}}
 function finish(status:SuiteRecord['status'],reason:string){
  if(s.phase==='done')return;
  Object.assign(s.metrics,frameMetrics(s.frames,(performance.now()-s.started)/1000,s.phase==='run'?`Task block ${s.block+1}`:s.phase));
  if(collecting.includes(s.phase)&&s.step<s.targets.length)Object.assign(s.metrics,frameMetrics(s.pointFrames,(performance.now()-s.targetStarted)/1000,`${s.phase} point ${s.step+1}`));
  if(status==='incomplete'&&s.model&&collecting.includes(s.phase))capture('Interrupted '+s.phase);
  const captureSettings=stream.current?.getVideoTracks()[0]?.getSettings();if(captureSettings?.width)s.metrics['Capture width (pixels)']=captureSettings.width;if(captureSettings?.height)s.metrics['Capture height (pixels)']=captureSettings.height;
  s.metrics['Logging revision']=2;s.metrics['Camera protocol']=8;s.metrics['Average error limit (%)']=20;s.metrics['Per-target error limit (%)']=20;s.metrics['Calibration visits']=s.visits.length;s.metrics['Selected method (0 landmark, 1 BlazeGaze)']=s.selected==='blaze'?1:0;s.metrics['Mean inference time (ms)']=average(s.latency);if(s.rect){s.metrics['Target surface width (CSS pixels)']=s.rect.width;s.metrics['Target surface height (CSS pixels)']=s.rect.height;}
  const r:SuiteRecord={...initial,version:8,status,metrics:{...s.metrics},quality:reason,notes:`Protocol 8: BlazeGaze default camera tracking. BlazeGaze pretrained eye-image model with local regularized mapping; not the paper's neural fine-tuning. Two calibration visits per position, one extra visit for disagreements. Local mapping selection uses held-out calibration targets; independent verification uses separate observations. Offset correction offered after every initial check; fresh verification determines corrected or original mapping. Two 12-second blocks with a five-point midpoint check; no changes to the mapping during the task. Final confirmation never rescues an earlier failed task. 1 s settling + 1.8 s sampling. Logging revision 2: processed and accepted frame rates are separate. Rejection reasons are mutually exclusive, first failing check; counters include settling frames. Error summaries use measured targets only; missing targets never count as zero error. No clinical thresholds. ${s.details.join(' ')}`.slice(0,4000)};
  stopHardware();transition('done');setRecord(r);void persist(r);
 }
 function stop(){if(s.phase==='intro'||s.phase==='done'){stopHardware();onClose();}else finish('incomplete','Stopped before all checks and the activity were completed.');}
 function reasonsFor(e:Engine,fps:number,coverage:number,offset=zero()){return checkReasons(groupsFor(s.checks,e,offset),fps,coverage);}
 function acceptedBeforeTask(){if(initial.kind==='readingGaze'){setMessage('Look at each dot to check that the three reading regions can be distinguished.');startCheck('region',regionTargets);}else{transition('ready');setMessage('Independent accuracy check passed. Keep your head and device in place.');}}
 function finishTask(){
  const r=s.run;if(r.valid/Math.max(1,r.total)<.75||r.valid/24<10){finish('unusable','Task sampling was insufficient: at least 75% accepted frames and 10 accepted frames/sec are required.');return;}
  s.metrics['Task accepted frames (%)']=100*r.valid/r.total;s.metrics['Task accepted fps']=r.valid/24;
  if(initial.kind==='readingGaze')r.regions.forEach((n,i)=>s.metrics[`Reading region ${i+1} samples (%)`]=100*n/r.valid);
  else if(r.errors.length){s.metrics['Task mean target distance (% surface units)']=100*average(r.errors);s.metrics['Task scored samples']=r.errors.length;}
  finish('complete','BlazeGaze passed independent checks before and after this activity. Results remain experimental and include tracking error.');
 }
 function completeCheck(){
  const stage=s.phase,{fps,coverage}=capture(stage);
  if(stage==='verify'){
   const reasons=reasonsFor(s.selected,fps,coverage);s.verifiedTargets=s.targets.map(p=>({...p}));
   s.initialPassed=!reasons.length;s.metrics['Initial verification passed']=s.initialPassed?1:0;
   s.details.push('Initial verification: '+(s.initialPassed?'passed.':reasons.join(' ')));transition('driftReady');setMessage((s.initialPassed?'Initial accuracy passed. You can still test whether an offset correction improves it.':reasons.join(' '))+' The correction is accepted only if it improves a separate fresh check.');return;
  }
  if(stage==='driftFit'){
   const candidate=fitOffset(groupsFor(s.checks,s.selected));
   s.candidateValid=!!candidate&&fps>=10&&coverage>=.75;s.candidate=s.candidateValid?candidate!:zero();s.metrics['Correction fit valid']=s.candidateValid?1:0;
   if(s.candidateValid){s.metrics['Proposed correction X (% width)']=s.candidate.x*100;s.metrics['Proposed correction Y (% height)']=s.candidate.y*100;}
   else s.details.push('A consistent offset could not be fitted; checking the original mapping on fresh observations.');
   setMessage('Checking the proposed correction on new observations.');startCheck('driftVerify',freshValidation(initial.seed+8));return;
  }
  if(stage==='driftVerify'){
   const raw=groupsFor(s.checks,s.selected),corrected=groupsFor(s.checks,s.selected,s.candidate);Object.assign(s.metrics,validationMetrics(validationStats(corrected,s.rect!.width,s.rect!.height),'Corrected independent check'));
   const decision=correctionDecision(raw,corrected,fps,coverage,s.candidateValid);s.metrics['Correction accepted']=decision==='corrected'?1:0;
   if(decision==='unusable'){finish('unusable','Neither the proposed correction nor the original mapping passed fresh independent verification. Recalibrate before starting an activity.');return;}
   s.offset=decision==='corrected'?s.candidate:zero();s.details.push(decision==='corrected'?'Verified offset accepted before the task.':'Correction not accepted; original mapping passed fresh verification and is retained.');s.verifiedTargets=s.targets.map(p=>({...p}));acceptedBeforeTask();return;
  }
  if(stage==='region'||stage==='postRegion'){
   const groups=groupsFor(s.checks,s.selected,s.offset),r=regionStats(groups);s.metrics[`${stage} correct region (%)`]=r.rate*100;r.rows.forEach((v,i)=>s.metrics[`${stage} row ${i+1} correct (%)`]=v.rate*100);
   if(!r.usable||fps<10||coverage<.75){finish('unusable','Reading regions could not be distinguished reliably: at least 80% overall and 70% in each row, with samples at every location, are required. No reading-region result is produced.');return;}
   if(stage==='postRegion'){finishTask();return;}transition('ready');setMessage('Independent accuracy and reading-region checks passed.');return;
  }
  if(stage==='midCheck'){
   const groups=groupsFor(s.checks,s.selected,s.offset),reasons=checkReasons(groups,fps,coverage);Object.assign(s.metrics,validationMetrics(validationStats(groups,s.rect!.width,s.rect!.height),'Midpoint selected check'));s.metrics['Midpoint check passed']=reasons.length?0:1;
   if(reasons.length){finish('unusable','The between-block accuracy check failed. '+reasons.join(' ')+' Block 2 was not started. Recalibrate for a new activity; the earlier block cannot be repaired by a later correction.');return;}
   transition('resumeReady');setMessage('Between-block accuracy passed with the same mapping. Keep your position and continue with block 2.');return;
  }
  const groups=groupsFor(s.checks,s.selected,s.offset),v=validationStats(groups,s.rect!.width,s.rect!.height);Object.assign(s.metrics,validationMetrics(v,stage==='final'?'Final selected check':'Confirmation selected check'));
  const reasons=checkReasons(groups,fps,coverage);
  if(stage==='confirm'){
   s.metrics['Confirmation passed']=reasons.length?0:1;finish('unusable',reasons.length?'The confirmation also failed. '+reasons.join(' '):'The final check failed but the unchanged-model confirmation passed. Results disagree; this task remains unusable. Both checks are retained.');return;
  }
  if(reasons.length){s.finalFailed=true;s.details.push('Final check: '+reasons.join(' '));transition('confirmReady');setMessage(reasons.join(' ')+' You may run one confirmation with the same model. It will not replace this failure.');return;}
  if(initial.kind==='readingGaze'){startCheck('postRegion',regionTargets);return;}finishTask();
 }
 function advance(){
  Object.assign(s.metrics,frameMetrics(s.pointFrames,(performance.now()-s.targetStarted)/1000,`${s.phase} point ${s.step+1}`));
  s.step++;if(s.step<s.targets.length){place(s.targets[s.step]);return;}
  if(s.phase!=='calibrate'){completeCheck();return;}
  try{
   s.model=selectMapping(mergeVisits(s.visits,'blaze')).model;
   if(!s.extraDone){const disagreements=visitDisagreement(s.visits,{blaze:s.model});disagreements.forEach((d,i)=>s.metrics[`Repeated location ${i+1} disagreement (%)`]=d.error*100);s.metrics['Worst repeated-visit disagreement (%)']=100*Math.max(...disagreements.map(d=>d.error));const extra=disagreements.filter(d=>d.error>.08).map(d=>d.target);s.extraDone=true;s.metrics['Extra calibration positions']=extra.length;if(extra.length){setMessage('Some visits disagreed. Collecting one additional visit at those positions.');startCheck('calibrate',extra);return;}}
   startCheck('verify',freshValidation(initial.seed+4));
  }catch{finish('unusable','BlazeGaze needs enough usable samples at every calibration location. Try again with clearer lighting and a steady position.');}
 }
 function receive(m:Packet){
  s.lastFrame=performance.now();s.latency.push(m.inferenceMs);if(s.latency.length>2000)s.latency.shift();const f=richFeatures(m.points,m.matrix),good=!!f&&m.count===1&&poseMatches(f,s.pose),paired=good&&!!m.neural;
  setGuide(headGuide(f,s.pose,m.count));
  setQuality(!f?'Eyes not clearly visible':m.count!==1?'One person only':!good?'Return to your calibrated head position':!m.neural?'Eye-image model could not read this frame':'BlazeGaze tracking available');
  if(!collecting.includes(s.phase)&&s.phase!=='run')return;
  if(m.stamp.phase!==s.phase||m.stamp.step!==s.step)return;
  if(s.rect&&surface.current&&!sameSurface(s.rect,surface.current.getBoundingClientRect())){finish('incomplete','Target area moved or changed size. Restart calibration.');return;}
  countFrame(s.frames,m.count,!!f,good,!!m.neural);countFrame(s.pointFrames,m.count,!!f,good,!!m.neural);
  s.total++;if(good)s.valid++;if(paired)s.paired++;
  if(s.phase==='run'){
   s.run.total++;if(good&&f&&m.neural){const raw=predictMapping(s.model!,neuralFeature(m.neural!)),gaze={x:raw.x-s.offset.x,y:raw.y-s.offset.y};s.run.valid++;s.run.points.push(gaze);
    if(initial.kind==='readingGaze'){if(gaze.x>=0&&gaze.x<=1&&gaze.y>=0&&gaze.y<1)s.run.regions[Math.floor(gaze.y*3)]++;}
    else{const t=s.block*12+(m.stamp.time-s.started)/1000,cue=targetAt(s.history,m.stamp.time);if(cue&&(initial.kind!=='pursuit'||pursuitScored(t))&&(!['gazeShift','antiSaccade'].includes(initial.kind)||t%3>1))s.run.errors.push(distance(gaze,initial.kind==='antiSaccade'?{x:1-cue.x,y:cue.y}:cue));}
   }return;
  }
  const elapsed=m.stamp.time-s.targetStarted;if(elapsed<1000)return;
  if(s.phase!=='calibrate'&&elapsed>=2800){advance();return;}
  if(s.phase==='calibrate'){
   if(!paired||!f){s.window=[];return;}
   s.window.push({time:m.stamp.time,feature:f,neural:neuralFeature(m.neural!)});s.window=s.window.filter(p=>m.stamp.time-p.time<1400);
   const stable=stableWindow(s.window,m.stamp.time);if(stable.length){const times=new Set(stable.map(p=>p.time)),samples=s.window.filter(p=>times.has(p.time));if(!s.pose.length)s.pose=poseReference(stable);s.visits.push({target:s.targets[s.step],landmark:samples.map(p=>p.feature),blaze:samples.map(p=>p.neural)});advance();}return;
  }
  // Only BlazeGaze predictions enter calibration and validation.
  if(paired&&f){const g=s.checks[s.step];g.blaze.push(predictMapping(s.model!,neuralFeature(m.neural!)));}
 }
 async function enable(){
  const token=++generation.current;transition('loading');setMessage('Loading BlazeGaze…');
  try{
   const media=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},audio:false});if(!alive.current||token!==generation.current){media.getTracks().forEach(t=>t.stop());return;}
   stream.current=media;video.current!.srcObject=media;await video.current!.play();if(token!==generation.current)return;
   const w=new Worker(new URL('vision/compare-worker.js',document.baseURI));worker.current=w;
   const send=async(now:number,metadata?:{captureTime?:number;presentationTime?:number})=>{
    if(token!==generation.current||!alive.current)return;const v=video.current!;
    frameId.current='requestVideoFrameCallback'in v?v.requestVideoFrameCallback(send):requestAnimationFrame(send);if(pending.current||v.readyState<2)return;pending.current=true;
    try{const frame=await createImageBitmap(v);if(token!==generation.current){frame.close();return;}const time=metadata?.captureTime??metadata?.presentationTime??now;w.postMessage({type:'frame',frame,time:performance.now(),stamp:{time,phase:s.phase,step:s.step,generation:token}},[frame]);}catch{pending.current=false;finish('unusable','Camera frames could not be processed.');}
   };
   w.onmessage=e=>{if(token!==generation.current||!alive.current)return;if(e.data.type==='ready'){transition('preview');s.lastFrame=performance.now();setMessage('BlazeGaze is loaded. Use even lighting and keep your head steady. Allow about three minutes for calibration and checks.');frameId.current='requestVideoFrameCallback'in video.current!?video.current!.requestVideoFrameCallback(send):requestAnimationFrame(send);}else if(e.data.type==='frame'){pending.current=false;receive(e.data);}else if(e.data.type==='error')finish('unusable','BlazeGaze could not run on this browser. You can return to compatibility tracking.');};
   w.onerror=()=>{if(token===generation.current)finish('unusable','BlazeGaze could not load or run. You can return to compatibility tracking.');};w.postMessage({type:'init'});
  }catch{if(token===generation.current)finish('incomplete','Camera permission or camera startup was unavailable.');}
 }
 useEffect(()=>{
  alive.current=true;let animation=0;
  const tick=()=>{if(s.phase==='run'){const elapsed=(performance.now()-s.started)/1000,t=s.block*12+elapsed;setSeconds(Math.min(12,Math.floor(elapsed)));if(elapsed>=12){Object.assign(s.metrics,frameMetrics(s.frames,elapsed,`Task block ${s.block+1}`));s.metrics['Completed activity blocks']=s.block+1;transition(s.block===0?'midReady':'postReady');setMessage(s.block===0?'Block 1 is finished. Follow five stationary dots to check accuracy before block 2. Keep your head and device in place.':'The activity is finished. Start the final accuracy check without changing your position.');}else{const cue=cameraTarget(initial.kind,t).cue;if(dot.current){dot.current.style.left=`${cue.x*100}%`;dot.current.style.top=`${cue.y*100}%`;}s.history.push({time:performance.now(),point:cue});if(s.history.length>500)s.history.shift();}}animation=requestAnimationFrame(tick);};animation=requestAnimationFrame(tick);
  const watchdog=setInterval(()=>{const now=performance.now();if(s.phase==='loading'&&now-s.started>60000)finish('unusable','BlazeGaze took too long to load.');else if((collecting.includes(s.phase)||s.phase==='run')&&now-s.lastFrame>8000)finish('unusable','No recent camera frames.');else if(s.phase==='calibrate'&&now-s.targetStarted>8000)finish('unusable',`Could not collect steady samples at calibration visit ${s.visits.length+1}.`);else if(collecting.includes(s.phase)&&s.phase!=='calibrate'&&now-s.targetStarted>5000)advance();else if(!['intro','loading','done','run'].includes(s.phase)&&!collecting.includes(s.phase)&&now-s.started>90000)finish('incomplete','Camera switched off after 90 seconds without continuing.');},500);
  const hidden=()=>{if(document.hidden&&!['intro','done'].includes(s.phase))finish('incomplete','Interrupted because the tab was hidden.');};const resized=()=>{if(s.rect&&!['done','intro'].includes(s.phase))finish('incomplete','Screen size changed. Restart calibration.');};document.addEventListener('visibilitychange',hidden);window.addEventListener('resize',resized);
  return()=>{alive.current=false;clearInterval(watchdog);cancelAnimationFrame(animation);stopHardware();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('resize',resized);};
 },[]);
 const tracking=collecting.includes(phase)||phase==='run';
 return <Dialog open onOpenChange={stop}><DialogContent className="camera-dialog camera-v2 camera-comparison" showCloseButton={false} aria-describedby={undefined}>
  <div className="camera-v2-head"><DialogTitle>{suiteCatalog[initial.kind].title}</DialogTitle><Button variant="outline" disabled={busy} onClick={stop}>Camera off / stop</Button></div>
  <div className="camera-v2-status"><span role="status">{quality}</span><span>{tracking?(phase==='run'?`Block ${s.block+1} of 2 · ${12-seconds} seconds remaining`:`${phase==='calibrate'?'Calibration visit':'Check point'} ${step+1} of ${s.targets.length}`):''}</span></div>
  <div ref={surface} className="gaze-surface camera-v2-surface comparison-surface">
   <video ref={video} autoPlay muted playsInline hidden className="camera-preview"/>
   <span ref={dot} className="gaze-target" hidden={!tracking||(phase==='run'&&initial.kind==='readingGaze')}>●</span>
   {phase==='run'&&initial.kind==='readingGaze'&&<div className="comparison-reading">{passage.map(t=><p key={t}>{t}</p>)}</div>}
   <div className="camera-v2-panel" hidden={tracking}>
    {phase==='intro'?<><h2>BlazeGaze camera tracking</h2><p>BlazeGaze + local mapping estimates gaze from your eye images and head position. Each calibration location is visited twice; disagreements receive one extra visit. Allow about three minutes.</p><p>A separate check tests tracking accuracy. An optional offset correction is offered even after a passing check and tested on fresh observations. The activity has two 12-second blocks with a five-point accuracy check between them. Reading sessions also test whether three broad rows can be distinguished.</p><p>All frames and models stay on this device. Only summary results are saved. This experimental tracking does not establish clinical accuracy.</p><label className="suite-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> I agree to local camera processing, with adult help and permission for children.</label><Button disabled={!consent||window.innerWidth<700} onClick={()=>void enable()}>Enable camera</Button><details><summary>Advanced / compatibility</summary><p>Use the older landmark tracker if BlazeGaze cannot run on this device.</p><Button variant="outline" onClick={onBasic}>Use landmark fallback</Button></details></>:<p role="status">{message}</p>}
    {phase==='preview'&&<Button onClick={()=>{const r=surface.current!.getBoundingClientRect();s.rect={left:r.left,top:r.top,width:r.width,height:r.height};s.pose=[];startCheck('calibrate',repeatedTargets(initial.seed));}}>Start repeated calibration</Button>}
    {phase!=='done'&&rows.length>0&&<table><caption>Most recent check · raw predictions before offset correction. Errors cover measured points only; all points need at least 5 samples.</caption><thead><tr><th>Method</th><th>Average measured error</th><th>Worst measured location</th><th>Coverage</th></tr></thead><tbody>{rows.map(r=><tr key={r.label}><td>{r.label}</td><td>{r.count?`${(r.mean*100).toFixed(1)}%`:"Not measured"}</td><td>{r.count?`${(r.worst*100).toFixed(1)}%`:"Not measured"}</td><td>{r.sufficient===r.expected?`All ${r.expected} points sampled`:`Incomplete: ${r.measured}/${r.expected} points measured; ${r.sufficient} with enough samples`}</td></tr>)}</tbody></table>}
    {phase==='driftReady'&&<><Button onClick={()=>{s.metrics['Correction attempted']=1;startCheck('driftFit',freshValidation(initial.seed+6));}}>Try one verified offset correction</Button><Button variant="outline" onClick={()=>{s.metrics['Correction attempted']=0;if(s.initialPassed)acceptedBeforeTask();else finish('unusable','Independent verification failed. Offset correction was declined.');}}>{s.initialPassed?'Continue without correction':'Finish without correction'}</Button></>}
    {phase==='ready'&&<><p>Using {engineName[s.selected]}{s.metrics['Correction accepted']===1?' with verified offset correction':s.metrics['Correction attempted']===1?' with the original mapping; correction was not accepted':''}. {suiteCatalog[initial.kind].instructions}</p><Button onClick={()=>{s.block=0;s.history=[];s.run={total:0,valid:0,errors:[],points:[],regions:[0,0,0]};s.step=0;transition('run');place(cameraTarget(initial.kind,0).cue);}}>Begin camera task</Button></>}
    {phase==='midReady'&&<Button onClick={()=>startCheck('midCheck',s.verifiedTargets)}>Check accuracy before block 2</Button>}
    {phase==='resumeReady'&&<Button onClick={()=>{s.block=1;s.step=0;s.history=[];transition('run');place(cameraTarget(initial.kind,12).cue);}}>Begin block 2</Button>}
    {phase==='postReady'&&<Button onClick={()=>startCheck('final',s.verifiedTargets)}>Begin final accuracy check</Button>}
    {phase==='confirmReady'&&<><Button onClick={()=>startCheck('confirm',s.verifiedTargets)}>Run one confirmation check</Button><Button variant="outline" onClick={()=>finish('unusable','Final accuracy check failed. '+s.details.at(-1))}>Save without confirmation</Button></>}
    {phase==='done'&&record&&<><h2>{record.status==='complete'?'Activity saved':record.status==='incomplete'?'Session interrupted':'Tracking checks were not sufficient'}</h2><CameraResults record={record}/><details><summary>Technical logs</summary>{Object.entries(record.metrics).map(([k,v])=><p key={k}>{k}: {v.toFixed(2)}</p>)}<p>{record.notes}</p></details>{!saved&&<Button disabled={busy} onClick={()=>void persist(record)}>Retry saving</Button>}<Button disabled={busy} onClick={onClose}>Return to workspace</Button><details><summary>Advanced / compatibility</summary><Button disabled={busy} variant="outline" onClick={onBasic}>Use landmark fallback</Button></details></>}
   </div>
  </div>
  <div className="camera-v2-foot camera-guide-foot">{!['intro','loading','done'].includes(phase)&&<HeadPositionGuide value={guide} compact={phase==='run'}/>}<div><p>{tracking?(phase==='run'?(initial.kind==='pursuit'&&!pursuitScored(s.block*12+seconds)?'Follow the dot — settling in (not scored).':suiteCatalog[initial.kind].instructions):'Look at the dot and keep your head steady. One second to settle; checks then sample for 1.8 seconds.'):'Protocol 8 · BlazeGaze · 20% average and per-location limits · No clinical thresholds.'}</p>{!tracking&&<a href="https://github.com/RedForestAI/WebEyeTrack" target="_blank" rel="noreferrer">BlazeGaze source and MIT license</a>}</div></div>
 </DialogContent></Dialog>;
}
