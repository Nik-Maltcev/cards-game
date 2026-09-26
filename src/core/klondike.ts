import { Card, SUITS, sameColor } from './cards';

export interface TableauEntry {
  card: Card;
  faceUp: boolean;
}

export type Location =
  | { pile: 'tableau'; index: number }
  | { pile: 'waste' }
  | { pile: 'foundation'; index: number };

export type Move =
  | { type: 'draw' }
  | { type: 'resetStock'; recycled: Card[] }
  | {
      type: 'move';
      from: Location;
      to: Location;
      count: number;
      flipped: boolean;
    };

export interface GameState {
  tableau: TableauEntry[][];
  foundations: Card[][];
  stock: Card[];
  waste: Card[];
  drawCount: 1 | 3;
  stockPassesLeft: number;
  moves: number;
  history: Move[];
  seed: number;
  won: boolean;
}

export const MAX_PASSES_DRAW3 = 3;

export function foundationIndex(card: Card): number {
  return SUITS.indexOf(card.suit);
}

export function canPlaceOnFoundation(state: GameState, card: Card): boolean {
  const idx = foundationIndex(card);
  const f = state.foundations[idx];
  if (f.length === 0) return card.rank === 1;
  return f[f.length - 1].rank === card.rank - 1;
}

export function canPlaceOnTableau(state: GameState, card: Card, index: number): boolean {
  const pile = state.tableau[index];
  if (pile.length === 0) return card.rank === 13;
  const top = pile[pile.length - 1];
  if (!top.faceUp) return false;
  return !sameColor(top.card, card) && top.card.rank === card.rank + 1;
}

export function tableauMovableCount(state: GameState, index: number): number {
  const pile = state.tableau[index];
  let count = 0;
  for (let i = pile.length - 1; i >= 0; i--) {
    if (!pile[i].faceUp) break;
    if (i < pile.length - 1) {
      const above = pile[i + 1];
      if (sameColor(pile[i].card, above.card) || pile[i].card.rank !== above.card.rank + 1) break;
    }
    count++;
  }
  return count;
}

export function getMovableCards(state: GameState, from: Location, count?: number): Card[] | null {
  if (from.pile === 'waste') {
    return state.waste.length ? [state.waste[state.waste.length - 1]] : null;
  }
  if (from.pile === 'foundation') {
    const f = state.foundations[from.index];
    return f.length ? [f[f.length - 1]] : null;
  }
  const pile = state.tableau[from.index];
  if (!pile.length) return null;
  const movable = tableauMovableCount(state, from.index);
  const take = count === undefined ? movable : Math.min(count, movable);
  if (take <= 0) return null;
  return pile.slice(pile.length - take).map((e) => e.card);
}

export function topCard(state: GameState, from: Location): Card | null {
  if (from.pile === 'waste') return state.waste[state.waste.length - 1] ?? null;
  if (from.pile === 'foundation') {
    const f = state.foundations[from.index];
    return f[f.length - 1] ?? null;
  }
  const top = state.tableau[from.index][state.tableau[from.index].length - 1];
  return top && top.faceUp ? top.card : null;
}

export function canMove(state: GameState, from: Location, to: Location, takeCount?: number): boolean {
  if (from.pile === to.pile && from.pile !== 'tableau') return false;
  if (from.pile === 'tableau' && to.pile === 'tableau' && from.index === to.index) return false;
  if (to.pile === 'foundation') {
    if (from.pile === 'foundation') return false;
    if (takeCount !== undefined && takeCount !== 1) return false;
    const card = topCard(state, from);
    if (!card) return false;
    return foundationIndex(card) === to.index && canPlaceOnFoundation(state, card);
  }
  if (to.pile === 'waste') return false;
  if (from.pile === 'foundation') return false;
  const cards = getMovableCards(state, from, takeCount);
  if (!cards || !cards.length) return false;
  if (takeCount !== undefined && takeCount !== cards.length) return false;
  return canPlaceOnTableau(state, cards[0], to.index);
}

export function applyMove(state: GameState, from: Location, to: Location, takeCount?: number): boolean {
  if (!canMove(state, from, to, takeCount)) return false;
  const count = to.pile === 'foundation' ? 1 : takeCount ?? getMovableCards(state, from)!.length;
  const cards = getMovableCards(state, from, count)!;
  let flipped = false;

  if (from.pile === 'waste') {
    state.waste.pop();
  } else if (from.pile === 'foundation') {
    state.foundations[from.index].pop();
  } else {
    const pile = state.tableau[from.index];
    pile.splice(pile.length - cards.length, cards.length);
    if (pile.length && !pile[pile.length - 1].faceUp) {
      pile[pile.length - 1].faceUp = true;
      flipped = true;
    }
  }

  if (to.pile === 'foundation') {
    state.foundations[to.index].push(cards[0]);
  } else if (to.pile === 'tableau') {
    for (const c of cards) state.tableau[to.index].push({ card: c, faceUp: true });
  }

  state.history.push({ type: 'move', from, to, count: cards.length, flipped });
  state.moves++;
  checkWin(state);
  return true;
}

export function drawFromStock(state: GameState): boolean {
  if (state.stock.length === 0) {
    if (state.waste.length === 0) return false;
    const recycled = state.waste.slice().reverse();
    state.stock = recycled;
    state.waste = [];
    if (state.drawCount === 3 && state.stockPassesLeft > 0) state.stockPassesLeft--;
    state.history.push({ type: 'resetStock', recycled });
    state.moves++;
    return true;
  }
  const n = Math.min(state.drawCount, state.stock.length);
  for (let i = 0; i < n; i++) {
    state.waste.push(state.stock.pop()!);
  }
  state.history.push({ type: 'draw' });
  state.moves++;
  return true;
}

export function undo(state: GameState): boolean {
  const move = state.history.pop();
  if (!move) return false;
  state.moves = Math.max(0, state.moves - 1);

  if (move.type === 'draw') {
    const n = Math.min(state.drawCount, state.waste.length);
    for (let i = 0; i < n; i++) state.stock.push(state.waste.pop()!);
    return true;
  }
  if (move.type === 'resetStock') {
    state.waste = move.recycled.slice().reverse();
    state.stock = [];
    if (state.drawCount === 3) state.stockPassesLeft++;
    return true;
  }

  const { from, to, count, flipped } = move;
  if (to.pile === 'waste') return false;
  let cards: Card[];
  if (to.pile === 'foundation') {
    cards = [state.foundations[to.index].pop()!];
  } else {
    const pile = state.tableau[to.index];
    cards = pile.splice(pile.length - count, count).map((e) => e.card);
  }

  if (from.pile === 'waste') {
    state.waste.push(cards[0]);
  } else if (from.pile === 'foundation') {
    state.foundations[from.index].push(cards[0]);
  } else {
    const pile = state.tableau[from.index];
    if (flipped && pile.length) pile[pile.length - 1].faceUp = false;
    for (const c of cards) pile.push({ card: c, faceUp: true });
  }
  state.won = false;
  return true;
}

export function checkWin(state: GameState): boolean {
  state.won = state.foundations.every((f) => f.length === 13);
  return state.won;
}

export function foundationComplete(state: GameState): boolean {
  return state.foundations.every((f) => f.length === 13);
}

export function allFaceUp(state: GameState): boolean {
  return state.tableau.every((pile) => pile.every((e) => e.faceUp)) && state.stock.length === 0;
}

export function autoMoveToFoundation(state: GameState, card: Card): boolean {
  const from = findCardLocation(state, card);
  if (!from) return false;
  const to: Location = { pile: 'foundation', index: foundationIndex(card) };
  return applyMove(state, from, to);
}

export function findCardLocation(state: GameState, card: Card): Location | null {
  if (state.waste.length) {
    const top = state.waste[state.waste.length - 1];
    if (top.suit === card.suit && top.rank === card.rank) return { pile: 'waste' };
  }
  for (let i = 0; i < state.tableau.length; i++) {
    const pile = state.tableau[i];
    const top = pile[pile.length - 1];
    if (top && top.faceUp && top.card.suit === card.suit && top.card.rank === card.rank) {
      return { pile: 'tableau', index: i };
    }
  }
  return null;
}

export type Hint =
  | { type: 'move'; from: Location; to: Location }
  | { type: 'draw' };

export function findHint(state: GameState): Hint | null {
  const candidates: { hint: Hint; score: number }[] = [];

  const sources: Location[] = [];
  if (state.waste.length) sources.push({ pile: 'waste' });
  for (let i = 0; i < 7; i++) {
    if (state.tableau[i].some((e) => e.faceUp)) sources.push({ pile: 'tableau', index: i });
  }

  for (const from of sources) {
    for (let fi = 0; fi < 4; fi++) {
      const to: Location = { pile: 'foundation', index: fi };
      if (canMove(state, from, to)) {
        candidates.push({ hint: { type: 'move', from, to }, score: 100 });
      }
    }
    for (let ti = 0; ti < 7; ti++) {
      const to: Location = { pile: 'tableau', index: ti };
      if (!canMove(state, from, to)) continue;
      const cards = getMovableCards(state, from)!;
      let score = 10;
      if (from.pile === 'tableau') {
        const pile = state.tableau[from.index];
        const hidden = pile.length - cards.length;
        if (hidden > 0 && !pile[pile.length - cards.length - 1]?.faceUp) score += 40;
        if (pile.length === cards.length) {
          const targetPile = state.tableau[ti];
          if (targetPile.length === 0 && cards[0].rank === 13 && from.index !== ti) score += 5;
          else if (targetPile.length === 0) score -= 50;
        }
      } else {
        score += 20;
      }
      candidates.push({ hint: { type: 'move', from, to }, score });
    }
  }

  const canDraw =
    state.stock.length > 0 ||
    (state.waste.length > 0 && (state.drawCount === 1 || state.stockPassesLeft > 1));
  if (canDraw) {
    candidates.push({ hint: { type: 'draw' }, score: 1 });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].hint;
}
