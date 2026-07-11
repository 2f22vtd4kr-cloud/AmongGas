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

    const pw = Math.min(W - 60, 540);
    const ph = Math.min(Math.round(H * 0.52), 520);
    const px = (W-pw)/2, py = (H-ph)/2;
    this.add.rectangle(W/2, H/2, pw, ph, 0x0a0a1a).setStrokeStyle(2, 0xff6600);
    this.add.text(W/2, py+18, 'Divert Power To Reactor', {
      fontSize: '22px', color: '#ff8800', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    const closeBtn = this.add.text(px+pw-12, py+12, '✕', {
      fontSize: '28px', color: '#fff', backgroundColor: '#444', padding: { x: 10, y: 4 },
    }).setOrigin(1,0).setInteractive();
    closeBtn.on('pointerdown', () => this.closeTask());

    if (this.textures.exists('task_reactor_base1')) {
      this.add.image(W/2, H/2, 'task_reactor_base1').setDisplaySize(pw, ph).setDepth(-1);
    }

    // 3×2 grid — buttons sized relative to panel
    const cols = 3, rows = 2;
    const bw = Math.round(pw * 0.22);  // ~22% of panel width
    const bh = Math.round(bw * 0.85);
    const gap = Math.round(pw * 0.04);
    const gridW = cols * bw + (cols-1)*gap;
    const gridH = rows * bh + (rows-1)*gap;
    const gx = W/2 - gridW/2;
    const gy = H/2 - gridH/2 + 20;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const bx = gx + c * (bw + gap) + bw/2;
        const by = gy + r * (bh + gap) + bh/2;
        const btn = this.add.rectangle(bx, by, bw, bh, 0x222244).setStrokeStyle(2, 0x4444aa).setInteractive();
        this.add.text(bx, by, `${idx+1}`, {
          fontSize: `${Math.round(bw * 0.36)}px`, color: '#ffffff', fontFamily: 'Arial',
        }).setOrigin(0.5);
        btn.on('pointerdown', () => { if (!this.showing) this.playerPress(idx); });
        this.buttons.push(btn);
      }
    }

    this.add.text(W/2, py+ph-28, 'Watch the sequence, then repeat it!', {
      fontSize: '16px', color: '#aaaaaa', fontFamily: 'Arial',
    }).setOrigin(0.5, 1);

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
      this.playerInput = [];
      this.time.delayedCall(600, () => this.playSequence());
      return;
    }
    if (this.playerInput.length === this.sequence.length) this.showSuccess();
  }

  private showSuccess() {
    const { width: W, height: H } = this.scale;
    this.add.text(W/2, H/2, '✓ Reactor Started!', {
      fontSize: '38px', color: '#00ff88', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
    }).setOrigin(0.5);
    this.time.delayedCall(1200, () => { this.gameScene.completeTask(this.taskId); this.scene.stop(); });
  }

  private closeTask() { this.scene.resume('GameScene'); this.scene.stop(); }
}
