import Phaser from 'phaser';
import { Card, cardId, fullDeck } from '../core/cards';
import {
  GameState,
  Hint,
  Location,
  allFaceUp,
  applyMove,
  canMove,
  drawFromStock,
  findHint,
  foundationIndex,
  tableauMovableCount,
  topCard,
  undo,
} from '../core/klondike';
import { generateDeal } from '../core/generator';
import { CARD_H, CARD_W, CardView } from '../ui/CardView';
import { profile, session } from '../app';
import { ECONOMY, comboMultiplier, winReward } from '../meta/economy';
import { ads, adsEnabled } from '../platform/AdProvider';
import { t } from '../i18n';

const CARD_RATIO = CARD_H / CARD_W;

interface Metrics {
  cw: number;
  ch: number;
  gap: number;
  x0: number;
  topY: number;
  tabTop: number;
  tabMaxH: number;
  hudY: number;
  hudH: number;
  scale: number;
}

type CardPick =
  | { kind: 'waste'; card: Card }
  | { kind: 'tableau'; index: number; cardIndex: number; card: Card };

type Pick = CardPick | { kind: 'stock' };

interface HudButton {
  key: string;
  bg: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private views = new Map<string, CardView>();
  private slots: Phaser.GameObjects.Image[] = [];
  private felt!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private tableMark!: Phaser.GameObjects.Text;
  private introBg!: Phaser.GameObjects.Graphics;
  private introTitle!: Phaser.GameObjects.Text;
  private tableTip!: Phaser.GameObjects.Text;
  private helpButton!: HudButton;
  private helpOverlay: Phaser.GameObjects.GameObject[] = [];
  private helpOpen = false;
  private hasPlayed = false;
  private hudButtons: HudButton[] = [];
  private hudObjects = new Set<Phaser.GameObjects.GameObject>();
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private m: Metrics = { cw: 0, ch: 0, gap: 0, x0: 0, topY: 0, tabTop: 0, tabMaxH: 0, hudY: 0, hudH: 0, scale: 1 };

  private selection: { from: Location; take: number; views: CardView[] } | null = null;
  private down: { x: number; y: number; time: number; pick: CardPick } | null = null;
  private drag: { views: CardView[]; origin: { x: number; y: number }[]; from: Location; take: number } | null = null;
  private lastTap: { id: string; time: number } | null = null;
  private dealing = false;
  private startedAt = 0;
  private finalSecs = 0;
  private autoRunning = false;
  private pulse: Phaser.Tweens.Tween | null = null;
  private gameplayActive = false;
  private loadedOnce = false;
  private adChoiceOpen = false;
  private tapBlocked = false;
  private toastObj: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super('Game');
  }

  create(): void {
    //  the scene instance is reused across Home <-> Game round trips, so every
    //  collection and modal flag has to start from a clean slate
    this.views = new Map();
    this.slots = [];
    this.hudButtons = [];
    this.hudObjects = new Set();
    this.overlay = [];
    this.helpOverlay = [];
    this.helpOpen = false;
    this.drag = null;
    this.down = null;
    this.pulse = null;
    this.adChoiceOpen = false;
    this.tapBlocked = false;
    this.toastObj = null;
    this.toastTimer = null;

    this.felt = this.add.graphics();
    this.tableMark = this.add
      .text(0, 0, 'COZY\nSOLITAIRE', {
        fontFamily: 'Georgia, serif', fontSize: '38px', fontStyle: 'bold',
        color: '#e4d2aa', align: 'center', lineSpacing: -5,
      })
      .setOrigin(0.5).setAlpha(0.11).setDepth(0.5);
    this.introBg = this.add.graphics().setDepth(0.6);
    this.introTitle = this.add
      .text(0, 0, t('how.title'), {
        fontFamily: 'Arial, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#ffd27f',
      })
      .setOrigin(0.5).setDepth(0.7);
    this.tableTip = this.add
      .text(0, 0, t('game.tip', { hints: ECONOMY.hintFree, undos: ECONOMY.undoFree }), {
        fontFamily: 'Arial, sans-serif', fontSize: '14px', lineSpacing: 5,
        color: '#e8d9b7', align: 'center',
      })
      .setOrigin(0.5).setDepth(0.7);
    for (let i = 0; i < 6; i++) this.slots.push(this.add.image(0, 0, 'slot').setDepth(1));
    for (const card of fullDeck()) {
      const v = new CardView(this, card);
      v.setVisible(false).setDepth(10);
      this.views.set(cardId(card), v);
      this.add.existing(v);
    }

    this.buildHud();
    this.computeMetrics();
    this.placeStatic();
    this.layoutHud();

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.time.addEvent({ delay: 500, loop: true, callback: () => this.updateHud() });

    this.newGame(1);
  }

  // ---------------------------------------------------------------- layout

  private onResize(): void {
    if (this.helpOpen) this.closeHelp();
    this.computeMetrics();
    this.placeStatic();
    this.layoutHud();
    this.layout();
  }

  private computeMetrics(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const gap = Phaser.Math.Clamp(Math.round(W * 0.008), 6, 16);
    const hudH = W < 700
      ? Phaser.Math.Clamp(Math.round(H * 0.13), 70, 88)
      : Phaser.Math.Clamp(Math.round(H * 0.09), 42, 62);
    const margin = gap;
    const byW = (W - margin * 2 - gap * 6) / 7;
    const availH = H - margin * 2 - hudH - gap * 2;
    let cw = byW;
    let ch = cw * CARD_RATIO;
    const maxCh = availH / 3.6;
    if (ch > maxCh) {
      ch = maxCh;
      cw = ch / CARD_RATIO;
    }
    cw = Math.floor(Math.max(34, cw));
    ch = Math.floor(ch);
    const totalW = 7 * cw + 6 * gap;
    const tabTop = Math.round(margin + ch + gap * 1.6);
    this.m = {
      cw,
      ch,
      gap,
      x0: Math.round((W - totalW) / 2 + cw / 2),
      topY: Math.round(margin + ch / 2),
      tabTop,
      tabMaxH: Math.max(ch, H - margin - hudH - gap - tabTop),
      hudY: Math.round(H - margin - hudH / 2),
      hudH,
      scale: cw / CARD_W,
    };
  }

  private colX(i: number): number {
    return this.m.x0 + i * (this.m.cw + this.m.gap);
  }

  private placeStatic(): void {
    const { cw, ch, scale } = this.m;
    const W = this.scale.width;
    const H = this.scale.height;
    const g = this.felt;
    const hudTop = H - this.m.gap - this.m.hudH;
    g.clear().setDepth(0);
    g.fillStyle(0x142b25, 1).fillRect(0, 0, W, H);
    g.fillStyle(0xa48352, 1).fillRoundedRect(5, 5, W - 10, H - 10, 18);
    g.fillStyle(0x1c3d32, 1).fillRoundedRect(8, 8, W - 16, H - 16, 15);
    g.fillStyle(0x3b6752, 0.55).fillRoundedRect(12, 12, W - 24, Math.max(20, hudTop - 10), 11);
    g.fillStyle(0x204736, 0.5).fillRoundedRect(12, 12 + Math.max(20, hudTop - 10) * 0.38, W - 24, Math.max(20, hudTop - 10) * 0.62, 11);
    for (let y = 24; y < hudTop - 18; y += 34) {
      for (let x = 26 + ((Math.round(y / 34) % 2) * 17); x < W - 18; x += 34) {
        g.fillStyle(0xe6dbb2, 0.035).fillCircle(x, y, 1);
      }
    }
    g.lineStyle(1, 0xd8bc83, 0.34).strokeRoundedRect(13, 13, W - 26, H - 26, 11);
    g.fillStyle(0x18352c, 0.96).fillRoundedRect(15, hudTop, W - 30, this.m.hudH - 2, 9);
    g.lineStyle(1, 0xc5a978, 0.45).lineBetween(25, hudTop + 1, W - 25, hudTop + 1);
    this.tableMark.setPosition(W / 2, Math.min(hudTop - 62, this.m.tabTop + this.m.ch * 2.65))
      .setFontSize(Phaser.Math.Clamp(Math.round(W * 0.06), 24, 42));
    const introW = Math.min(390, W - 36);
    const introH = W < 430 ? 185 : 170;
    const introY = Math.round((this.m.tabTop + this.m.ch + hudTop) / 2);
    this.introBg.clear();
    this.introBg.fillStyle(0x19382e, 0.92).fillRoundedRect(W / 2 - introW / 2, introY - introH / 2, introW, introH, 13);
    this.introBg.lineStyle(1.5, 0xd7bb81, 0.76).strokeRoundedRect(W / 2 - introW / 2, introY - introH / 2, introW, introH, 13);
    this.introTitle.setPosition(W / 2, introY - introH / 2 + 27).setFontSize(W < 430 ? 15 : 18);
    this.tableTip.setPosition(W / 2, introY + 14)
      .setFontSize(W < 430 ? 12 : 14)
      .setWordWrapWidth(introW - 28);
    this.setIntroVisible(!this.hasPlayed);
    this.helpButton.bg.setPosition(this.colX(2), this.m.topY)
      .setDisplaySize(Math.max(34, Math.min(75, cw * 0.7)), Math.max(34, Math.min(44, ch * 0.38)));
    this.helpButton.label.setPosition(this.colX(2), this.m.topY)
      .setText(W < 430 ? '?' : t('how.button'))
      .setFontSize(W < 430 ? 19 : 13);
    this.slots[0].setPosition(this.colX(0), this.m.topY).setDisplaySize(cw, ch);
    this.slots[1].setPosition(this.colX(1), this.m.topY).setDisplaySize(cw, ch);
    for (let i = 0; i < 4; i++) this.slots[2 + i].setPosition(this.colX(3 + i), this.m.topY).setDisplaySize(cw, ch);
    for (const v of this.views.values()) v.setScale(scale);
  }

  private setIntroVisible(visible: boolean): void {
    this.introBg.setVisible(visible);
    this.introTitle.setVisible(visible);
    this.tableTip.setVisible(visible);
  }

  private fanSteps(): { down: number; up: number } {
    return { down: Math.max(4, Math.round(this.m.ch * 0.16)), up: Math.max(8, Math.round(this.m.ch * 0.24)) };
  }

  /** Fan compression factor for a pile so long piles never overflow into the HUD. */
  private pileScale(pile: { faceUp: boolean }[]): number {
    const { down, up } = this.fanSteps();
    let d = 0;
    let u = 0;
    for (const e of pile) (e.faceUp ? u++ : d++);
    const needed = d * down + Math.max(0, u - 1) * up + this.m.ch;
    if (needed <= this.m.tabMaxH || needed <= this.m.ch) return 1;
    return (this.m.tabMaxH - this.m.ch) / (needed - this.m.ch);
  }

  private pileY(pile: { faceUp: boolean }[], index: number): number {
    const { down, up } = this.fanSteps();
    const k = this.pileScale(pile);
    let y = this.m.tabTop + this.m.ch / 2;
    for (let i = 0; i < index; i++) y += pile[i].faceUp ? up * k : down * k;
    return Math.round(y);
  }

  private wasteGeom(): { base: number; off: number; visible: number } {
    const n = this.state.waste.length;
    const visible = Math.min(this.state.drawCount === 3 ? 3 : 1, n);
    const off = this.state.drawCount === 3 ? Math.round(this.m.cw * 0.3) : 0;
    return { base: this.colX(1) - Math.round((visible - 1) * off), off, visible };
  }

  /** Repositions every card from state. `skip` holds cards currently under the pointer. */
  private layout(skip: Set<CardView> = new Set()): void {
    let depth = 10;
    const s = this.state;
    const place = (v: CardView, x: number, y: number) => {
      if (!skip.has(v)) v.setPosition(x, y).setDepth(depth++);
      else depth++;
    };

    const stockTop = s.stock.length - 1;
    s.stock.forEach((card, i) => {
      const v = this.view(card);
      v.setFaceUp(false).setVisible(i === stockTop);
      place(v, this.colX(0), this.m.topY);
    });

    const { base, off, visible } = this.wasteGeom();
    s.waste.forEach((card, i) => {
      const v = this.view(card);
      const shown = i >= s.waste.length - visible;
      v.setFaceUp(true).setVisible(shown);
      place(v, base + (i - (s.waste.length - visible)) * off, this.m.topY);
    });

    s.foundations.forEach((pile, i) => {
      pile.forEach((card, k) => {
        const v = this.view(card);
        v.setFaceUp(true).setVisible(k === pile.length - 1);
        place(v, this.colX(3 + i), this.m.topY);
      });
    });

    s.tableau.forEach((pile, p) => {
      pile.forEach((entry, i) => {
        const v = this.view(entry.card);
        v.setFaceUp(entry.faceUp).setVisible(true);
        place(v, this.colX(p), this.pileY(pile, i));
      });
    });
  }

  private view(card: Card): CardView {
    return this.views.get(cardId(card))!;
  }

  // ---------------------------------------------------------------- game flow

  private newGame(drawCount: 1 | 3): void {
    this.dealing = true;
    this.clearSelection();
    this.destroyOverlay();
    this.stopPulse();
    this.drag = null;
    this.down = null;
    session.usedUndo = 0;
    session.usedHint = 0;
    session.cleanDeal = true;
    session.undoUnlimited = false;
    session.hintBonus = 0;
    for (const v of this.views.values()) v.setVisible(false);
    const msg = this.add
      .text(this.scale.width / 2, this.scale.height / 2, t('game.dealing'), {
        fontFamily: 'Arial, sans-serif',
        fontSize: '22px',
        color: '#f3e3c3',
      })
      .setOrigin(0.5)
      .setDepth(9000);

    this.time.delayedCall(40, () => {
      msg.destroy();
      this.state = generateDeal(Math.floor(Math.random() * 2147483647), drawCount).state;
      this.startedAt = Date.now();
      this.finalSecs = 0;
      this.autoRunning = false;
      this.dealing = false;
      if (!this.gameplayActive) {
        this.gameplayActive = true;
        ads().gameplayStart();
      }
      if (!this.loadedOnce) {
        this.loadedOnce = true;
        ads().loadingFinished();
      }
      ads().track('round_start', { mode: drawCount, seed: this.state.seed });
      this.layout();
      this.updateHud();
      this.setIntroVisible(!this.hasPlayed);
    });
  }

  private afterMove(): void {
    this.hasPlayed = true;
    this.setIntroVisible(false);
    this.clearSelection();
    this.layout();
    this.updateHud();
    if (this.state.won) this.showWin();
    else if (!this.autoRunning && allFaceUp(this.state)) this.runAutoComplete();
  }

  private runAutoComplete(): void {
    this.autoRunning = true;
    const step = () => {
      if (this.state.won) {
        this.showWin();
        return;
      }
      const sources: Location[] = [];
      if (this.state.waste.length) sources.push({ pile: 'waste' });
      this.state.tableau.forEach((pile, i) => {
        if (pile.length && pile[pile.length - 1].faceUp) sources.push({ pile: 'tableau', index: i });
      });
      let best: { loc: Location; card: Card } | null = null;
      for (const loc of sources) {
        const card = topCard(this.state, loc);
        if (!card || !canMove(this.state, loc, { pile: 'foundation', index: foundationIndex(card) })) continue;
        if (!best || card.rank < best.card.rank) best = { loc, card };
      }
      if (!best) return;
      applyMove(this.state, best.loc, { pile: 'foundation', index: foundationIndex(best.card) });
      this.layout();
      this.updateHud();
      this.time.delayedCall(110, step);
    };
    step();
  }

  // ---------------------------------------------------------------- input

  private pick(x: number, y: number): Pick | null {
    const { cw, ch } = this.m;
    const s = this.state;
    const inside = (cx: number, cy: number) => Math.abs(x - cx) <= cw / 2 && Math.abs(y - cy) <= ch / 2;

    if (inside(this.colX(0), this.m.topY)) return { kind: 'stock' };

    if (s.waste.length) {
      const { base, off, visible } = this.wasteGeom();
      if (inside(base + (visible - 1) * off, this.m.topY)) return { kind: 'waste', card: s.waste[s.waste.length - 1] };
    }

    for (let p = 6; p >= 0; p--) {
      const pile = s.tableau[p];
      for (let i = pile.length - 1; i >= 0; i--) {
        if (inside(this.colX(p), this.pileY(pile, i))) {
          return { kind: 'tableau', index: p, cardIndex: i, card: pile[i].card };
        }
      }
    }
    return null;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (this.dealing || this.state.won || this.adChoiceOpen || this.helpOpen || this.tapBlocked) return;
    if (this.input.hitTestPointer(pointer).some((o) => this.hudObjects.has(o))) return;
    this.stopPulse();
    const pick = this.pick(pointer.x, pointer.y);
    if (!pick) {
      this.clearSelection();
      return;
    }
    if (pick.kind === 'stock') {
      if (drawFromStock(this.state)) this.afterMove();
      return;
    }
    this.down = { x: pointer.x, y: pointer.y, time: this.time.now, pick };
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (this.drag) {
      this.moveDrag(pointer);
      return;
    }
    if (!this.down || !pointer.isDown) return;
    if (Phaser.Math.Distance.Between(this.down.x, this.down.y, pointer.x, pointer.y) < 7) return;
    if (this.startDrag(this.down.pick)) this.moveDrag(pointer);
    else this.down = null;
  }

  private startDrag(pick: CardPick): boolean {
    const s = this.state;
    let from: Location;
    let cards: Card[];
    if (pick.kind === 'waste') {
      from = { pile: 'waste' };
      cards = [pick.card];
    } else {
      const pile = s.tableau[pick.index];
      if (!pile[pick.cardIndex].faceUp) return false;
      const take = pile.length - pick.cardIndex;
      if (tableauMovableCount(s, pick.index) < take) return false;
      from = { pile: 'tableau', index: pick.index };
      cards = pile.slice(pick.cardIndex).map((e) => e.card);
    }
    this.clearSelection();
    const views = cards.map((c) => this.view(c));
    this.drag = {
      views,
      origin: views.map((v) => ({ x: v.x, y: v.y })),
      from,
      take: cards.length,
    };
    this.layout(new Set(views));
    views.forEach((v, i) => v.setVisible(true).setDepth(5000 + i));
    return true;
  }

  private moveDrag(pointer: Phaser.Input.Pointer): void {
    if (!this.drag || !this.down) return;
    const dx = pointer.x - this.down.x;
    const dy = pointer.y - this.down.y;
    this.drag.views.forEach((v, i) => v.setPosition(this.drag!.origin[i].x + dx, this.drag!.origin[i].y + dy));
  }

  private onUp(): void {
    const down = this.down;
    const drag = this.drag;
    this.down = null;
    this.drag = null;

    if (drag) {
      const head = drag.views[0];
      const target = this.dropTarget(head.x, head.y);
      const ok = target ? applyMove(this.state, drag.from, target, drag.take) : false;
      if (ok) this.afterMove();
      else this.layout();
      return;
    }
    if (!down || this.time.now - down.time > 500) return;
    this.handleTap(down.pick, down.time, down.x, down.y);
  }

  private handleTap(pick: CardPick, time: number, x: number, y: number): void {
    const s = this.state;
    const id = pick.kind === 'waste' ? `w:${cardId(pick.card)}` : `t${pick.index}:${cardId(pick.card)}`;
    const loc: Location = pick.kind === 'waste' ? { pile: 'waste' } : { pile: 'tableau', index: pick.index };

    if (this.lastTap && this.lastTap.id === id && time - this.lastTap.time < 350) {
      this.lastTap = null;
      const card = topCard(s, loc);
      if (card && applyMove(s, loc, { pile: 'foundation', index: foundationIndex(card) })) {
        this.afterMove();
        return;
      }
    }
    this.lastTap = { id, time };

    if (this.selection) {
      const sameSource =
        (pick.kind === 'waste' && this.selection.from.pile === 'waste') ||
        (pick.kind === 'tableau' &&
          this.selection.from.pile === 'tableau' &&
          this.selection.from.index === pick.index &&
          pick.cardIndex === s.tableau[pick.index].length - this.selection.take);
      if (sameSource) {
        this.clearSelection();
        return;
      }
      const { from, take } = this.selection;
      this.clearSelection();
      const target = this.dropTarget(x, y);
      if (target && applyMove(s, from, target, take)) {
        this.afterMove();
        return;
      }
    }

    if (pick.kind === 'waste') {
      this.setSelection({ pile: 'waste' }, 1, [this.view(pick.card)]);
      return;
    }
    const pile = s.tableau[pick.index];
    const take = pile.length - pick.cardIndex;
    if (!pile[pick.cardIndex].faceUp || tableauMovableCount(s, pick.index) < take) return;
    this.setSelection(
      { pile: 'tableau', index: pick.index },
      take,
      pile.slice(pick.cardIndex).map((e) => this.view(e.card)),
    );
  }

  private dropTarget(x: number, y: number): Location | null {
    const { cw, ch, gap } = this.m;
    if (y < this.m.tabTop - ch * 0.1) {
      for (let i = 0; i < 4; i++) {
        if (Math.abs(x - this.colX(3 + i)) <= cw * 0.62) return { pile: 'foundation', index: i };
      }
      return null;
    }
    const idx = Math.round((x - this.colX(0)) / (cw + gap));
    if (idx < 0 || idx > 6) return null;
    return { pile: 'tableau', index: idx };
  }

  private setSelection(from: Location, take: number, views: CardView[]): void {
    this.selection = { from, take, views };
    for (const v of views) v.setSelected(true);
  }

  private clearSelection(): void {
    if (!this.selection) return;
    for (const v of this.selection.views) v.setSelected(false);
    this.selection = null;
  }

  private showHint(hint: Hint): void {
    this.stopPulse();
    const targets: CardView[] = [];
    if (hint.type === 'draw') {
      const top = this.state.stock[this.state.stock.length - 1];
      if (top) targets.push(this.view(top));
    } else {
      const from = topCard(this.state, hint.from);
      if (from) targets.push(this.view(from));
      if (hint.to.pile === 'tableau') {
        const pile = this.state.tableau[hint.to.index];
        if (pile.length) targets.push(this.view(pile[pile.length - 1].card));
      } else if (hint.to.pile === 'foundation') {
        const pile = this.state.foundations[hint.to.index];
        if (pile.length) targets.push(this.view(pile[pile.length - 1]));
      }
    }
    if (!targets.length) return;
    for (const t of targets) t.setSelected(true);
    this.pulse = this.tweens.add({
      targets,
      alpha: { from: 1, to: 0.4 },
      duration: 320,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.stopPulse(),
    });
  }

  private stopPulse(): void {
    if (this.pulse) {
      this.pulse.remove();
      this.pulse = null;
    }
    for (const v of this.views.values()) {
      v.setAlpha(1);
      if (!this.selection?.views.includes(v)) v.setSelected(false);
    }
  }

  // ---------------------------------------------------------------- hud

  private buildHud(): void {
    this.hudText = this.add
      .text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#f3e3c3' })
      .setDepth(8000);

    const mk = (key: string, label: string, cb: () => void) => {
      const bg = this.add
        .image(0, 0, key === 'new' ? 'btn-primary' : 'btn')
        .setDepth(8000)
        .setInteractive({ useHandCursor: true });
      const text = this.add
        .text(0, 0, label, { fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#f3e3c3' })
        .setOrigin(0.5)
        .setDepth(8001);
      bg.on('pointerdown', () => {
        if (!this.dealing) cb();
      });
      bg.on('pointerover', () => bg.setTint(0xcfe6d4));
      bg.on('pointerout', () => bg.clearTint());
      this.hudButtons.push({ key, bg, label: text });
      this.hudObjects.add(bg);
    };

    mk('hint', t('game.hint'), () => this.tryHint());
    mk('undo', t('game.undo'), () => this.tryUndo());
    mk('draw', t('game.draw1'), () => this.newGame(this.state.drawCount === 1 ? 3 : 1));
    mk('new', t('game.new'), () => this.newGame(this.state.drawCount));
    mk('home', t('game.home'), () => this.goHome());

    const bg = this.add.image(0, 0, 'btn').setDepth(8000).setInteractive({ useHandCursor: true });
    const label = this.add.text(0, 0, t('how.button'), {
      fontFamily: 'Arial, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#f3e3c3',
    }).setOrigin(0.5).setDepth(8001);
    bg.on('pointerdown', () => {
      if (!this.dealing && !this.helpOpen) this.openHelp();
    });
    bg.on('pointerover', () => bg.setTint(0xcfe6d4));
    bg.on('pointerout', () => bg.clearTint());
    this.helpButton = { key: 'help', bg, label };
    this.hudObjects.add(bg);
  }

  private openHelp(): void {
    this.helpOpen = true;
    const W = this.scale.width;
    const H = this.scale.height;
    const compact = W < 430;
    const pw = Math.min(460, W - 26);
    const cx = W / 2;
    const cy = H / 2;
    let fontSize = compact ? 13 : 15;
    const body = this.add.text(0, 0, t('how.body', { hints: ECONOMY.hintFree, undos: ECONOMY.undoFree }), {
      fontFamily: 'Arial, sans-serif', fontSize: `${fontSize}px`,
      color: '#f3e3c3', lineSpacing: compact ? 4 : 6,
      wordWrap: { width: pw - 44 },
    }).setDepth(9402);
    const maxPh = Math.min(545, H - 24);
    while (body.height > maxPh - 132 && fontSize > 10) body.setFontSize(--fontSize);
    const ph = Math.min(maxPh, Math.max(280, body.height + 132));
    body.setPosition(cx - pw / 2 + 22, cy - ph / 2 + 64);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.62)
      .setOrigin(0).setDepth(9400).setInteractive();
    const panel = this.add.image(cx, cy, 'panel').setDisplaySize(pw, ph).setDepth(9401).setInteractive();
    const title = this.add.text(cx, cy - ph / 2 + 30, t('how.title'), {
      fontFamily: 'Arial, sans-serif', fontSize: compact ? '18px' : '22px',
      fontStyle: 'bold', color: '#ffd27f',
    }).setOrigin(0.5).setDepth(9402);
    const closeBg = this.add.image(cx, cy + ph / 2 - 30, 'btn-primary')
      .setDisplaySize(Math.min(160, pw - 44), 40).setDepth(9402).setInteractive({ useHandCursor: true });
    const closeLabel = this.add.text(cx, cy + ph / 2 - 30, t('how.close'), {
      fontFamily: 'Arial, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#f3e3c3',
    }).setOrigin(0.5).setDepth(9403);
    dim.on('pointerdown', () => this.closeHelp());
    closeBg.on('pointerdown', () => this.closeHelp());
    closeBg.on('pointerover', () => closeBg.setTint(0xcfe6d4));
    closeBg.on('pointerout', () => closeBg.clearTint());
    this.helpOverlay = [dim, panel, title, body, closeBg, closeLabel];
  }

  private closeHelp(): void {
    for (const obj of this.helpOverlay) obj.destroy();
    this.helpOverlay = [];
    this.helpOpen = false;
    this.tapBlocked = true;
    this.events.once(Phaser.Scenes.Events.POST_UPDATE, () => {
      this.tapBlocked = false;
    });
  }

  private goHome(): void {
    if (!this.state.won) {
      const done = this.state.foundations.reduce((n, p) => n + p.length, 0);
      ads().track('round_exit', { progress: Math.round((done / 52) * 100), moves: this.state.moves });
    }
    if (this.gameplayActive) {
      this.gameplayActive = false;
      ads().gameplayStop();
    }
    this.scene.start('Home');
  }

  private tryUndo(): void {
    if (this.state.won || this.autoRunning) return;
    this.clearSelection();
    if (session.usedUndo < ECONOMY.undoFree) {
      this.applyUndo('free');
      return;
    }
    if (session.undoUnlimited) {
      this.applyUndo('rewarded');
      return;
    }
    this.openAdChoice('undo');
  }

  private applyUndo(source: 'free' | 'rewarded' | 'coins'): void {
    if (!undo(this.state)) return;
    if (source === 'free') session.usedUndo++;
    else session.paidUndo++;
    session.cleanDeal = false;
    this.layout();
    this.updateHud();
  }

  private tryHint(): void {
    if (this.state.won || this.autoRunning) return;
    const hint = findHint(this.state);
    if (!hint) return;
    if (session.usedHint >= ECONOMY.hintFree + session.hintBonus) {
      this.openAdChoice('hint');
      return;
    }
    ads().track('hint_free_used', { used: session.usedHint + 1 });
    session.usedHint++;
    session.cleanDeal = false;
    this.showHint(hint);
    this.updateHud();
  }

  private openAdChoice(kind: 'undo' | 'hint'): void {
    if (this.adChoiceOpen) return;
    this.adChoiceOpen = true;
    const W = this.scale.width;
    const H = this.scale.height;
    const pw = Math.min(360, W * 0.8);
    const ph = 170;
    const cx = W / 2;
    const cy = H / 2;
    const style: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial, sans-serif', color: '#f3e3c3' };
    const objs: Phaser.GameObjects.GameObject[] = [];
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.5).setOrigin(0).setDepth(9400).setInteractive();
    const panel = this.add.image(cx, cy, 'panel').setDisplaySize(pw, ph).setDepth(9401);
    const title = this.add
      .text(cx, cy - ph * 0.28, kind === 'undo' ? t('ad.title.undo') : t('ad.title.hint'), {
        ...style,
        fontSize: '16px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(9402);
    objs.push(dim, panel, title);

    const close = () => {
      for (const o of objs) o.destroy();
      this.adChoiceOpen = false;
      //  the button's pointerdown fires before the scene-level one, so without this
      //  the tap that dismissed the panel would also grab the card underneath it
      this.tapBlocked = true;
      this.events.once(Phaser.Scenes.Events.POST_UPDATE, () => {
        this.tapBlocked = false;
      });
    };

    const mkBtn = (x: number, label: string, cb: () => void) => {
      const bg = this.add.image(x, cy + ph * 0.12, 'btn').setDisplaySize(pw * 0.4, 40).setDepth(9402).setInteractive({ useHandCursor: true });
      const text = this.add.text(x, cy + ph * 0.12, label, { ...style, fontSize: '13px' }).setOrigin(0.5).setDepth(9403);
      bg.on('pointerdown', cb);
      bg.on('pointerover', () => bg.setTint(0xcfe6d4));
      bg.on('pointerout', () => bg.clearTint());
      objs.push(bg, text);
    };

    if (adsEnabled()) {
      mkBtn(cx - pw * 0.23, t('ad.watch'), () => {
        close();
        const placement = kind === 'undo' ? 'undo-refill' : 'hint-refill';
        void ads()
          .showRewarded(placement)
          .then((ok) => {
            ads().track('rewarded_show', { placement, result: ok ? 1 : 0 });
            if (!ok) {
              this.toast(t('ad.failed'));
              return;
            }
            if (kind === 'undo') {
              session.undoUnlimited = true;
              this.applyUndo('rewarded');
            } else {
              session.hintBonus += 3;
              this.tryHint();
            }
          });
      });
    }
    mkBtn(
      adsEnabled() ? cx + pw * 0.23 : cx,
      t('ad.coins', { n: kind === 'undo' ? ECONOMY.undoCost : ECONOMY.hintCost }),
      () => {
        const cost = kind === 'undo' ? ECONOMY.undoCost : ECONOMY.hintCost;
        if (profile.profile.coins < cost) {
          this.toast(t('toast.notEnoughCoins'));
          close();
          return;
        }
        close();
        profile.spend(cost);
        if (kind === 'undo') {
          this.toast(t('toast.undoPaid', { n: cost }));
          this.applyUndo('coins');
        } else {
          this.toast(t('toast.hintPaid', { n: cost }));
          this.showPaidHint();
        }
      },
    );
    const cancel = this.add
      .text(cx, cy + ph * 0.38, t('shop.close'), { ...style, fontSize: '13px', color: '#c9b18c' })
      .setOrigin(0.5)
      .setDepth(9402)
      .setInteractive({ useHandCursor: true });
    cancel.on('pointerdown', close);
    objs.push(cancel);
  }

  private showPaidHint(): void {
    const hint = findHint(this.state);
    if (!hint) return;
    session.paidHint++;
    session.cleanDeal = false;
    this.showHint(hint);
  }

  private toast(msg: string): void {
    if (this.toastObj) this.toastObj.destroy();
    if (this.toastTimer) this.toastTimer.remove();
    this.toastObj = this.add
      .text(this.scale.width / 2, this.m.tabTop + this.m.ch, msg, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        color: '#f3e3c3',
        backgroundColor: '#1e2a21cc',
        padding: { x: 12, y: 7 },
      })
      .setOrigin(0.5)
      .setDepth(9400);
    this.toastTimer = this.time.delayedCall(1600, () => {
      this.toastObj?.destroy();
      this.toastObj = null;
    });
  }

  private layoutHud(): void {
    const { hudY, hudH, cw, gap } = this.m;
    const compact = this.scale.width < 700;
    const left = this.m.x0 - cw / 2;
    const h = compact ? 30 : Math.round(hudH * 0.65);
    const buttonGap = Math.max(5, Math.round(gap * 0.8));
    const w = compact
      ? Math.floor((this.scale.width - left * 2 - buttonGap * 4 - 12) / 5)
      : Math.max(65, Math.round(cw * 0.82));
    this.hudText.setPosition(left + 8, compact ? hudY - 18 : hudY)
      .setOrigin(0, 0.5).setFontSize(compact ? 14 : Math.round(h * 0.41));
    const buttonY = compact ? hudY + 18 : hudY;
    const firstX = compact ? left + 6 + w / 2 : this.scale.width - left - 5 * w - 4 * buttonGap + w / 2;
    this.hudButtons.forEach((btn, i) => {
      const x = Math.round(firstX + i * (w + buttonGap));
      btn.bg.setPosition(x, buttonY).setDisplaySize(w, h);
      btn.label.setPosition(x, buttonY).setFontSize(Math.round(h * 0.4));
    });
  }

  private updateHud(): void {
    if (!this.state) return;
    const secs = this.finalSecs || Math.floor((Date.now() - this.startedAt) / 1000);
    const mm = Math.floor(secs / 60);
    const ss = String(secs % 60).padStart(2, '0');
    const coins = t('game.coins', { coins: profile.profile.coins });
    this.hudText.setText(`✦ ${coins}    ·    ${t('game.movesTime', { moves: this.state.moves, time: `${mm}:${ss}` })}`);
    for (const b of this.hudButtons) {
      if (b.key === 'draw') b.label.setText(this.state.drawCount === 1 ? t('game.draw1') : t('game.draw3'));
      if (b.key === 'hint') b.label.setText(`${t('game.hint')} ${Math.max(0, ECONOMY.hintFree + session.hintBonus - session.usedHint)}`);
      if (b.key === 'undo') b.label.setText(`${t('game.undo')} ${session.undoUnlimited ? '∞' : Math.max(0, ECONOMY.undoFree - session.usedUndo)}`);
    }
  }

  // ---------------------------------------------------------------- win

  private showWin(): void {
    if (this.overlay.length) return;
    this.finalSecs = Math.floor((Date.now() - this.startedAt) / 1000);
    this.updateHud();
    if (this.gameplayActive) {
      this.gameplayActive = false;
      ads().gameplayStop();
    }

    const clean = session.cleanDeal;
    profile.recordWin(this.state.drawCount, clean);
    const streak = session.winsInRow;
    const base = this.state.drawCount === 1 ? ECONOMY.win.draw1 : ECONOMY.win.draw3;
    const reward = winReward(this.state.drawCount, clean, streak);
    profile.addCoins(reward);
    this.updateHud();
    ads().track('round_win', {
      mode: this.state.drawCount,
      time: this.finalSecs,
      moves: this.state.moves,
      hints_used: session.usedHint + session.paidHint,
      undos_used: session.usedUndo + session.paidUndo,
      bonus: reward,
    });
    ads().track('win', { moves: this.state.moves, secs: this.finalSecs, draw: this.state.drawCount, reward });

    const now = Date.now();
    if (
      adsEnabled() &&
      session.winsThisSession > ECONOMY.interstitial.skipFirstWins &&
      now - session.lastInterstitialAt >= ECONOMY.interstitial.minGapMs
    ) {
      session.lastInterstitialAt = now;
      ads().track('interstitial_show', { wins: session.winsThisSession });
      void ads().showInterstitial();
    }

    const W = this.scale.width;
    const H = this.scale.height;
    const pw = Math.min(430, W * 0.86);
    const ph = Math.min(350, H * 0.72);
    const mm = Math.floor(this.finalSecs / 60);
    const ss = String(this.finalSecs % 60).padStart(2, '0');
    const style: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial, sans-serif', color: '#f3e3c3' };
    const cx = W / 2;
    const cy = H / 2;

    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0).setDepth(9500);
    const panel = this.add.image(cx, cy, 'panel').setDisplaySize(pw, ph).setDepth(9501);
    const title = this.add
      .text(cx, cy - ph * 0.38, t('win.title'), { ...style, fontSize: '26px', fontStyle: 'bold', color: '#ffd27f' })
      .setOrigin(0.5)
      .setDepth(9502);
    const stats = this.add
      .text(cx, cy - ph * 0.24, t('win.stats', { moves: this.state.moves, time: `${mm}:${ss}` }), { ...style, fontSize: '16px' })
      .setOrigin(0.5)
      .setDepth(9502);
    this.overlay.push(dim, panel, title, stats);

    const lines: string[] = [`${t('win.base')}   +${base}`];
    if (clean) lines.push(`${t('win.clean')}   +${Math.round(base * ECONOMY.cleanBonus)}`);
    const cm = comboMultiplier(streak);
    if (cm > 0) lines.push(`${t('win.combo', { n: streak })}   +${Math.round(base * cm)}`);
    lines.push(`${t('win.total')}   +${reward}`);
    lines.forEach((line, i) => {
      const isTotal = i === lines.length - 1;
      const txt = this.add
        .text(cx, cy - ph * 0.1 + i * 22, line, {
          ...style,
          fontSize: isTotal ? '17px' : '14px',
          color: isTotal ? '#ffd27f' : '#f3e3c3',
        })
        .setOrigin(0.5)
        .setDepth(9502);
      this.overlay.push(txt);
    });

    const btnY = cy + ph * 0.3;
    const againX = adsEnabled() ? cx - pw * 0.24 : cx;
    const again = this.add
      .image(againX, btnY, 'btn-primary')
      .setDisplaySize(adsEnabled() ? pw * 0.38 : pw * 0.52, 42)
      .setDepth(9502)
      .setInteractive({ useHandCursor: true });
    const againLabel = this.add
      .text(againX, btnY, t('win.playAgain'), { ...style, fontSize: '14px' })
      .setOrigin(0.5)
      .setDepth(9503);
    again.on('pointerdown', () => this.newGame(this.state.drawCount));
    again.on('pointerover', () => again.setTint(0xcfe6d4));
    again.on('pointerout', () => again.clearTint());

    this.overlay.push(again, againLabel);
    if (adsEnabled()) {
      const x2 = this.add
        .image(cx + pw * 0.24, btnY, 'btn')
        .setDisplaySize(pw * 0.34, 42)
        .setDepth(9502)
        .setInteractive({ useHandCursor: true });
      const x2Label = this.add
        .text(cx + pw * 0.24, btnY, t('win.x2'), { ...style, fontSize: '14px', color: '#ffd27f' })
        .setOrigin(0.5)
        .setDepth(9503);
      let x2Used = false;
      x2.on('pointerdown', () => {
        if (x2Used) return;
        x2Used = true;
        void ads()
          .showRewarded('x2')
          .then((ok) => {
            if (!ok) {
              x2Used = false;
              return;
            }
            profile.addCoins(reward);
            ads().track('rewarded_show', { placement: 'x2', result: 1, amount: reward });
            x2Label.setText(`+${reward}`);
            x2.disableInteractive().setAlpha(0.6);
            this.updateHud();
          });
      });
      x2.on('pointerover', () => x2.setTint(0xcfe6d4));
      x2.on('pointerout', () => x2.clearTint());
      this.overlay.push(x2, x2Label);
    }

    const home = this.add
      .text(cx, cy + ph * 0.44, t('game.home'), { ...style, fontSize: '14px', color: '#c9b18c' })
      .setOrigin(0.5)
      .setDepth(9502)
      .setInteractive({ useHandCursor: true });
    home.on('pointerdown', () => this.goHome());

    this.overlay.push(home);
    panel.setScale(panel.scaleX * 0.86, panel.scaleY * 0.86);
    this.tweens.add({
      targets: panel,
      scaleX: panel.scaleX / 0.86,
      scaleY: panel.scaleY / 0.86,
      duration: 240,
      ease: 'back.out',
    });
    this.events.emit('game-won', {
      moves: this.state.moves,
      secs: this.finalSecs,
      drawCount: this.state.drawCount,
      seed: this.state.seed,
    });
  }

  private destroyOverlay(): void {
    for (const o of this.overlay) o.destroy();
    this.overlay = [];
  }
}
