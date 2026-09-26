import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, shuffle } from '../src/core/rng';
import { Card, fullDeck, SUITS, cardId } from '../src/core/cards';
import { stateFromSeed } from '../src/core/generator';
import {
  applyMove,
  canPlaceOnFoundation,
  canPlaceOnTableau,
  checkWin,
  drawFromStock,
  findHint,
  foundationIndex,
  GameState,
  getMovableCards,
  MAX_PASSES_DRAW3,
  tableauMovableCount,
  undo,
} from '../src/core/klondike';

const card = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

function emptyState(drawCount: 1 | 3 = 1): GameState {
  return {
    tableau: Array.from({ length: 7 }, () => []),
    foundations: [[], [], [], []],
    stock: [],
    waste: [],
    drawCount,
    stockPassesLeft: MAX_PASSES_DRAW3,
    moves: 0,
    history: [],
    seed: 0,
    won: false,
  };
}

const dealIds = (state: GameState): string[] => [
  ...state.tableau.flat().map((e) => cardId(e.card)),
  ...state.stock.map(cardId),
  ...state.waste.map(cardId),
  ...state.foundations.flat().map(cardId),
];

describe('rng', () => {
  it('is deterministic and stays in [0,1)', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const seqA = Array.from({ length: 20 }, a);
    const seqB = Array.from({ length: 20 }, b);
    assert.deepEqual(seqA, seqB);
    assert.ok(seqA.every((v) => v >= 0 && v < 1));
    assert.notDeepEqual(seqA, Array.from({ length: 20 }, mulberry32(124)));
  });

  it('shuffle keeps every card exactly once', () => {
    const out = shuffle(fullDeck(), mulberry32(7));
    assert.equal(out.length, 52);
    assert.deepEqual([...out].map(cardId).sort(), fullDeck().map(cardId).sort());
    assert.deepEqual(shuffle(fullDeck(), mulberry32(7)).map(cardId), out.map(cardId));
  });
});

describe('deal shape', () => {
  it('has 52 unique cards in the Klondike triangle', () => {
    const state = stateFromSeed(42, 1);
    assert.deepEqual(
      state.tableau.map((p) => p.length),
      [1, 2, 3, 4, 5, 6, 7]
    );
    assert.equal(new Set(dealIds(state)).size, 52);
    assert.equal(dealIds(state).length, 52);
    assert.equal(state.stock.length, 24);
    assert.equal(state.waste.length, 0);
    assert.equal(state.foundations.length, 4);
    assert.equal(state.drawCount, 1);
    assert.equal(state.won, false);
  });

  it('turns exactly one card face-up per tableau pile', () => {
    const state = stateFromSeed(4242, 1);
    for (const pile of state.tableau) assert.equal(pile.filter((e) => e.faceUp).length, 1);
  });

  it('is reproducible from the same seed', () => {
    assert.equal(JSON.stringify(stateFromSeed(9, 3)), JSON.stringify(stateFromSeed(9, 3)));
    assert.notEqual(JSON.stringify(stateFromSeed(9, 3)), JSON.stringify(stateFromSeed(10, 3)));
  });
});

describe('stock', () => {
  it('draw-1 moves one card per click', () => {
    const state = stateFromSeed(11, 1);
    assert.ok(drawFromStock(state));
    assert.equal(state.waste.length, 1);
    assert.equal(state.stock.length, 23);
  });

  it('draw-3 moves three cards per click', () => {
    const state = stateFromSeed(11, 3);
    assert.ok(drawFromStock(state));
    assert.equal(state.waste.length, 3);
    assert.equal(state.stock.length, 21);
    drawFromStock(state);
    drawFromStock(state);
    assert.equal(state.waste.length, 9);
    assert.equal(state.stock.length, 15);
  });

  it('recycles the waste back into the stock', () => {
    const state = stateFromSeed(11, 1);
    const first = state.stock[state.stock.length - 1];
    for (let i = 0; i < 24; i++) drawFromStock(state);
    assert.equal(state.stock.length, 0);
    assert.equal(state.waste.length, 24);
    const passesBefore = state.stockPassesLeft;
    assert.ok(drawFromStock(state));
    assert.equal(state.stock.length, 24);
    assert.equal(state.waste.length, 0);
    assert.equal(state.stock[state.stock.length - 1].suit, first.suit);
    assert.equal(state.stock[state.stock.length - 1].rank, first.rank);
    assert.equal(state.stockPassesLeft, passesBefore, 'draw-1 has unlimited passes');
  });

  it('draw-3 consumes one pass per recycle', () => {
    const state = stateFromSeed(11, 3);
    const before = state.stockPassesLeft;
    for (let i = 0; i < 8; i++) drawFromStock(state);
    assert.equal(state.stock.length, 0);
    drawFromStock(state);
    assert.equal(state.stock.length, 24);
    assert.equal(state.stockPassesLeft, before - 1);
  });
});

describe('placement rules', () => {
  it('foundation accepts only the ace, then ascending', () => {
    const state = emptyState();
    assert.equal(canPlaceOnFoundation(state, card(1, 'S')), true);
    assert.equal(canPlaceOnFoundation(state, card(2, 'S')), false);
    state.foundations[foundationIndex(card(1, 'S'))].push(card(1, 'S'));
    assert.equal(canPlaceOnFoundation(state, card(2, 'S')), true);
    assert.equal(canPlaceOnFoundation(state, card(3, 'S')), false);
    assert.equal(canPlaceOnFoundation(state, card(1, 'H')), true, 'other suits start independently');
  });

  it('tableau accepts kings on empty piles and alternating descending runs', () => {
    const state = emptyState();
    assert.equal(canPlaceOnTableau(state, card(13, 'S'), 0), true);
    assert.equal(canPlaceOnTableau(state, card(12, 'S'), 0), false);
    state.tableau[1] = [{ card: card(7, 'S'), faceUp: true }];
    assert.equal(canPlaceOnTableau(state, card(6, 'H'), 1), true);
    assert.equal(canPlaceOnTableau(state, card(6, 'C'), 1), false, 'same colour rejected');
    assert.equal(canPlaceOnTableau(state, card(5, 'H'), 1), false, 'rank gap rejected');
    state.tableau[2] = [{ card: card(7, 'S'), faceUp: false }];
    assert.equal(canPlaceOnTableau(state, card(6, 'H'), 2), false, 'face-down top rejected');
  });

  it('movable run stops at the first broken link', () => {
    const state = emptyState();
    state.tableau[0] = [
      { card: card(9, 'S'), faceUp: false },
      { card: card(8, 'H'), faceUp: true },
      { card: card(7, 'S'), faceUp: true },
      { card: card(6, 'S'), faceUp: true },
    ];
    assert.equal(tableauMovableCount(state, 0), 1, '7S->6S is same colour, so only the 6S moves');
    assert.equal(getMovableCards(state, { pile: 'tableau', index: 0 })?.length, 1);
    state.tableau[0][3] = { card: card(6, 'H'), faceUp: true };
    assert.equal(tableauMovableCount(state, 0), 3, '8H-7S-6H is a legal alternating run');
    assert.deepEqual(getMovableCards(state, { pile: 'tableau', index: 0 })?.map(cardId), ['8H', '7S', '6H']);
  });
});

describe('moves and undo', () => {
  it('undo rewinds every move back to the deal', () => {
    const state = stateFromSeed(777, 1);
    const snapshot = JSON.stringify({ t: state.tableau, s: state.stock, w: state.waste, f: state.foundations });
    let applied = 0;
    for (let i = 0; i < 12; i++) {
      const hint = findHint(state);
      if (!hint) break;
      if (hint.type === 'draw') drawFromStock(state);
      else applyMove(state, hint.from, hint.to);
      applied++;
    }
    assert.ok(applied > 0, 'a fresh deal offers at least one action');
    for (let i = 0; i < applied; i++) assert.equal(undo(state), true);
    assert.equal(JSON.stringify({ t: state.tableau, s: state.stock, w: state.waste, f: state.foundations }), snapshot);
  });

  it('rejects illegal moves without touching the state', () => {
    const state = emptyState();
    state.tableau[0] = [{ card: card(5, 'S'), faceUp: true }];
    state.tableau[1] = [{ card: card(4, 'S'), faceUp: true }];
    const before = JSON.stringify(state);
    assert.equal(applyMove(state, { pile: 'tableau', index: 0 }, { pile: 'tableau', index: 1 }), false);
    assert.equal(applyMove(state, { pile: 'tableau', index: 0 }, { pile: 'waste' }), false);
    assert.equal(JSON.stringify(state), before);
  });

  it('flips the exposed card after a tableau move', () => {
    const state = emptyState();
    state.tableau[0] = [
      { card: card(6, 'S'), faceUp: false },
      { card: card(5, 'H'), faceUp: true },
    ];
    state.tableau[1] = [{ card: card(6, 'S'), faceUp: true }];
    assert.ok(applyMove(state, { pile: 'tableau', index: 0 }, { pile: 'tableau', index: 1 }));
    assert.equal(state.tableau[0][0].faceUp, true);
    assert.equal(state.tableau[1].length, 2);
  });

  it('recognises a completed game only when all 52 cards are on the foundations', () => {
    const state = emptyState();
    assert.equal(checkWin(state), false);
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank++) state.foundations[foundationIndex(card(rank as Card['rank'], suit))].push(card(rank as Card['rank'], suit));
    }
    assert.equal(checkWin(state), true);
    assert.equal(state.won, true);
  });
});
