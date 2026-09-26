import Phaser from 'phaser';
import { CARD_H, CARD_W } from '../ui/CardView';
import { ROOMS } from '../meta/rooms';

const SS = 2;

/** Loads room illustrations and generates the reusable card and interface textures. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    for (const name of [
      'bg-landscape', 'bg-portrait', 'rug-a', 'sofa-a', 'table-a', 'table-b',
      'lamp-a', 'lamp-b', 'plant-a', 'plant-b', 'paint-a', 'paint-b',
    ]) {
      this.load.image(`living-${name}`, `art/living/${name}.webp`);
    }
    for (const room of ROOMS.filter((item) => item.id !== 'living')) {
      const sprites = room.slots
        .filter((slot) => slot.id !== 'wall' && slot.id !== 'floor')
        .flatMap((slot) => slot.variants.map((variant) => variant.id));
      for (const name of ['bg-landscape', 'bg-portrait', ...sprites]) {
        this.load.image(`${room.id}-${name}`, `art/${room.id}/${name}.webp`);
      }
    }
  }

  create(): void {
    this.cardFace();
    this.cardBack();
    this.cardShadow();
    this.glow();
    this.slot();
    this.button();
    this.panel();
    this.dot();
    this.scene.start('Game');
  }

  private dot(): void {
    this.bake('dot', 6, 6, (g) => {
      g.fillStyle(0xffffff, 0.35);
      g.fillCircle(3 * SS, 3 * SS, 3 * SS);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(3 * SS, 3 * SS, 1.6 * SS);
    });
  }

  private bake(key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, w * SS, h * SS);
    g.destroy();
  }

  private cardFace(): void {
    this.bake('card-face', CARD_W, CARD_H, (g) => {
      g.fillStyle(0xfffbf1, 1);
      g.fillRoundedRect(0, 0, CARD_W * SS, CARD_H * SS, 9 * SS);
      g.lineStyle(1 * SS, 0xd5c8ae, 1);
      g.strokeRoundedRect(0.5 * SS, 0.5 * SS, (CARD_W - 1) * SS, (CARD_H - 1) * SS, 9 * SS);
      g.lineStyle(0.5 * SS, 0xe9dfc9, 0.9);
      g.strokeRoundedRect(3 * SS, 3 * SS, (CARD_W - 6) * SS, (CARD_H - 6) * SS, 7 * SS);
      g.fillStyle(0xffffff, 0.55);
      g.fillRoundedRect(5 * SS, 4 * SS, (CARD_W - 10) * SS, 2 * SS, 1 * SS);
    });
  }

  private cardShadow(): void {
    this.bake('card-shadow', CARD_W + 8, CARD_H + 9, (g) => {
      g.fillStyle(0x07150f, 0.16);
      g.fillRoundedRect(4 * SS, 5 * SS, CARD_W * SS, CARD_H * SS, 10 * SS);
      g.fillStyle(0x07150f, 0.1);
      g.fillRoundedRect(2 * SS, 3 * SS, CARD_W * SS, CARD_H * SS, 10 * SS);
    });
  }

  private cardBack(): void {
    const w = CARD_W * SS;
    const h = CARD_H * SS;
    this.bake('card-back', CARD_W, CARD_H, (g) => {
      g.fillStyle(0x225a56, 1);
      g.fillRoundedRect(0, 0, w, h, 9 * SS);
      g.lineStyle(1 * SS, 0x163d3a, 1);
      g.strokeRoundedRect(0.5 * SS, 0.5 * SS, w - 1 * SS, h - 1 * SS, 9 * SS);
      g.lineStyle(1.2 * SS, 0xe1c994, 0.9);
      g.strokeRoundedRect(5 * SS, 5 * SS, w - 10 * SS, h - 10 * SS, 6 * SS);
      g.lineStyle(0.6 * SS, 0xe1c994, 0.55);
      g.strokeRoundedRect(8 * SS, 8 * SS, w - 16 * SS, h - 16 * SS, 4 * SS);
      for (let y = 15 * SS; y < h - 13 * SS; y += 11 * SS) {
        for (let x = 15 * SS; x < w - 13 * SS; x += 11 * SS) {
          g.fillStyle(0xd9c18e, 0.28);
          g.fillCircle(x, y, 1.3 * SS);
        }
      }
      const cx = w / 2;
      const cy = h / 2;
      g.fillStyle(0x16433f, 1);
      g.fillCircle(cx, cy, 19 * SS);
      g.lineStyle(1.3 * SS, 0xe1c994, 0.95);
      g.strokeCircle(cx, cy, 18 * SS);
      g.strokeCircle(cx, cy, 14 * SS);
      g.fillStyle(0xe1c994, 0.95);
      g.fillTriangle(cx, cy - 11 * SS, cx + 8 * SS, cy, cx - 8 * SS, cy);
      g.fillTriangle(cx, cy + 11 * SS, cx + 8 * SS, cy, cx - 8 * SS, cy);
      g.fillCircle(cx, cy, 2.5 * SS);
    });
  }

  private glow(): void {
    const w = (CARD_W + 12) * SS;
    const h = (CARD_H + 12) * SS;
    this.bake('glow', CARD_W + 12, CARD_H + 12, (g) => {
      g.fillStyle(0xffd27f, 0.22);
      g.fillRoundedRect(0, 0, w, h, 12 * SS);
      g.lineStyle(2.5 * SS, 0xffd27f, 0.95);
      g.strokeRoundedRect(1.5 * SS, 1.5 * SS, w - 3 * SS, h - 3 * SS, 12 * SS);
    });
  }

  private slot(): void {
    this.bake('slot', CARD_W, CARD_H, (g) => {
      g.fillStyle(0x000000, 0.14);
      g.fillRoundedRect(0, 0, CARD_W * SS, CARD_H * SS, 9 * SS);
      g.lineStyle(1.5 * SS, 0xf3e3c3, 0.28);
      g.strokeRoundedRect(1 * SS, 1 * SS, (CARD_W - 2) * SS, (CARD_H - 2) * SS, 9 * SS);
    });
  }

  private button(): void {
    const draw = (g: Phaser.GameObjects.Graphics, fill: number, edge: number) => {
      g.fillStyle(0x07150f, 0.28);
      g.fillRoundedRect(1 * SS, 2 * SS, 64 * SS, 21 * SS, 6 * SS);
      g.fillStyle(fill, 1);
      g.fillRoundedRect(0, 0, 66 * SS, 21 * SS, 6 * SS);
      g.fillStyle(0xffffff, 0.08);
      g.fillRoundedRect(3 * SS, 2 * SS, 60 * SS, 7 * SS, 4 * SS);
      g.lineStyle(1 * SS, edge, 0.85);
      g.strokeRoundedRect(0.5 * SS, 0.5 * SS, 65 * SS, 20 * SS, 6 * SS);
    };
    this.bake('btn', 66, 23, (g) => draw(g, 0x355c4d, 0x94b49b));
    this.bake('btn-primary', 66, 23, (g) => draw(g, 0xb57a42, 0xf2d198));
    this.bake('btn-wide', 260, 46, (g) => {
      g.fillStyle(0x07150f, 0.25).fillRoundedRect(2 * SS, 3 * SS, 256 * SS, 42 * SS, 9 * SS);
      g.fillStyle(0x355c4d, 1).fillRoundedRect(0, 0, 260 * SS, 43 * SS, 9 * SS);
      g.fillStyle(0xffffff, 0.07).fillRoundedRect(5 * SS, 4 * SS, 250 * SS, 11 * SS, 5 * SS);
      g.lineStyle(1 * SS, 0x94b49b, 0.85).strokeRoundedRect(1 * SS, 1 * SS, 258 * SS, 41 * SS, 9 * SS);
    });
  }

  private panel(): void {
    this.bake('panel', 260, 150, (g) => {
      g.fillStyle(0x24382b, 0.97);
      g.fillRoundedRect(0, 0, 260 * SS, 150 * SS, 12 * SS);
      g.lineStyle(2 * SS, 0xf3e3c3, 0.5);
      g.strokeRoundedRect(1 * SS, 1 * SS, 258 * SS, 148 * SS, 12 * SS);
    });
  }
}
