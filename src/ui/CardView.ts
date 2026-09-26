import Phaser from 'phaser';
import { Card, RANK_LABEL, SUIT_SYMBOL, isRed } from '../core/cards';

export const CARD_W = 86;
export const CARD_H = 120;

export class CardView extends Phaser.GameObjects.Container {
  readonly card: Card;
  private readonly back: Phaser.GameObjects.Image;
  private readonly face: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  // starts true so the constructor's setFaceUp(false) applies the back-facing state
  private up = true;

  constructor(scene: Phaser.Scene, card: Card) {
    super(scene, 0, 0);
    this.card = card;
    const color = isRed(card) ? '#b64039' : '#263b39';
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
      color,
      align: 'center',
      resolution: 3,
    };

    this.glow = scene.add.image(0, 0, 'glow').setDisplaySize(CARD_W + 12, CARD_H + 12).setVisible(false);
    this.shadow = scene.add.image(1, 2, 'card-shadow').setDisplaySize(CARD_W + 8, CARD_H + 9);
    this.back = scene.add.image(0, 0, 'card-back').setDisplaySize(CARD_W, CARD_H);
    this.face = scene.add.image(0, 0, 'card-face').setDisplaySize(CARD_W, CARD_H);

    const corner = scene.add.text(-CARD_W / 2 + 6, -CARD_H / 2 + 4, `${RANK_LABEL[card.rank]}\n${SUIT_SYMBOL[card.suit]}`, {
      ...style,
      fontSize: '17px',
      lineSpacing: -4,
    });
    const mirror = scene.add.text(CARD_W / 2 - 6, CARD_H / 2 - 4, `${RANK_LABEL[card.rank]}\n${SUIT_SYMBOL[card.suit]}`, {
      ...style,
      fontSize: '17px',
      lineSpacing: -4,
    }).setAngle(180);
    const pip = scene.add.text(0, 2, SUIT_SYMBOL[card.suit], { ...style, fontSize: '42px' }).setOrigin(0.5);
    this.labels.push(corner, mirror, pip);

    this.add([this.glow, this.shadow, this.back, this.face, corner, mirror, pip]);
    this.setFaceUp(false);
  }

  setFaceUp(up: boolean): this {
    if (this.up === up) return this;
    this.up = up;
    this.back.setVisible(!up);
    this.face.setVisible(up);
    for (const t of this.labels) t.setVisible(up);
    return this;
  }

  get faceUp(): boolean {
    return this.up;
  }

  setSelected(on: boolean): void {
    this.glow.setVisible(on);
  }
}
