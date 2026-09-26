export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RED_SUITS: Suit[] = ['H', 'D'];

export const SUIT_SYMBOL: Record<Suit, string> = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };
export const RANK_LABEL: Record<number, string> = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K',
};

export function cardId(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function isRed(card: Card): boolean {
  return RED_SUITS.includes(card.suit);
}

export function sameColor(a: Card, b: Card): boolean {
  return isRed(a) === isRed(b);
}

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ suit, rank: rank as Rank });
    }
  }
  return deck;
}
