import { ECONOMY } from './economy';
import { ROOMS } from './rooms';
import { SaveProvider } from '../platform/SaveProvider';

export const SAVE_VERSION = 1;

export interface RoomProgress {
  unlocked: boolean;
  owned: string[];
  selected: Record<string, string>;
}

export interface QuestState {
  day: string;
  ids: string[];
  progress: Record<string, number>;
  claimed: string[];
}

export interface Profile {
  saveVersion: number;
  coins: number;
  totalWins: number;
  cleanWins: number;
  rooms: Record<string, RoomProgress>;
  quests: QuestState;
  daily: { lastClaim: string; streak: number };
  piggyLast: number;
  settings: { sound: boolean; music: boolean };
  createdAt: number;
}

/** Per-session counters that must not survive a reload. */
export const session = {
  winsInRow: 0,
  winsThisSession: 0,
  usedUndo: 0,
  usedHint: 0,
  paidUndo: 0,
  paidHint: 0,
  cleanDeal: true,
  lastInterstitialAt: 0,
  undoUnlimited: false,
  hintBonus: 0,
};

export function dayKey(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function freeSelection(roomId: string): { owned: string[]; selected: Record<string, string> } {
  const room = ROOMS.find((r) => r.id === roomId)!;
  const owned: string[] = [];
  const selected: Record<string, string> = {};
  for (const slot of room.slots) {
    const free = slot.variants[0];
    owned.push(free.id);
    selected[slot.id] = free.id;
  }
  return { owned, selected };
}

export function defaultProfile(): Profile {
  const rooms: Record<string, RoomProgress> = {};
  for (const room of ROOMS) {
    const start = room.unlockCost === 0 ? freeSelection(room.id) : { owned: [], selected: {} };
    rooms[room.id] = { unlocked: room.unlockCost === 0, ...start };
  }
  return {
    saveVersion: SAVE_VERSION,
    coins: 0,
    totalWins: 0,
    cleanWins: 0,
    rooms,
    quests: { day: '', ids: [], progress: {}, claimed: [] },
    daily: { lastClaim: '', streak: 0 },
    piggyLast: 0,
    settings: { sound: true, music: true },
    createdAt: Date.now(),
  };
}

function migrate(raw: unknown): Profile {
  const base = defaultProfile();
  if (typeof raw !== 'object' || raw === null) return base;
  const data = raw as Partial<Profile>;
  const profile: Profile = { ...base, ...data, settings: { ...base.settings, ...data.settings }, daily: { ...base.daily, ...data.daily } };
  profile.rooms = { ...base.rooms };
  for (const room of ROOMS) {
    const saved = data.rooms?.[room.id];
    if (!saved) continue;
    profile.rooms[room.id] = {
      unlocked: !!saved.unlocked,
      owned: saved.owned?.slice() ?? [],
      selected: { ...(saved.unlocked ? freeSelection(room.id).selected : {}), ...saved.selected },
    };
  }
  profile.quests = data.quests ?? base.quests;
  profile.saveVersion = SAVE_VERSION;
  return profile;
}

export class ProfileStore {
  profile: Profile;

  constructor(private readonly storage: SaveProvider) {
    const raw = storage.load();
    this.profile = raw ? migrate(JSON.parse(raw)) : defaultProfile();
    this.ensureQuests();
  }

  save(): void {
    this.storage.save(JSON.stringify(this.profile));
  }

  reset(): void {
    this.storage.clear();
    this.profile = defaultProfile();
    this.ensureQuests();
    this.save();
  }

  // ------------------------------------------------------------- economy

  addCoins(amount: number): void {
    this.profile.coins = Math.max(0, this.profile.coins + amount);
    this.save();
  }

  spend(amount: number): boolean {
    if (this.profile.coins < amount) return false;
    this.profile.coins -= amount;
    this.save();
    return true;
  }

  recordWin(drawCount: 1 | 3, clean: boolean): void {
    this.profile.totalWins++;
    if (clean) this.profile.cleanWins++;
    session.winsInRow++;
    session.winsThisSession++;
    this.questEvent('win');
    if (clean) this.questEvent('cleanWin');
    if (drawCount === 3) this.questEvent('draw3Win');
    if (session.winsInRow >= 3) this.questEvent('combo3');
    this.save();
  }

  // ------------------------------------------------------------- rooms & items

  unlockRoom(roomId: string): boolean {
    const room = ROOMS.find((r) => r.id === roomId);
    const progress = this.profile.rooms[roomId];
    if (!room || !progress || progress.unlocked) return false;
    const idx = ROOMS.indexOf(room);
    const prev = ROOMS[idx - 1];
    if (prev) {
      const prevProgress = this.profile.rooms[prev.id];
      const totalVariants = prev.slots.reduce((n, s) => n + s.variants.length, 0);
      const ownedShare = prevProgress.owned.length / totalVariants;
      if (!prevProgress.unlocked || ownedShare < 0.6) return false;
    }
    if (!this.spend(room.unlockCost)) return false;
    progress.unlocked = true;
    const start = freeSelection(roomId);
    progress.owned = start.owned;
    progress.selected = start.selected;
    this.save();
    return true;
  }

  buyVariant(roomId: string, slotId: string, variantId: string): 'bought' | 'selected' | 'poor' | 'invalid' {
    const room = ROOMS.find((r) => r.id === roomId);
    const progress = this.profile.rooms[roomId];
    const slot = room?.slots.find((s) => s.id === slotId);
    const variant = slot?.variants.find((v) => v.id === variantId);
    if (!room || !progress || !progress.unlocked || !slot || !variant) return 'invalid';
    if (progress.owned.includes(variantId)) {
      progress.selected[slotId] = variantId;
      this.save();
      return 'selected';
    }
    if (!this.spend(variant.price)) return 'poor';
    progress.owned.push(variantId);
    progress.selected[slotId] = variantId;
    this.questEvent('buy');
    this.save();
    return 'bought';
  }

  // ------------------------------------------------------------- daily & quests

  dailyBonusAvailable(): number | null {
    const today = dayKey();
    if (this.profile.daily.lastClaim === today) return null;
    const streak = this.profile.daily.lastClaim === dayKey(-1) ? this.profile.daily.streak + 1 : 1;
    return ECONOMY.dailyBonus[Math.min(streak - 1, ECONOMY.dailyBonus.length - 1)];
  }

  claimDaily(): number | null {
    const amount = this.dailyBonusAvailable();
    if (amount === null) return null;
    const today = dayKey();
    this.profile.daily.streak = this.profile.daily.lastClaim === dayKey(-1) ? this.profile.daily.streak + 1 : 1;
    this.profile.daily.lastClaim = today;
    this.profile.coins += amount;
    this.save();
    return amount;
  }

  piggyAvailable(): number | null {
    if (Date.now() - this.profile.piggyLast < ECONOMY.piggy.cooldownMs) return null;
    return ECONOMY.piggy.amount;
  }

  claimPiggy(): number | null {
    const amount = this.piggyAvailable();
    if (amount === null) return null;
    this.profile.piggyLast = Date.now();
    this.profile.coins += amount;
    this.save();
    return amount;
  }

  ensureQuests(): void {
    const today = dayKey();
    if (this.profile.quests.day === today && this.profile.quests.ids.length) return;
    let seed = 0;
    for (const ch of today) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const pool = QUEST_POOL.slice();
    const ids: string[] = [];
    while (ids.length < 3 && pool.length) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      ids.push(pool.splice(seed % pool.length, 1)[0].id);
    }
    this.profile.quests = { day: today, ids, progress: {}, claimed: [] };
    this.save();
  }

  questDef(id: string): QuestDef {
    return QUEST_POOL.find((q) => q.id === id)!;
  }

  questEvent(event: QuestEvent, amount = 1): void {
    this.ensureQuests();
    for (const id of this.profile.quests.ids) {
      const def = QUEST_POOL.find((q) => q.id === id)!;
      if (def.event !== event) continue;
      if (this.profile.quests.claimed.includes(id)) continue;
      const cur = this.profile.quests.progress[id] ?? 0;
      this.profile.quests.progress[id] = Math.min(def.target, cur + amount);
    }
  }

  claimQuest(id: string): number | null {
    const def = QUEST_POOL.find((q) => q.id === id);
    if (!def) return null;
    if (this.profile.quests.claimed.includes(id)) return null;
    if ((this.profile.quests.progress[id] ?? 0) < def.target) return null;
    this.profile.quests.claimed.push(id);
    this.profile.coins += def.reward;
    this.save();
    return def.reward;
  }
}

export type QuestEvent = 'win' | 'cleanWin' | 'buy' | 'combo3' | 'draw3Win';

export interface QuestDef {
  id: string;
  text: string;
  target: number;
  reward: number;
  event: QuestEvent;
}

export const QUEST_POOL: QuestDef[] = [
  { id: 'win3', text: 'Win 3 deals', target: 3, reward: 60, event: 'win' },
  { id: 'win5', text: 'Win 5 deals', target: 5, reward: 110, event: 'win' },
  { id: 'buy2', text: 'Buy 2 items', target: 2, reward: 50, event: 'buy' },
  { id: 'clean1', text: 'Win without undo or hint', target: 1, reward: 80, event: 'cleanWin' },
  { id: 'combo3', text: 'Reach a x3 win streak', target: 1, reward: 100, event: 'combo3' },
  { id: 'draw3', text: 'Win a Draw-3 deal', target: 1, reward: 70, event: 'draw3Win' },
];
