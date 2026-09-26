import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMY, comboMultiplier, winReward } from '../src/meta/economy';
import { ROOMS } from '../src/meta/rooms';
import { dayKey, defaultProfile, ProfileStore, QUEST_POOL, SAVE_VERSION, session } from '../src/meta/profile';
import { SaveProvider } from '../src/platform/SaveProvider';

class MemoryStorage implements SaveProvider {
  raw: string | null = null;
  writes = 0;
  load(): string | null {
    return this.raw;
  }
  save(data: string): void {
    this.raw = data;
    this.writes++;
  }
  clear(): void {
    this.raw = null;
  }
}

const LIVING = ROOMS[0];
const KITCHEN = ROOMS[1];
const livingVariants = LIVING.slots.reduce((n, s) => n + s.variants.length, 0);

function newStore(seed?: string): { store: ProfileStore; storage: MemoryStorage } {
  const storage = new MemoryStorage();
  if (seed !== undefined) storage.raw = seed;
  return { store: new ProfileStore(storage), storage };
}

/** Own `count` living-room variants (free ones first) so the unlock gate passes. */
function ownLiving(store: ProfileStore, count: number): void {
  const ids: string[] = [];
  for (const slot of LIVING.slots) for (const v of slot.variants) ids.push(v.id);
  store.profile.rooms[LIVING.id].owned = ids.slice(0, count);
}

beforeEach(() => {
  session.winsInRow = 0;
  session.winsThisSession = 0;
  session.usedUndo = 0;
  session.usedHint = 0;
  session.paidUndo = 0;
  session.paidHint = 0;
  session.cleanDeal = true;
  session.lastInterstitialAt = 0;
  session.undoUnlimited = false;
  session.hintBonus = 0;
});

describe('default profile', () => {
  it('unlocks only the free room with its free variants selected', () => {
    const { store } = newStore();
    const p = store.profile;
    assert.equal(p.saveVersion, SAVE_VERSION);
    assert.equal(p.coins, 0);
    for (const room of ROOMS) {
      const progress = p.rooms[room.id];
      const freeCount = room.slots.length;
      assert.equal(progress.unlocked, room.unlockCost === 0, `${room.id} unlocked flag`);
      if (room.unlockCost === 0) {
        assert.equal(progress.owned.length, freeCount);
        assert.deepEqual(
          progress.owned,
          room.slots.map((s) => s.variants[0].id)
        );
        for (const slot of room.slots) assert.equal(progress.selected[slot.id], slot.variants[0].id);
      } else {
        assert.deepEqual(progress.owned, []);
        assert.deepEqual(progress.selected, {});
      }
    }
  });

  it('seeds three daily quests', () => {
    const { store } = newStore();
    assert.equal(store.profile.quests.ids.length, 3);
    assert.equal(store.profile.quests.day, dayKey());
    for (const id of store.profile.quests.ids) assert.ok(QUEST_POOL.some((q) => q.id === id));
  });
});

describe('coins', () => {
  it('never goes below zero and persists through the storage provider', () => {
    const { store, storage } = newStore();
    store.addCoins(300);
    store.addCoins(-9999);
    assert.equal(store.profile.coins, 0);
    store.addCoins(450);
    assert.equal(store.spend(500), false);
    assert.equal(store.profile.coins, 450);
    assert.equal(store.spend(200), true);
    assert.equal(store.profile.coins, 250);
    assert.equal(storage.writes > 0, true);
    const reloaded = new ProfileStore(storage);
    assert.equal(reloaded.profile.coins, 250);
  });
});

describe('buyVariant', () => {
  it('rejects unknown or locked targets without spending', () => {
    const { store } = newStore();
    assert.equal(store.buyVariant(LIVING.id, 'nope', 'nope'), 'invalid');
    assert.equal(store.buyVariant(KITCHEN.id, KITCHEN.slots[0].id, KITCHEN.slots[0].variants[1].id), 'invalid');
    assert.equal(store.buyVariant(LIVING.id, LIVING.slots[0].id, 'ghost'), 'invalid');
    assert.equal(store.profile.coins, 0);
  });

  it('charges once, then switching back is free', () => {
    const { store } = newStore();
    store.addCoins(1000);
    const slot = LIVING.slots.find((s) => s.variants.length > 1)!;
    const paid = slot.variants.find((v) => v.price > 0)!;
    assert.equal(store.buyVariant(LIVING.id, slot.id, paid.id), 'bought');
    assert.equal(store.profile.coins, 1000 - paid.price);
    assert.ok(store.profile.rooms[LIVING.id].owned.includes(paid.id));
    assert.equal(store.profile.rooms[LIVING.id].selected[slot.id], paid.id);
    assert.equal(store.buyVariant(LIVING.id, slot.id, paid.id), 'selected');
    assert.equal(store.profile.coins, 1000 - paid.price);
    store.buyVariant(LIVING.id, slot.id, slot.variants[0].id);
    assert.equal(store.buyVariant(LIVING.id, slot.id, paid.id), 'selected', 're-owning costs nothing');
    assert.equal(store.profile.coins, 1000 - paid.price);
  });

  it('refuses when the player is short on coins', () => {
    const { store } = newStore();
    store.addCoins(1);
    const slot = LIVING.slots.find((s) => s.variants.some((v) => v.price > 5))!;
    const paid = slot.variants.find((v) => v.price > 5)!;
    assert.equal(store.buyVariant(LIVING.id, slot.id, paid.id), 'poor');
    assert.equal(store.profile.coins, 1);
    assert.equal(store.profile.rooms[LIVING.id].owned.includes(paid.id), false);
  });
});

describe('unlockRoom', () => {
  it('requires 60% of the previous room variants', () => {
    const { store } = newStore();
    store.addCoins(99999);
    ownLiving(store, Math.ceil(livingVariants * 0.6) - 1);
    assert.equal(store.unlockRoom(KITCHEN.id), false);
    assert.equal(store.profile.rooms[KITCHEN.id].unlocked, false);
    assert.equal(store.profile.coins, 99999, 'a rejected unlock is free');
    ownLiving(store, Math.ceil(livingVariants * 0.6));
    assert.equal(store.unlockRoom(KITCHEN.id), true);
  });

  it('charges the cost and grants the free variants', () => {
    const { store } = newStore();
    store.addCoins(99999);
    ownLiving(store, livingVariants);
    const before = store.profile.coins;
    assert.equal(store.unlockRoom(KITCHEN.id), true);
    assert.equal(store.profile.coins, before - KITCHEN.unlockCost);
    const progress = store.profile.rooms[KITCHEN.id];
    assert.equal(progress.unlocked, true);
    assert.deepEqual(
      progress.owned,
      KITCHEN.slots.map((s) => s.variants[0].id)
    );
    assert.equal(store.unlockRoom(KITCHEN.id), false, 'already unlocked');
  });

  it('refuses when coins are short even if the progress gate passes', () => {
    const { store } = newStore();
    ownLiving(store, livingVariants);
    store.addCoins(KITCHEN.unlockCost - 1);
    assert.equal(store.unlockRoom(KITCHEN.id), false);
    assert.equal(store.profile.coins, KITCHEN.unlockCost - 1);
  });
});

describe('daily bonus', () => {
  it('pays once per day and walks the streak table', () => {
    const { store } = newStore();
    assert.equal(store.dailyBonusAvailable(), ECONOMY.dailyBonus[0]);
    assert.equal(store.claimDaily(), ECONOMY.dailyBonus[0]);
    assert.equal(store.claimDaily(), null);
    assert.equal(store.dailyBonusAvailable(), null);
    assert.equal(store.profile.coins, ECONOMY.dailyBonus[0]);

    store.profile.daily.lastClaim = dayKey(-1);
    store.profile.daily.streak = 3;
    assert.equal(store.dailyBonusAvailable(), ECONOMY.dailyBonus[3]);
    assert.equal(store.claimDaily(), ECONOMY.dailyBonus[3]);
    assert.equal(store.profile.daily.streak, 4);
  });

  it('resets the streak after a missed day and caps at the table end', () => {
    const { store } = newStore();
    store.profile.daily.lastClaim = dayKey(-5);
    store.profile.daily.streak = 5;
    assert.equal(store.dailyBonusAvailable(), ECONOMY.dailyBonus[0]);
    store.profile.daily.lastClaim = dayKey(-1);
    store.profile.daily.streak = ECONOMY.dailyBonus.length + 2;
    assert.equal(store.dailyBonusAvailable(), ECONOMY.dailyBonus[ECONOMY.dailyBonus.length - 1]);
  });
});

describe('piggy bank', () => {
  it('pays once per cooldown window', () => {
    const { store } = newStore();
    assert.equal(store.piggyAvailable(), ECONOMY.piggy.amount);
    assert.equal(store.claimPiggy(), ECONOMY.piggy.amount);
    assert.equal(store.piggyAvailable(), null);
    assert.equal(store.claimPiggy(), null);
    store.profile.piggyLast = Date.now() - ECONOMY.piggy.cooldownMs - 1000;
    assert.equal(store.piggyAvailable(), ECONOMY.piggy.amount);
  });
});

describe('quests', () => {
  it('keeps the same three quests for the whole day', () => {
    const { store } = newStore();
    const ids = store.profile.quests.ids.slice();
    store.ensureQuests();
    assert.deepEqual(store.profile.quests.ids, ids);
    store.profile.quests.day = dayKey(-1);
    store.ensureQuests();
    assert.equal(store.profile.quests.day, dayKey());
    assert.equal(store.profile.quests.ids.length, 3);
    assert.deepEqual(store.profile.quests.claimed, []);
  });

  it('progresses only matching events, caps at the target and pays once', () => {
    const { store } = newStore();
    const winQuest = QUEST_POOL.find((q) => q.event === 'win')!;
    const otherQuest = QUEST_POOL.find((q) => q.event === 'buy')!;
    store.profile.quests = { day: dayKey(), ids: [winQuest.id, otherQuest.id], progress: {}, claimed: [] };
    for (let i = 0; i < winQuest.target + 3; i++) store.questEvent('win');
    assert.equal(store.profile.quests.progress[winQuest.id], winQuest.target);
    assert.equal(store.profile.quests.progress[otherQuest.id], undefined, 'unrelated event ignored');
    assert.equal(store.claimQuest('nope'), null);
    assert.equal(store.claimQuest(otherQuest.id), null, 'not finished yet');
    assert.equal(store.claimQuest(winQuest.id), winQuest.reward);
    assert.equal(store.profile.coins, winQuest.reward);
    assert.equal(store.claimQuest(winQuest.id), null, 'no double claim');
    store.questEvent('win');
    assert.equal(store.profile.quests.progress[winQuest.id], winQuest.target, 'claimed quests stay put');
  });

  it('wins feed the win, clean, draw-3 and combo quests', () => {
    const { store } = newStore();
    const ids = QUEST_POOL.map((q) => q.id);
    store.profile.quests = { day: dayKey(), ids, progress: {}, claimed: [] };
    session.winsInRow = 2;
    store.recordWin(3, true);
    assert.equal(store.profile.totalWins, 1);
    assert.equal(store.profile.cleanWins, 1);
    assert.equal(session.winsThisSession, 1);
    assert.equal(store.profile.quests.progress['win3'], 1);
    assert.equal(store.profile.quests.progress['clean1'], 1);
    assert.equal(store.profile.quests.progress['draw3'], 1);
    assert.equal(store.profile.quests.progress['combo3'], 1);
    store.recordWin(1, false);
    assert.equal(store.profile.quests.progress['clean1'], 1, 'a dirty win adds no clean progress');
    assert.equal(store.profile.quests.progress['draw3'], 1, 'a draw-1 win adds no draw-3 progress');
  });
});

describe('win rewards', () => {
  it('follows the economy table', () => {
    assert.equal(winReward(1, false, 0), ECONOMY.win.draw1);
    assert.equal(winReward(3, false, 0), ECONOMY.win.draw3);
    assert.equal(winReward(1, true, 0), Math.round(ECONOMY.win.draw1 * 1.25));
    assert.equal(winReward(1, false, 3), Math.round(ECONOMY.win.draw1 * 1.25));
    assert.equal(winReward(1, true, 3), Math.round(ECONOMY.win.draw1 * 1.5));
    assert.equal(comboMultiplier(0), 0);
    assert.equal(comboMultiplier(1), 0);
    assert.equal(comboMultiplier(2), 0.1);
    assert.equal(comboMultiplier(4), 0.5);
    assert.equal(comboMultiplier(99), 0.5, 'combo bonus is clamped to the table');
  });
});

describe('save migration', () => {
  it('fills missing fields and keeps the player data', () => {
    const legacy = {
      saveVersion: 0,
      coins: 777,
      totalWins: 4,
      rooms: { [LIVING.id]: { unlocked: true, owned: ['wall-b'], selected: {} } },
    };
    const { store } = newStore(JSON.stringify(legacy));
    const p = store.profile;
    assert.equal(p.saveVersion, SAVE_VERSION);
    assert.equal(p.coins, 777);
    assert.equal(p.totalWins, 4);
    assert.equal(p.piggyLast, 0);
    assert.deepEqual(p.settings, { sound: true, music: true });
    assert.equal(p.rooms[KITCHEN.id].unlocked, false);
    assert.deepEqual(
      Object.keys(p.rooms),
      ROOMS.map((r) => r.id)
    );
  });

  it('re-applies free selections and never loses a chosen variant', () => {
    const slot = LIVING.slots.find((s) => s.variants.length > 1)!;
    const paid = slot.variants.find((v) => v.price > 0)!;
    const saved = defaultProfile();
    saved.rooms[LIVING.id].owned = [slot.variants[0].id, paid.id];
    saved.rooms[LIVING.id].selected[slot.id] = paid.id;
    const { store } = newStore(JSON.stringify(saved));
    assert.equal(store.profile.rooms[LIVING.id].selected[slot.id], paid.id);
    for (const other of LIVING.slots) {
      if (other.id === slot.id) continue;
      assert.equal(store.profile.rooms[LIVING.id].selected[other.id], other.variants[0].id);
    }
  });

  it('falls back to a fresh profile on garbage input', () => {
    for (const garbage of ['null', '"text"', '[1,2,3]']) {
      const { store } = newStore(garbage);
      assert.deepEqual(store.profile.rooms[KITCHEN.id], { unlocked: false, owned: [], selected: {} });
      assert.equal(store.profile.coins, 0);
    }
  });

  it('reset() wipes the save back to defaults', () => {
    const { store, storage } = newStore();
    store.addCoins(500);
    store.profile.totalWins = 3;
    store.reset();
    assert.equal(store.profile.coins, 0);
    assert.equal(store.profile.totalWins, 0);
    assert.deepEqual(
      store.profile.rooms[LIVING.id].owned,
      LIVING.slots.map((s) => s.variants[0].id)
    );
    assert.equal(JSON.parse(storage.raw!).coins, 0);
  });
});
