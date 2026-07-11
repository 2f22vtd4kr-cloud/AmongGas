import Phaser from 'phaser';
import type { GameScene } from '../GameScene';

interface TaskData { taskId: string; gameScene: GameScene; }

export class StartReactorScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private taskId!: string;
  private sequence: number[] = [];
  private playerInput: number[] = [];
  private buttons: Phaser.GameObjects.Rectangle[] = [];
  private showing = false;
  private SEQUENCE_LEN = 5;

  constructor() { super({ key: 'StartReactorScene' }); }
  init(d: TaskData) { this.gameScene = d.gameScene; this.taskId = d.taskId; }

  create() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.85);

    const pw = 420, ph = 380;
    const px = (W-pw)/2, py = (H-ph)/2;
    this.add.rectangle(W/2, H/2, pw, ph, 0x0a0a1a).setStrokeStyle(2, 0xff6600);
    this.add.text(W/2, py+14, 'Divert Power To Reactor', {
      fontSize: '18px', color: '#ff8800', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    const closeBtn = this.add.text(px+pw-10, py+10, '✕', {
      fontSize: '22px', color: '#fff', backgroundColor: '#333', padding: { x: 6, y: 2 },
    }).setOrigin(1,0).setInteractive();
    closeBtn.on('pointerdown', () => this.closeTask());

    // 3×2 grid of buttons
    const cols = 3, rows = 2;
    const bw = 80, bh = 70, gap = 14;
    const gridW = cols * bw + (cols-1)*gap;
    const gridH = rows * bh + (rows-1)*gap;
    const gx = W/2 - gridW/2, gy = H/2 - gridH/2 + 20;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const bx = gx + c * (bw + gap) + bw/2;
        const by = gy + r * (bh + gap) + bh/2;
        const btn = this.add.rectangle(bx, by, bw, bh, 0x222244).setStrokeStyle(2, 0x4444aa).setInteractive();
        this.add.text(bx, by, `${idx+1}`, { fontSize: '28px', color: '#ffffff', fontFamily: 'Arial' }).setOrigin(0.5);
        btn.on('pointerdown', () => { if (!this.showing) this.playerPress(idx); });
        this.buttons.push(btn);
      }
    }

    const hint = this.add.text(W/2, py+ph-30, 'Watch the sequence, then repeat it!', {
      fontSize: '14px', color: '#aaaaaa', fontFamily: 'Arial',
    }).setOrigin(0.5, 1);

    // Generate and show sequence
    for (let i = 0; i < this.SEQUENCE_LEN; i++) {
      this.sequence.push(Phaser.Math.Between(0, 5));
    }
    this.time.delayedCall(600, () => this.playSequence());
  }

  private playSequence() {
    this.showing = true;
    this.playerInput = [];
    let delay = 0;
    for (const idx of this.sequence) {
      this.time.delayedCall(delay, () => this.flashButton(idx));
      delay += 700;
    }
    this.time.delayedCall(delay + 300, () => { this.showing = false; });
  }

  private flashButton(idx: number) {
    const btn = this.buttons[idx];
    btn.setFillStyle(0xffaa00);
    this.time.delayedCall(400, () => btn.setFillStyle(0x222244));
  }

  private playerPress(idx: number) {
    this.flashButton(idx);
    this.playerInput.push(idx);
    const pos = this.playerInput.length - 1;
    if (this.playerInput[pos] !== this.sequence[pos]) {
      // Wrong — reset
      this.playerInput = [];
      this.time.delayedCall(600, () => this.playSequence());
      return;
    }
    if (this.playerInput.length === this.sequence.length) {
      this.showSuccess();
    }
  }

  private showSuccess() {
    const { width: W, height: H } = this.scale;
    this.add.text(W/2, H/2, '✓ Reactor Started!', {
      fontSize: '34px', color: '#00ff88', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
    }).setOrigin(0.5);
    this.time.delayedCall(1200, () => { this.gameScene.completeTask(this.taskId); this.scene.stop(); });
  }

  private closeTask() { this.scene.stop(); this.scene.resume('GameScene'); }
}
