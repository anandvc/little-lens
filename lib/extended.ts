import { z } from 'zod';

export const extendedKinds = ['detailSearch', 'rotation', 'sequence', 'pattern', 'blocks'] as const;
export type ExtendedKind = typeof extendedKinds[number];
export const catalog: Record<ExtendedKind, {title:string;description:string;instruction:string;skill:string}> = {
  detailSearch: { title:'Detail detective', description:'Find a shape among increasingly similar distractors.', instruction:'Find the shape with the same outline, fill, and direction as the target. Its size may be different.', skill:'Visual discrimination & search' },
  rotation: { title:'Turn it around', description:'Recognize a pattern after it turns.', instruction:'Turn the reference pattern in your mind by the number of clockwise quarter turns shown. Choose the resulting pattern.', skill:'Mental rotation' },
  sequence: { title:'Remember the route', description:'Watch a sequence of squares, then replay it in order.', instruction:'Watch each highlighted square. After the sequence ends, select the same squares in the same order. You can undo a selection before submitting.', skill:'Sequential visual memory' },
  pattern: { title:'Pattern builder', description:'Recreate a pattern, one square at a time.', instruction:'Recreate the reference in the empty grid. Select a square to fill or clear it. Submit when your grid matches exactly.', skill:'Spatial construction' },
  blocks: { title:'Block studio', description:'Rotate and place four tiles to build the reference.', instruction:'Select a tile, rotate it if needed, then select a board position. Each tile is used once. Placing it moves it from its previous position; replacing a tile returns the old tile to the tray.', skill:'Part–whole relationships' },
};
const inputSchema = z.enum(['keyboard','touch','mouse','mixed','unknown']);
export const trialSchema = z.object({
  index:z.number().int().min(1).max(12), correct:z.boolean(), seconds:z.number().finite().min(0).max(86400),
  seed:z.number().int().min(0).max(4294967295), input:inputSchema,
  response:z.array(z.number().int().min(-1).max(100)).max(40), expected:z.array(z.number().int().min(0).max(100)).max(40),
});
export const extendedAttemptSchema=z.object({
  id:z.string().min(1).max(100), profileId:z.string().min(1).max(100), date:z.string().datetime(), kind:z.enum(extendedKinds),
  mode:z.enum(['assessment','practice']), version:z.union([z.literal(1),z.literal(2)]), difficulty:z.number().int().min(1).max(3), total:z.union([z.literal(6),z.literal(12)]),
  status:z.enum(['incomplete','complete']), input:inputSchema, trials:z.array(trialSchema).max(12),
  viewport:z.object({width:z.number().int().min(1).max(20000),height:z.number().int().min(1).max(20000),pixelRatio:z.number().positive().max(20)}),
  conditions:z.string().max(500), seed:z.number().int().min(0).max(4294967295),
}).superRefine((a,c)=>{
  const expectedTotal=a.mode==='assessment'?12:6;
  if(a.version===2&&(a.kind!=='rotation'||a.mode!=='assessment'))c.addIssue({code:'custom',message:'Unsupported activity version'});
  if(a.total!==expectedTotal || (a.mode==='assessment'&&a.difficulty!==2) || a.trials.length>a.total || (a.status==='complete'&&a.trials.length!==a.total)) c.addIssue({code:'custom',message:'Invalid session protocol'});
  a.trials.forEach((t,i)=>{
    if(t.index!==i+1||t.seed!==trialSeed(a.seed,i))c.addIssue({code:'custom',message:'Invalid trial order or seed'});
    const puzzle=sessionPuzzle(a,i);
    if(!same(t.expected,puzzle.expected)||t.correct!==same(t.response,t.expected))c.addIssue({code:'custom',message:'Trial result does not match its stimulus'});
  });
  if(a.input!==a.trials.reduce((v,t)=>mergeInput(v,t.input),'unknown' as InputMethod))c.addIssue({code:'custom',message:'Input summary does not match trials'});
});
export type ExtendedAttempt=z.infer<typeof extendedAttemptSchema>;
export type Trial=z.infer<typeof trialSchema>;
export type InputMethod=z.infer<typeof inputSchema>;
export function mergeInput(a:InputMethod,b:InputMethod):InputMethod {return a==='unknown'?b:b==='unknown'?a:a===b?a:'mixed';}
export function summary(a:ExtendedAttempt){return {correct:a.trials.filter(t=>t.correct).length,seconds:a.trials.reduce((s,t)=>s+t.seconds,0),accuracy:a.trials.length?Math.round(a.trials.filter(t=>t.correct).length/a.trials.length*100):0};}
export function median(values:number[]){const x=[...values].sort((a,b)=>a-b);return x.length?x.length%2?x[(x.length-1)/2]:(x[x.length/2-1]+x[x.length/2])/2:0;}
export function extendedComparable(a:ExtendedAttempt,b:ExtendedAttempt){return a.status==='complete'&&b.status==='complete'&&a.mode==='assessment'&&b.mode==='assessment'&&a.profileId===b.profileId&&a.kind===b.kind&&a.version===b.version&&a.difficulty===b.difficulty&&a.total===b.total&&a.input===b.input&&!['unknown','mixed'].includes(a.input)&&a.viewport.width===b.viewport.width&&a.viewport.height===b.viewport.height&&a.viewport.pixelRatio===b.viewport.pixelRatio;}
export function rng(seed:number){let x=seed>>>0;return ()=>{x=(x+0x6D2B79F5)>>>0;let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function pick(r:()=>number,n:number){return Math.floor(r()*n);}
function shuffle<T>(arr:T[],r:()=>number){const x=[...arr];for(let i=x.length-1;i>0;i--){const j=pick(r,i+1);[x[i],x[j]]=[x[j],x[i]];}return x;}
export function rotate(grid:number[],size:number,turns=1):number[]{let g=[...grid];for(let k=0;k<((turns%4)+4)%4;k++){const next=Array(g.length).fill(0);for(let y=0;y<size;y++)for(let x=0;x<size;x++)next[x*size+size-1-y]=g[y*size+x];g=next;}return g;}
export function same(a:number[],b:number[]){return a.length===b.length&&a.every((v,i)=>v===b[i]);}
function mask(size:number,count:number,r:()=>number){const cells=shuffle(Array.from({length:size*size},(_,i)=>i),r).slice(0,count);return Array.from({length:size*size},(_,i)=>Number(cells.includes(i)));}
export type Glyph={shape:number;turn:number;filled:number;scale:number};
export function glyphKey(g:Glyph){return `${g.shape}/${g.shape===1||g.shape===2?g.turn:0}/${g.filled}`;}
export type Puzzle={kind:ExtendedKind;size:number;target:number[];expected:number[];options:number[][];glyphs:Glyph[];targetGlyph:Glyph;turns:number;tiles:number[][];answer:number};
export function makePuzzle(kind:ExtendedKind,level:number,seed:number,rotationTurns=level):Puzzle {
  const r=rng(seed),size=level===3?4:3;
  const p:Puzzle={kind,size,target:[],expected:[],options:[],glyphs:[],targetGlyph:{shape:0,turn:0,filled:0,scale:1},turns:level,tiles:[],answer:0};
  if(kind==='detailSearch'){
    const shape=pick(r,4),turn=shape===1||shape===2?pick(r,4):0,filled=pick(r,2);
    p.targetGlyph={shape,turn,filled,scale:1};
    const count=[9,16,25][level-1];p.size=Math.sqrt(count);p.answer=pick(r,count);p.expected=[p.answer];
    const pool:Glyph[]=[];for(let sh=0;sh<4;sh++)for(let fi=0;fi<2;fi++)for(let tr=0;tr<(sh===1||sh===2?4:1);tr++){const g={shape:sh,turn:tr,filled:fi,scale:1};if(glyphKey(g)!==glyphKey(p.targetGlyph))pool.push(g);}
    const similar=pool.filter(g=>g.shape===shape||g.filled===filled);
    p.glyphs=Array.from({length:count},(_,i)=>i===p.answer?{...p.targetGlyph,scale:level===1?1:.8+r()*.3}:{...(level===1?pool:similar)[pick(r,level===1?pool.length:similar.length)],scale:level===1?1:.7+r()*.4});return p;
  }
  if(kind==='sequence') {p.target=shuffle(Array.from({length:size*size},(_,i)=>i),r).slice(0,level+2);p.expected=[...p.target];return p;}
  if(kind==='pattern'){p.target=mask(size,level+3,r);p.expected=[...p.target];return p;}
  if(kind==='blocks'){
    p.size=4;const codes=level===1?[1,3,7,15]:level===3?[3,5,6,9,10,12]:Array.from({length:14},(_,i)=>i+1);
    const tilePool=codes.map(code=>Array.from({length:4},(_,j)=>(code>>j)&1));
    const original=shuffle(tilePool,r).slice(0,4).map(t=>rotate(t,2,pick(r,4)));
    p.target=assemble(original);p.expected=[...p.target];p.tiles=shuffle(original,r).map(t=>rotate(t,2,level===1?0:pick(r,4)));return p;
  }
  // Exclude rotationally symmetric targets so the direction has a real effect.
  let target:number[];let tries=0;do{target=mask(size,level+3,r);tries++;}while(same(target,rotate(target,size,rotationTurns))&&tries<50);
  p.target=target;p.turns=rotationTurns;p.expected=rotate(target,size,rotationTurns);const alternatives=[p.expected];
  for(let k=0;k<4&&alternatives.length<4;k++){const o=rotate(target,size,k);if(!alternatives.some(a=>same(a,o)))alternatives.push(o);}
  while(alternatives.length<4){const o=mask(size,level+3,r);if(!alternatives.some(a=>same(a,o)))alternatives.push(o);}
  p.options=shuffle(alternatives,r);p.answer=p.options.findIndex(o=>same(o,p.expected));return p;
}
export function assemble(tiles:number[][]){const out=Array(16).fill(0);tiles.forEach((t,i)=>t.forEach((v,j)=>{const y=Math.floor(i/2)*2+Math.floor(j/2),x=(i%2)*2+j%2;out[y*4+x]=v;}));return out;}
export function trialSeed(seed:number,index:number){return (seed+Math.imul(index+1,2654435761))>>>0;}
export function makeExtendedAttempt(profileId:string,kind:ExtendedKind,mode:'assessment'|'practice',difficulty:number,viewport:ExtendedAttempt['viewport'],conditions:string):ExtendedAttempt{return {id:crypto.randomUUID(),profileId,date:new Date().toISOString(),kind,mode,version:kind==='rotation'&&mode==='assessment'?2:1,difficulty:mode==='assessment'?2:difficulty,total:mode==='assessment'?12:6,status:'incomplete',input:'unknown',trials:[],viewport,conditions,seed:crypto.getRandomValues(new Uint32Array(1))[0]};}

// The session seed fixes a balanced, reproducible schedule; v1 generation stays unchanged.
export function rotationSchedule(seed:number):number[]{return shuffle([1,1,1,1,2,2,2,2,3,3,3,3],rng(seed^0x524f5432));}
export function sessionPuzzle(a:{kind:ExtendedKind;difficulty:number;seed:number;version:number},index:number):Puzzle {
 const turns=a.kind==='rotation'&&a.version===2?rotationSchedule(a.seed)[index]:a.difficulty;
 return makePuzzle(a.kind,a.difficulty,trialSeed(a.seed,index),turns);
}
