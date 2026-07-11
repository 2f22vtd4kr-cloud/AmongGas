import Phaser from 'phaser';
import type { GameScene } from '../GameScene';
import { fitContain } from '../../utils/imageFit';

interface TaskData { taskId: string; gameScene: GameScene; }

export class RebootWifiScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private taskId!: string;
  private leverY = 0;
  private dragging = false;
  private complete = false;

  constructor() { super({ key: 'RebootWifiScene' }); }
  init(d: TaskData) { this.gameScene = d.gameScene; this.taskId = d.taskId; }

  create() {
    const { width: W, height: H } = this.scale;
    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.85);

    const pw = Math.min(W - 60, 480);
    // WiFi bg art is 366×716 (portrait) — give the panel enough height to
    // show it without squishing; cap at screen height minus safe margins.
    const ph = Math.min(H - 100, 720);
    const px = (W-pw)/2, py = (H-ph)/2;
    this.add.rectangle(W/2, H/2, pw, ph, 0x0d1117).setStrokeStyle(2, 0x00aaff);
    this.add.text(W/2, py+18, 'Reboot The Wifi', {
      fontSize: '22px', color: '#00ccff', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    const closeBtn = this.add.text(px+pw-12, py+12, '✕', {
      fontSize: '28px', color: '#fff', backgroundColor: '#444', padding: { x: 10, y: 4 },
    }).setOrigin(1,0).setInteractive();
    closeBtn.on('pointerdown', () => this.closeTask());

    if (this.textures.exists('task_wifi_bg')) {
      fitContain(this.add.image(W/2, H/2 + 10, 'task_wifi_bg'), pw - 30, ph - 80);
    }

    // Track
    const trackX = W/2;
    const trackTop = py + 90;
    const trackBot = py + ph - 90;
    this.leverY = trackBot;

    this.add.rectangle(trackX, (trackTop+trackBot)/2, 28, trackBot-trackTop, 0x333333).setStrokeStyle(1, 0x666666);

    // Lever — wide and tall for easy touch
    const leverW = 80, leverH = 40;
    const lever = this.add.rectangle(trackX, this.leverY, leverW, leverH, 0x00aaff).setStrokeStyle(2, 0x00ffff);
    lever.setInteractive(new Phaser.Geom.Rectangle(-leverW/2, -leverH/2, leverW, leverH), Phaser.Geom.Rectangle.Contains);

    this.add.text(trackX, trackTop-22, 'ON',  { fontSize:'18px', color:'#00ff88', fontFamily:'Arial', fontStyle:'bold' }).setOrigin(0.5);
    this.add.text(trackX, trackBot+22, 'OFF', { fontSize:'18px', color:'#ff4444', fontFamily:'Arial', fontStyle:'bold' }).setOrigin(0.5);

    this.add.text(W/2, py+ph-24, 'Drag lever UP to reboot', {
      fontSize: '16px', color: '#aaaaaa', fontFamily: 'Arial',
    }).setOrigin(0.5, 1);

    // Generous hit area around lever
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (Math.abs(p.y - this.leverY) < 50 && Math.abs(p.x - trackX) < 65) this.dragging = true;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      this.leverY = Phaser.Math.Clamp(p.y, trackTop, trackBot);
      lever.setY(this.leverY);
      const pct = 1 - (this.leverY - trackTop) / (trackBot - trackTop);
      const r = Math.floor(0);
      const g = Math.floor(pct * 170 + (1-pct)*50);
      const b = Math.floor(pct * 255 + (1-pct)*50);
      lever.setFillStyle(Phaser.Display.Color.GetColor(r, g, b));
    });
    this.input.on('pointerup', () => {
      this.dragging = false;
      if (!this.complete && this.leverY <= trackTop + 12) {
        this.complete = true;
        this.showSuccess();
      }
    });
  }

  private showSuccess() {
    const { width: W, height: H } = this.scale;
    this.add.text(W/2, H/2, '✓ Wifi Rebooted!', {
      fontSize: '38px', color: '#00ff88', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
    }).setOrigin(0.5);
    this.time.delayedCall(1200, () => { this.gameScene.completeTask(this.taskId); this.scene.stop(); });
  }

  private closeTask() { this.scene.resume('GameScene'); this.scene.stop(); }
}
