import Phaser from 'phaser';
import type { GameScene } from '../GameScene';
import { fitContain } from '../../utils/imageFit';

interface TaskData { taskId: string; gameScene: GameScene; }

export class StabilizeNavScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private taskId!: string;
  private targetX = 0; private targetY = 0;
  private joystickX = 0; private joystickY = 0;
  private isDragging = false;
  private graphics!: Phaser.GameObjects.Graphics;
  private stableTime = 0;
  private STABLE_NEEDED = 2.5;
  private indicator?: Phaser.GameObjects.Text;
  // panel bounds stored for clamping in update
  private panelBounds = { px: 0, py: 0, pw: 0, ph: 0 };

  constructor() { super({ key: 'StabilizeNavScene' }); }
  init(d: TaskData) { this.gameScene = d.gameScene; this.taskId = d.taskId; }

  create() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.85);

    const pw = Math.min(W - 60, 560);
    const ph = Math.min(Math.round(H * 0.52), 520);
    const px = (W-pw)/2, py = (H-ph)/2;
    this.panelBounds = { px, py, pw, ph };

    if (this.textures.exists('task_nav_base')) {
      fitContain(this.add.image(W/2, H/2, 'task_nav_base'), pw, ph);
    } else {
      this.add.rectangle(W/2, H/2, pw, ph, 0x0a1628).setStrokeStyle(2, 0x0044ff);
    }

    this.add.text(W/2, py+18, "Stabilize The Ship's Navigation", {
      fontSize: '20px', color: '#88aaff', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    const closeBtn = this.add.text(px+pw-12, py+12, '✕', {
      fontSize: '28px', color: '#fff', backgroundColor: '#444', padding: { x: 10, y: 4 },
    }).setOrigin(1,0).setInteractive();
    closeBtn.on('pointerdown', () => this.closeTask());

    // Target (random position in safe area)
    const area = { x: px+90, y: py+90, w: pw-180, h: ph-180 };
    this.targetX = area.x + Math.random() * area.w;
    this.targetY = area.y + Math.random() * area.h;

    if (this.textures.exists('task_nav_center')) {
      this.add.image(this.targetX, this.targetY, 'task_nav_center').setDisplaySize(52, 52).setAlpha(0.9);
    }

    // Joystick starts at panel center
    this.joystickX = W/2;
    this.joystickY = H/2 + 30;

    this.graphics = this.add.graphics();
    this.renderScene();

    this.indicator = this.add.text(W/2, py+ph-30, 'Hold the marker on target!', {
      fontSize: '18px', color: '#ffff00', fontFamily: 'Arial',
    }).setOrigin(0.5, 1);

    // Drag hit radius generous for touch
    const hitR = 42;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (Phaser.Math.Distance.Between(p.x, p.y, this.joystickX, this.joystickY) < hitR) {
        this.isDragging = true;
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.isDragging) return;
      this.joystickX = Phaser.Math.Clamp(p.x, px+50, px+pw-50);
      this.joystickY = Phaser.Math.Clamp(p.y, py+70, py+ph-50);
    });
    this.input.on('pointerup', () => { this.isDragging = false; });
  }

  update(_t: number, delta: number) {
    this.renderScene();
    const dist = Phaser.Math.Distance.Between(this.joystickX, this.joystickY, this.targetX, this.targetY);
    if (dist < 25) {
      this.stableTime += delta / 1000;
      if (this.indicator) this.indicator.setText(`Hold… ${(this.STABLE_NEEDED - this.stableTime).toFixed(1)}s`);
      if (this.stableTime >= this.STABLE_NEEDED) this.showSuccess();
    } else {
      this.stableTime = 0;
      if (this.indicator) this.indicator.setText('Hold the marker on target!');
    }
  }

  private renderScene() {
    this.graphics.clear();
    // Target crosshair
    this.graphics.lineStyle(2, 0xff4400, 0.8);
    this.graphics.strokeCircle(this.targetX, this.targetY, 25);
    this.graphics.lineStyle(1, 0xff4400, 0.6);
    this.graphics.beginPath();
    this.graphics.moveTo(this.targetX-36, this.targetY);
    this.graphics.lineTo(this.targetX+36, this.targetY);
    this.graphics.moveTo(this.targetX, this.targetY-36);
    this.graphics.lineTo(this.targetX, this.targetY+36);
    this.graphics.strokePath();

    // Joystick marker
    this.graphics.fillStyle(0x00ffcc, 0.9);
    this.graphics.fillCircle(this.joystickX, this.joystickY, 18);
    this.graphics.lineStyle(2, 0xffffff);
    this.graphics.strokeCircle(this.joystickX, this.joystickY, 18);
  }

  private showSuccess() {
    const { width: W, height: H } = this.scale;
    this.add.text(W/2, H/2, '✓ Navigation Stable!', {
      fontSize: '38px', color: '#00ff88', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
    }).setOrigin(0.5);
    this.time.delayedCall(1200, () => {
      this.gameScene.completeTask(this.taskId);
      this.scene.stop();
    });
  }

  private closeTask() { this.scene.resume('GameScene'); this.scene.stop(); }
}
