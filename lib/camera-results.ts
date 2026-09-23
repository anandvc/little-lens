import type {SuiteRecord} from './suite';
export function cameraResults(record:SuiteRecord){
 const m=record.metrics;
 const get=(...keys:string[])=>{for(const key of keys)if(Number.isFinite(m[key]))return m[key];return undefined;};
 const activity:{label:string;value:number;unit:string}[]=[];
 if(record.status==='complete'){
  if(record.kind==='readingGaze'){
   ['Top region','Middle region','Bottom region'].forEach((label,i)=>{const value=get(`Reading region ${i+1} samples (%)`,`Time samples in broad row ${i+1} (%)`);if(value!==undefined)activity.push({label,value,unit:'% of accepted gaze samples'});});
  }else{
   const value=get('Task mean target distance (% surface units)','Mean distance from instructed target (% surface units)');
   if(value!==undefined)activity.push({label:record.kind==='fixation'?'Average distance from the stationary target':record.kind==='antiSaccade'?'Average distance from the instructed opposite target':'Average distance from the target',value,unit:'% surface units'});
   const scatter=get('Gaze estimate scatter (% surface units)');if(record.kind==='fixation'&&scatter!==undefined)activity.push({label:'Spread of gaze estimates around their center',value:scatter,unit:'% surface units'});
  }
 }
 const engine=m['Selected method (0 landmark, 1 BlazeGaze)']===0?'landmark':'blaze';
 const before=record.version>=6?(m['Correction accepted']===1?'Corrected independent check':m['Correction attempted']===1?`driftVerify ${engine}`:`verify ${engine}`):'Initial validation';
 const checks=[['Before activity',before],['Between blocks','Midpoint selected check'],['After activity',record.version>=6?'Final selected check':'Final validation']].flatMap(([label,prefix])=>{
  const error=get(`${prefix} error (% surface units)`),samples=get(`${prefix} samples`);if(error===undefined&&samples===undefined)return [];
  const points=Object.entries(m).filter(([key])=>key.startsWith(`${prefix} target `)&&key.endsWith(' samples')).map(([,value])=>value);
  const expected=get(`${prefix} expected targets`)??(points.length||undefined),sufficient=get(`${prefix} targets with 5+ samples`)??(points.length?points.filter(n=>n>=5).length:undefined);
  return [{label,error,samples,partial:samples===0||(expected!==undefined&&sufficient!==undefined&&sufficient<expected)}];
 });
 return {activity,checks,accepted:get('Task accepted frames (%)','Usable task frames (%)'),fps:get('Task accepted fps','Valid task frames per second'),samples:record.status==='complete'?get('Task scored samples','Scored target samples'):undefined};
}
