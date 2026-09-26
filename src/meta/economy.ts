export const ECONOMY = {
  win: { draw1: 100, draw3: 150 },
  cleanBonus: 0.25,
  comboBonus: [0, 0, 0.1, 0.25, 0.5],
  dailyBonus: [50, 75, 100, 150, 200, 300, 500],
  undoFree: 5,
  undoCost: 20,
  hintFree: 3,
  hintCost: 50,
  piggy: { amount: 250, cooldownMs: 4 * 60 * 60 * 1000 },
  interstitial: { minGapMs: 4 * 60 * 1000, skipFirstWins: 2 },
} as const;

export function comboMultiplier(winsInRow: number): number {
  return ECONOMY.comboBonus[Math.min(winsInRow, ECONOMY.comboBonus.length - 1)];
}

export function winReward(drawCount: 1 | 3, clean: boolean, winsInRow: number): number {
  const base = drawCount === 1 ? ECONOMY.win.draw1 : ECONOMY.win.draw3;
  const mult = 1 + (clean ? ECONOMY.cleanBonus : 0) + comboMultiplier(winsInRow);
  return Math.round(base * mult);
}
