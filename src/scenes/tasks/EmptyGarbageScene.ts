import Phaser from 'phaser';
import type { GameScene } from '../GameScene';

interface TaskData { taskId: string; gameScene: GameScene; }

export class EmptyGarbageScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private taskId!: string;
  private leverY = 0;
  private trackBot = 0;
  private trackTop = 0;
  private garbagePieces: Phaser.GameObjects.Image[] = [];
  private dragging = false;
  private handleImg?: Phaser.GameObjects.Image;
  private handleRect?: Phaser.GameObjects.Rectangle;
  private bgImg?: Phaser.GameObjects.Image;
  private done = false;
  private chuteX = 0;

  constructor() { super({ key: 'EmptyGarbageScene' }); }
  init(d: TaskData) { this.gameScene = d.gameScene; this.taskId = d.taskId; }

  create() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.85);

    const pw = 380, ph = 380;
    const px = (W - pw) / 2, py = (H - ph) / 2;

    // Panel background — use original asset
    if (this.textures.exists('task_garbage_full')) {
      this.bgImg = this.add.image(W / 2, H / 2, 'task_garbage_full').setDisplaySize(pw, ph);
    } else {
      this.add.rectangle(W / 2, H / 2, pw, ph, 0x1a1108).setStrokeStyle(2, 0x886600);
    }

    this.add.text(W / 2, py + 14, 'Empty The Garbage', {
      fontSize: '20px', color: '#ffcc00', fontFamily: 'Arial',
    }).setOrigin(0.5, 0).setDepth(5);

    const closeBtn = this.add.text(px + pw - 10, py + 10, '✕', {
      fontSize: '22px', color: '#fff', backgroundColor: '#333', padding: { x: 6, y: 2 },
    }).setOrigin(1, 0).setInteractive().setDepth(5);
    closeBtn.on('pointerdown', () => this.closeTask());

    // Chute track (visual guide — overlaid on panel image)
    this.chuteX = W / 2;
    this.trackTop = py + 70;
    this.trackBot = py + ph - 60;

    this.add.text(this.chuteX, this.trackBot + 18, 'PULL DOWN', {
      fontSize: '12px', color: '#ffaa00', fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(5);

    // Garbage piece sprites from original assets
    const gbKeys = ['task_garbage_gb2', 'task_garbage_gb3', 'task_garbage_gb4'];
    for (let i = 0; i < 6; i++) {
      const gx = px + 80 + Math.random() * (pw - 160);
      const gy = py + 80 + Math.random() * (ph - 200);
      const key = gbKeys[i % gbKeys.length];
      let g: Phaser.GameObjects.Image;
      if (this.textures.exists(key)) {
        g = this.add.image(gx, gy, key).setDisplaySize(36, 28).setDepth(6);
      } else {
        g = this.add.image(gx, gy, '__DEFAULT').setDisplaySize(36, 28).setDepth(6);
      }
      this.garbagePieces.push(g);
    }

    // Lever / handle — use original asset
    this.leverY = this.trackTop;
    const leverKey = 'task_garbage_liver_up';
    if (this.textures.exists(leverKey)) {
      this.handleImg = this.add.image(this.chuteX, this.leverY, leverKey)
        .setDisplaySize(64, 36).setDepth(8);
    } else {
      this.handleRect = this.add.rectangle(this.chuteX, this.leverY, 50, 22, 0xaa6600)
        .setStrokeStyle(2, 0xffaa00).setDepth(8) as unknown as Phaser.GameObjects.Rectangle;
    }

    // Input — drag the handle downward to empty garbage
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const hy = this.handleImg ? this.handleImg.y : (this.handleRect as Phaser.GameObjects.Rectangle).y;
      if (Math.abs(p.x - this.chuteX) < 50 && Math.abs(p.y - hy) < 30) {
        this.dragging = true;
      }
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;

      this.leverY = Phaser.Math.Clamp(p.y, this.trackTop, this.trackBot);

      if (this.handleImg) {
        this.handleImg.setY(this.leverY);
        // Switch between up/down lever texture based on position
        const pct = (this.leverY - this.trackTop) / (this.trackBot - this.trackTop);
        const tKey = pct > 0.25 ? 'task_garbage_liver_down' : 'task_garbage_liver_up';
        if (this.textures.exists(tKey) && this.handleImg.texture.key !== tKey) {
          this.handleImg.setTexture(tKey);
        }
      } else if (this.handleRect) {
        this.handleRect.setY(this.leverY);
      }

      // Suck garbage toward the chute as the lever is pulled
      const pct = (this.leverY - this.trackTop) / (this.trackBot - this.trackTop);
      for (const g of this.garbagePieces) {
        if (!g.active) continue;
        g.setPosition(
          Phaser.Math.Linear(g.x, this.chuteX, pct * 0.06),
          Phaser.Math.Linear(g.y, this.trackBot, pct * 0.06),
        );
        if (Math.abs(g.x - this.chuteX) < 22 && g.y >= this.trackBot - 12) {
          g.setVisible(false).setActive(false);
        }
      }
    });

    this.input.on('pointerup', () => { this.dragging = false; });
  }

  update() {
    if (this.done) return;
    if (this.garbagePieces.every(g => !g.active)) {
      this.done = true;
      // Switch panel to empty state
      if (this.bgImg && this.textures.exists('task_garbage_empty')) {
        this.bgImg.setTexture('task_garbage_empty');
      }
      this.showSuccess();
    }
  }

  private showSuccess() {
    const { width: W, height: H } = this.scale;
    this.add.text(W / 2, H / 2, '✓ Garbage Emptied!', {
      fontSize: '34px', color: '#00ff88', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(20);
    this.time.delayedCall(1200, () => {
      this.gameScene.completeTask(this.taskId);
      this.scene.stop();
    });
  }

  private closeTask() {
    this.scene.resume('GameScene');
    this.scene.stop();
  }
}
