import {calibrationTargets, distance, features, type Point} from './gaze.ts';

export type TimedFeature = {time:number; feature:number[]};
export type TargetSamples = {target:Point; samples:TimedFeature[]};
export type ModelFamily = 'linear'|'quadratic';
export type Mapping = {family:ModelFamily; lambda:number; mean:number[]; scale:number[]; x:number[]; y:number[]};
export type Validation = {target:Point; estimates:Point[]};
export const median=(xs:number[])=>{const a=[...xs].sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:0;};
const mean=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;

// Extract eye features plus pose metadata. Only eye-relative coordinates enter the mapping.
export function richFeatures(points:Point[],matrix:number[]=[]):number[]|null {
 const base=features(points);if(!base)return null;
 const iris=(a:number,b:number)=>Math.hypot(points[a].x-points[b].x,points[a].y-points[b].y)/base[6];
 const pose=matrix.length===16?[Math.atan2(matrix[8],matrix[10]),Math.atan2(-matrix[9],Math.hypot(matrix[8],matrix[10]))]:[0,0];
 const f=[...base,...pose,iris(469,471),iris(474,476)];return f.every(Number.isFinite)?f:null;
}
function basis(f:number[],family:ModelFamily){
 // Head translation and iris size can correlate with calibration targets without
 // representing gaze. Head pose is checked separately, never learned as a gaze shortcut.
 const eyes=f.slice(0,4);
 if(family==='linear')return eyes;
 const x=(f[0]+f[2])/2,y=(f[1]+f[3])/2;
 return [...eyes,x*x,x*y,y*y];
}
function solve(a:number[][],b:number[]){
 const m=a.map((r,i)=>[...r,b[i]]),n=b.length;
 for(let k=0;k<n;k++){let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(m[i][k])>Math.abs(m[pivot][k]))pivot=i;
 [m[k],m[pivot]]=[m[pivot],m[k]];if(Math.abs(m[k][k])<1e-12)throw Error('Insufficient calibration variation');
 const d=m[k][k];for(let j=k;j<=n;j++)m[k][j]/=d;
 for(let i=0;i<n;i++)if(i!==k){const f=m[i][k];for(let j=k;j<=n;j++)m[i][j]-=f*m[k][j];}}
 return m.map(r=>r[n]);
}
export function fitMapping(groups:TargetSamples[],family:ModelFamily,lambda:number):Mapping{
 if(groups.length<6||groups.some(g=>g.samples.length<5))throw Error('More stable calibration targets needed');
 // Equal target weighting: hundreds of adjacent frames are not independent training targets.
 const fs=groups.map(g=>basis(g.samples[0].feature.map((_,i)=>median(g.samples.map(s=>s.feature[i]))),family));
 const mu=fs[0].map((_,i)=>mean(fs.map(f=>f[i]))),scale=mu.map((m,i)=>Math.max(.002,Math.sqrt(mean(fs.map(f=>(f[i]-m)**2)))));
 const rows=fs.map(f=>[1,...f.map((v,i)=>(v-mu[i])/scale[i])]),n=rows[0].length;
 const a=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>mean(rows.map(r=>r[i]*r[j]))+(i===j&&i>0?lambda:0)));
 const rhs=(axis:'x'|'y')=>rows[0].map((_,i)=>mean(rows.map((r,j)=>r[i]*groups[j].target[axis])));
 return {family,lambda,mean:mu,scale,x:solve(a,rhs('x')),y:solve(a,rhs('y'))};
}
export function predictMapping(m:Mapping,f:number[]):Point{const row=[1,...basis(f,m.family).map((v,i)=>(v-m.mean[i])/m.scale[i])];return {x:row.reduce((s,v,i)=>s+v*m.x[i],0),y:row.reduce((s,v,i)=>s+v*m.y[i],0)};}
export function selectMapping(groups:TargetSamples[]){
 const candidates: {model:Mapping;error:number;perTarget:number[]}[]=[];
 for(const family of ['linear','quadratic'] as const)for(const lambda of [.001,.03,.3]){
  const perTarget=groups.map((g,i)=>{const m=fitMapping(groups.filter((_,j)=>j!==i),family,lambda);return mean(g.samples.map(s=>distance(predictMapping(m,s.feature),g.target)));});
  candidates.push({model:fitMapping(groups,family,lambda),error:mean(perTarget),perTarget});
 }
 const baseline=candidates.filter(c=>c.model.family==='linear').sort((a,b)=>a.error-b.error)[0];
 const best=[...candidates].sort((a,b)=>a.error-b.error)[0];
 // Complexity must earn its place on held-out *targets*, not adjacent frames.
 const selected=best.error<baseline.error*.9?best:baseline;
 return {...selected,baseline:baseline.error,candidates:candidates.map(c=>({family:c.model.family,lambda:c.model.lambda,error:c.error}))};
}
export function stableWindow(samples:TimedFeature[],now:number):TimedFeature[]{
 const recent=samples.filter(s=>now-s.time<=1100);if(recent.length<12)return [];
 const mid=recent[0].feature.map((_,i)=>median(recent.map(s=>s.feature[i])));
 const clean=recent.filter(s=>s.feature.slice(0,4).every((v,i)=>Math.abs(v-mid[i])<=.035)&&Math.abs(s.feature[4]-mid[4])<.012&&Math.abs(s.feature[5]-mid[5])<.012);
 if(clean.length<12||clean.length/recent.length<.8||clean.at(-1)!.time-clean[0].time<650)return [];
 return clean;
}
export function freshValidation(seed:number):Point[]{
 // All coordinates differ from calibration targets. New offset on each retry, never used for fitting.
 const j=((seed%17)-8)*.004;
 return [{x:.29+j,y:.28-j},{x:.71-j,y:.31+j},{x:.47+j,y:.57-j},{x:.31-j,y:.73+j},{x:.72+j,y:.69-j}];
}
export function validationStats(groups:Validation[],width:number,height:number){
 const perTarget=groups.map(g=>({target:g.target,count:g.estimates.length,error:mean(g.estimates.map(p=>distance(p,g.target))),biasX:mean(g.estimates.map(p=>p.x-g.target.x)),biasY:mean(g.estimates.map(p=>p.y-g.target.y)),jitter:0,pixels:mean(g.estimates.map(p=>Math.hypot((p.x-g.target.x)*width,(p.y-g.target.y)*height)))}));
 perTarget.forEach((r,i)=>{const center={x:r.target.x+r.biasX,y:r.target.y+r.biasY};r.jitter=mean(groups[i].estimates.map(p=>distance(p,center)));});
 const observed=perTarget.filter(r=>r.count>0);
 const errors=groups.flatMap(g=>g.estimates.map(p=>distance(p,g.target))).sort((a,b)=>a-b);
 return {perTarget,mean:mean(perTarget.filter(r=>r.count>0).map(r=>r.error)),worst:Math.max(0,...perTarget.map(r=>r.error)),biasX:mean(observed.map(r=>r.biasX)),biasY:mean(observed.map(r=>r.biasY)),jitter:mean(observed.map(r=>r.jitter)),pixels:mean(observed.map(r=>r.pixels)),p95:errors[Math.floor((errors.length-1)*.95)]||0,count:errors.length};
}
export function validationPass(groups:Validation[],width:number,height:number,valid:number,total:number,fps:number){
 const stats=validationStats(groups,width,height);
 return {stats,usable:groups.length===5&&groups.every(g=>g.estimates.length>=5)&&stats.count>=25&&stats.mean<=.2&&stats.worst<=.2&&total>0&&valid/total>=.75&&fps>=10};
}
export type Surface = {left:number;top:number;width:number;height:number};
export function sameSurface(a:Surface,b:Surface){return (['left','top','width','height'] as const).every(k=>Math.abs(a[k]-b[k])<=1);}
export type TargetStamp={time:number;point:Point};
export function targetAt(history:TargetStamp[],time:number):Point|null {for(let i=history.length-1;i>=0;i--)if(history[i].time<=time)return history[i].point;return null;}
export function retryTargets(groups:TargetSamples[],errors:number[]){return groups.map((g,i)=>({g,e:errors[i]||0})).sort((a,b)=>b.e-a.e).slice(0,3).map(x=>x.g.target);}
export {calibrationTargets};

// Keep one pose reference for the entire calibration, including partial retries.
export function poseReference(samples:TimedFeature[]){return [4,5,6,7,8,9].map(i=>median(samples.map(s=>s.feature[i])));}
export function poseMatches(f:number[],pose:number[]){
 if(!pose.length)return true;
 return poseDeltas(f,pose).every(v=>Number.isFinite(v)&&Math.abs(v)<=1);
}
export function validationMetrics(v:ReturnType<typeof validationStats>,prefix:string):Record<string,number>{
 const m:Record<string,number>={[`${prefix} expected targets`]:v.perTarget.length,[`${prefix} measured targets`]:v.perTarget.filter(p=>p.count>0).length,[`${prefix} targets with 5+ samples`]:v.perTarget.filter(p=>p.count>=5).length};
 if(v.count===0){v.perTarget.forEach((_,i)=>m[`${prefix} target ${i+1} samples`]=0);return {...m,[`${prefix} samples`]:0};}m[`${prefix} error (% surface units)`]=v.mean*100;m[`${prefix} error (CSS pixels)`]=v.pixels;m[`${prefix} horizontal bias (% width)`]=v.biasX*100;m[`${prefix} vertical bias (% height)`]=v.biasY*100;m[`${prefix} jitter (% surface units)`]=v.jitter*100;m[`${prefix} 95th percentile error (% surface units)`]=v.p95*100;m[`${prefix} samples`]=v.count;
 v.perTarget.forEach((p,i)=>{if(p.count)m[`${prefix} target ${i+1} error (% surface units)`]=p.error*100;m[`${prefix} target ${i+1} samples`]=p.count;});return m;
}
export function pairedValidationMetrics(pre:ReturnType<typeof validationStats>|null,post:ReturnType<typeof validationStats>):Record<string,number>{
 return {...validationMetrics(post,'Final validation'),...(pre?validationMetrics(pre,'Initial validation'):{}),...(pre&&pre.perTarget.every(p=>p.count)&&post.perTarget.every(p=>p.count)?{'Horizontal drift (% width)':100*(post.biasX-pre.biasX),'Vertical drift (% height)':100*(post.biasY-pre.biasY)}:{})};
}

// Normalized against the exact frame-acceptance limits; 1 is the boundary.
export function poseDeltas(f:number[],pose:number[]){
 const limits=[.02,.02,Math.max(.005,pose[2]*.08),.06,.1,.1];
 return [4,5,6,7,8,9].map((i,j)=>(f[i]-pose[j])/limits[j]);
}
export function headGuide(f:number[]|null,pose:number[],count:number){
 const empty={dx:0,dy:0,scale:1,roll:0,tracked:false,ok:false};
 if(count!==1)return {...empty,cue:count>1?'One person at a time':'Bring your face into view'};
 if(!f)return {...empty,cue:'Eyes not clearly visible'};
 if(!pose.length)return {...empty,cue:'Hold a comfortable position for calibration'};
 const d=poseDeltas(f,pose);if(d.some(v=>!Number.isFinite(v)))return {...empty,cue:'Position unavailable'};
 const worst=d.reduce((best,v,i)=>Math.abs(v)>Math.abs(d[best])?i:best,0),ok=poseMatches(f,pose);
 const cues=[d[0]>0?'Move slightly right':'Move slightly left',d[1]>0?'Move slightly up':'Move slightly down',d[2]>0?'Move slightly farther back':'Move slightly closer','Return to your calibrated head tilt','Return to your calibrated facing direction','Return to your calibrated chin angle'];
 return {tracked:true,ok,cue:ok?'Position OK':cues[worst],dx:-d[0],dy:d[1],scale:f[6]/pose[2],roll:-Math.asin(Math.max(-1,Math.min(1,f[7])))+Math.asin(Math.max(-1,Math.min(1,pose[3])))};
}
