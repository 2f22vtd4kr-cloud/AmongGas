import Phaser from 'phaser';
import type { GameScene } from '../GameScene';

interface TaskData { taskId: string; gameScene: GameScene; }

export class FuelEngineScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private taskId!: string;
  private fuelLevel = 0;
  private targetLevel = 1;
  private fuelBar?: Phaser.GameObjects.Rectangle;
  private pouring = false;

  constructor() { super({ key: 'FuelEngineScene' }); }
  init(d: TaskData) { this.gameScene = d.gameScene; this.taskId = d.taskId; }

  create() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.85);

    const pw = 400, ph = 420;
    const px = (W-pw)/2, py = (H-ph)/2;
    this.add.rectangle(W/2, H/2, pw, ph, 0x111122).setStrokeStyle(2, 0xff8800);
    this.add.text(W/2, py+14, 'Fuel Lower Engine', {
      fontSize: '20px', color: '#ffaa00', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    const closeBtn = this.add.text(px+pw-10, py+10, '✕', {
      fontSize: '22px', color: '#fff', backgroundColor: '#333', padding: { x: 6, y: 2 },
    }).setOrigin(1,0).setInteractive();
    closeBtn.on('pointerdown', () => this.closeTask());

    // Panel background from original asset — depth -1 so interactive elements stay on top
    if (this.textures.exists('task_fuel_base')) {
      this.add.image(W/2, H/2, 'task_fuel_base').setDisplaySize(pw-20, ph-20).setDepth(-1);
    }

    // Tank outline
    const tankX = W/2;
    const tankTop = py+80, tankBot = py+ph-80;
    const tankH = tankBot - tankTop;
    const tankW = 100;

    this.add.rectangle(tankX, tankTop + tankH/2, tankW, tankH, 0x222233, 0.5).setStrokeStyle(2, 0x666688);

    // Fuel fill bar
    this.fuelBar = this.add.rectangle(tankX, tankBot, tankW-6, 0, 0xff8800).setOrigin(0.5, 1);

    // Target line
    const targetY = tankTop + (1-this.targetLevel) * tankH;
    this.add.line(tankX, targetY, -tankW/2-10, 0, tankW/2+10, 0, 0x00ff00, 1).setLineWidth(2);
    this.add.text(tankX + tankW/2+14, targetY, '← Fill to here', {
      fontSize: '12px', color: '#00ff00', fontFamily: 'Arial',
    }).setOrigin(0, 0.5);

    // Gas can (drag it to tank)
    const canImg = this.textures.exists('task_fuel_can')
      ? this.add.image(px+60, tankBot-20, 'task_fuel_can').setDisplaySize(64, 80)
      : this.add.rectangle(px+60, tankBot-20, 64, 80, 0xff6600).setStrokeStyle(2, 0xffaa00) as unknown as Phaser.GameObjects.Image;

    canImg.setInteractive();
    this.input.setDraggable(canImg as unknown as Phaser.GameObjects.Image);

    let draining = false;
    this.input.on('drag', (_p: unknown, obj: Phaser.GameObjects.Image, x: number, y: number) => {
      obj.setPosition(x, y);
      if (Math.abs(x - tankX) < tankW/2 + 20 && y < tankBot && y > tankTop) {
        draining = true;
      }
    });
    this.input.on('dragend', (_p: unknown, obj: Phaser.GameObjects.Image) => {
      obj.setPosition(px+60, tankBot-20);
      draining = false;
    });

    // Hold button to fill
    const fillBtn = this.add.text(W/2, py+ph-40, '👆 Hold to pour fuel', {
      fontSize: '16px', color: '#ffcc00', backgroundColor: '#333',
      padding: { x: 12, y: 8 }, fontFamily: 'Arial',
    }).setOrigin(0.5, 1).setInteractive();

    fillBtn.on('pointerdown', () => { this.pouring = true; });
    this.input.on('pointerup', () => { this.pouring = false; });
  }

  update(_t: number, delta: number) {
    if (this.pouring && this.fuelLevel < this.targetLevel) {
      this.fuelLevel = Math.min(this.targetLevel, this.fuelLevel + delta / 3000);
      const { height: H } = this.scale;
      const py = (H - 420) / 2;
      const tankTop = py + 80, tankBot = py + 420 - 80;
      const tankH = tankBot - tankTop;
      this.fuelBar?.setSize(94, this.fuelLevel * tankH);

      if (this.fuelLevel >= this.targetLevel) {
        this.showSuccess();
      }
    }
  }

  private showSuccess() {
    const { width: W, height: H } = this.scale;
    this.add.text(W/2, H/2, '✓ Engine Fueled!', {
      fontSize: '34px', color: '#00ff88', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
    }).setOrigin(0.5);
    this.time.delayedCall(1200, () => { this.gameScene.completeTask(this.taskId); this.scene.stop(); });
  }

  private closeTask() { this.scene.resume('GameScene'); this.scene.stop(); }
}
