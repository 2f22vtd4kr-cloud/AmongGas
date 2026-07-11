import Phaser from 'phaser';
import type { GameScene } from '../GameScene';

interface TaskData { taskId: string; gameScene: GameScene; }

export class StabilizeNavScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private taskId!: string;
  private targetX = 0; private targetY = 0;
  private joystickX = 0; private joystickY = 0;
  private isDragging = false;
  private graphics!: Phaser.GameObjects.Graphics;
  private stableTime = 0;
  private STABLE_NEEDED = 2.5; // seconds
  private indicator?: Phaser.GameObjects.Text;

  constructor() { super({ key: 'StabilizeNavScene' }); }
  init(d: TaskData) { this.gameScene = d.gameScene; this.taskId = d.taskId; }

  create() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.85);

    const pw = 460, ph = 400;
    const px = (W-pw)/2, py = (H-ph)/2;
    this.add.rectangle(W/2, H/2, pw, ph, 0x0a1628).setStrokeStyle(2, 0x0044ff);

    this.add.text(W/2, py+16, "Stabilize The Ship's Navigation", {
      fontSize: '18px', color: '#88aaff', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    const closeBtn = this.add.text(px+pw-10, py+10, '✕', {
      fontSize: '22px', color: '#fff', backgroundColor: '#333', padding: { x: 6, y: 2 },
    }).setOrigin(1,0).setInteractive();
    closeBtn.on('pointerdown', () => this.closeTask());

    // Target crosshair (random position)
    const area = { x: px+80, y: py+80, w: pw-160, h: ph-160 };
    this.targetX = area.x + Math.random() * area.w;
    this.targetY = area.y + Math.random() * area.h;

    // Joystick starts at center
    this.joystickX = W/2;
    this.joystickY = H/2 + 30;

    this.graphics = this.add.graphics();
    this.renderScene();

    this.indicator = this.add.text(W/2, py+ph-28, 'Hold the marker on target!', {
      fontSize: '15px', color: '#ffff00', fontFamily: 'Arial',
    }).setOrigin(0.5, 1);

    // Dragging
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (Phaser.Math.Distance.Between(p.x, p.y, this.joystickX, this.joystickY) < 30) {
        this.isDragging = true;
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.isDragging) return;
      this.joystickX = Phaser.Math.Clamp(p.x, px+40, px+pw-40);
      this.joystickY = Phaser.Math.Clamp(p.y, py+60, py+ph-40);
    });
    this.input.on('pointerup', () => { this.isDragging = false; });
  }

  update(_t: number, delta: number) {
    this.renderScene();
    const dist = Phaser.Math.Distance.Between(this.joystickX, this.joystickY, this.targetX, this.targetY);
    if (dist < 20) {
      this.stableTime += delta / 1000;
      if (this.indicator) this.indicator.setText(`Hold… ${(this.STABLE_NEEDED - this.stableTime).toFixed(1)}s`);
      if (this.stableTime >= this.STABLE_NEEDED) {
        this.showSuccess();
      }
    } else {
      this.stableTime = 0;
      if (this.indicator) this.indicator.setText('Hold the marker on target!');
    }
  }

  private renderScene() {
    this.graphics.clear();
    // Target
    this.graphics.lineStyle(2, 0xff4400, 0.8);
    this.graphics.strokeCircle(this.targetX, this.targetY, 20);
    this.graphics.lineStyle(1, 0xff4400, 0.6);
    this.graphics.beginPath();
    this.graphics.moveTo(this.targetX-30, this.targetY);
    this.graphics.lineTo(this.targetX+30, this.targetY);
    this.graphics.moveTo(this.targetX, this.targetY-30);
    this.graphics.lineTo(this.targetX, this.targetY+30);
    this.graphics.strokePath();

    // Joystick marker
    this.graphics.fillStyle(0x00ffcc, 0.9);
    this.graphics.fillCircle(this.joystickX, this.joystickY, 14);
    this.graphics.lineStyle(2, 0xffffff);
    this.graphics.strokeCircle(this.joystickX, this.joystickY, 14);
  }

  private showSuccess() {
    const { width: W, height: H } = this.scale;
    this.add.text(W/2, H/2, '✓ Navigation Stable!', {
      fontSize: '34px', color: '#00ff88', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
    }).setOrigin(0.5);
    this.time.delayedCall(1200, () => {
      this.gameScene.completeTask(this.taskId);
      this.scene.stop();
    });
  }

  private closeTask() { this.scene.stop(); this.scene.resume('GameScene'); }
}
