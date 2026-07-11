import Phaser from 'phaser';
import type { GameScene } from '../GameScene';

interface TaskData { taskId: string; gameScene: GameScene; }

export class EmptyGarbageScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private taskId!: string;
  private leverY = 0;
  private trackBot = 0;
  private trackTop = 0;
  private garbagePieces: Phaser.GameObjects.Rectangle[] = [];
  private dragging = false;
  private handle?: Phaser.GameObjects.Rectangle;
  private done = false;

  constructor() { super({ key: 'EmptyGarbageScene' }); }
  init(d: TaskData) { this.gameScene = d.gameScene; this.taskId = d.taskId; }

  create() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.85);

    const pw = 380, ph = 380;
    const px = (W-pw)/2, py = (H-ph)/2;
    this.add.rectangle(W/2, H/2, pw, ph, 0x1a1108).setStrokeStyle(2, 0x886600);
    this.add.text(W/2, py+14, 'Empty The Garbage', {
      fontSize: '20px', color: '#ffcc00', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    const closeBtn = this.add.text(px+pw-10, py+10, '✕', {
      fontSize: '22px', color: '#fff', backgroundColor: '#333', padding: { x: 6, y: 2 },
    }).setOrigin(1,0).setInteractive();
    closeBtn.on('pointerdown', () => this.closeTask());

    // Garbage chute
    const chuteX = W/2;
    this.trackTop = py + 80;
    this.trackBot = py + ph - 70;

    this.add.rectangle(chuteX, (this.trackTop + this.trackBot)/2, 40, this.trackBot - this.trackTop, 0x333322).setStrokeStyle(1, 0x666644);
    this.add.text(chuteX, this.trackBot + 18, 'PULL DOWN', { fontSize: '12px', color: '#ffaa00', fontFamily: 'Arial' }).setOrigin(0.5);

    // Garbage pieces
    for (let i = 0; i < 6; i++) {
      const gx = px + 80 + Math.random() * (pw - 160);
      const gy = py + 80 + Math.random() * (ph - 200);
      const g = this.add.rectangle(gx, gy, 28, 20, 0x556644).setStrokeStyle(1, 0x888877);
      this.garbagePieces.push(g);
    }

    // Handle
    this.leverY = this.trackTop;
    this.handle = this.add.rectangle(chuteX, this.leverY, 50, 22, 0xaa6600).setStrokeStyle(2, 0xffaa00);
    this.handle.setInteractive(new Phaser.Geom.Rectangle(-25, -11, 50, 22), Phaser.Geom.Rectangle.Contains);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.handle && Math.abs(p.x - this.handle.x) < 40 && Math.abs(p.y - this.handle.y) < 30) {
        this.dragging = true;
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !this.handle) return;
      this.leverY = Phaser.Math.Clamp(p.y, this.trackTop, this.trackBot);
      this.handle.setY(this.leverY);

      // Move garbage toward chute
      const pct = (this.leverY - this.trackTop) / (this.trackBot - this.trackTop);
      for (const g of this.garbagePieces) {
        if (g.active) {
          g.setPosition(
            Phaser.Math.Linear(g.x, W/2, pct * 0.05),
            Phaser.Math.Linear(g.y, this.trackBot, pct * 0.05),
          );
          if (Math.abs(g.x - W/2) < 20 && g.y >= this.trackBot - 10) {
            g.setVisible(false).setActive(false);
          }
        }
      }
    });
    this.input.on('pointerup', () => { this.dragging = false; });
  }

  update() {
    if (this.done) return;
    const allGone = this.garbagePieces.every(g => !g.active);
    if (allGone) {
      this.done = true;
      this.showSuccess();
    }
  }

  private showSuccess() {
    const { width: W, height: H } = this.scale;
    this.add.text(W/2, H/2, '✓ Garbage Emptied!', {
      fontSize: '34px', color: '#00ff88', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
    }).setOrigin(0.5);
    this.time.delayedCall(1200, () => { this.gameScene.completeTask(this.taskId); this.scene.stop(); });
  }

  private closeTask() { this.scene.stop(); this.scene.resume('GameScene'); }
}
