import Phaser from 'phaser';
import type { GameScene } from '../GameScene';
import { fitContain } from '../../utils/imageFit';

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

    const pw = Math.min(W - 60, 500);
    const ph = Math.min(Math.round(H * 0.52), 520);
    const px = (W - pw) / 2, py = (H - ph) / 2;

    if (this.textures.exists('task_garbage_full')) {
      this.bgImg = fitContain(this.add.image(W / 2, H / 2, 'task_garbage_full'), pw, ph);
    } else {
      this.add.rectangle(W / 2, H / 2, pw, ph, 0x1a1108).setStrokeStyle(2, 0x886600);
    }

    this.add.text(W / 2, py + 18, 'Empty The Garbage', {
      fontSize: '22px', color: '#ffcc00', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(5);

    const closeBtn = this.add.text(px + pw - 12, py + 12, '✕', {
      fontSize: '28px', color: '#fff', backgroundColor: '#444', padding: { x: 10, y: 4 },
    }).setOrigin(1, 0).setInteractive().setDepth(5);
    closeBtn.on('pointerdown', () => this.closeTask());

    this.chuteX = W / 2;
    this.trackTop = py + 80;
    this.trackBot = py + ph - 70;

    this.add.text(this.chuteX, this.trackBot + 22, 'PULL DOWN', {
      fontSize: '16px', color: '#ffaa00', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(5);

    // Garbage piece sprites — larger for portrait
    const gbKeys = ['task_garbage_gb2', 'task_garbage_gb3', 'task_garbage_gb4'];
    for (let i = 0; i < 6; i++) {
      const gx = px + 90 + Math.random() * (pw - 180);
      const gy = py + 90 + Math.random() * (ph - 220);
      const key = gbKeys[i % gbKeys.length];
      let g: Phaser.GameObjects.Image;
      if (this.textures.exists(key)) {
        g = this.add.image(gx, gy, key).setDisplaySize(44, 34).setDepth(6);
      } else {
        g = this.add.image(gx, gy, '__DEFAULT').setDisplaySize(44, 34).setDepth(6);
      }
      this.garbagePieces.push(g);
    }

    // Lever handle
    this.leverY = this.trackTop;
    const leverKey = 'task_garbage_liver_up';
    if (this.textures.exists(leverKey)) {
      this.handleImg = this.add.image(this.chuteX, this.leverY, leverKey)
        .setDisplaySize(76, 44).setDepth(8);
    } else {
      this.handleRect = this.add.rectangle(this.chuteX, this.leverY, 60, 28, 0xaa6600)
        .setStrokeStyle(2, 0xffaa00).setDepth(8) as unknown as Phaser.GameObjects.Rectangle;
    }

    // Generous touch hit area: ±68px horizontal, ±50px vertical
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const hy = this.handleImg ? this.handleImg.y : (this.handleRect as Phaser.GameObjects.Rectangle).y;
      if (Math.abs(p.x - this.chuteX) < 68 && Math.abs(p.y - hy) < 50) {
        this.dragging = true;
      }
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      this.leverY = Phaser.Math.Clamp(p.y, this.trackTop, this.trackBot);

      if (this.handleImg) {
        this.handleImg.setY(this.leverY);
        const pct = (this.leverY - this.trackTop) / (this.trackBot - this.trackTop);
        const tKey = pct > 0.25 ? 'task_garbage_liver_down' : 'task_garbage_liver_up';
        if (this.textures.exists(tKey) && this.handleImg.texture.key !== tKey) {
          this.handleImg.setTexture(tKey);
        }
      } else if (this.handleRect) {
        this.handleRect.setY(this.leverY);
      }

      const pct = (this.leverY - this.trackTop) / (this.trackBot - this.trackTop);
      for (const g of this.garbagePieces) {
        if (!g.active) continue;
        g.setPosition(
          Phaser.Math.Linear(g.x, this.chuteX, pct * 0.06),
          Phaser.Math.Linear(g.y, this.trackBot, pct * 0.06),
        );
        if (Math.abs(g.x - this.chuteX) < 26 && g.y >= this.trackBot - 14) {
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
      if (this.bgImg && this.textures.exists('task_garbage_empty')) {
        this.bgImg.setTexture('task_garbage_empty');
      }
      this.showSuccess();
    }
  }

  private showSuccess() {
    const { width: W, height: H } = this.scale;
    this.add.text(W / 2, H / 2, '✓ Garbage Emptied!', {
      fontSize: '38px', color: '#00ff88', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
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
