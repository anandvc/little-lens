'use client';
import {headGuide} from '@/lib/gaze-calibration';

export type HeadGuideState=ReturnType<typeof headGuide>;
export function HeadPositionGuide({value,compact}:{value:HeadGuideState|null;compact:boolean}){
 const v=value??headGuide(null,[],0);
 const clamp=(n:number,limit:number)=>Math.max(-limit,Math.min(limit,n));
 return <div className={`head-position-guide ${compact?'is-compact':''}`} data-ok={v.ok}>
  <svg viewBox="0 0 120 80" aria-hidden="true">
   <rect x="35" y="10" width="50" height="60" rx="24" fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="4 3"/>
   {v.tracked&&<g transform={`translate(${60+clamp(v.dx,2)*12} ${40+clamp(v.dy,2)*9}) rotate(${clamp(v.roll*180/Math.PI,40)}) scale(${Math.max(.65,Math.min(1.4,v.scale))})`}>
    <ellipse rx="24" ry="29" fill="none" stroke="currentColor" strokeWidth="2.5"/>
    <path d="M-12 -6h7m10 0h7M-7 13h14" fill="none" stroke="currentColor" strokeWidth="2"/>
   </g>}
  </svg>
  <div><strong>Head position</strong><p role="status" aria-live="polite">{v.cue}</p><small>{compact?'Keep looking at the task target.':'Match the solid outline to the dashed outline · mirror view.'}</small></div>
 </div>;
}
