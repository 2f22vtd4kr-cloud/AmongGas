import Phaser from 'phaser';
import type { GameScene } from '../GameScene';

interface TaskData { taskId: string; gameScene: GameScene; }

export class AlignEngineScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private taskId!: string;
  private sliderX = 0;
  private targetX = 0;
  private dragging = false;
  private graphics!: Phaser.GameObjects.Graphics;
  private stableTime = 0;
  private STABLE_NEEDED = 1.5;

  constructor() { super({ key: 'AlignEngineScene' }); }
  init(d: TaskData) { this.gameScene = d.gameScene; this.taskId = d.taskId; }

  create() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.85);

    const pw = 440, ph = 340;
    const px = (W-pw)/2, py = (H-ph)/2;
    this.add.rectangle(W/2, H/2, pw, ph, 0x0d1a0d).setStrokeStyle(2, 0x00ff44);
    this.add.text(W/2, py+14, 'Align Engine Output', {
      fontSize: '20px', color: '#00ff88', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    const closeBtn = this.add.text(px+pw-10, py+10, '✕', {
      fontSize: '22px', color: '#fff', backgroundColor: '#333', padding: { x: 6, y: 2 },
    }).setOrigin(1,0).setInteractive();
    closeBtn.on('pointerdown', () => this.closeTask());

    // Track
    const trackLeft = px + 60;
    const trackRight = px + pw - 60;
    const trackY = H/2 + 20;
    this.targetX = trackLeft + Math.random() * (trackRight - trackLeft);
    this.sliderX = trackLeft;

    this.add.rectangle((trackLeft+trackRight)/2, trackY, trackRight-trackLeft, 12, 0x333333).setStrokeStyle(1, 0x666666);

    // Target zone
    this.add.rectangle(this.targetX, trackY, 30, 28, 0x00ff44, 0.3).setStrokeStyle(2, 0x00ff44);

    this.graphics = this.add.graphics();

    this.add.text(W/2, trackY+50, 'Drag the slider to the green zone', {
      fontSize: '14px', color: '#aaaaaa', fontFamily: 'Arial',
    }).setOrigin(0.5);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (Math.abs(p.x - this.sliderX) < 24 && Math.abs(p.y - trackY) < 30) this.dragging = true;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragging) this.sliderX = Phaser.Math.Clamp(p.x, trackLeft, trackRight);
    });
    this.input.on('pointerup', () => { this.dragging = false; });

    // Store refs for update
    this.data.set('trackY', trackY);
  }

  update(_t: number, delta: number) {
    const trackY = this.data.get('trackY') as number;
    this.graphics.clear();
    this.graphics.fillStyle(0x00aaff);
    this.graphics.fillRect(this.sliderX - 16, trackY - 20, 32, 40);
    this.graphics.lineStyle(2, 0xffffff);
    this.graphics.strokeRect(this.sliderX - 16, trackY - 20, 32, 40);

    if (Math.abs(this.sliderX - this.targetX) < 15) {
      this.stableTime += delta / 1000;
      if (this.stableTime >= this.STABLE_NEEDED) this.showSuccess();
    } else {
      this.stableTime = 0;
    }
  }

  private showSuccess() {
    const { width: W, height: H } = this.scale;
    this.add.text(W/2, H/2, '✓ Engine Aligned!', {
      fontSize: '34px', color: '#00ff88', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
    }).setOrigin(0.5);
    this.time.delayedCall(1200, () => { this.gameScene.completeTask(this.taskId); this.scene.stop(); });
  }

  private closeTask() { this.scene.stop(); this.scene.resume('GameScene'); }
}
