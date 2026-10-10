import { labels, type Data, type Kind } from './vision.ts';
import { catalog, summary, type ExtendedKind } from './extended.ts';
import { suiteCatalog, taskSummary, type SuiteKind } from './suite.ts';

// The home page runs as four linear steps: profile, clicking games, webcam games, check-in.
export type FlowGame = { family: 'original'; kind: Kind } | { family: 'extended'; kind: ExtendedKind } | { family: 'suite'; kind: SuiteKind };
const original = (kind: Kind): FlowGame => ({ family: 'original', kind });
const extended = (kind: ExtendedKind): FlowGame => ({ family: 'extended', kind });
const suite = (kind: SuiteKind): FlowGame => ({ family: 'suite', kind });

export const gameGroups: { title: string; games: FlowGame[] }[] = [
  { title: 'Search & discrimination', games: [original('search'), extended('detailSearch'), suite('figureGround'), suite('closure'), suite('constancy')] },
  { title: 'Memory', games: [original('memory'), extended('sequence'), suite('workingMemory')] },
  { title: 'Spatial skills', games: [original('spatial'), extended('rotation'), extended('pattern'), extended('blocks')] },
  { title: 'Attention & comparison', games: [suite('selective'), suite('sustained'), suite('comparison')] },
];
export const clickingGames = gameGroups.flatMap(g => g.games);
export const webcamGames: FlowGame[] = (['fixation', 'pursuit', 'gazeShift', 'antiSaccade', 'readingGaze'] as const).map(suite);

export function gameKey(g: FlowGame) { return `${g.family}:${g.kind}`; }
export function gameTitle(g: FlowGame) { return g.family === 'original' ? labels[g.kind] : g.family === 'extended' ? catalog[g.kind].title : suiteCatalog[g.kind].title; }

export type GameStatus = { played: boolean; score?: { correct: number; total: number } };
/** Latest finished assessment of a game for one profile. Webcam games count as played when the measurement was unusable too. */
export function gameStatus(data: Data, profileId: string, g: FlowGame): GameStatus {
  const latest = <T extends { date: string }>(list: T[]) => list.sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (g.family === 'original') {
    const a = latest(data.attempts.filter(a => a.profileId === profileId && a.kind === g.kind && a.mode === 'assessment' && a.status === 'complete'));
    return a ? { played: true, score: { correct: a.correct, total: a.total } } : { played: false };
  }
  if (g.family === 'extended') {
    const a = latest(data.extended.filter(a => a.profileId === profileId && a.kind === g.kind && a.mode === 'assessment' && a.status === 'complete'));
    return a ? { played: true, score: { correct: summary(a).correct, total: a.total } } : { played: false };
  }
  const camera = suiteCatalog[g.kind].group === 'camera';
  const r = latest(data.suite.filter(r => r.profileId === profileId && r.kind === g.kind && (r.status === 'complete' || (camera && r.status === 'unusable'))));
  if (!r) return { played: false };
  return camera ? { played: true } : { played: true, score: { correct: taskSummary(r).correct, total: r.trials.length } };
}

export function flowScore(data: Data, profileId: string) {
  let correct = 0, total = 0;
  for (const g of clickingGames) { const s = gameStatus(data, profileId, g).score; if (s) { correct += s.correct; total += s.total; } }
  return { correct, total, percent: total ? Math.round(correct / total * 100) : 0 };
}

/** The first game in the list that has not been played or skipped. */
export function nextGame(data: Data, profileId: string, games: FlowGame[], skipped: Set<string> = new Set()) {
  return games.find(g => !skipped.has(gameKey(g)) && !gameStatus(data, profileId, g).played);
}

export type FlowProgress = { step: 1 | 2 | 3 | 4 | 5; done: number; total: number; games: number; webcam: number };
/** Step 5 means all four steps are done. A skipped webcam step counts as done. */
export function flowProgress(data: Data, profileId: string | undefined, webcamSkipped: boolean): FlowProgress {
  const total = 1 + clickingGames.length + webcamGames.length + 1;
  if (!profileId || !data.profiles.some(p => p.id === profileId)) return { step: 1, done: 0, total, games: 0, webcam: 0 };
  const games = clickingGames.filter(g => gameStatus(data, profileId, g).played).length;
  const webcam = webcamGames.filter(g => gameStatus(data, profileId, g).played).length;
  const checked = data.checks.some(c => c.profileId === profileId);
  const webcamDone = webcamSkipped || webcam === webcamGames.length;
  const step = games < clickingGames.length ? 2 : !webcamDone ? 3 : !checked ? 4 : 5;
  return { step, done: 1 + games + (webcamSkipped ? webcamGames.length : webcam) + (checked ? 1 : 0), total, games, webcam };
}

// "Skip webcam games" is a per-profile convenience kept in browser storage, outside IndexedDB and backups.
export const webcamSkipKey = 'little-lens-webcam-skipped';
type SkipStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function browserStore(): SkipStore | undefined { try { return globalThis.localStorage; } catch { return undefined; } }
export function readWebcamSkips(store = browserStore()): string[] {
  try { const ids = JSON.parse(store?.getItem(webcamSkipKey) || '[]'); return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []; } catch { return []; }
}
function writeWebcamSkips(ids: string[], store = browserStore()) {
  try { if (ids.length) store?.setItem(webcamSkipKey, JSON.stringify(ids)); else store?.removeItem(webcamSkipKey); } catch { /* the skip is only a convenience */ }
  return ids;
}
export function setWebcamSkip(profileId: string, skip: boolean, store = browserStore()) {
  const rest = readWebcamSkips(store).filter(id => id !== profileId);
  return writeWebcamSkips(skip ? [...rest, profileId] : rest, store);
}
/** Forget skip preferences when profiles are deleted, so a restored backup never inherits a stale skip. */
export function forgetWebcamSkips(profileIds: string[] | 'all', store = browserStore()) {
  return writeWebcamSkips(profileIds === 'all' ? [] : readWebcamSkips(store).filter(id => !profileIds.includes(id)), store);
}
