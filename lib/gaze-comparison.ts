import {calibrationTargets,median,selectMapping,predictMapping,validationStats,type Mapping,type TargetSamples,type Validation} from './gaze-calibration.ts';
import {distance,type Point} from './gaze.ts';
export type Engine='landmark'|'blaze';
export const engineName={landmark:'Landmark model',blaze:'BlazeGaze + local mapping'};
export type Visit={target:Point;landmark:number[][];blaze:number[][]};
export type PairedCheck={target:Point;landmark:Point[];blaze:Point[]};
export function shufflePoints(points:Point[],seed:number){const out=points.map(p=>({...p}));let s=seed>>>0;for(let i=out.length-1;i>0;i--){s=(Math.imul(s,1664525)+1013904223)>>>0;const j=s%(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
export function repeatedTargets(seed:number){return [...shufflePoints(calibrationTargets,seed),...shufflePoints(calibrationTargets,seed+91)];}
export function neuralFeature(p:number[]){return [p[0],p[1],p[0],p[1]];}
export function mergeVisits(visits:Visit[],engine:Engine):TargetSamples[]{return calibrationTargets.map(target=>({target,samples:visits.filter(v=>distance(v.target,target)<.001).flatMap(v=>v[engine].map(feature=>({time:0,feature})))}));}
export function fitEngines(visits:Visit[]){return {landmark:selectMapping(mergeVisits(visits,'landmark')).model,blaze:selectMapping(mergeVisits(visits,'blaze')).model};}
export function visitDisagreement(visits:Visit[],models:Partial<Record<Engine,Mapping>>){return calibrationTargets.map(target=>{const at=visits.filter(v=>distance(v.target,target)<.001);const errors=(Object.keys(models) as Engine[]).map(e=>{const centers=at.map(v=>predictMapping(models[e]!,v[e][0].map((_,i)=>median(v[e].map(f=>f[i])))));return centers.length>=2?distance(centers[0],centers[1]):Infinity;});return {target,error:Math.max(...errors)};});}
export function groupsFor(check:PairedCheck[],engine:Engine,offset:Point={x:0,y:0}):Validation[]{return check.map(g=>({target:g.target,estimates:g[engine].map(p=>({x:p.x-offset.x,y:p.y-offset.y}))}));}
export function checkReasons(groups:Validation[],fps:number,coverage:number,rateLabel='Accepted frame rate'){const stats=validationStats(groups,1,1),reasons:string[]=[];groups.forEach((g,i)=>{if(g.estimates.length<5)reasons.push(`Point ${i+1}: ${g.estimates.length} samples; at least 5 required.`);else if(stats.perTarget[i].error>.2)reasons.push(`Point ${i+1}: ${(stats.perTarget[i].error*100).toFixed(1)}% error exceeds 20%.`);});if(stats.mean>.2)reasons.push(`Average error ${(stats.mean*100).toFixed(1)}% exceeds 20%.`);if(groups.length<5)reasons.push('Not enough check locations.');if(fps<10)reasons.push(`${rateLabel} ${fps.toFixed(1)} frames/sec is below 10.`);if(coverage<.75)reasons.push(`Accepted frames ${(coverage*100).toFixed(1)}% is below 75%.`);return reasons;}
export function fitOffset(groups:Validation[]):Point|null{if(groups.length<5||groups.some(g=>g.estimates.length<5))return null;const residuals=groups.map(g=>({x:median(g.estimates.map(p=>p.x-g.target.x)),y:median(g.estimates.map(p=>p.y-g.target.y))}));const offset={x:median(residuals.map(p=>p.x)),y:median(residuals.map(p=>p.y))};if(Math.hypot(offset.x,offset.y)>.2||residuals.some(p=>distance(p,offset)>.1))return null;return offset;}
export function correctionVerified(raw:Validation[],corrected:Validation[],fps:number,coverage:number){const a=validationStats(raw,1,1),b=validationStats(corrected,1,1);return !checkReasons(corrected,fps,coverage).length&&b.mean<a.mean*.8&&b.worst<=a.worst;}
export const regionTargets:Point[]=[{x:.3,y:1/6},{x:.7,y:1/6},{x:.3,y:.5},{x:.7,y:.5},{x:.3,y:5/6},{x:.7,y:5/6}];
export function regionStats(groups:Validation[]){const rows=[0,1,2].map(row=>{const gs=groups.filter(g=>Math.floor(g.target.y*3)===row),ps=gs.flatMap(g=>g.estimates);const hits=ps.filter(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<1&&Math.floor(p.y*3)===row).length;return {count:ps.length,rate:ps.length?hits/ps.length:0,complete:gs.length===2&&gs.every(g=>g.estimates.length>=5)};});const total=rows.reduce((s,r)=>s+r.count,0),rate=total?rows.reduce((s,r)=>s+r.rate*r.count,0)/total:0;return {rows,rate,usable:rows.every(r=>r.complete&&r.rate>=.7)&&rate>=.8};}

// Fresh raw observations may justify keeping the original mapping; an earlier pass cannot.
export function correctionDecision(raw:Validation[],corrected:Validation[],fps:number,coverage:number,candidateValid:boolean):'corrected'|'original'|'unusable'{
 if(candidateValid&&correctionVerified(raw,corrected,fps,coverage))return 'corrected';
 return checkReasons(raw,fps,coverage).length?'unusable':'original';
}

export const emptyFrameCounts=()=>({processed:0,accepted:0,noFace:0,multipleFaces:0,eyes:0,pose:0,prediction:0});
export type FrameCounts=ReturnType<typeof emptyFrameCounts>;
export function countFrame(c:FrameCounts,faceCount:number,featuresAvailable:boolean,poseOK:boolean,predictionAvailable:boolean){
 c.processed++;
 if(faceCount===0)c.noFace++;else if(faceCount!==1)c.multipleFaces++;else if(!featuresAvailable)c.eyes++;else if(!poseOK)c.pose++;else if(!predictionAvailable)c.prediction++;else c.accepted++;
}
export function frameMetrics(c:FrameCounts,seconds:number,prefix:string){const elapsed=Math.max(.001,seconds);return {
 [`${prefix} processed frames`]:c.processed,[`${prefix} accepted frames`]:c.accepted,
 [`${prefix} processed fps`]:c.processed/elapsed,[`${prefix} accepted fps`]:c.accepted/elapsed,
 [`${prefix} accepted frames (%)`]:100*c.accepted/Math.max(1,c.processed),
 [`${prefix} rejected: no face`]:c.noFace,[`${prefix} rejected: multiple faces`]:c.multipleFaces,
 [`${prefix} rejected: eyes/features unavailable`]:c.eyes,[`${prefix} rejected: head position`]:c.pose,
 [`${prefix} rejected: gaze prediction unavailable`]:c.prediction};}
