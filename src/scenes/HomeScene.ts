import Phaser from 'phaser';
import { ROOMS, Room, ItemSlot, ArtSpec } from '../meta/rooms';
import { profile } from '../app';
import { t } from '../i18n';
import { ads, adsEnabled } from '../platform/AdProvider';

const hex = (c: string): number => parseInt(c.slice(1), 16);
const STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial, sans-serif', color: '#f3e3c3' };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface UiButton {
  key: string;
  bg: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

interface AnimPiece {
  type: 'sway' | 'glow';
  px: number;
  py: number;
  draw: (g: Phaser.GameObjects.Graphics) => void;
}

export class HomeScene extends Phaser.Scene {
  private roomG!: Phaser.GameObjects.Graphics;
  private livingTint!: Phaser.GameObjects.Graphics;
  private roomBackground!: Phaser.GameObjects.Image;
  private decorSprites: Phaser.GameObjects.Image[] = [];
  private decorBySlot = new Map<string, Phaser.GameObjects.Image>();
  private livingFallbacks: Phaser.GameObjects.Graphics[] = [];
  private hoverG!: Phaser.GameObjects.Graphics;
  private hoverLabel!: Phaser.GameObjects.Text;
  private hoveredSlot: ItemSlot | null = null;
  private buttons: UiButton[] = [];
  private tabButtons: UiButton[] = [];
  private coinsText!: Phaser.GameObjects.Text;
  private roomTitle!: Phaser.GameObjects.Text;
  private roomProgress!: Phaser.GameObjects.Text;
  private dailyDot!: Phaser.GameObjects.Arc;
  private popup: Phaser.GameObjects.GameObject[] = [];
  private slotRects: { slot: ItemSlot; rect: Rect }[] = [];
  private animTargets: Phaser.GameObjects.Graphics[] = [];
  private dust: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private tapBlocked = false;
  private toastObj: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private currentRoom = 'living';
  private topH = 48;
  private tabH = 56;

  constructor() {
    super('Home');
  }

  create(): void {
    this.buttons = [];
    this.tabButtons = [];
    this.popup = [];
    this.animTargets = [];
    this.dust = null;
    this.tapBlocked = false;
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x2b3a2e).setOrigin(0).setDepth(0);
    this.roomBackground = this.add.image(0, 0, 'living-bg-landscape').setOrigin(0).setDepth(1).setVisible(false);
    this.livingTint = this.add.graphics().setDepth(1.5);
    this.roomG = this.add.graphics().setDepth(6);
    this.hoverG = this.add.graphics().setDepth(8);
    this.hoverLabel = this.add.text(0, 0, '', {
      ...STYLE, fontSize: '14px', fontStyle: 'bold', color: '#fff4d4',
      backgroundColor: '#203d32ee', padding: { x: 10, y: 6 },
    }).setOrigin(0.5, 1).setDepth(9).setVisible(false);
    this.coinsText = this.add.text(0, 0, '', { ...STYLE, fontSize: '17px', color: '#ffd27f' }).setDepth(10);
    this.roomTitle = this.add.text(0, 0, '', { ...STYLE, fontSize: '17px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(10);
    this.roomProgress = this.add.text(0, 0, '', { ...STYLE, fontSize: '12px', fontStyle: 'bold' }).setDepth(7);

    this.mkButton('quests', t('home.quests'), () => this.openQuests());
    this.mkButton('daily', t('home.daily'), () => this.onDaily());
    this.mkButton('piggy', t('home.piggy'), () => this.onPiggy());
    this.mkButton('play', t('home.play'), () => this.scene.start('Game'));
    this.dailyDot = this.add.circle(0, 0, 5, 0xff6b5e).setDepth(12).setVisible(false);

    for (const room of ROOMS) {
      const btn = this.mkButton(`tab-${room.id}`, room.name, () => this.onTab(room));
      this.tabButtons.push(btn);
    }

    this.scale.on('resize', this.render, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.render, this);
      this.clearHover();
    });
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('gameout', this.clearHover, this);
    this.render();
  }

  private mkButton(key: string, label: string, cb: () => void): UiButton {
    const texture = key === 'play' ? 'btn-primary' : key.startsWith('tab-') ? 'btn-wide' : 'btn';
    const bg = this.add.image(0, 0, texture).setDepth(10).setInteractive({ useHandCursor: true });
    const text = this.add.text(0, 0, label, { ...STYLE, fontSize: '14px' }).setOrigin(0.5).setDepth(11);
    bg.on('pointerdown', cb);
    bg.on('pointerover', () => bg.setTint(0xcfe6d4));
    bg.on('pointerout', () => bg.clearTint());
    const btn = { key, bg, label: text };
    this.buttons.push(btn);
    return btn;
  }

  private findButton(key: string): UiButton {
    return this.buttons.find((b) => b.key === key)!;
  }

  // ---------------------------------------------------------------- layout & render

  private roomRect(): Rect {
    const W = this.scale.width;
    const H = this.scale.height;
    return { x: 14, y: this.topH + 10, w: W - 28, h: Math.max(80, H - this.topH - this.tabH - 30) };
  }

  private render(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const compact = W < 750;
    this.topH = compact ? 91 : Phaser.Math.Clamp(Math.round(H * 0.075), 48, 60);
    this.tabH = Phaser.Math.Clamp(Math.round(H * 0.09), 46, 64);

    const titleY = compact ? 24 : this.topH / 2;
    this.coinsText.setPosition(17, titleY).setOrigin(0, 0.5).setText(`✦ ${profile.profile.coins}`);
    const room = ROOMS.find((r) => r.id === this.currentRoom)!;
    const btnKeys = adsEnabled() ? ['quests', 'daily', 'piggy', 'play'] : ['quests', 'daily', 'play'];
    const bw = compact
      ? Math.floor((W - 28 - (btnKeys.length - 1) * 7) / btnKeys.length)
      : Math.max(70, Math.round(W * 0.095));
    this.roomTitle.setPosition(compact ? W / 2 : Math.max(95, (W - btnKeys.length * bw - 40) / 2), titleY)
      .setOrigin(0.5).setText(room.name);
    const bh = compact ? 34 : Math.round(this.topH * 0.66);
    const buttonY = compact ? 66 : this.topH / 2;
    let bx = W - 14 - bw;
    for (let i = btnKeys.length - 1; i >= 0; i--) {
      const b = this.findButton(btnKeys[i]);
      b.bg.setPosition(Math.round(bx + bw / 2), buttonY).setDisplaySize(bw, bh);
      b.label.setPosition(Math.round(bx + bw / 2), buttonY).setFontSize(compact ? 13 : Math.round(bh * 0.39));
      bx -= bw + (compact ? 7 : 8);
    }
    const piggyOn = adsEnabled() && profile.piggyAvailable() !== null;
    this.findButton('piggy').bg.setVisible(piggyOn);
    this.findButton('piggy').label.setVisible(piggyOn);
    this.dailyDot.setPosition(this.findButton('daily').bg.x + bw / 2 - 4, buttonY - bh / 2 + 2);
    this.dailyDot.setVisible(profile.dailyBonusAvailable() !== null);

    const tw = Math.max(70, Math.round((W - 28 - 4 * 6) / 5));
    const th = Math.round(this.tabH * 0.68);
    this.tabButtons.forEach((b, i) => {
      const roomDef = ROOMS[i];
      const locked = !profile.profile.rooms[roomDef.id].unlocked;
      const x = Math.round(14 + i * (tw + 6) + tw / 2);
      const y = Math.round(H - 12 - th / 2);
      b.bg.setPosition(x, y).setDisplaySize(tw, th);
      b.label.setPosition(x, y).setFontSize(compact ? 11 : Math.round(th * 0.34)).setAlign('center');
      const compactName = roomDef.name.split(' ')[0];
      b.label.setText(compact
        ? locked ? `${compactName}\n${roomDef.unlockCost}` : compactName
        : locked ? `${roomDef.name} · ${roomDef.unlockCost}` : roomDef.name);
      b.bg.setAlpha(locked ? 0.65 : 1);
      if (roomDef.id === this.currentRoom) b.bg.setTint(0x8fc79f);
      else b.bg.clearTint();
    });

    this.drawRoom();
  }

  private drawRoom(): void {
    this.clearHover();
    const g = this.roomG;
    g.clear();
    this.livingTint.clear();
    this.roomBackground.setVisible(false);
    for (const sprite of this.decorSprites) sprite.destroy();
    for (const fallback of this.livingFallbacks) fallback.destroy();
    this.decorSprites = [];
    this.decorBySlot.clear();
    this.livingFallbacks = [];
    this.tweens.killTweensOf(this.animTargets);
    for (const target of this.animTargets) target.destroy();
    this.animTargets = [];
    if (this.dust) {
      this.dust.destroy();
      this.dust = null;
    }
    this.slotRects = [];
    const room = ROOMS.find((r) => r.id === this.currentRoom)!;
    const r = this.roomRect();
    const progress = profile.profile.rooms[room.id];

    g.lineStyle(4, 0x1e2a21, 1).strokeRoundedRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, 12);

    if (!progress.unlocked) {
      g.fillStyle(0x000000, 0.55).fillRoundedRect(r.x, r.y, r.w, r.h, 10);
      this.roomProgress.setVisible(false);
      return;
    }

    const anims: AnimPiece[] = [];
    if (room.id === 'living') {
      this.drawLivingRoom(room, r, anims);
    } else {
      this.drawIllustratedRoom(room, r);
    }

    const total = room.slots.reduce((n, slot) => n + slot.variants.length, 0);
    const owned = Math.min(total, progress.owned.length);
    const badgeW = Math.min(220, r.w * 0.46);
    g.fillStyle(0x203d32, 0.82).fillRoundedRect(r.x + 12, r.y + 12, badgeW, 40, 8);
    g.lineStyle(1, 0xe5d0a5, 0.48).strokeRoundedRect(r.x + 12, r.y + 12, badgeW, 40, 8);
    g.fillStyle(0x143126, 0.8).fillRoundedRect(r.x + 23, r.y + 39, badgeW - 22, 5, 2);
    g.fillStyle(0xe8bd77, 1).fillRoundedRect(r.x + 23, r.y + 39, (badgeW - 22) * (owned / Math.max(1, total)), 5, 2);
    this.roomProgress.setText(t('home.progress', { owned, total }))
      .setPosition(r.x + 22, r.y + 19).setVisible(true);

    for (const piece of anims) {
      const ag = this.add.graphics().setPosition(piece.px, piece.py).setDepth(7);
      piece.draw(ag);
      this.animTargets.push(ag);
      if (piece.type === 'sway') {
        this.tweens.add({
          targets: ag,
          angle: { from: -2.4, to: 2.4 },
          duration: 1600 + Math.random() * 900,
          delay: Math.random() * 600,
          ease: 'sine.inout',
          yoyo: true,
          repeat: -1,
        });
      } else {
        ag.setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: ag,
          alpha: { from: 0.45, to: 0.95 },
          duration: 1100 + Math.random() * 700,
          delay: Math.random() * 500,
          ease: 'sine.inout',
          yoyo: true,
          repeat: -1,
        });
      }
    }

    this.dust = this.add
      .particles(r.x + r.w / 2, r.y + r.h * 0.45, 'dot', {
        x: { min: -r.w * 0.45, max: r.w * 0.45 },
        y: { min: -r.h * 0.4, max: r.h * 0.35 },
        speedX: { min: -5, max: 5 },
        speedY: { min: -14, max: -6 },
        lifespan: { min: 4000, max: 7000 },
        alpha: { start: 0.28, end: 0 },
        scale: { start: 0.45, end: 0.15 },
        tint: 0xffe9c0,
        blendMode: 'ADD',
        frequency: 400,
        maxAliveParticles: 14,
      })
      .setDepth(3);
  }

  private drawLivingRoom(room: Room, roomRect: Rect, anims: AnimPiece[]): void {
    const portrait = roomRect.h > roomRect.w;
    const bgKey = portrait ? 'living-bg-portrait' : 'living-bg-landscape';
    this.roomBackground.setTexture(bgKey).setPosition(roomRect.x, roomRect.y)
      .setDisplaySize(roomRect.w, roomRect.h).setVisible(true);

    const selected = profile.profile.rooms[room.id].selected;
    const wall = room.slots.find((slot) => slot.id === 'wall')!;
    const floor = room.slots.find((slot) => slot.id === 'floor')!;
    const wallVariant = wall.variants.find((v) => v.id === selected.wall) ?? wall.variants[0];
    const floorVariant = floor.variants.find((v) => v.id === selected.floor) ?? floor.variants[0];
    if (wallVariant !== wall.variants[0]) {
      const windowWidth = portrait ? 0.25 : 0.22;
      this.livingTint.fillStyle(hex(wallVariant.art.colors[0]), 0.68)
        .fillRect(roomRect.x + roomRect.w * windowWidth, roomRect.y,
          roomRect.w * (1 - windowWidth), roomRect.h * 0.62);
    }
    if (floorVariant !== floor.variants[0]) {
      this.livingTint.fillStyle(hex(floorVariant.art.colors[0]), 0.48)
        .fillRect(roomRect.x, roomRect.y + roomRect.h * 0.62, roomRect.w, roomRect.h * 0.38);
    }

    const painted = new Set([
      'rug-a', 'sofa-a', 'table-a', 'table-b', 'lamp-a', 'lamp-b',
      'plant-a', 'plant-b', 'paint-a', 'paint-b',
    ]);
    for (const slot of room.slots.slice().sort((a, b) => a.layer - b.layer)) {
      const rect = livingSlotRect(slot, roomRect, portrait);
      const variant = slot.variants.find((v) => v.id === selected[slot.id]) ?? slot.variants[0];
      this.slotRects.push({ slot, rect });
      if (slot.id === 'wall' || slot.id === 'floor') continue;
      const depth = 2 + slot.layer;
      if (painted.has(variant.id)) {
        const image = this.add.image(0, 0, `living-${variant.id}`).setDepth(depth);
        if (slot.id === 'rug') {
          image.setDisplaySize(rect.w, rect.h);
          image.setPosition(rect.x + rect.w / 2, rect.y + rect.h / 2);
        } else {
          const scale = Math.min(rect.w / image.width, rect.h / image.height);
          image.setDisplaySize(image.width * scale, image.height * scale);
          image.setPosition(rect.x + rect.w / 2,
            slot.id === 'painting' ? rect.y + rect.h / 2 : rect.y + rect.h - image.displayHeight / 2);
        }
        this.decorSprites.push(image);
        this.decorBySlot.set(slot.id, image);
      } else {
        const fallback = this.add.graphics().setDepth(depth);
        drawArt(fallback, variant.art, rect, anims);
        this.livingFallbacks.push(fallback);
      }
    }
  }

  private drawIllustratedRoom(room: Room, roomRect: Rect): void {
    const portrait = roomRect.h > roomRect.w;
    this.roomBackground.setTexture(`${room.id}-bg-${portrait ? 'portrait' : 'landscape'}`)
      .setPosition(roomRect.x, roomRect.y)
      .setDisplaySize(roomRect.w, roomRect.h)
      .setVisible(true);

    const selected = profile.profile.rooms[room.id].selected;
    for (const surface of ['wall', 'floor']) {
      const slot = room.slots.find((item) => item.id === surface)!;
      const variant = slot.variants.find((item) => item.id === selected[surface]) ?? slot.variants[0];
      if (variant !== slot.variants[0]) {
        const y = surface === 'wall' ? roomRect.y : roomRect.y + roomRect.h * 0.62;
        const h = surface === 'wall' ? roomRect.h * 0.62 : roomRect.h * 0.38;
        this.livingTint.fillStyle(hex(variant.art.colors[0]), room.id === 'garden' ? 0.32 : 0.50)
          .fillRect(roomRect.x, y, roomRect.w, h);
      }
    }

    for (const slot of room.slots.slice().sort((a, b) => a.layer - b.layer)) {
      const rect = illustratedSlotRect(room.id, slot, roomRect, portrait);
      const variant = slot.variants.find((item) => item.id === selected[slot.id]) ?? slot.variants[0];
      this.slotRects.push({ slot, rect });
      if (slot.id === 'wall' || slot.id === 'floor') continue;
      const depth = 2 + slot.layer;
      const image = this.add.image(0, 0, `${room.id}-${variant.id}`).setDepth(depth);
      if (slot.id === 'rug') {
        image.setDisplaySize(rect.w, rect.h);
        image.setPosition(rect.x + rect.w / 2, rect.y + rect.h / 2);
      } else {
        const scale = Math.min(rect.w / image.width, rect.h / image.height);
        image.setDisplaySize(image.width * scale, image.height * scale);
        image.setPosition(rect.x + rect.w / 2,
          ['painting', 'shelf'].includes(slot.id) ? rect.y + rect.h / 2 : rect.y + rect.h - image.displayHeight / 2);
      }
      this.decorSprites.push(image);
      this.decorBySlot.set(slot.id, image);
    }
  }

  // ---------------------------------------------------------------- interaction

  private slotAt(x: number, y: number, decorOnly = false): { slot: ItemSlot; rect: Rect } | null {
    for (let i = this.slotRects.length - 1; i >= 0; i--) {
      const hit = this.slotRects[i];
      if (decorOnly && (hit.slot.id === 'wall' || hit.slot.id === 'floor')) continue;
      const { rect } = hit;
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return hit;
    }
    return null;
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (this.popup.length || this.tapBlocked || !profile.profile.rooms[this.currentRoom].unlocked ||
      this.input.hitTestPointer(pointer).some((o) => this.buttons.some((b) => b.bg === o))) {
      this.clearHover();
      return;
    }
    const hit = this.slotAt(pointer.x, pointer.y, true);
    if (hit?.slot === this.hoveredSlot) return;
    this.clearHover();
    if (!hit) return;

    this.hoveredSlot = hit.slot;
    const image = this.decorBySlot.get(hit.slot.id);
    if (image) image.setTint(0xffe9bb);
    const bounds = image ? image.getBounds() : new Phaser.Geom.Rectangle(hit.rect.x, hit.rect.y, hit.rect.w, hit.rect.h);
    const pad = 5;
    this.hoverG.fillStyle(0xffd985, 0.10).fillRoundedRect(
      bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2, 10);
    this.hoverG.lineStyle(3, 0xffdc8e, 0.95).strokeRoundedRect(
      bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2, 10);
    const room = this.roomRect();
    this.hoverLabel.setText(hit.slot.name)
      .setPosition(Phaser.Math.Clamp(bounds.centerX, room.x + 45, room.x + room.w - 45),
        Math.max(room.y + 65, bounds.y - 8))
      .setVisible(true);
    this.input.setDefaultCursor('pointer');
  }

  private clearHover(): void {
    if (this.hoveredSlot) this.decorBySlot.get(this.hoveredSlot.id)?.clearTint();
    this.hoveredSlot = null;
    this.hoverG.clear();
    this.hoverLabel.setVisible(false);
    this.input.setDefaultCursor('default');
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (this.popup.length || this.tapBlocked) return;
    if (this.input.hitTestPointer(pointer).some((o) => o instanceof Phaser.GameObjects.Image && this.buttons.some((b) => b.bg === o))) return;
    const progress = profile.profile.rooms[this.currentRoom];
    if (!progress.unlocked) return;
    const hit = this.slotAt(pointer.x, pointer.y);
    if (hit) {
      this.clearHover();
      this.openShop(hit.slot);
    }
  }

  private onTab(room: Room): void {
    const progress = profile.profile.rooms[room.id];
    if (progress.unlocked) {
      this.currentRoom = room.id;
      this.render();
      return;
    }
    if (profile.unlockRoom(room.id)) {
      ads().track('room_unlock', { room: room.id, cost: room.unlockCost });
      this.currentRoom = room.id;
      this.toast(t('home.unlocked', { room: room.name }));
      this.render();
      return;
    }
    const idx = ROOMS.indexOf(room);
    const prev = ROOMS[idx - 1];
    const prevP = prev ? profile.profile.rooms[prev.id] : null;
    const prevVariants = prev ? prev.slots.reduce((n, s) => n + s.variants.length, 0) : 1;
    const prevDone = prevP?.unlocked && prevP.owned.length / prevVariants >= 0.6;
    this.toast(!prevDone && prev ? t('home.needProgress') : t('toast.notEnoughCoins'));
  }

  private onDaily(): void {
    const amount = profile.claimDaily();
    if (amount === null) {
      this.toast(t('home.dailyDone'));
      return;
    }
    ads().track('daily_bonus_claim', { day: profile.profile.daily.streak, amount });
    this.toast(t('home.dailyClaimed', { n: amount }));
    this.render();
  }

  private onPiggy(): void {
    if (profile.piggyAvailable() === null) {
      this.render();
      return;
    }
    void ads()
      .showRewarded('piggy')
      .then((ok) => {
        ads().track('rewarded_show', { placement: 'piggy', result: ok ? 1 : 0 });
        if (!ok) {
          this.toast(t('ad.failed'));
          return;
        }
        const amount = profile.claimPiggy();
        if (amount !== null) this.toast(t('home.dailyClaimed', { n: amount }));
        this.render();
      });
  }

  // ---------------------------------------------------------------- popups

  private popupBase(titleText: string, pw: number, ph: number): { panel: Phaser.GameObjects.Image; x: number; y: number } {
    this.clearHover();
    const W = this.scale.width;
    const H = this.scale.height;
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0).setDepth(9000).setInteractive();
    const panel = this.add.image(W / 2, H / 2, 'panel').setDisplaySize(pw, ph).setDepth(9001);
    const title = this.add
      .text(W / 2, H / 2 - ph / 2 + 22, titleText, { ...STYLE, fontSize: '19px', fontStyle: 'bold', color: '#ffd27f' })
      .setOrigin(0.5)
      .setDepth(9002);
    this.popup.push(dim, panel, title);
    return { panel, x: W / 2, y: H / 2 };
  }

  private popupButton(x: number, y: number, w: number, h: number, label: string, cb: () => void, depth = 9002): UiButton {
    const bg = this.add.image(x, y, 'btn').setDisplaySize(w, h).setDepth(depth).setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, { ...STYLE, fontSize: '14px' }).setOrigin(0.5).setDepth(depth + 1);
    bg.on('pointerdown', cb);
    bg.on('pointerover', () => bg.setTint(0xcfe6d4));
    bg.on('pointerout', () => bg.clearTint());
    const btn = { key: `popup-${label}`, bg, label: text };
    this.popup.push(bg, text);
    return btn;
  }

  private closePopup(): void {
    for (const o of this.popup) o.destroy();
    this.popup = [];
    //  the gameobject pointerdown that closed the popup runs before the scene-level
    //  one, so without this the same tap reopens the shop for the slot underneath
    this.tapBlocked = true;
    this.events.once(Phaser.Scenes.Events.POST_UPDATE, () => {
      this.tapBlocked = false;
    });
    this.render();
  }

  private openShop(slot: ItemSlot): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const progress = profile.profile.rooms[this.currentRoom];
    const pw = Math.min(430, W * 0.88);
    const rowH = 46;
    const ph = Math.min(H * 0.82, 74 + slot.variants.length * (rowH + 6) + 50);
    const { x, y } = this.popupBase(t('shop.title', { slot: slot.name }), pw, ph);

    slot.variants.forEach((variant, i) => {
      const ry = y - ph / 2 + 52 + i * (rowH + 6) + rowH / 2;
      const owned = progress.owned.includes(variant.id);
      const inUse = progress.selected[slot.id] === variant.id;
      const rowBg = this.add
        .image(x, ry, 'btn-wide')
        .setDisplaySize(pw - 36, rowH)
        .setDepth(9002)
        .setInteractive({ useHandCursor: true });
      const name = this.add
        .text(x - pw / 2 + 34, ry, variant.premium ? `${variant.name} ★` : variant.name, { ...STYLE, fontSize: '15px' })
        .setOrigin(0, 0.5)
        .setDepth(9003);
      const state = this.add
        .text(x + pw / 2 - 34, ry, inUse ? t('shop.selected') : owned ? t('shop.owned') : `${variant.price}`, {
          ...STYLE,
          fontSize: '14px',
          color: inUse ? '#9fd6a8' : owned ? '#ffd27f' : '#f3e3c3',
        })
        .setOrigin(1, 0.5)
        .setDepth(9003);
      this.popup.push(rowBg, name, state);
      rowBg.on('pointerover', () => rowBg.setTint(0xcfe6d4));
      rowBg.on('pointerout', () => rowBg.clearTint());
      rowBg.on('pointerdown', () => {
        const result = profile.buyVariant(this.currentRoom, slot.id, variant.id);
        if (result === 'poor') {
          this.toast(t('toast.notEnoughCoins'));
          return;
        }
        if (result === 'bought') {
          ads().track('item_purchase', { room: this.currentRoom, item: variant.id, price: variant.price });
          this.toast(t('shop.bought', { item: variant.name }));
        }
        this.closePopup();
      });
    });

    this.popupButton(x, y + ph / 2 - 28, 130, 38, t('shop.close'), () => this.closePopup());
  }

  private openQuests(): void {
    profile.ensureQuests();
    const W = this.scale.width;
    const H = this.scale.height;
    const ids = profile.profile.quests.ids;
    const pw = Math.min(460, W * 0.9);
    const rowH = 52;
    const ph = Math.min(H * 0.82, 74 + ids.length * (rowH + 6) + 50);
    const { x, y } = this.popupBase(t('quests.title'), pw, ph);

    ids.forEach((id, i) => {
      const def = profile.questDef(id);
      const ry = y - ph / 2 + 52 + i * (rowH + 6) + rowH / 2;
      const cur = profile.profile.quests.progress[id] ?? 0;
      const claimed = profile.profile.quests.claimed.includes(id);
      const rowBg = this.add.image(x, ry, 'btn-wide').setDisplaySize(pw - 36, rowH).setDepth(9002);
      const text = this.add
        .text(x - pw / 2 + 34, ry - 8, def.text, { ...STYLE, fontSize: '14px' })
        .setOrigin(0, 0.5)
        .setDepth(9003);
      const prog = this.add
        .text(x - pw / 2 + 34, ry + 12, t('quests.progress', { cur, target: def.target }), { ...STYLE, fontSize: '12px', color: '#c9b18c' })
        .setOrigin(0, 0.5)
        .setDepth(9003);
      this.popup.push(rowBg, text, prog);
      if (claimed || cur >= def.target) {
        const claim = this.popupButton(x + pw / 2 - 74, ry, 76, 34, claimed ? t('quests.done') : t('quests.claim'), () => {
          const reward = profile.claimQuest(id);
          if (reward !== null) {
            ads().track('quest_complete', { quest: id, reward });
            this.toast(t('quests.claimed', { n: reward }));
            this.closePopup();
          }
        });
        if (claimed) {
          claim.bg.setAlpha(0.5).disableInteractive();
          claim.label.setColor('#9aa89c');
        }
      }
    });

    this.popupButton(x, y + ph / 2 - 28, 130, 38, t('shop.close'), () => this.closePopup());
  }

  private toast(msg: string): void {
    if (this.toastObj) this.toastObj.destroy();
    if (this.toastTimer) this.toastTimer.remove();
    const W = this.scale.width;
    const H = this.scale.height;
    this.toastObj = this.add
      .text(W / 2, H - this.tabH - 40, msg, { ...STYLE, fontSize: '15px', backgroundColor: '#1e2a21cc', padding: { x: 12, y: 7 } })
      .setOrigin(0.5)
      .setDepth(9500);
    this.toastTimer = this.time.delayedCall(1800, () => {
      this.toastObj?.destroy();
      this.toastObj = null;
    });
  }
}

// ---------------------------------------------------------------- procedural art

function livingSlotRect(slot: ItemSlot, room: Rect, portrait: boolean): Rect {
  const layout: Record<string, [number, number, number, number]> = portrait
    ? {
        rug: [0.15, 0.77, 0.70, 0.13],
        sofa: [0.17, 0.52, 0.70, 0.30],
        table: [0.43, 0.76, 0.43, 0.15],
        lamp: [0.83, 0.50, 0.13, 0.31],
        plant: [0.03, 0.62, 0.22, 0.19],
        painting: [0.48, 0.27, 0.39, 0.14],
      }
    : {
        rug: [0.28, 0.77, 0.54, 0.20],
        sofa: [0.27, 0.40, 0.49, 0.47],
        table: [0.50, 0.69, 0.29, 0.26],
        lamp: [0.82, 0.30, 0.14, 0.55],
        plant: [0.10, 0.50, 0.17, 0.35],
        painting: [0.59, 0.12, 0.25, 0.28],
      };
  const [x, y, w, h] = layout[slot.id] ?? [slot.x, slot.y, slot.w, slot.h];
  return { x: room.x + x * room.w, y: room.y + y * room.h, w: w * room.w, h: h * room.h };
}

function illustratedSlotRect(roomId: string, slot: ItemSlot, room: Rect, portrait: boolean): Rect {
  const layouts: Record<string, Record<string, [number, number, number, number]>> = portrait
    ? {
        kitchen: {
          counter: [0.12, 0.57, 0.52, 0.31], stove: [0.61, 0.56, 0.27, 0.29],
          table: [0.46, 0.74, 0.42, 0.21], chair: [0.31, 0.69, 0.20, 0.22],
          shelf: [0.48, 0.28, 0.38, 0.13], plant: [0.04, 0.68, 0.19, 0.22],
        },
        bedroom: {
          bed: [0.13, 0.43, 0.59, 0.45], rug: [0.38, 0.81, 0.51, 0.15],
          wardrobe: [0.72, 0.35, 0.25, 0.43], lamp: [0.64, 0.63, 0.17, 0.21],
          painting: [0.48, 0.25, 0.37, 0.16], plant: [0.03, 0.63, 0.22, 0.22],
        },
        garden: {
          bench: [0.18, 0.57, 0.51, 0.23], table: [0.50, 0.73, 0.36, 0.20],
          flowers: [0.69, 0.61, 0.29, 0.23], tree: [0.02, 0.21, 0.32, 0.59],
          lamp: [0.40, 0.59, 0.13, 0.28], rug: [0.30, 0.86, 0.48, 0.12],
        },
        office: {
          desk: [0.17, 0.56, 0.56, 0.32], chair: [0.32, 0.70, 0.28, 0.24],
          bookcase: [0.75, 0.32, 0.23, 0.46], rug: [0.17, 0.80, 0.63, 0.17],
          lamp: [0.32, 0.44, 0.17, 0.20], painting: [0.48, 0.24, 0.32, 0.17],
        },
      }
    : {
        kitchen: {
          counter: [0.11, 0.55, 0.43, 0.40], stove: [0.51, 0.49, 0.24, 0.38],
          table: [0.65, 0.68, 0.28, 0.27], chair: [0.56, 0.68, 0.15, 0.24],
          shelf: [0.22, 0.17, 0.30, 0.16], plant: [0.81, 0.56, 0.16, 0.30],
        },
        bedroom: {
          bed: [0.25, 0.37, 0.48, 0.57], rug: [0.51, 0.79, 0.37, 0.17],
          wardrobe: [0.77, 0.28, 0.19, 0.57], lamp: [0.68, 0.60, 0.13, 0.23],
          painting: [0.43, 0.10, 0.27, 0.23], plant: [0.07, 0.52, 0.18, 0.34],
        },
        garden: {
          bench: [0.24, 0.54, 0.37, 0.26], table: [0.56, 0.68, 0.24, 0.22],
          flowers: [0.76, 0.60, 0.22, 0.28], tree: [0.04, 0.13, 0.23, 0.69],
          lamp: [0.50, 0.53, 0.10, 0.31], rug: [0.46, 0.82, 0.33, 0.14],
        },
        office: {
          desk: [0.26, 0.49, 0.46, 0.39], chair: [0.42, 0.68, 0.23, 0.28],
          bookcase: [0.77, 0.25, 0.20, 0.56], rug: [0.24, 0.80, 0.52, 0.17],
          lamp: [0.36, 0.33, 0.13, 0.20], painting: [0.51, 0.10, 0.23, 0.23],
        },
      };
  const [x, y, w, h] = layouts[roomId]?.[slot.id] ?? [slot.x, slot.y, slot.w, slot.h];
  return { x: room.x + x * room.w, y: room.y + y * room.h, w: w * room.w, h: h * room.h };
}

const mix = (a: number, b: number, k: number): number =>
  (Math.round(((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k) << 16) |
  (Math.round(((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k) << 8) |
  Math.round((a & 255) * (1 - k) + (b & 255) * k);

const shade = (c: number, amt: number): number => mix(c, amt > 0 ? 0xffffff : 0x000000, Math.abs(amt));

function vGrad(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, top: number, bottom: number, strips = 12): void {
  for (let i = 0; i < strips; i++) {
    g.fillStyle(mix(top, bottom, i / (strips - 1)), 1);
    g.fillRect(x, y + (h / strips) * i, w, h / strips + 1);
  }
}

function shadow(g: Phaser.GameObjects.Graphics, cx: number, by: number, w: number): void {
  g.fillStyle(0x1a1208, 0.18).fillEllipse(cx, by, w, Math.max(4, w * 0.14));
}

function drawArt(g: Phaser.GameObjects.Graphics, art: ArtSpec, r: Rect, anims: AnimPiece[]): void {
  const c0 = hex(art.colors[0]);
  const c1 = hex(art.colors[1]);
  const { x, y, w, h } = r;
  switch (art.shape) {
    case 'wall': {
      vGrad(g, x, y, w, h, shade(c0, 0.14), shade(c0, -0.16));
      g.fillStyle(0xfff0c9, 0.07).fillTriangle(x + w * 0.05, y, x + w * 0.28, y, x + w * 0.5, y + h * 0.93);
      g.fillStyle(0xfff0c9, 0.04).fillTriangle(x + w * 0.34, y, x + w * 0.43, y, x + w * 0.71, y + h * 0.93);
      g.fillStyle(shade(c0, 0.45), 0.24).fillRect(x, y, w, Math.max(3, h * 0.02));
      g.fillStyle(shade(c0, -0.32), 0.2).fillRect(x, y + h * 0.025, w, Math.max(2, h * 0.008));
      for (let i = 0; i < 6; i++) {
        const px = x + (w / 6) * i;
        g.lineStyle(1, shade(c0, -0.28), 0.28).lineBetween(px, y + h * 0.04, px, y + h * 0.93);
        g.lineStyle(1, shade(c0, 0.4), 0.28).lineBetween(px + 3, y + h * 0.04, px + 3, y + h * 0.93);
        g.lineStyle(1.2, shade(c0, -0.26), 0.22).strokeRect(px + w * 0.016, y + h * 0.08, w / 6 - w * 0.032, h * 0.71);
      }
      g.fillStyle(c1, 1).fillRect(x, y + h * 0.93, w, h * 0.07);
      g.fillStyle(shade(c1, 0.42), 0.85).fillRect(x, y + h * 0.92, w, Math.max(2, h * 0.016));
      g.fillStyle(shade(c1, -0.23), 0.45).fillRect(x, y + h * 0.98, w, Math.max(2, h * 0.02));
      break;
    }
    case 'floor': {
      vGrad(g, x, y, w, h, shade(c0, 0.05), shade(c0, -0.3));
      g.lineStyle(1, shade(c0, -0.35), 0.55);
      for (let i = 1; i < 8; i++) {
        const px = x + (w / 8) * i;
        g.lineBetween(px, y, px, y + h);
      }
      for (let i = 1; i <= 8; i++) {
        const jy = y + h * (i % 2 === 0 ? 0.36 : 0.68);
        g.lineBetween(x + (w / 8) * (i - 1), jy, x + (w / 8) * i, jy);
      }
      g.lineStyle(1, shade(c0, 0.3), 0.12);
      for (let i = 0; i < 8; i++) {
        const px = x + (w / 8) * i;
        g.lineBetween(px + 3, y + 2, px + 3, y + h);
      }
      g.lineStyle(1, shade(c0, 0.18), 0.35);
      g.lineBetween(x, y + 1, x + w, y + 1);
      break;
    }
    case 'rug': {
      shadow(g, x + w / 2, y + h * 0.92, w * 1.08);
      g.fillStyle(shade(c0, -0.22), 1).fillEllipse(x + w / 2, y + h / 2, w, h);
      g.fillStyle(c0, 1).fillEllipse(x + w / 2, y + h / 2, w * 0.94, h * 0.9);
      g.lineStyle(Math.max(1.5, h * 0.03), c1, 0.85).strokeEllipse(x + w / 2, y + h / 2, w * 0.78, h * 0.72);
      g.lineStyle(Math.max(1, h * 0.01), shade(c1, -0.2), 0.55).strokeEllipse(x + w / 2, y + h / 2, w * 0.58, h * 0.52);
      g.fillStyle(shade(c1, 0.12), 0.9).fillEllipse(x + w / 2, y + h / 2, w * 0.34, h * 0.3);
      g.lineStyle(1, shade(c1, -0.15), 0.5);
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI * 2 * i) / 4 + Math.PI / 4;
        g.lineBetween(
          x + w / 2 + Math.cos(a) * w * 0.2,
          y + h / 2 + Math.sin(a) * h * 0.17,
          x + w / 2 + Math.cos(a) * w * 0.3,
          y + h / 2 + Math.sin(a) * h * 0.26
        );
      }
      break;
    }
    case 'sofa': {
      shadow(g, x + w / 2, y + h * 0.97, w * 0.92);
      g.fillStyle(shade(c1, -0.08), 1).fillRoundedRect(x, y, w, h * 0.52, 7);
      g.fillStyle(shade(c1, 0.15), 0.7).fillRoundedRect(x + w * 0.03, y + h * 0.03, w * 0.94, h * 0.09, 5);
      g.fillStyle(shade(c0, 0.06), 1).fillRoundedRect(x + w * 0.14, y + h * 0.14, w * 0.34, h * 0.34, 6);
      g.fillRoundedRect(x + w * 0.52, y + h * 0.14, w * 0.34, h * 0.34, 6);
      g.fillStyle(shade(c1, -0.3), 1);
      g.fillCircle(x + w * 0.31, y + h * 0.31, Math.max(1.5, h * 0.02));
      g.fillCircle(x + w * 0.69, y + h * 0.31, Math.max(1.5, h * 0.02));
      g.fillStyle(c0, 1).fillRoundedRect(x + w * 0.05, y + h * 0.42, w * 0.9, h * 0.4, 7);
      g.lineStyle(1.5, shade(c0, -0.25), 0.8).lineBetween(x + w * 0.5, y + h * 0.46, x + w * 0.5, y + h * 0.78);
      g.fillStyle(shade(c0, 0.12), 0.65).fillRoundedRect(x + w * 0.08, y + h * 0.44, w * 0.84, h * 0.07, 4);
      g.fillStyle(shade(c0, 0.28), 0.95).fillRoundedRect(x + w * 0.18, y + h * 0.53, w * 0.18, h * 0.14, 4);
      g.fillStyle(shade(c1, 0.3), 0.85).fillRoundedRect(x + w * 0.67, y + h * 0.51, w * 0.13, h * 0.17, 4);
      g.lineStyle(1, shade(c1, 0.5), 0.6).lineBetween(x + w * 0.2, y + h * 0.56, x + w * 0.32, y + h * 0.64);
      g.fillStyle(c1, 1).fillRoundedRect(x, y + h * 0.3, w * 0.13, h * 0.58, 6);
      g.fillRoundedRect(x + w * 0.87, y + h * 0.3, w * 0.13, h * 0.58, 6);
      g.fillStyle(shade(c1, 0.18), 0.8).fillRoundedRect(x + w * 0.015, y + h * 0.32, w * 0.1, h * 0.09, 4);
      g.fillRoundedRect(x + w * 0.885, y + h * 0.32, w * 0.1, h * 0.09, 4);
      g.fillStyle(0x4a3a28, 1).fillRect(x + w * 0.08, y + h * 0.88, w * 0.05, h * 0.12);
      g.fillRect(x + w * 0.87, y + h * 0.88, w * 0.05, h * 0.12);
      break;
    }
    case 'table': {
      shadow(g, x + w / 2, y + h * 0.96, w * 0.86);
      g.fillStyle(c1, 1);
      g.fillRect(x + w * 0.1, y + h * 0.3, w * 0.07, h * 0.66);
      g.fillRect(x + w * 0.83, y + h * 0.3, w * 0.07, h * 0.66);
      g.fillStyle(shade(c1, -0.25), 1);
      g.fillRect(x + w * 0.1, y + h * 0.9, w * 0.09, h * 0.06);
      g.fillRect(x + w * 0.81, y + h * 0.9, w * 0.09, h * 0.06);
      g.fillStyle(shade(c0, -0.22), 1).fillRect(x + w * 0.06, y + h * 0.26, w * 0.88, h * 0.12);
      g.fillStyle(c0, 1).fillRoundedRect(x, y, w, h * 0.28, 5);
      g.fillStyle(shade(c0, 0.22), 0.75).fillRoundedRect(x + w * 0.02, y + h * 0.02, w * 0.96, h * 0.08, 4);
      g.lineStyle(1.5, 0x4a3a28, 0.5).strokeRoundedRect(x, y, w, h * 0.28, 5);
      const vx = x + w * 0.72;
      const vy = y - h * 0.02;
      g.fillStyle(shade(c1, 0.2), 1).fillEllipse(vx, vy - h * 0.06, w * 0.1, h * 0.12);
      g.fillStyle(0x6d9b6a, 1);
      g.fillEllipse(vx - w * 0.04, vy - h * 0.18, w * 0.07, h * 0.1);
      g.fillEllipse(vx + w * 0.04, vy - h * 0.2, w * 0.07, h * 0.11);
      break;
    }
    case 'lamp': {
      shadow(g, x + w / 2, y + h * 0.99, w * 0.6);
      g.fillStyle(c1, 1).fillRect(x + w * 0.46, y + h * 0.32, w * 0.08, h * 0.6);
      g.fillStyle(shade(c1, -0.1), 1).fillEllipse(x + w * 0.5, y + h * 0.95, w * 0.44, h * 0.07);
      g.fillStyle(c0, 1).fillPoints(
        [
          { x: x + w * 0.18, y: y + h * 0.34 },
          { x: x + w * 0.82, y: y + h * 0.34 },
          { x: x + w * 0.66, y: y + h * 0.02 },
          { x: x + w * 0.34, y: y + h * 0.02 },
        ],
        true
      );
      g.fillStyle(shade(c0, 0.3), 0.85).fillPoints(
        [
          { x: x + w * 0.2, y: y + h * 0.34 },
          { x: x + w * 0.8, y: y + h * 0.34 },
          { x: x + w * 0.76, y: y + h * 0.26 },
          { x: x + w * 0.24, y: y + h * 0.26 },
        ],
        true
      );
      g.lineStyle(1.5, shade(c0, -0.25), 0.8).lineBetween(x + w * 0.18, y + h * 0.34, x + w * 0.82, y + h * 0.34);
      anims.push({
        type: 'glow',
        px: x + w * 0.5,
        py: y + h * 0.36,
        draw: (ag) => {
          ag.fillStyle(0xffdf9e, 0.16).fillEllipse(0, h * 0.1, w * 1.7, h * 0.9);
          ag.fillStyle(0xffdf9e, 0.22).fillEllipse(0, h * 0.05, w * 1.15, h * 0.6);
          ag.fillStyle(0xffe9bd, 0.3).fillEllipse(0, 0, w * 0.7, h * 0.36);
        },
      });
      break;
    }
    case 'plant': {
      shadow(g, x + w / 2, y + h * 0.99, w * 0.62);
      const potTop = y + h * 0.66;
      g.lineStyle(Math.max(1.5, w * 0.03), shade(c0, -0.3), 1).lineBetween(x + w * 0.5, potTop, x + w * 0.5, potTop - h * 0.16);
      g.fillStyle(c1, 1).fillPoints(
        [
          { x: x + w * 0.26, y: y + h },
          { x: x + w * 0.74, y: y + h },
          { x: x + w * 0.68, y: potTop + h * 0.05 },
          { x: x + w * 0.32, y: potTop + h * 0.05 },
        ],
        true
      );
      g.fillStyle(shade(c1, 0.18), 1).fillRoundedRect(x + w * 0.27, potTop - h * 0.02, w * 0.46, h * 0.09, 3);
      g.fillStyle(0x3a2a1a, 1).fillEllipse(x + w * 0.5, potTop + h * 0.03, w * 0.34, h * 0.045);
      const leafR = Math.min(w, h);
      anims.push({
        type: 'sway',
        px: x + w * 0.5,
        py: potTop,
        draw: (ag) => {
          ag.fillStyle(shade(c0, -0.12), 1);
          ag.fillCircle(-w * 0.2, -h * 0.22, leafR * 0.17);
          ag.fillCircle(w * 0.2, -h * 0.24, leafR * 0.18);
          ag.fillStyle(c0, 1);
          ag.fillCircle(0, -h * 0.3, leafR * 0.24);
          ag.fillCircle(-w * 0.13, -h * 0.36, leafR * 0.15);
          ag.fillCircle(w * 0.15, -h * 0.38, leafR * 0.14);
          ag.fillStyle(shade(c0, 0.22), 0.85);
          ag.fillCircle(-w * 0.06, -h * 0.36, leafR * 0.1);
          ag.lineStyle(1.2, shade(c0, -0.35), 0.5);
          ag.lineBetween(0, -h * 0.06, 0, -h * 0.44);
          ag.lineBetween(0, -h * 0.2, -w * 0.17, -h * 0.3);
          ag.lineBetween(0, -h * 0.22, w * 0.17, -h * 0.32);
        },
      });
      break;
    }
    case 'painting': {
      g.fillStyle(0x1a1208, 0.18).fillRect(x + w * 0.04, y + h * 0.05, w, h);
      g.fillStyle(shade(c0, -0.15), 1).fillRect(x, y, w, h);
      g.fillStyle(c0, 1).fillRect(x + w * 0.03, y + h * 0.03, w * 0.94, h * 0.94);
      const ix = x + w * 0.1;
      const iy = y + h * 0.1;
      const iw = w * 0.8;
      const ih = h * 0.8;
      vGrad(g, ix, iy, iw, ih, shade(c1, 0.3), shade(c1, -0.05), 8);
      g.fillStyle(0xffd98a, 0.95).fillCircle(ix + iw * 0.72, iy + ih * 0.28, Math.min(iw, ih) * 0.13);
      g.fillStyle(shade(c0, 0.15), 0.9).fillTriangle(ix, iy + ih, ix + iw * 0.42, iy + ih * 0.42, ix + iw * 0.75, iy + ih);
      g.fillStyle(shade(c0, -0.05), 0.95).fillTriangle(ix + iw * 0.35, iy + ih, ix + iw * 0.78, iy + ih * 0.55, ix + iw, iy + ih);
      g.lineStyle(1.2, shade(c0, -0.4), 0.8);
      g.lineBetween(ix + iw * 0.2, iy + ih * 0.25, ix + iw * 0.24, iy + ih * 0.22);
      g.lineBetween(ix + iw * 0.24, iy + ih * 0.22, ix + iw * 0.28, iy + ih * 0.25);
      break;
    }
    case 'bed': {
      shadow(g, x + w / 2, y + h * 0.97, w * 0.94);
      g.fillStyle(c1, 1).fillRoundedRect(x, y, w * 0.13, h * 0.9, 5);
      g.fillStyle(shade(c1, 0.15), 1).fillCircle(x + w * 0.065, y + h * 0.03, w * 0.05);
      g.fillStyle(0xf1ead8, 1).fillRoundedRect(x + w * 0.12, y + h * 0.24, w * 0.88, h * 0.6, 7);
      g.fillStyle(c0, 1).fillRoundedRect(x + w * 0.4, y + h * 0.3, w * 0.6, h * 0.54, 6);
      g.fillStyle(shade(c0, -0.15), 0.9).fillRect(x + w * 0.4, y + h * 0.3, w * 0.05, h * 0.54);
      g.lineStyle(1, shade(c0, -0.25), 0.5);
      g.lineBetween(x + w * 0.58, y + h * 0.36, x + w * 0.58, y + h * 0.8);
      g.lineBetween(x + w * 0.78, y + h * 0.36, x + w * 0.78, y + h * 0.8);
      g.fillStyle(0xfdfcf4, 1).fillRoundedRect(x + w * 0.16, y + h * 0.14, w * 0.22, h * 0.22, 6);
      g.lineStyle(1, 0xd8cfb8, 0.9).strokeRoundedRect(x + w * 0.18, y + h * 0.16, w * 0.18, h * 0.18, 5);
      g.fillStyle(shade(c1, -0.2), 1).fillRect(x + w * 0.12, y + h * 0.84, w * 0.86, h * 0.08);
      break;
    }
    case 'counter': {
      shadow(g, x + w / 2, y + h * 0.99, w * 0.96);
      vGrad(g, x, y + h * 0.2, w, h * 0.72, shade(c1, 0.05), shade(c1, -0.18), 8);
      g.lineStyle(1.5, shade(c1, -0.3), 0.9);
      g.strokeRect(x + w * 0.07, y + h * 0.32, w * 0.38, h * 0.5);
      g.strokeRect(x + w * 0.55, y + h * 0.32, w * 0.38, h * 0.5);
      g.fillStyle(0xe8d9b0, 1);
      g.fillCircle(x + w * 0.42, y + h * 0.56, Math.max(1.5, h * 0.025));
      g.fillCircle(x + w * 0.58, y + h * 0.56, Math.max(1.5, h * 0.025));
      g.fillStyle(shade(c1, -0.45), 1).fillRect(x + w * 0.04, y + h * 0.92, w * 0.92, h * 0.08);
      g.fillStyle(c0, 1).fillRoundedRect(x - w * 0.02, y, w * 1.04, h * 0.2, 4);
      g.fillStyle(shade(c0, 0.2), 0.8).fillRect(x, y + h * 0.02, w, h * 0.05);
      g.lineStyle(1.5, shade(c0, -0.3), 0.6).lineBetween(x - w * 0.02, y + h * 0.2, x + w * 1.02, y + h * 0.2);
      g.fillStyle(shade(c0, -0.2), 1).fillEllipse(x + w * 0.3, y - h * 0.01, w * 0.2, h * 0.08);
      g.fillStyle(0xe9a13b, 1).fillCircle(x + w * 0.26, y - h * 0.05, h * 0.04);
      g.fillStyle(0xd95f4b, 1).fillCircle(x + w * 0.33, y - h * 0.06, h * 0.04);
      g.fillStyle(0x9fc46a, 1).fillCircle(x + w * 0.295, y - h * 0.085, h * 0.04);
      break;
    }
    case 'shelf': {
      const board = (by: number): void => {
        g.fillStyle(c0, 1).fillRect(x, by, w, h * 0.1);
        g.fillStyle(shade(c0, 0.2), 0.7).fillRect(x, by, w, h * 0.025);
        g.fillStyle(shade(c0, -0.25), 1);
        g.fillTriangle(x + w * 0.12, by + h * 0.1, x + w * 0.2, by + h * 0.1, x + w * 0.12, by + h * 0.24);
        g.fillTriangle(x + w * 0.8, by + h * 0.1, x + w * 0.88, by + h * 0.1, x + w * 0.88, by + h * 0.24);
      };
      g.fillStyle(shade(c1, 0.2), 1).fillRect(x + w * 0.42, y + h * 0.08, w * 0.07, h * 0.22);
      g.fillStyle(shade(c1, -0.05), 1).fillRect(x + w * 0.5, y + h * 0.11, w * 0.06, h * 0.19);
      g.fillStyle(shade(c1, -0.25), 1).fillRect(x + w * 0.57, y + h * 0.14, w * 0.055, h * 0.16);
      g.fillStyle(c1, 1).fillCircle(x + w * 0.2, y + h * 0.22, h * 0.08);
      g.fillStyle(0x6d9b6a, 1).fillCircle(x + w * 0.2, y + h * 0.12, h * 0.05);
      board(y + h * 0.3);
      g.fillStyle(shade(c1, 0.1), 1).fillRoundedRect(x + w * 0.55, y + h * 0.6, w * 0.24, h * 0.18, 3);
      g.fillStyle(shade(c1, -0.2), 1).fillCircle(x + w * 0.3, y + h * 0.7, h * 0.075);
      board(y + h * 0.78);
      break;
    }
    case 'chair': {
      shadow(g, x + w / 2, y + h * 0.99, w * 0.8);
      g.fillStyle(c1, 1);
      g.fillRect(x + w * 0.16, y, w * 0.09, h * 0.5);
      g.fillRect(x + w * 0.75, y, w * 0.09, h * 0.5);
      g.fillStyle(shade(c1, 0.12), 1).fillRoundedRect(x + w * 0.14, y, w * 0.72, h * 0.12, 5);
      g.fillStyle(shade(c1, -0.12), 1).fillRect(x + w * 0.3, y + h * 0.17, w * 0.4, h * 0.06);
      g.fillRect(x + w * 0.3, y + h * 0.3, w * 0.4, h * 0.06);
      g.fillStyle(c0, 1).fillRoundedRect(x + w * 0.06, y + h * 0.48, w * 0.88, h * 0.14, 4);
      g.fillStyle(shade(c0, 0.18), 0.7).fillRect(x + w * 0.08, y + h * 0.49, w * 0.84, h * 0.035);
      g.fillStyle(c1, 1);
      g.fillRect(x + w * 0.12, y + h * 0.62, w * 0.08, h * 0.38);
      g.fillRect(x + w * 0.8, y + h * 0.62, w * 0.08, h * 0.38);
      g.fillStyle(shade(c1, -0.2), 1).fillRect(x + w * 0.2, y + h * 0.78, w * 0.6, h * 0.045);
      break;
    }
    case 'tree': {
      shadow(g, x + w / 2, y + h * 0.99, w * 0.7);
      g.fillStyle(c1, 1).fillPoints(
        [
          { x: x + w * 0.4, y: y + h },
          { x: x + w * 0.6, y: y + h },
          { x: x + w * 0.55, y: y + h * 0.5 },
          { x: x + w * 0.45, y: y + h * 0.5 },
        ],
        true
      );
      g.lineStyle(Math.max(1.5, w * 0.025), shade(c1, -0.15), 1).lineBetween(x + w * 0.5, y + h * 0.62, x + w * 0.3, y + h * 0.45);
      const cr = Math.min(w, h);
      anims.push({
        type: 'sway',
        px: x + w * 0.5,
        py: y + h * 0.52,
        draw: (ag) => {
          ag.fillStyle(shade(c0, -0.15), 1);
          ag.fillCircle(-w * 0.24, -h * 0.08, cr * 0.2);
          ag.fillCircle(w * 0.24, -h * 0.08, cr * 0.2);
          ag.fillStyle(c0, 1);
          ag.fillCircle(0, -h * 0.2, cr * 0.28);
          ag.fillCircle(-w * 0.16, -h * 0.26, cr * 0.18);
          ag.fillCircle(w * 0.17, -h * 0.25, cr * 0.17);
          ag.fillStyle(shade(c0, 0.2), 0.8);
          ag.fillCircle(-w * 0.08, -h * 0.3, cr * 0.12);
          ag.fillStyle(0xe9a13b, 1);
          ag.fillCircle(w * 0.12, -h * 0.12, cr * 0.035);
          ag.fillCircle(-w * 0.2, -h * 0.16, cr * 0.035);
          ag.fillCircle(w * 0.02, -h * 0.34, cr * 0.035);
        },
      });
      break;
    }
  }
}
