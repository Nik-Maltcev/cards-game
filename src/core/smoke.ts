import { generateDeal } from './generator';
import { checkSolvable, isSolvable, playSolution } from './solver';
import { applyMove, drawFromStock, findHint, undo } from './klondike';
import { SUITS } from './cards';

let failures = 0;
function check(name: string, ok: boolean) {
  if (!ok) {
    failures++;
    console.error(`FAIL: ${name}`);
  } else {
    console.log(`ok: ${name}`);
  }
}

// 1. draw-1: every generated deal must be independently solver-verified
{
  const N = 100;
  let solved = 0;
  let slowest = 0;
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const ts = Date.now();
    const { state } = generateDeal(1000 + i * 7919, 1, 1500);
    slowest = Math.max(slowest, Date.now() - ts);
    if (isSolvable(state, 200000, 1000)) solved++;
  }
  const ms = Date.now() - t0;
  console.log(`   draw-1: ${ms}ms total, ${(ms / N).toFixed(1)}ms/deal avg, slowest ${slowest}ms`);
  check(`draw-1 solvable ${solved}/${N}`, solved === N);
}

// 2. draw-3 (unlimited passes): generated deals must be solver-verified
{
  const N = 30;
  let solved = 0;
  let slowest = 0;
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const ts = Date.now();
    const { state } = generateDeal(50000 + i * 104729, 3, 1500);
    slowest = Math.max(slowest, Date.now() - ts);
    if (isSolvable(state, 400000, 2000)) solved++;
  }
  const ms = Date.now() - t0;
  console.log(`   draw-3: ${ms}ms total, ${(ms / N).toFixed(0)}ms/deal avg, slowest ${slowest}ms`);
  check(`draw-3 solvable ${solved}/${N}`, solved === N);
}

// 3. deal shape invariants
{
  const { state } = generateDeal(42, 1);
  const counts = state.tableau.map((p) => p.length);
  check(`tableau sizes 1..7: ${counts.join(',')}`, counts.join(',') === '1,2,3,4,5,6,7');
  check('exactly one face-up per pile', state.tableau.every((p) => p.filter((e) => e.faceUp).length === 1));
  const total =
    state.tableau.flat().length + state.stock.length + state.waste.length + state.foundations.flat().length;
  check(`52 cards total (got ${total})`, total === 52);
  const ids = new Set<string>();
  for (const p of state.tableau) for (const e of p) ids.add(`${e.card.rank}${e.card.suit}`);
  for (const c of state.stock) ids.add(`${c.rank}${c.suit}`);
  check(`52 unique cards (got ${ids.size})`, ids.size === 52);
  check(`suits order stable: ${SUITS.join('')}`, SUITS.join('') === 'SHDC');
}

// 4. moves / undo round-trip
{
  const { state } = generateDeal(777, 1);
  const snap = JSON.stringify({ t: state.tableau, s: state.stock, w: state.waste, f: state.foundations });
  let did = 0;
  for (let i = 0; i < 10; i++) {
    const hint = findHint(state);
    if (!hint) break;
    if (hint.type === 'draw') {
      drawFromStock(state);
    } else {
      applyMove(state, hint.from, hint.to);
    }
    did++;
  }
  for (let i = 0; i < did; i++) undo(state);
  const snap2 = JSON.stringify({ t: state.tableau, s: state.stock, w: state.waste, f: state.foundations });
  check(`undo restores state after ${did} moves`, snap === snap2);
  check('hint available after undo cycle', findHint(state) !== null);
}

// 5. solver solution must replay to a win on the real GameState
{
  const { state } = generateDeal(31337, 1);
  const result = checkSolvable(state, { timeBudgetMs: 2000, nodeBudget: 400000 });
  check('solver returns a solution path', result.solvable && !!result.solution);
  if (result.solution) {
    const won = playSolution(state, result.solution);
    check(`solution replays to win (moves=${result.solution.length}, won=${won})`, won);
  }
}

// 5b. same for a draw-3 deal
{
  const { state } = generateDeal(999001, 3);
  const result = checkSolvable(state, { timeBudgetMs: 3000, nodeBudget: 600000 });
  check('draw-3 solver returns a solution path', result.solvable && !!result.solution);
  if (result.solution) {
    const won = playSolution(state, result.solution);
    check(`draw-3 solution replays to win (moves=${result.solution.length}, won=${won})`, won);
  }
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
