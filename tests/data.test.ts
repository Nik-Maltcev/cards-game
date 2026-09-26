import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import en from '../strings/en.json';
import { ROOMS, ArtSpec } from '../src/meta/rooms';
import { t } from '../src/i18n';

/** Shapes HomeScene.drawArt knows how to render; anything else draws an invisible slot. */
const DRAWN_SHAPES = [
  'wall',
  'floor',
  'rug',
  'sofa',
  'table',
  'lamp',
  'plant',
  'painting',
  'bed',
  'counter',
  'shelf',
  'chair',
  'tree',
] as const;

const dict = en as Record<string, string>;

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return name.endsWith('.ts') ? [full] : [];
  });
}

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));

describe('room data', () => {
  it('is a strictly priced progression starting free', () => {
    assert.equal(ROOMS.length, 5);
    assert.equal(ROOMS[0].unlockCost, 0);
    for (let i = 1; i < ROOMS.length; i++) assert.ok(ROOMS[i].unlockCost > ROOMS[i - 1].unlockCost, ROOMS[i].id);
    assert.equal(new Set(ROOMS.map((r) => r.id)).size, ROOMS.length);
    for (const room of ROOMS) assert.ok(room.name.length > 0);
  });

  it('has unique slot and variant ids', () => {
    for (const room of ROOMS) {
      assert.ok(room.slots.length > 0, room.id);
      const slotIds = room.slots.map((s) => s.id);
      assert.equal(new Set(slotIds).size, slotIds.length, `duplicate slot in ${room.id}`);
      for (const slot of room.slots) {
        assert.ok(slot.name.length > 0, `${room.id}/${slot.id} name`);
        const variantIds = slot.variants.map((v) => v.id);
        assert.equal(new Set(variantIds).size, variantIds.length, `duplicate variant in ${room.id}/${slot.id}`);
        assert.ok(slot.variants.length > 1, `${room.id}/${slot.id} needs a shop choice`);
      }
    }
  });

  it('lists the free variant first, which the profile seeds as owned', () => {
    for (const room of ROOMS) {
      for (const slot of room.slots) {
        assert.equal(slot.variants[0].price, 0, `${room.id}/${slot.id} free variant must be index 0`);
        for (const variant of slot.variants) {
          assert.ok(variant.price >= 0);
          assert.ok(variant.name.length > 0);
          if (variant.price === 0) assert.ok(!variant.premium, `${variant.id} free but premium`);
        }
        assert.ok(
          slot.variants.every((v, i) => i === 0 || v.price >= slot.variants[i - 1].price),
          `${room.id}/${slot.id} prices must ascend`
        );
      }
    }
  });

  it('places every slot inside the room box', () => {
    for (const room of ROOMS) {
      for (const slot of room.slots) {
        assert.ok(slot.w > 0 && slot.h > 0, `${room.id}/${slot.id} size`);
        assert.ok(slot.x >= 0 && slot.y >= 0, `${room.id}/${slot.id} origin`);
        assert.ok(slot.x + slot.w <= 1.0001, `${room.id}/${slot.id} overflows right`);
        assert.ok(slot.y + slot.h <= 1.0001, `${room.id}/${slot.id} overflows bottom`);
        assert.ok(Number.isInteger(slot.layer), `${room.id}/${slot.id} layer`);
      }
    }
  });

  it('provides two parseable colours and a drawable shape per variant', () => {
    const seen = new Set<string>();
    for (const room of ROOMS) {
      for (const slot of room.slots) {
        for (const variant of slot.variants) {
          const art: ArtSpec = variant.art;
          assert.ok((DRAWN_SHAPES as readonly string[]).includes(art.shape), `${variant.id} shape ${art.shape}`);
          assert.ok(art.colors.length >= 2, `${variant.id} needs at least two colours`);
          for (const c of art.colors) assert.match(c, /^#[0-9a-fA-F]{6}$/, `${variant.id} colour ${c}`);
          seen.add(art.shape);
        }
      }
    }
    for (const shape of DRAWN_SHAPES) assert.ok(seen.has(shape), `shape ${shape} is drawn but unused`);
  });

  it('layers walls below furniture so hit-testing favours the foreground', () => {
    for (const room of ROOMS) {
      const walls = room.slots.filter((s) => s.variants.some((v) => v.art.shape === 'wall'));
      assert.ok(walls.length > 0, `${room.id} has no wall slot`);
      const wallLayer = Math.min(...walls.map((s) => s.layer));
      for (const slot of room.slots) {
        const shape = slot.variants[0].art.shape;
        if (shape === 'wall' || shape === 'floor' || shape === 'rug') continue;
        assert.ok(slot.layer > wallLayer, `${room.id}/${slot.id} sits below the wall layer`);
      }
    }
  });
});

describe('strings', () => {
  const used = new Map<string, string>();
  for (const file of tsFiles(SRC_DIR)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*'([^']+)'/g)) used.set(match[1], file);
  }

  it('covers every key referenced by the scenes', () => {
    const missing = [...used.keys()].filter((k) => !(k in dict));
    assert.deepEqual(missing, [], `missing translations: ${missing.join(', ')}`);
  });

  it('has no dead keys and no empty values', () => {
    const unused = Object.keys(dict).filter((k) => !used.has(k));
    assert.deepEqual(unused, [], `unused strings: ${unused.join(', ')}`);
    for (const [k, v] of Object.entries(dict)) assert.ok(v.trim().length > 0, `empty value for ${k}`);
  });

  it('substitutes every placeholder the call sites pass', () => {
    for (const [key, value] of Object.entries(dict)) {
      const params = [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const probe: Record<string, string> = {};
      for (const p of params) probe[p] = 'X';
      const out = t(key, probe);
      assert.equal(out.includes('{'), false, `${key} has a placeholder no param fills`);
      for (const p of params) assert.ok(out.includes('X'), `${key} drops the {${p}} value`);
    }
    assert.equal(t('shop.bought', { item: 'Rug' }), dict['shop.bought'].replace('{item}', 'Rug'));
    assert.equal(t('no.such.key'), 'no.such.key', 'unknown keys fall back to the key itself');
  });
});
