import { Card, isRed } from './cards';
import { GameState, applyMove, drawFromStock, foundationIndex } from './klondike';

/**
 * DFS solvability checker with make/unmake moves, wall-clock budget, and
 * solution path recording (used for verification and in-game auto-complete).
 */

interface SimState {
  tableau: { card: Card; faceUp: boolean }[][];
  foundations: number[];
  stock: Card[]; // pops from end
  waste: Card[];
  drawCount: 1 | 3;
}

export type SolMove =
  | { k: 'f-waste' } // waste top -> its foundation
  | { k: 'f-tab'; t: number } // tableau[t] top -> its foundation
  | { k: 'w2t'; to: number } // waste top -> tableau[to]
  | { k: 't2t'; from: number; take: number; to: number }
  | { k: 'draw' }
  | { k: 'recycle' };

export interface SolveResult {
  solvable: boolean;
  timedOut: boolean;
  nodes: number;
  solution: SolMove[] | null;
}

function toSim(state: GameState): SimState {
  return {
    tableau: state.tableau.map((p) => p.map((e) => ({ card: e.card, faceUp: e.faceUp }))),
    foundations: state.foundations.map((f) => f.length),
    stock: state.stock.slice(),
    waste: state.waste.slice(),
    drawCount: state.drawCount,
  };
}

function serialize(s: SimState): string {
  let out = '';
  for (const pile of s.tableau) {
    for (const e of pile) out += `${e.card.rank}${e.card.suit}${e.faceUp ? 'u' : 'd'}`;
    out += '|';
  }
  out += `#${s.foundations.join('')}#${s.stock.length}#`;
  for (const c of s.waste) out += `${c.rank}${c.suit}`;
  return out;
}

type UndoFn = () => void;

export function checkSolvable(state: GameState, opts: { timeBudgetMs?: number; nodeBudget?: number } = {}): SolveResult {
  const timeBudgetMs = opts.timeBudgetMs ?? 300;
  const nodeBudget = opts.nodeBudget ?? 200000;
  const s = toSim(state);
  const visited = new Set<string>();
  const start = Date.now();
  let nodes = 0;
  let timedOut = false;
  const path: SolMove[] = [];
  const undos: UndoFn[] = [];

  function canFoundation(card: Card): boolean {
    return s.foundations[foundationIndex(card)] === card.rank - 1;
  }
  function minFoundation(): number {
    return Math.min(s.foundations[0], s.foundations[1], s.foundations[2], s.foundations[3]);
  }
  function movableRun(pile: { card: Card; faceUp: boolean }[]): number {
    let count = 0;
    for (let i = pile.length - 1; i >= 0; i--) {
      if (!pile[i].faceUp) break;
      if (i < pile.length - 1) {
        const above = pile[i + 1];
        if (isRed(pile[i].card) === isRed(above.card) || pile[i].card.rank !== above.card.rank + 1) break;
      }
      count++;
    }
    return count;
  }
  function tableauAccepts(t: number, card: Card): boolean {
    const pile = s.tableau[t];
    if (pile.length === 0) return card.rank === 13;
    const top = pile[pile.length - 1];
    return top.faceUp && isRed(top.card) !== isRed(card) && top.card.rank === card.rank + 1;
  }

  function apply(m: SolMove): boolean {
    switch (m.k) {
      case 'f-waste': {
        if (!s.waste.length) return false;
        const c = s.waste[s.waste.length - 1];
        if (!canFoundation(c)) return false;
        s.waste.pop();
        s.foundations[foundationIndex(c)]++;
        undos.push(() => {
          s.foundations[foundationIndex(c)]--;
          s.waste.push(c);
        });
        path.push(m);
        return true;
      }
      case 'f-tab': {
        const pile = s.tableau[m.t];
        const top = pile[pile.length - 1];
        if (!top || !top.faceUp || !canFoundation(top.card)) return false;
        const c = top.card;
        pile.pop();
        let flipped = false;
        if (pile.length && !pile[pile.length - 1].faceUp) {
          pile[pile.length - 1].faceUp = true;
          flipped = true;
        }
        s.foundations[foundationIndex(c)]++;
        undos.push(() => {
          s.foundations[foundationIndex(c)]--;
          pile.push({ card: c, faceUp: true });
          if (flipped) pile[pile.length - 2].faceUp = false;
        });
        path.push(m);
        return true;
      }
      case 'w2t': {
        if (!s.waste.length) return false;
        const c = s.waste[s.waste.length - 1];
        if (!tableauAccepts(m.to, c)) return false;
        s.waste.pop();
        s.tableau[m.to].push({ card: c, faceUp: true });
        undos.push(() => {
          s.tableau[m.to].pop();
          s.waste.push(c);
        });
        path.push(m);
        return true;
      }
      case 't2t': {
        const pile = s.tableau[m.from];
        if (pile.length < m.take) return false;
        const startIdx = pile.length - m.take;
        const moved = pile.splice(startIdx, m.take);
        if (!tableauAccepts(m.to, moved[0].card)) {
          pile.push(...moved);
          return false;
        }
        let flipped = false;
        if (pile.length && !pile[pile.length - 1].faceUp) {
          pile[pile.length - 1].faceUp = true;
          flipped = true;
        }
        s.tableau[m.to].push(...moved);
        undos.push(() => {
          s.tableau[m.to].splice(s.tableau[m.to].length - m.take, m.take);
          if (flipped) pile[pile.length - 1].faceUp = false;
          pile.push(...moved);
        });
        path.push(m);
        return true;
      }
      case 'draw': {
        if (!s.stock.length) return false;
        const n = Math.min(s.drawCount, s.stock.length);
        const drawn: Card[] = [];
        for (let i = 0; i < n; i++) {
          const c = s.stock.pop()!;
          drawn.push(c);
          s.waste.push(c);
        }
        undos.push(() => {
          for (let i = drawn.length - 1; i >= 0; i--) {
            s.waste.pop();
            s.stock.push(drawn[i]);
          }
        });
        path.push(m);
        return true;
      }
      case 'recycle': {
        if (s.stock.length || !s.waste.length) return false;
        const n = s.waste.length;
        undos.push(() => {
          for (let i = 0; i < n; i++) s.waste.push(s.stock.pop()!);
        });
        for (let i = 0; i < n; i++) s.stock.push(s.waste.pop()!);
        path.push(m);
        return true;
      }
    }
  }

  function unapply() {
    const u = undos.pop();
    path.pop();
    if (u) u();
  }

  function isWon(): boolean {
    return s.foundations[0] === 13 && s.foundations[1] === 13 && s.foundations[2] === 13 && s.foundations[3] === 13;
  }

  function dfs(): boolean {
    if (timedOut) return false;
    if (++nodes % 512 === 0 && Date.now() - start > timeBudgetMs) {
      timedOut = true;
      return false;
    }
    if (nodes > nodeBudget) {
      timedOut = true;
      return false;
    }
    if (isWon()) return true;
    const key = serialize(s);
    if (visited.has(key)) return false;
    visited.add(key);

    const frameBase = path.length;

    // greedy safe foundation plays
    let progress = true;
    while (progress) {
      progress = false;
      const minF = minFoundation();
      const safe = (c: Card) => c.rank <= 2 || c.rank - 1 <= minF + 1;
      if (s.waste.length && canFoundation(s.waste[s.waste.length - 1]) && safe(s.waste[s.waste.length - 1])) {
        apply({ k: 'f-waste' });
        progress = true;
        continue;
      }
      for (let t = 0; t < 7; t++) {
        const pile = s.tableau[t];
        const top = pile[pile.length - 1];
        if (top && top.faceUp && canFoundation(top.card) && safe(top.card)) {
          apply({ k: 'f-tab', t });
          progress = true;
          break;
        }
      }
    }
    if (isWon()) return true;
    if (timedOut) {
      while (path.length > frameBase) unapply();
      return false;
    }

    // waste -> tableau
    if (s.waste.length) {
      const card = s.waste[s.waste.length - 1];
      for (let t = 0; t < 7; t++) {
        if (!tableauAccepts(t, card)) continue;
        if (apply({ k: 'w2t', to: t })) {
          if (dfs()) return true;
          unapply();
        }
      }
    }

    // tableau -> tableau (only useful moves: uncover a card or free a pile)
    for (let from = 0; from < 7; from++) {
      const pile = s.tableau[from];
      if (!pile.length) continue;
      const run = movableRun(pile);
      for (let take = run; take >= 1; take--) {
        const startIdx = pile.length - take;
        const uncovers = startIdx > 0 && !pile[startIdx - 1].faceUp;
        const freesPile = startIdx === 0;
        if (!uncovers && !freesPile && take !== run) continue;
        for (let to = 0; to < 7; to++) {
          if (to === from) continue;
          if (s.tableau[to].length === 0 && !uncovers) continue; // pointless shift to empty
          if (apply({ k: 't2t', from, take, to })) {
            if (dfs()) return true;
            unapply();
          }
        }
      }
    }

    // draw / recycle
    if (s.stock.length) {
      if (apply({ k: 'draw' })) {
        if (dfs()) return true;
        unapply();
      }
    } else if (s.waste.length) {
      if (apply({ k: 'recycle' })) {
        if (dfs()) return true;
        unapply();
      }
    }

    while (path.length > frameBase) unapply();
    return false;
  }

  const solvable = dfs();
  return {
    solvable,
    timedOut,
    nodes,
    solution: solvable ? path.slice() : null,
  };
}

export function isSolvable(state: GameState, _nodeBudget = 30000, timeBudgetMs = 300): boolean {
  return checkSolvable(state, { timeBudgetMs, nodeBudget: _nodeBudget }).solvable;
}

/** Replays a recorded solution onto a GameState (used by auto-complete and tests). */
export function playSolution(state: GameState, solution: SolMove[]): boolean {
  for (const m of solution) {
    let ok = false;
    switch (m.k) {
      case 'f-waste': {
        const c = state.waste[state.waste.length - 1];
        ok = !!c && applyMove(state, { pile: 'waste' }, { pile: 'foundation', index: foundationIndex(c) });
        break;
      }
      case 'f-tab': {
        const pile = state.tableau[m.t];
        const top = pile[pile.length - 1];
        ok = !!top && applyMove(state, { pile: 'tableau', index: m.t }, { pile: 'foundation', index: foundationIndex(top.card) });
        break;
      }
      case 'w2t':
        ok = applyMove(state, { pile: 'waste' }, { pile: 'tableau', index: m.to });
        break;
      case 't2t':
        ok = applyMove(state, { pile: 'tableau', index: m.from }, { pile: 'tableau', index: m.to }, m.take);
        break;
      case 'draw':
      case 'recycle':
        ok = drawFromStock(state);
        break;
    }
    if (!ok) return false;
  }
  return state.won;
}
