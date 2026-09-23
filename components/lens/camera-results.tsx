'use client';
import type {SuiteRecord} from '@/lib/suite';
import {cameraResults} from '@/lib/camera-results';
export function CameraResults({record}:{record:SuiteRecord}){
 const result=cameraResults(record),reading=record.kind==='readingGaze';
 return <div className="camera-results">
  <section aria-label="Activity measurements"><h3>Activity measurements</h3>
   {record.status!=='complete'?<p>{record.status==='incomplete'?'This session was interrupted.':'Tracking checks were not sufficient.'} No completed activity measurements are available.</p>:result.activity.length?<>
    <dl>{result.activity.map(item=><div key={item.label}><dt>{item.label}</dt><dd><strong>{item.value.toFixed(1)}</strong> {item.unit}</dd></div>)}</dl>
    <p>{reading?'These percentages describe where accepted gaze estimates fell across three broad screen regions. They do not measure reading speed, comprehension, or word-by-word eye movements.':'A smaller distance means the estimated gaze was closer to the instructed target. The measurement includes camera error; it is not a percent-correct score.'}</p>
    {result.samples!==undefined&&<p>{Math.round(result.samples)} scored gaze samples.</p>}
   </>:<p>No activity measurements were recorded in this saved session.</p>}
  </section>
  <section aria-label="Tracking quality"><h3>Tracking quality</h3><p>{record.status==='complete'?'This session passed its required tracking checks.':record.quality||'Tracking checks were not completed.'}</p>
   {result.checks.length>0&&<div className="table-wrap"><table><caption>Camera-check error · separate from activity measurements</caption><thead><tr><th>Check</th><th>Average measured error</th><th>Coverage</th></tr></thead><tbody>{result.checks.map(c=><tr key={c.label}><td>{c.label}</td><td>{c.error===undefined?'Not measured':`${c.error.toFixed(1)}% surface units`}</td><td>{c.partial?'Incomplete — measured points only':c.samples!==undefined?`${Math.round(c.samples)} samples`:'Sample count not recorded'}</td></tr>)}</tbody></table></div>}
   {(result.accepted!==undefined||result.fps!==undefined)&&<p>{result.accepted!==undefined&&<>Accepted activity frames: <strong>{result.accepted.toFixed(1)}%</strong>. </>}{result.fps!==undefined&&<>Accepted frames per second: <strong>{result.fps.toFixed(1)}</strong>.</>}</p>}
   <p>Camera-check error measures how far estimates were from known targets. These experimental measurements have no age norms or clinical interpretation.</p>
  </section>
 </div>;
}
