import { z } from 'zod';
import {suiteRecordSchema} from './suite.ts';
import { extendedAttemptSchema } from './extended.ts';
export const kinds = ['search','memory','spatial'] as const;
export type Kind = typeof kinds[number];
export const labels: Record<Kind,string> = {search:'Visual search',memory:'Visual memory',spatial:'Spatial matching'};
export const symptoms = ['Tired or sore eyes during near work','Blurred vision during near work','Double vision','Losing place while reading','Difficulty with everyday visual tasks'] as const;
const uid=z.string().min(1).max(100), note=z.string().max(2000);
export const profileSchema=z.object({id:uid,nickname:z.string().trim().min(1).max(40),age:z.number().int().min(0),glasses:z.enum(['Yes','No','Sometimes']),diagnoses:note,observations:note});
export const checkSchema=z.object({id:uid,profileId:uid,date:z.string().datetime(),responses:z.array(z.enum(['Never','Sometimes','Often','Not sure'])).length(5),observations:note});
export const attemptSchema=z.object({id:uid,profileId:uid,date:z.string().datetime(),kind:z.enum(kinds),mode:z.enum(['assessment','practice']),version:z.literal(1),difficulty:z.number().int().min(1).max(3),input:z.enum(['keyboard','touch','mouse','mixed','unknown']),status:z.enum(['incomplete','complete']),correct:z.number().int().min(0).max(6),answered:z.number().int().min(0).max(6),total:z.literal(6),seconds:z.number().finite().min(0).max(86400)}).refine(a=>a.correct<=a.answered && (a.status!=='complete'||a.answered===6),'Invalid result counts');
const shared={profiles:z.array(profileSchema).max(100),checks:z.array(checkSchema).max(10000),attempts:z.array(attemptSchema).max(10000)};
const oldShared={...shared,extended:z.array(extendedAttemptSchema).max(10000)};
const legacyBackup=z.object({schemaVersion:z.literal(1),...shared}).strict().transform(d=>({...d,schemaVersion:3 as const,extended:[] as z.infer<typeof extendedAttemptSchema>[],suite:[] as z.infer<typeof suiteRecordSchema>[]}));
const secondBackup=z.object({schemaVersion:z.literal(2),...oldShared}).strict().transform(d=>({...d,schemaVersion:3 as const,suite:[] as z.infer<typeof suiteRecordSchema>[]}));
const currentBackup=z.object({schemaVersion:z.literal(3),...oldShared,suite:z.array(suiteRecordSchema).max(10000)}).strict();
export const backupSchema=z.union([legacyBackup,secondBackup,currentBackup]).superRefine((d,c)=>{const ids=new Set(d.profiles.map(p=>p.id));if(ids.size!==d.profiles.length)c.addIssue({code:'custom',message:'Duplicate profile IDs'});for(const arr of [d.checks,d.attempts,d.extended,d.suite]){if(new Set(arr.map(x=>x.id)).size!==arr.length)c.addIssue({code:'custom',message:'Duplicate record IDs'});for(const r of arr)if(!ids.has(r.profileId))c.addIssue({code:'custom',message:'Unknown profile'});}});
export type Profile=z.infer<typeof profileSchema>;export type Check=z.infer<typeof checkSchema>;export type Attempt=z.infer<typeof attemptSchema>;export type Data=z.infer<typeof backupSchema>;
export const empty:Data={schemaVersion:3,profiles:[],checks:[],attempts:[],extended:[],suite:[]};
export function comparable(a:Attempt,b:Attempt){return a.status==='complete'&&b.status==='complete'&&a.mode==='assessment'&&b.mode==='assessment'&&a.profileId===b.profileId&&a.kind===b.kind&&a.version===b.version&&a.difficulty===b.difficulty&&a.input===b.input&&a.input!=='unknown'&&a.input!=='mixed';}
export function accuracy(a:Attempt){return Math.round(a.correct/a.total*100);}
export function advice(c?:Check){if(!c)return 'Start with a check-in to record symptoms and everyday observations.';if(c.responses[2]==='Sometimes'||c.responses[2]==='Often')return 'Double vision deserves an eye-care assessment, even if task scores are high. Stop activities that bring it on. Sudden new double vision or sudden loss of vision needs urgent medical attention.';if(c.responses.slice(0,3).some(x=>x==='Sometimes'||x==='Often'))return 'Arrange an eye-care assessment for recurring discomfort or blurred vision. These tasks cannot determine the cause. Stop activities if symptoms appear.';if(c.responses.slice(3).some(x=>x==='Sometimes'||x==='Often'))return 'Discuss persistent everyday difficulties with an eye-care professional; for children, also discuss learning concerns with their school. Attention, reading skills, and vision can all affect these experiences.';if(c.responses.some(x=>x==='Not sure'))return 'Some symptoms are uncertain. Record what you experience, or ask the person you are assisting, and seek eye-care advice if you suspect blur, double vision, or persistent difficulty. Scores cannot rule out a condition.';return 'No frequent concern was recorded here. This does not rule out an eye or learning condition. Seek advice for persistent difficulties regardless of scores.';}
export function randomInt(n:number){return Math.floor(Math.random()*n);}
export type Item={target:number[],options:number[][],answer:number};
export function makeItem(kind:Kind,difficulty:number):Item {if(kind==='search'){const n=difficulty===1?9:difficulty===2?16:25;const answer=randomInt(n);return {target:[1],options:Array.from({length:n},(_,i)=>[i===answer?1:0]),answer};}const n=difficulty+2;const target:number[]=[];while(target.length<n){const v=randomInt(9);if(!target.includes(v))target.push(v);}target.sort((a,b)=>a-b);const options=[target];while(options.length<4){const x=[...target];x[randomInt(n)]=randomInt(9);x.sort((a,b)=>a-b);if(new Set(x).size===n&&!options.some(o=>o.join()===x.join()))options.push(x);}const answer=randomInt(4);[options[0],options[answer]]=[options[answer],options[0]];return {target,options,answer};}
export async function loadData():Promise<Data>{const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction('family','readonly');const q=tx.objectStore('family').get('data');q.onsuccess=()=>{try{resolve(q.result?backupSchema.parse(q.result):structuredClone(empty));}catch(e){reject(e);}};q.onerror=()=>reject(q.error);tx.oncomplete=()=>db.close();});}
function openDB():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open('little-lens',3);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('family'))r.result.createObjectStore('family');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Close other Little Lens tabs and try again.'));});}
export async function saveData(data:Data,expected?:Data){
  const next=backupSchema.parse(data),db=await openDB();
  return new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('family','readwrite');let problem:Error|null=null;
    const store=tx.objectStore('family'),read=store.get('data');
    read.onsuccess=()=>{try{const current=read.result?backupSchema.parse(read.result):structuredClone(empty);
      if(expected&&JSON.stringify(current)!==JSON.stringify(backupSchema.parse(expected))){problem=new Error('Data changed in another tab. Export this tab’s data, then reload before continuing.');tx.abort();return;}
      store.put(next,'data');
    }catch{problem=new Error('Stored data could not be validated. Export a backup before clearing anything.');tx.abort();}};
    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(problem||tx.error);};tx.onabort=()=>{db.close();reject(problem||tx.error);};
  });
}
