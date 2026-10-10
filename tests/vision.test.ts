import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeItem,kinds,backupSchema,empty,comparable,accuracy,advice,attemptVersion,needsExam,symptoms,legacySymptomCount,type Attempt,type Check} from '../lib/vision.ts';
const a:Attempt={id:'a',profileId:'p',date:new Date().toISOString(),kind:'search',mode:'assessment',version:1,difficulty:2,input:'mouse',status:'complete',correct:5,answered:6,total:6,seconds:12};
test('every generated item has exactly one valid answer at every difficulty',()=>{for(const kind of kinds)for(const level of [1,2,3])for(let n=0;n<300;n++){const item=makeItem(kind,level);assert.deepEqual(item.options[item.answer],item.target);assert.equal(item.options.filter(o=>o.join()===item.target.join()).length,1);if(kind==='search')assert.equal(item.options.length,[9,16,25][level-1]);else {assert.equal(item.target.length,level+2);assert.equal(new Set(item.options.map(o=>o.join())).size,4);}}});
test('accuracy is based on six trials',()=>assert.equal(accuracy(a),83));
test('comparison rejects incompatible or incomplete attempts',()=>{assert.ok(comparable(a,{...a,id:'b'}));for(const patch of [{status:'incomplete'},{mode:'practice'},{profileId:'other'},{kind:'memory'},{difficulty:1},{input:'keyboard'},{input:'unknown'}])assert.equal(comparable(a,{...a,...patch} as Attempt),false);assert.equal(comparable({...a,input:'mixed'},{...a,input:'mixed'}),false);});
test('backup roundtrip and validation',()=>{const d={...empty,profiles:[{id:'p',nickname:'Test',age:10,glasses:'No',diagnoses:'',observations:''}],attempts:[a]};assert.deepEqual(backupSchema.parse(JSON.parse(JSON.stringify(d))),d);for(const invalid of [{...d,schemaVersion:99},{...d,profiles:[]},{...d,attempts:[{...a,correct:7}]},{...d,attempts:[{...a,answered:2}]},{...d,attempts:[a,a]},{...d,profiles:[d.profiles[0],d.profiles[0]]}])assert.equal(backupSchema.safeParse(invalid).success,false);assert.throws(()=>JSON.parse('{broken'));});
test('double vision has priority; uncertainty is explicit',()=>{const c:Check={id:'c',profileId:'p',date:new Date().toISOString(),responses:['Often','Often','Sometimes','Often','Often'],observations:''};assert.match(advice(c),/Double vision deserves/);assert.match(advice({...c,responses:['Not sure','Never','Never','Never','Never']}),/uncertain/);});
test('reading questions lead to eye-examination guidance; earlier five-answer check-ins still count',()=>{const none:Check['responses']=symptoms.map(()=>'Never' as const);const c:Check={id:'c',profileId:'p',date:new Date().toISOString(),responses:none,observations:''};assert.equal(needsExam(c),false);assert.match(advice(c),/No frequent concern/);for(const [i,pattern] of [[5,/full eye examination/],[6,/full eye examination/],[8,/full eye examination/],[7,/everyday difficulties/],[9,/everyday difficulties/]] as const){const r=[...none];r[i]='Often';assert.match(advice({...c,responses:r}),pattern);assert.equal(needsExam({...c,responses:r}),true);}const legacy={...c,responses:none.slice(0,legacySymptomCount)};assert.equal(needsExam(legacy),false);assert.equal(needsExam({...legacy,responses:['Never','Never','Never','Often','Never']}),true);assert.equal(needsExam(undefined),false);});
test('assessments paced differently are never compared',()=>{const v2={...a,id:'b',version:attemptVersion} as Attempt;assert.ok(comparable(v2,{...v2,id:'c'}));assert.equal(comparable(a,v2),false);assert.equal(comparable(v2,a),false);const d={...empty,profiles:[{id:'p',nickname:'Test',age:10,glasses:'No' as const,diagnoses:'',observations:''}]};assert.ok(backupSchema.safeParse({...d,attempts:[a,v2]}).success);assert.equal(backupSchema.safeParse({...d,attempts:[{...a,version:3}]}).success,false);});
test('backups accept five-answer and full check-ins only',()=>{const profile={id:'p',nickname:'Test',age:9,glasses:'No' as const,diagnoses:'',observations:''};const check=(n:number)=>({id:'c'+n,profileId:'p',date:new Date().toISOString(),responses:Array(n).fill('Never'),observations:''});assert.ok(backupSchema.safeParse({...empty,profiles:[profile],checks:[check(legacySymptomCount)]}).success);assert.ok(backupSchema.safeParse({...empty,profiles:[profile],checks:[check(symptoms.length)]}).success);assert.equal(backupSchema.safeParse({...empty,profiles:[profile],checks:[check(7)]}).success,false);assert.ok(backupSchema.safeParse({schemaVersion:1,profiles:[profile],checks:[check(legacySymptomCount)],attempts:[]}).success);});

import { makePuzzle,extendedKinds,rotate,same,assemble,glyphKey,extendedAttemptSchema,extendedComparable,trialSeed,summary,median,type ExtendedAttempt } from '../lib/extended.ts';

test('all expanded generators are deterministic and produce solvable, unambiguous puzzles',()=>{
  for(const kind of extendedKinds)for(const level of [1,2,3])for(let seed=0;seed<250;seed++){
    const p=makePuzzle(kind,level,seed);assert.deepEqual(p,makePuzzle(kind,level,seed));
    if(kind==='detailSearch'){assert.equal(p.glyphs.filter(g=>glyphKey(g)===glyphKey(p.targetGlyph)).length,1);assert.equal(glyphKey(p.glyphs[p.answer]),glyphKey(p.targetGlyph));}
    if(kind==='rotation'){assert.deepEqual(p.options[p.answer],rotate(p.target,p.size,p.turns));assert.equal(p.options.filter(o=>same(o,p.expected)).length,1);assert.equal(new Set(p.options.map(o=>o.join())).size,4);assert.ok(!same(p.target,p.expected));}
    if(kind==='sequence'){assert.equal(p.target.length,level+2);assert.equal(new Set(p.target).size,p.target.length);}
    if(kind==='pattern'){assert.equal(p.target.reduce((a,b)=>a+b),level+3);}
    if(kind==='blocks'){
      const targets=[0,1,2,3].map(i=>{const y=Math.floor(i/2)*2,x=(i%2)*2;return [p.target[y*4+x],p.target[y*4+x+1],p.target[(y+1)*4+x],p.target[(y+1)*4+x+1]];});
      function solve(slot:number,used:number[]):boolean{if(slot===4)return true;return p.tiles.some((t,i)=>!used.includes(i)&&[0,1,2,3].some(r=>same(rotate(t,2,r),targets[slot]))&&solve(slot+1,[...used,i]));}
      assert.ok(solve(0,[]));assert.deepEqual(assemble(targets),p.expected);
    }
  }
});
const viewport={width:1200,height:900,pixelRatio:1};
function expandedFixture():ExtendedAttempt {const seed=91,kind='rotation' as const;const trials=Array.from({length:12},(_,i)=>{const s=trialSeed(seed,i),p=makePuzzle(kind,2,s);return {index:i+1,correct:true,seconds:3+i,seed:s,input:'keyboard' as const,response:p.expected,expected:p.expected};});return {id:'ext',profileId:'p',date:new Date().toISOString(),kind,mode:'assessment',version:1,difficulty:2,total:12,status:'complete',input:'keyboard',trials,viewport,conditions:'Test',seed};}
test('expanded results validate every trial and reject tampered counts or seeds',()=>{const e=expandedFixture();assert.ok(extendedAttemptSchema.safeParse(e).success);assert.equal(summary(e).correct,12);assert.equal(summary(e).accuracy,100);assert.equal(median([3,1,2,4]),2.5);for(const changed of [{...e,total:6},{...e,trials:e.trials.slice(0,11)},{...e,trials:e.trials.map((t,i)=>i===0?{...t,correct:false}:t)},{...e,trials:e.trials.map((t,i)=>i===0?{...t,seed:0}:t)},{...e,input:'mouse'}])assert.equal(extendedAttemptSchema.safeParse(changed).success,false);});
test('v1 backups migrate without altering any original record; v2 roundtrips both histories',()=>{
  const profile={id:'p',nickname:'Existing child',age:10,glasses:'Yes',diagnoses:'Existing note',observations:'Preserve this'};
  const old={schemaVersion:1,profiles:[profile],checks:[],attempts:[a]};const migrated=backupSchema.parse(old);
  assert.equal(migrated.schemaVersion,3);assert.deepEqual(migrated.attempts,old.attempts);assert.deepEqual(migrated.profiles,old.profiles);assert.deepEqual(migrated.extended,[]);
  const upgraded={...migrated,extended:[expandedFixture()]};assert.deepEqual(backupSchema.parse(JSON.parse(JSON.stringify(upgraded))),upgraded);
  assert.equal(backupSchema.safeParse({...upgraded,profiles:[]}).success,false);
});
test('extended comparisons isolate protocols and screen setup',()=>{const e=expandedFixture();assert.ok(extendedComparable(e,{...e,id:'another'}));for(const patch of [{status:'incomplete'},{mode:'practice'},{profileId:'other'},{kind:'blocks'},{difficulty:3},{total:6},{input:'mouse'},{viewport:{...viewport,width:1199}}])assert.equal(extendedComparable(e,{...e,...patch} as ExtendedAttempt),false);assert.equal(extendedComparable({...e,input:'mixed'},{...e,input:'mixed'}),false);});

test('profiles of different ages survive backup roundtrips without changing existing histories',()=>{
 for(const age of [0,6,10,17,42,85,130]){
  const d={...empty,profiles:[{id:'p',nickname:'Test',age,glasses:'No',diagnoses:'',observations:''}],attempts:[a]};
  assert.deepEqual(backupSchema.parse(JSON.parse(JSON.stringify(d))),d);
  for(const invalidAge of [-1,4.5,NaN,Infinity])assert.equal(backupSchema.safeParse({...d,profiles:[{...d.profiles[0],age:invalidAge}]}).success,false);
 }
});

import {rotationSchedule,sessionPuzzle,makeExtendedAttempt} from '../lib/extended.ts';
test('mixed rotation assessments balance angles, validate trials and isolate old baselines',()=>{
 const orders=new Set<string>();
 for(let seed=0;seed<100;seed++){
  const schedule=rotationSchedule(seed);orders.add(schedule.join());
  for(const angle of [1,2,3])assert.equal(schedule.filter(x=>x===angle).length,4);
  const session={...expandedFixture(),version:2 as const,seed};
  session.trials=schedule.map((turns,i)=>{const p=sessionPuzzle(session,i);assert.equal(p.turns,turns);assert.deepEqual(rotate(p.target,p.size,turns),p.expected);assert.equal(p.options.filter(o=>same(o,p.expected)).length,1);return {index:i+1,correct:true,seconds:3,seed:trialSeed(seed,i),input:'keyboard' as const,response:p.expected,expected:p.expected};});
  assert.ok(extendedAttemptSchema.safeParse(session).success);
  assert.equal(extendedComparable(session,expandedFixture()),false);
  assert.ok(extendedComparable(session,{...session,id:'another'}));
  const incomplete={...session,status:'incomplete' as const,trials:session.trials.slice(0,5)};
  assert.ok(extendedAttemptSchema.safeParse(incomplete).success);
  assert.equal(extendedComparable(incomplete,session),false);
 }
 assert.ok(orders.size>1);
 const v1=expandedFixture();assert.deepEqual(sessionPuzzle(v1,0),makePuzzle(v1.kind,v1.difficulty,trialSeed(v1.seed,0)));
 assert.equal(makeExtendedAttempt('p','rotation','assessment',2,viewport,'').version,2);
 assert.equal(makeExtendedAttempt('p','rotation','practice',2,viewport,'').version,1);
 assert.equal(extendedAttemptSchema.safeParse({...v1,version:3}).success,false);
});

import {suiteKinds,suiteCatalog,suitePuzzle,suiteRecordSchema,suiteComparable,symbolPixels,trialCount,type SuiteRecord} from '../lib/suite.ts';
import {fitGaze,predictGaze,cameraQuality,distance} from '../lib/gaze.ts';
function suiteFixture(kind:SuiteRecord['kind']='closure'):SuiteRecord {const r:SuiteRecord={id:'suite',profileId:'p',kind,version:1,date:new Date().toISOString(),status:'incomplete',seed:123,settings:{...viewport,input:'keyboard',eye:'Left',distanceCm:40,pixelsPerMm:4,correction:'Usual',brightness:'Fixed'},trials:[],notes:'',metrics:{},quality:''};return r;}
test('all new tasks are deterministic and scored against the recorded stimulus',()=>{
 for(const kind of suiteKinds.filter(k=>suiteCatalog[k].group==='performance'||['nearAcuity','distanceAcuity','crowding','contrast','color'].includes(k)))for(let seed=0;seed<20;seed++){
 const r={...suiteFixture(kind),seed,status:'complete' as const};r.trials=Array.from({length:trialCount(kind)},(_,index)=>{const p=suitePuzzle(kind,seed,index);assert.deepEqual(p,suitePuzzle(kind,seed,index));if(['closure','figureGround','constancy'].includes(kind)){assert.equal(p.choices[p.answer[0]],p.shape);assert.equal(new Set(p.choices).size,4);}if(kind==='workingMemory')assert.deepEqual(p.answer,[...p.sequence].reverse());return {index,condition:p.condition,response:p.answer,correct:true,seconds:1};});assert.ok(suiteRecordSchema.safeParse(r).success,kind);assert.equal(suiteRecordSchema.safeParse({...r,trials:r.trials.slice(1)}).success,false);assert.equal(suiteRecordSchema.safeParse({...r,trials:r.trials.map((t,i)=>i===0?{...t,correct:false}:t)}).success,false);
 }
});
test('v3 backup includes new records, preserves old records, rejects orphans and unsupported versions',()=>{
 const r=suiteFixture(),d={...empty,profiles:[{id:'p',nickname:'Test',age:42,glasses:'No',diagnoses:'',observations:''}],attempts:[a],extended:[expandedFixture()],suite:[r]};assert.deepEqual(backupSchema.parse(JSON.parse(JSON.stringify(d))),d);const {suite,...v2}=d;const migrated=backupSchema.parse({...v2,schemaVersion:2});assert.deepEqual(migrated.suite,[]);assert.deepEqual(migrated.extended,d.extended);assert.equal(backupSchema.safeParse({...d,suite:[{...r,profileId:'other'}]}).success,false);assert.equal(backupSchema.safeParse({...d,suite:[{...r,version:99}]}).success,false);
});
test('suite comparisons exclude incomplete, camera, other profiles and changed conditions',()=>{const r={...suiteFixture(),status:'complete' as const};assert.ok(suiteComparable(r,{...r,id:'two'}));for(const patch of [{status:'incomplete'},{profileId:'other'},{kind:'color'},{settings:{...r.settings,input:'mixed'}},{settings:{...r.settings,eye:'Right'}}])assert.equal(suiteComparable(r,{...r,...patch} as SuiteRecord),false);assert.equal(suiteComparable({...r,kind:'fixation'},{...r,kind:'fixation'}),false);});
test('screen geometry scales with measured distance and camera gate rejects noise and tracking loss',()=>{assert.ok(Math.abs(symbolPixels(32,80,4)/symbolPixels(32,40,4)-2)<.00001);assert.ok(!cameraQuality([],0,0,0).usable);assert.ok(!cameraQuality(Array(30).fill(.3),30,30,30).usable);assert.ok(!cameraQuality(Array(30).fill(.01),30,100,30).usable);assert.ok(!cameraQuality(Array(30).fill(.01),30,30,5).usable);assert.ok(cameraQuality(Array(30).fill(.03),30,30,30).usable);});
test('gaze fit predicts held-out synthetic coordinates, not just training points',()=>{const samples=Array.from({length:100},(_,i)=>{const x=(i%10)/10,y=Math.floor(i/10)/10;return {feature:[x,y],target:{x:.1+.7*x,y:.2+.6*y}}});const m=fitGaze(samples),p=predictGaze(m,[.45,.35]);assert.ok(Math.abs(p.x-.415)<.01);assert.ok(Math.abs(p.y-.41)<.01);});

import {fitMapping,predictMapping,selectMapping,stableWindow,freshValidation,validationPass,validationStats,sameSurface,targetAt,calibrationTargets as cameraPoints,type TargetSamples} from '../lib/gaze-calibration.ts';
function cameraGroups(nonlinear=false):TargetSamples[]{return cameraPoints.map(target=>({target,samples:Array.from({length:24},(_,i)=>{const x=nonlinear?Math.sqrt(target.x):target.x,y=target.y;return {time:i*34,feature:[x,y,x,y,.5,.5,.3,0,0,0,.04,.04]};})}));}
test('camera v2 accepts older history and rejects protocol changes for other tasks',()=>{assert.ok(suiteRecordSchema.safeParse({...suiteFixture('fixation'),version:2}).success);assert.ok(suiteRecordSchema.safeParse(suiteFixture('fixation')).success);assert.ok(!suiteRecordSchema.safeParse({...suiteFixture(),version:2}).success);const d={...empty,profiles:[{id:'p',nickname:'Test',age:42,glasses:'No',diagnoses:'',observations:''}],suite:[{...suiteFixture('fixation'),version:2}]};assert.deepEqual(backupSchema.parse(JSON.parse(JSON.stringify(d))),d);});
test('camera calibration rejects unstable windows and isolated outliers do not dominate',()=>{const samples=cameraGroups()[0].samples;assert.equal(stableWindow(samples.slice(0,5),200).length,0);assert.ok(stableWindow(samples,800).length>=12);const contaminated=samples.map((s,i)=>({...s,feature:s.feature.map((v,j)=>j<4&&i===9?v+.7:v)}));assert.equal(stableWindow(contaminated,800).length,23);assert.equal(stableWindow(samples.map((s,i)=>({...s,feature:s.feature.map((v,j)=>j<4?v+(i%2)*.2:v)})),800).length,0);});
test('camera models use held-out targets; nonlinear mapping must improve validation',()=>{const linear=selectMapping(cameraGroups());assert.equal(linear.model.family,'linear');assert.ok(linear.error<.01);const groups=cameraGroups(true),chosen=selectMapping(groups);assert.equal(chosen.model.family,'quadratic');assert.ok(chosen.error<chosen.baseline*.9);const pred=predictMapping(chosen.model,[Math.sqrt(.4),.6,Math.sqrt(.4),.6,.5,.5,.3,0,0,0,.04,.04]);assert.ok(distance(pred,{x:.4,y:.6})<.025);assert.throws(()=>fitMapping(groups.slice(0,5),'linear',.03));});
test('validation allows 20 percent average error and requires every separate target',()=>{const points=freshValidation(123);assert.ok(points.every(p=>cameraPoints.every(c=>distance(p,c)>.01)));assert.notDeepEqual(points,freshValidation(124));const groups=points.map(target=>({target,estimates:Array.from({length:30},()=>({x:target.x+.03,y:target.y}))}));assert.ok(validationPass(groups,1000,500,150,150,30).usable);assert.ok(validationPass(groups.map(g=>({...g,estimates:g.estimates.map(p=>({...p,x:p.x+.15}))})),1000,500,150,150,30).usable);assert.ok(!validationPass(groups.map(g=>({...g,estimates:g.estimates.map(p=>({...p,x:p.x+.18}))})),1000,500,150,150,30).usable);assert.ok(!validationPass(groups.map((g,i)=>i===2?{...g,estimates:[]}:g),1000,500,150,150,30).usable);const stats=validationStats(groups,1000,500);assert.ok(Math.abs(stats.pixels-30)<.001);assert.ok(Math.abs(stats.biasX-.03)<.00001);assert.ok(stats.jitter<.00001);});
test('frame targets follow displayed history, and geometry changes invalidate calibration',()=>{assert.deepEqual(targetAt([{time:10,point:{x:.2,y:.5}},{time:20,point:{x:.8,y:.5}}],15),{x:.2,y:.5});assert.equal(targetAt([{time:10,point:{x:.2,y:.5}}],5),null);const r={left:10,top:20,width:900,height:400};assert.ok(sameSurface(r,{...r}));assert.ok(!sameSurface(r,{...r,top:25}));});

import {poseReference,poseMatches,pairedValidationMetrics,validationMetrics} from '../lib/gaze-calibration.ts';
test('eye-only calibration cannot learn the head-position shortcut that produced large drift',()=>{
 const f=(x:number,y:number,shift=0)=>[.2+.6*x,.1+.12*y,.2+.6*x,.1+.12*y,.5,.5+.03*y+shift,.3,0,0,0,.04,.04];
 const groups=cameraPoints.map(target=>({target,samples:Array.from({length:24},(_,i)=>({time:i*34,feature:f(target.x,target.y)}))}));
 const legacy=fitGaze(groups.flatMap(g=>g.samples.map(s=>({feature:s.feature.slice(0,8),target:g.target}))));
 const model=selectMapping(groups).model;
 for(const shift of [-.048,.048]){
  const target={x:.4,y:.6},before=predictMapping(model,f(target.x,target.y)),after=predictMapping(model,f(target.x,target.y,shift));
  assert.ok(Math.abs(predictGaze(legacy,f(target.x,target.y,shift).slice(0,8)).y-target.y)>.5,'the previous feature set reproduces >50% vertical drift');
  assert.deepEqual(after,before,'head position must not enter the gaze mapping');assert.ok(distance(after,target)<.001);
  assert.equal(poseMatches(f(target.x,target.y,shift),poseReference(groups[4].samples)),false,'the excessive pose change is also rejected');
 }
});
test('head reference admits small variation but excludes translation, scale and rotation changes',()=>{
 const feature=cameraGroups()[4].samples[0].feature,pose=poseReference(cameraGroups()[4].samples);assert.ok(poseMatches(feature,pose));
 assert.ok(poseMatches(feature.map((v,i)=>i===5?v+.005:v),pose));
 for(const [index,delta] of [[4,.03],[5,-.03],[6,.04],[7,.1],[8,.15],[9,-.15]])assert.equal(poseMatches(feature.map((v,i)=>i===index?v+delta:v),pose),false);
});
test('failed final validation retains passing initial metrics and signed drift',()=>{
 const targets=freshValidation(123),make=(bias:number)=>validationStats(targets.map(target=>({target,estimates:Array.from({length:20},()=>({x:target.x,y:target.y+bias}))})),1066,533);
 const pre=make(.01),post=make(-.53),metrics=pairedValidationMetrics(pre,post);
 assert.ok(Math.abs(metrics['Initial validation error (% surface units)']-1)<.001);assert.ok(Math.abs(metrics['Final validation error (% surface units)']-53)<.001);assert.ok(Math.abs(metrics['Vertical drift (% height)']+54)<.001);assert.equal(metrics['Final validation target 1 samples'],20);
 const empty=validationStats(targets.map(target=>({target,estimates:[]})),1066,533);assert.equal(validationMetrics(empty,'Final validation')['Final validation samples'],0);assert.equal(validationMetrics(empty,'Final validation')['Final validation error (% surface units)'],undefined);assert.equal(pairedValidationMetrics(pre,empty)['Vertical drift (% height)'],undefined);
});
test('protocol 3 roundtrips alongside unchanged version 1 and 2 camera history',()=>{
 const suite=[1,2,3].map((version,i)=>({...suiteFixture('pursuit'),id:`camera-${i}`,version}));
 const data={...empty,profiles:[{id:'p',nickname:'Test',age:42,glasses:'No',diagnoses:'',observations:''}],suite};
 assert.deepEqual(backupSchema.parse(JSON.parse(JSON.stringify(data))),data);assert.equal(suiteRecordSchema.safeParse({...suiteFixture('closure'),version:3}).success,false);
});

test('protocol 4 gives each stationary dot a full settling second and fixed 1.8 second sample window',async()=>{
 const {stationarySampleAllowed}=await import('../lib/gaze.ts');
 for(const t of [-1,0,699,999,2800,5000])assert.equal(stationarySampleAllowed(t),false);
 for(const t of [1000,1799,2799])assert.equal(stationarySampleAllowed(t),true);
});
test('pursuit lead-ins exclude startup and direction-change samples without changing the trajectory',async()=>{
 const {pursuitScored,cameraTarget}=await import('../lib/gaze.ts');
 for(const t of [-1,0,.999,12,12.999,24])assert.equal(pursuitScored(t),false);
 for(const t of [1,11.999,13,23.999])assert.equal(pursuitScored(t),true);
 assert.deepEqual(cameraTarget('pursuit',0).cue,{x:.5,y:.5});
 assert.deepEqual(cameraTarget('pursuit',12).cue,{x:.5,y:.5});
 const records=[1,2,3,4].map((version,i)=>({...suiteFixture('pursuit'),id:'timing-'+i,version}));
 const data={...empty,profiles:[{id:'p',nickname:'Test',age:42,glasses:'No',diagnoses:'',observations:''}],suite:records};
 assert.deepEqual(backupSchema.parse(JSON.parse(JSON.stringify(data))),data);
 assert.equal(suiteRecordSchema.safeParse({...suiteFixture('closure'),version:4}).success,false);
});

test('protocol 5 preserves older camera history and keeps the individual target gate',()=>{
 const records=[1,2,3,4,5].map((version,i)=>({...suiteFixture('pursuit'),id:'threshold-'+i,version}));
 const data={...empty,profiles:[{id:'p',nickname:'Test',age:42,glasses:'No',diagnoses:'',observations:''}],suite:records};
 assert.deepEqual(backupSchema.parse(JSON.parse(JSON.stringify(data))),data);
 assert.equal(suiteRecordSchema.safeParse({...suiteFixture('closure'),version:5}).success,false);
 const groups=freshValidation(123).map((target,i)=>({target,estimates:Array.from({length:30},()=>({x:target.x+(i===0?.21:.03),y:target.y}))}));
 assert.ok(validationStats(groups,1000,500).mean<.2);
 assert.equal(validationPass(groups,1000,500,150,150,30).usable,false);
});

import {repeatedTargets,fitEngines,visitDisagreement,checkReasons,fitOffset,correctionVerified,correctionDecision,regionStats,regionTargets,groupsFor,type Visit} from '../lib/gaze-comparison.ts';
test('comparison repeats every location and groups holdout by location, not nearby frames',()=>{
 const targets=repeatedTargets(91);assert.equal(targets.length,18);assert.deepEqual(targets,repeatedTargets(91));assert.notDeepEqual(targets.slice(0,9),targets.slice(9));
 const visits:Visit[]=targets.map(target=>({target,landmark:Array.from({length:20},()=>[target.x,target.y,target.x,target.y]),blaze:Array.from({length:20},()=>[target.x*.7,target.y*.7,target.x*.7,target.y*.7])}));
 const models=fitEngines(visits);assert.ok(visitDisagreement(visits,models).every(d=>d.error<.001));
 visits[9].blaze=visits[9].blaze.map(f=>f.map(v=>v+.3));assert.ok(visitDisagreement(visits,models).some(d=>d.error>.08));
});
test('correction requires consistent fit residuals and improvement on independent observations',()=>{
 const make=(dx:number)=>freshValidation(51).map(target=>({target,estimates:Array.from({length:20},()=>({x:target.x+dx,y:target.y+.02}))}));
 const offset=fitOffset(make(.12));assert.ok(offset);assert.ok(Math.abs(offset.x-.12)<1e-8);
 const independent=make(.12),corrected=independent.map(g=>({...g,estimates:g.estimates.map(p=>({x:p.x-offset.x,y:p.y-offset.y}))}));
 assert.ok(correctionVerified(independent,corrected,25,1));assert.equal(correctionVerified(corrected,independent,25,1),false);assert.equal(correctionVerified(independent,corrected,5,1),false);
 const inconsistent=make(.12);inconsistent[0].estimates=inconsistent[0].estimates.map(p=>({...p,x:p.x+.3}));assert.equal(fitOffset(inconsistent),null);
 assert.equal(fitOffset(make(.12).map((g,i)=>i?g:{...g,estimates:[]})),null);
});
test('comparison exposes exact failure and requires reading regions separately from average error',()=>{
 const points=freshValidation(1),groups=points.map((target,i)=>({target,estimates:Array.from({length:20},()=>({x:target.x+(i===2?.373:.02),y:target.y}))}));
 assert.ok(checkReasons(groups,27,1).some(r=>r.includes('Point 3: 37.3%')));
 const correct=regionTargets.map(target=>({target,estimates:Array.from({length:10},()=>target)}));assert.ok(regionStats(correct).usable);
 assert.equal(regionStats(correct.map(g=>({...g,estimates:g.estimates.map(p=>({...p,y:.5}))}))).usable,false);
 const paired=points.map(target=>({target,landmark:[target],blaze:[{x:target.x+.1,y:target.y}]}));assert.equal(groupsFor(paired,'landmark')[0].estimates[0].x,points[0].x);assert.ok(Math.abs(groupsFor(paired,'blaze',{x:.1,y:0})[0].estimates[0].x-points[0].x)<1e-8);
});
test('comparison protocol history roundtrips without accepting new versions for non-camera tasks',()=>{
 const suite=[1,2,3,4,5,6,7,8].map((version,i)=>({...suiteFixture('pursuit'),id:'compare-'+i,version}));const data={...empty,profiles:[{id:'p',nickname:'Test',age:42,glasses:'No',diagnoses:'',observations:''}],suite};assert.deepEqual(backupSchema.parse(JSON.parse(JSON.stringify(data))),data);assert.equal(suiteRecordSchema.safeParse({...suiteFixture('closure'),version:8}).success,false);
});

test('offset optimization accepts improvement after a pass and falls back only on a fresh raw pass',()=>{
 const make=(dx:number)=>freshValidation(91).map(target=>({target,estimates:Array.from({length:20},()=>({x:target.x+dx,y:target.y}))}));
 assert.deepEqual(checkReasons(make(.12),25,1),[]);
 assert.equal(correctionDecision(make(.12),make(.02),25,1,true),'corrected');
 assert.equal(correctionDecision(make(.02),make(.08),25,1,true),'original');
 assert.equal(correctionDecision(make(.12),make(.02),25,1,false),'original');
 assert.equal(correctionDecision(make(.25),make(.24),25,1,true),'unusable');
 assert.equal(correctionDecision(make(.25),make(.02),25,1,false),'unusable');
 assert.equal(correctionDecision(make(.02),make(.01),5,1,true),'unusable');
 assert.equal(correctionDecision(make(.02),make(.01),25,.5,true),'unusable');
});

import {headGuide,poseDeltas} from '../lib/gaze-calibration.ts';
test('head guide matches the frame gate and gives mirrored correction cues',()=>{
 const f=[.5,.5,.5,.5,.5,.5,.3,0,0,0],pose=f.slice(4,10);
 assert.equal(headGuide(f,pose,1).cue,'Position OK');
 for(let axis=0;axis<6;axis++)for(const sign of [-1,1]){
  const moved=[...f];moved[axis+4]+=sign*[.021,.021,.025,.061,.101,.101][axis];
  assert.equal(poseMatches(moved,pose),false);assert.equal(headGuide(moved,pose,1).ok,false);assert.ok(Math.abs(poseDeltas(moved,pose)[axis])>1);
 }
 const left=[...f];left[4]+=.03;assert.equal(headGuide(left,pose,1).cue,'Move slightly right');assert.ok(headGuide(left,pose,1).dx<0);
 const down=[...f];down[5]+=.03;assert.equal(headGuide(down,pose,1).cue,'Move slightly up');
 const close=[...f];close[6]+=.03;assert.equal(headGuide(close,pose,1).cue,'Move slightly farther back');
 assert.equal(headGuide(null,pose,0).tracked,false);assert.equal(headGuide(f,pose,2).ok,false);assert.equal(headGuide(f,[],1).tracked,false);
});

test('BlazeGaze-only repeat checks ignore disagreement in the unused landmark mapping',()=>{
 const visits:Visit[]=repeatedTargets(13).map(target=>({target,landmark:Array.from({length:20},()=>[target.x,target.y,target.x,target.y]),blaze:Array.from({length:20},()=>[target.x,target.y,target.x,target.y])}));
 const models=fitEngines(visits);visits[9].landmark=visits[9].landmark.map(f=>f.map(v=>v+.3));
 assert.ok(visitDisagreement(visits,models).some(d=>d.error>.08));
 assert.ok(visitDisagreement(visits,{blaze:models.blaze}).every(d=>d.error<.001));
});

import {upsertSuiteRecord} from '../lib/suite.ts';
test('switching camera methods saves a fresh session and preserves the existing history',()=>{
 const old={...suiteFixture('pursuit'),id:'old',version:5 as const};
 const fresh={...suiteFixture('pursuit'),id:'fresh',version:8 as const};
 const saved=upsertSuiteRecord([old],fresh);assert.equal(saved.length,2);assert.deepEqual(saved[0],old);assert.deepEqual(saved[1],fresh);
 const updated=upsertSuiteRecord(saved,{...fresh,status:'unusable'});assert.equal(updated.length,2);assert.equal(updated[1].status,'unusable');assert.deepEqual(updated[0],old);
});

import {emptyFrameCounts,countFrame,frameMetrics} from '../lib/gaze-comparison.ts';
test('incomplete validation summaries exclude missing targets from all aggregates',()=>{
 const one={target:{x:.5,y:.5},estimates:[{x:.6,y:.7},{x:.7,y:.8}]};
 const a=validationStats([one],1000,500),b=validationStats([one,...freshValidation(1).slice(0,4).map(target=>({target,estimates:[]}))],1000,500);
 for(const k of ['mean','worst','biasX','biasY','jitter','pixels','p95','count'] as const)assert.equal(a[k],b[k]);
 const metrics=validationMetrics(b,'Check');assert.equal(metrics['Check measured targets'],1);assert.equal(metrics['Check expected targets'],5);assert.equal(metrics['Check target 2 samples'],0);
 const emptyStats=validationStats(freshValidation(1).map(target=>({target,estimates:[]})),1000,500);const emptyMetrics=validationMetrics(emptyStats,'Check');assert.equal(emptyMetrics['Check measured targets'],0);assert.equal(emptyMetrics['Check target 5 samples'],0);assert.equal(emptyMetrics['Check error (CSS pixels)'],undefined);
});
test('frame diagnostics distinguish throughput from accepted rate and count one rejection per frame',()=>{
 const c=emptyFrameCounts();countFrame(c,0,false,false,false);countFrame(c,2,false,false,false);countFrame(c,1,false,false,false);countFrame(c,1,true,false,false);countFrame(c,1,true,true,false);countFrame(c,1,true,true,true);
 assert.deepEqual(c,{processed:6,accepted:1,noFace:1,multipleFaces:1,eyes:1,pose:1,prediction:1});const m=frameMetrics(c,2,'Check');assert.equal(m['Check processed fps'],3);assert.equal(m['Check accepted fps'],.5);
});

import {cameraResults} from '../lib/camera-results.ts';
test('camera summaries separate activity measurements from corrected tracking checks',()=>{
 const r={...suiteFixture('pursuit'),version:8 as const,status:'complete' as const,metrics:{'Task mean target distance (% surface units)':10.4,'Correction attempted':1,'Correction accepted':1,'verify blaze error (% surface units)':12,'Corrected independent check error (% surface units)':7,'Final selected check error (% surface units)':8,'Task accepted frames (%)':100}};
 const result=cameraResults(r);assert.equal(result.activity[0].value,10.4);assert.equal(result.checks[0].error,7);assert.equal(result.accepted,100);
 assert.equal(cameraResults({...r,status:'unusable'}).activity.length,0);assert.equal(cameraResults({...r,status:'incomplete'}).activity.length,0);
 const reading=cameraResults({...r,kind:'readingGaze',metrics:{'Reading region 1 samples (%)':0,'Reading region 2 samples (%)':40,'Reading region 3 samples (%)':60}});assert.deepEqual(reading.activity.map(a=>a.value),[0,40,60]);
 const legacy=cameraResults({...r,version:5,metrics:{'Mean distance from instructed target (% surface units)':3,'Initial validation error (% surface units)':2}});assert.equal(legacy.activity[0].value,3);assert.equal(legacy.checks[0].error,2);
 const partial=cameraResults({...r,metrics:{'verify blaze error (% surface units)':11,'verify blaze samples':25,'verify blaze target 1 samples':25,'verify blaze target 2 samples':0}});assert.equal(partial.checks[0].partial,true);assert.equal(partial.activity.length,0);
});
