import Phaser from 'phaser';
import type { GameScene } from '../GameScene';
import { fitContain } from '../../utils/imageFit';

interface TaskData { taskId: string; gameScene: GameScene; }

export class FuelEngineScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private taskId!: string;
  private fuelLevel = 0;
  private targetLevel = 1;
  private fuelBar?: Phaser.GameObjects.Rectangle;
  private pouring = false;
  // Store panel dims so update() doesn't need to hardcode them
  private _pw = 520;
  private _ph = 520;

  constructor() { super({ key: 'FuelEngineScene' }); }
  init(d: TaskData) { this.gameScene = d.gameScene; this.taskId = d.taskId; }

  create() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.85);

    this._pw = Math.min(W - 60, 520);
    this._ph = Math.min(Math.round(H * 0.52), 520);
    const pw = this._pw, ph = this._ph;
    const px = (W-pw)/2, py = (H-ph)/2;

    this.add.rectangle(W/2, H/2, pw, ph, 0x111122).setStrokeStyle(2, 0xff8800);
    this.add.text(W/2, py+18, 'Fuel Lower Engine', {
      fontSize: '22px', color: '#ffaa00', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    const closeBtn = this.add.text(px+pw-12, py+12, '✕', {
      fontSize: '28px', color: '#fff', backgroundColor: '#444', padding: { x: 10, y: 10 },
    }).setOrigin(1,0).setInteractive();
    closeBtn.on('pointerdown', () => this.closeTask());

    if (this.textures.exists('task_fuel_base')) {
      fitContain(this.add.image(W/2, H/2, 'task_fuel_base'), pw - 20, ph - 20).setDepth(-1);
    }

    // Tank
    const tankX = W/2;
    const tankTop = py+90, tankBot = py+ph-100;
    const tankH = tankBot - tankTop;
    const tankW = Math.round(pw * 0.22); // ~22% of panel width

    this.add.rectangle(tankX, tankTop + tankH/2, tankW, tankH, 0x222233, 0.5).setStrokeStyle(2, 0x666688);
    this.fuelBar = this.add.rectangle(tankX, tankBot, tankW-8, 0, 0xff8800).setOrigin(0.5, 1);

    // Target line
    const targetY = tankTop + (1-this.targetLevel) * tankH;
    this.add.line(tankX, targetY, -tankW/2-12, 0, tankW/2+12, 0, 0x00ff00, 1).setLineWidth(2);
    this.add.text(tankX + tankW/2+16, targetY, '← Fill to here', {
      fontSize: '14px', color: '#00ff00', fontFamily: 'Arial',
    }).setOrigin(0, 0.5);

    // Hold-to-pour button — large for touch
    const fillBtn = this.add.text(W/2, py+ph-30, '👆 Hold to pour fuel', {
      fontSize: '20px', color: '#ffcc00', backgroundColor: '#333',
      padding: { x: 18, y: 14 }, fontFamily: 'Arial',
    }).setOrigin(0.5, 1).setInteractive();

    fillBtn.on('pointerdown', () => { this.pouring = true; });
    this.input.on('pointerup', () => { this.pouring = false; });
  }

  update(_t: number, delta: number) {
    if (this.pouring && this.fuelLevel < this.targetLevel) {
      this.fuelLevel = Math.min(this.targetLevel, this.fuelLevel + delta / 3000);
      const { height: H } = this.scale;
      const py = (H - this._ph) / 2;
      const tankTop = py + 90;
      const tankBot = py + this._ph - 100;
      const tankH = tankBot - tankTop;
      const tankW = Math.round(this._pw * 0.22);
      this.fuelBar?.setSize(tankW - 8, this.fuelLevel * tankH);

      if (this.fuelLevel >= this.targetLevel) this.showSuccess();
    }
  }

  private showSuccess() {
    const { width: W, height: H } = this.scale;
    this.add.text(W/2, H/2, '✓ Engine Fueled!', {
      fontSize: '38px', color: '#00ff88', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
    }).setOrigin(0.5);
    this.time.delayedCall(1200, () => { this.gameScene.completeTask(this.taskId); this.scene.stop(); });
  }

  private closeTask() { this.scene.resume('GameScene'); this.scene.stop(); }
}
