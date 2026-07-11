import Phaser from 'phaser';
import type { GameScene } from '../GameScene';
import { fitContain } from '../../utils/imageFit';

interface TaskData { taskId: string; gameScene: GameScene; }

export class AlignEngineScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private taskId!: string;
  private sliderX = 0;
  private targetX = 0;
  private dragging = false;
  private stableTime = 0;
  private STABLE_NEEDED = 1.5;
  private sliderImg?: Phaser.GameObjects.Image;
  private graphics!: Phaser.GameObjects.Graphics;
  private trackY = 0;
  private trackLeft = 0;
  private trackRight = 0;
  private done = false;

  constructor() { super({ key: 'AlignEngineScene' }); }
  init(d: TaskData) { this.gameScene = d.gameScene; this.taskId = d.taskId; }

  create() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.85);

    const pw = Math.min(W - 60, 540);
    const ph = Math.min(Math.round(H * 0.46), 480);
    const px = (W - pw) / 2, py = (H - ph) / 2;

    if (this.textures.exists('task_align_base')) {
      fitContain(this.add.image(W / 2, H / 2, 'task_align_base'), pw, ph);
    } else {
      this.add.rectangle(W / 2, H / 2, pw, ph, 0x0d1a0d).setStrokeStyle(2, 0x00ff44);
    }

    this.add.text(W / 2, py + 18, 'Align Engine Output', {
      fontSize: '22px', color: '#00ff88', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    const closeBtn = this.add.text(px + pw - 12, py + 12, '✕', {
      fontSize: '28px', color: '#fff', backgroundColor: '#444', padding: { x: 10, y: 4 },
    }).setOrigin(1, 0).setInteractive();
    closeBtn.on('pointerdown', () => this.closeTask());

    // Track geometry — wider margins for a bigger slider range
    this.trackLeft  = px + 80;
    this.trackRight = px + pw - 80;
    this.trackY     = H / 2 + 20;
    this.targetX    = this.trackLeft + Math.random() * (this.trackRight - this.trackLeft);
    this.sliderX    = this.trackLeft;

    this.add.rectangle(
      (this.trackLeft + this.trackRight) / 2,
      this.trackY,
      this.trackRight - this.trackLeft,
      12, 0x444444,
    ).setStrokeStyle(1, 0x888888);

    if (this.textures.exists('task_align_position')) {
      this.add.image(this.targetX, this.trackY, 'task_align_position').setDisplaySize(44, 52).setAlpha(0.85);
    } else {
      this.add.rectangle(this.targetX, this.trackY, 36, 32, 0x00ff44, 0.3).setStrokeStyle(2, 0x00ff44);
    }

    if (this.textures.exists('task_align_liver')) {
      this.sliderImg = this.add.image(this.sliderX, this.trackY, 'task_align_liver')
        .setDisplaySize(48, 76).setDepth(5);
    }
    this.graphics = this.add.graphics().setDepth(5);

    this.add.text(W / 2, this.trackY + 60, 'Drag the lever to the target zone', {
      fontSize: '18px', color: '#aaaaaa', fontFamily: 'Arial',
    }).setOrigin(0.5);

    // Generous hit area for touch
    const hitW = 52, hitH = 56;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (Math.abs(p.x - this.sliderX) < hitW && Math.abs(p.y - this.trackY) < hitH) {
        this.dragging = true;
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragging) {
        this.sliderX = Phaser.Math.Clamp(p.x, this.trackLeft, this.trackRight);
      }
    });
    this.input.on('pointerup', () => { this.dragging = false; });
  }

  update(_t: number, delta: number) {
    if (this.done) return;

    if (this.sliderImg) {
      this.sliderImg.setX(this.sliderX);
    } else {
      this.graphics.clear();
      this.graphics.fillStyle(0x00aaff);
      this.graphics.fillRect(this.sliderX - 20, this.trackY - 26, 40, 52);
      this.graphics.lineStyle(2, 0xffffff);
      this.graphics.strokeRect(this.sliderX - 20, this.trackY - 26, 40, 52);
    }

    if (Math.abs(this.sliderX - this.targetX) < 18) {
      this.stableTime += delta / 1000;
      if (this.stableTime >= this.STABLE_NEEDED) {
        this.done = true;
        this.showSuccess();
      }
    } else {
      this.stableTime = 0;
    }
  }

  private showSuccess() {
    const { width: W, height: H } = this.scale;
    this.add.text(W / 2, H / 2, '✓ Engine Aligned!', {
      fontSize: '38px', color: '#00ff88', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(10);
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
