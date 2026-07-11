import Phaser from 'phaser';
import type { GameScene } from '../GameScene';

interface TaskData { taskId: string; gameScene: GameScene; }

export class RebootWifiScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private taskId!: string;
  private leverY = 0;
  private leverTargetY = 0;
  private dragging = false;
  private complete = false;

  constructor() { super({ key: 'RebootWifiScene' }); }
  init(d: TaskData) { this.gameScene = d.gameScene; this.taskId = d.taskId; }

  create() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.85);

    const pw = 360, ph = 420;
    const px = (W-pw)/2, py = (H-ph)/2;
    this.add.rectangle(W/2, H/2, pw, ph, 0x0d1117).setStrokeStyle(2, 0x00aaff);
    this.add.text(W/2, py+14, 'Reboot The Wifi', {
      fontSize: '20px', color: '#00ccff', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    const closeBtn = this.add.text(px+pw-10, py+10, '✕', {
      fontSize: '22px', color: '#fff', backgroundColor: '#333', padding: { x: 6, y: 2 },
    }).setOrigin(1,0).setInteractive();
    closeBtn.on('pointerdown', () => this.closeTask());

    if (this.textures.exists('task_wifi_bg')) {
      this.add.image(W/2, H/2+10, 'task_wifi_bg').setDisplaySize(pw-40, ph-60);
    }

    // Track
    const trackX = W/2;
    const trackTop = py+80;
    const trackBot = py+ph-80;
    this.leverTargetY = trackBot; // start at bottom, must drag to top

    const track = this.add.rectangle(trackX, (trackTop+trackBot)/2, 24, trackBot-trackTop, 0x333333).setStrokeStyle(1, 0x666666);

    // Lever
    this.leverY = trackBot;
    const lever = this.add.rectangle(trackX, this.leverY, 60, 28, 0x00aaff).setStrokeStyle(2, 0x00ffff);
    lever.setInteractive(new Phaser.Geom.Rectangle(-30, -14, 60, 28), Phaser.Geom.Rectangle.Contains);

    this.add.text(trackX, trackTop-18, 'ON', { fontSize:'14px', color:'#00ff88', fontFamily:'Arial' }).setOrigin(0.5);
    this.add.text(trackX, trackBot+18, 'OFF', { fontSize:'14px', color:'#ff4444', fontFamily:'Arial' }).setOrigin(0.5);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (Math.abs(p.y - this.leverY) < 30 && Math.abs(p.x - trackX) < 50) this.dragging = true;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      this.leverY = Phaser.Math.Clamp(p.y, trackTop, trackBot);
      lever.setY(this.leverY);
      // Color
      const pct = 1 - (this.leverY - trackTop) / (trackBot - trackTop);
      lever.setFillStyle(Phaser.Display.Color.RGBToString(
        Math.floor(pct * 0), Math.floor(pct * 170 + (1-pct)*50), Math.floor(pct*255+(1-pct)*50)
      ) as unknown as number);
    });
    this.input.on('pointerup', () => {
      this.dragging = false;
      if (!this.complete && this.leverY <= trackTop + 10) {
        this.complete = true;
        this.showSuccess();
      }
    });
  }

  private showSuccess() {
    const { width: W, height: H } = this.scale;
    this.add.text(W/2, H/2, '✓ Wifi Rebooted!', {
      fontSize: '34px', color: '#00ff88', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
    }).setOrigin(0.5);
    this.time.delayedCall(1200, () => { this.gameScene.completeTask(this.taskId); this.scene.stop(); });
  }

  private closeTask() { this.scene.resume('GameScene'); this.scene.stop(); }
}
