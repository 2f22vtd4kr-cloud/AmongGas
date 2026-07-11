import Phaser from 'phaser';
import type { GameScene } from '../GameScene';

interface TaskData { taskId: string; gameScene: GameScene; }

const WIRE_COLORS = ['blue', 'pink', 'red', 'yellow'];
const HEX: Record<string, number> = { blue: 0x4444ff, pink: 0xff69b4, red: 0xff2222, yellow: 0xffdd00 };

export class FixWiringScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private taskId!: string;
  private solution: number[] = [];
  private playerOrder: number[] = [];
  private graphics!: Phaser.GameObjects.Graphics;
  private leftPegs: { x: number; y: number; color: string }[] = [];
  private rightPegs: { x: number; y: number; color: string }[] = [];
  private dragFrom: number | null = null;
  private connections: { from: number; to: number }[] = [];

  constructor() { super({ key: 'FixWiringScene' }); }

  init(data: TaskData) { this.gameScene = data.gameScene; this.taskId = data.taskId; }

  create() {
    const { width: W, height: H } = this.scale;

    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.85);

    // Dynamic panel — fills portrait screen comfortably
    const pw = Math.min(W - 60, 560);
    const ph = Math.min(Math.round(H * 0.52), 520);
    const px = (W - pw) / 2, py = (H - ph) / 2;
    this.add.rectangle(W/2, H/2, pw, ph, 0x1a1a2e).setStrokeStyle(2, 0x4444ff);

    if (this.textures.exists('task_wiring_base')) {
      this.add.image(W/2, H/2, 'task_wiring_base').setDisplaySize(pw - 40, ph - 80);
    }

    this.add.text(W/2, py + 18, 'Fix The Electricity Wires', {
      fontSize: '22px', color: '#00ffff', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    // Close button — larger touch target
    const close = this.add.text(px + pw - 12, py + 12, '✕', {
      fontSize: '28px', color: '#fff', backgroundColor: '#444', padding: { x: 10, y: 4 },
    }).setOrigin(1, 0).setInteractive();
    close.on('pointerdown', () => this.closeTask());

    const shuffled = Phaser.Math.RND.shuffle([...WIRE_COLORS]);
    this.solution = shuffled.map((_, i) => i);

    const leftX  = px + 80;
    const rightX = px + pw - 80;
    const pegStartY  = py + 100;
    const pegSpacing = Math.min(Math.round((ph - 160) / WIRE_COLORS.length), 80);

    for (let i = 0; i < WIRE_COLORS.length; i++) {
      this.leftPegs.push({ x: leftX,  y: pegStartY + i * pegSpacing, color: WIRE_COLORS[i] });
      this.rightPegs.push({ x: rightX, y: pegStartY + i * pegSpacing, color: shuffled[i] });
    }

    this.graphics = this.add.graphics();
    this.drawPegs();

    // Hit radius scaled with panel — generous for touch
    const hitR  = Math.round(pw * 0.055); // ~30px
    const landR = Math.round(pw * 0.065); // ~36px

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const cp = this.cameras.main.getWorldPoint(p.x, p.y);
      for (let i = 0; i < this.leftPegs.length; i++) {
        const peg = this.leftPegs[i];
        if (Phaser.Math.Distance.Between(cp.x, cp.y, peg.x, peg.y) < hitR) {
          this.dragFrom = i;
          break;
        }
      }
    });

    this.input.on('pointermove', () => this.drawWires());

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.dragFrom === null) return;
      const cp = this.cameras.main.getWorldPoint(p.x, p.y);
      for (let j = 0; j < this.rightPegs.length; j++) {
        const peg = this.rightPegs[j];
        if (Phaser.Math.Distance.Between(cp.x, cp.y, peg.x, peg.y) < landR) {
          this.connections = this.connections.filter(c => c.from !== this.dragFrom);
          this.connections.push({ from: this.dragFrom!, to: j });
          break;
        }
      }
      this.dragFrom = null;
      this.drawWires();
      this.checkComplete();
    });
  }

  private drawPegs() {
    this.graphics.clear();
    const r = 16;
    for (const peg of this.leftPegs) {
      this.graphics.fillStyle(HEX[peg.color] ?? 0xffffff);
      this.graphics.fillCircle(peg.x, peg.y, r);
      this.graphics.lineStyle(2, 0xffffff);
      this.graphics.strokeCircle(peg.x, peg.y, r);
    }
    for (const peg of this.rightPegs) {
      this.graphics.fillStyle(HEX[peg.color] ?? 0xffffff);
      this.graphics.fillCircle(peg.x, peg.y, r);
      this.graphics.lineStyle(2, 0xffffff);
      this.graphics.strokeCircle(peg.x, peg.y, r);
    }
    for (const conn of this.connections) {
      const lp = this.leftPegs[conn.from];
      const rp = this.rightPegs[conn.to];
      this.graphics.lineStyle(5, HEX[lp.color] ?? 0xffffff);
      this.graphics.beginPath();
      this.graphics.moveTo(lp.x + r, lp.y);
      this.graphics.lineTo(rp.x - r, rp.y);
      this.graphics.strokePath();
    }
  }

  private drawWires() {
    this.drawPegs();
    if (this.dragFrom !== null) {
      const r = 16;
      const lp = this.leftPegs[this.dragFrom];
      const ptr = this.input.activePointer;
      const cp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      this.graphics.lineStyle(4, HEX[lp.color] ?? 0xffffff, 0.7);
      this.graphics.beginPath();
      this.graphics.moveTo(lp.x + r, lp.y);
      this.graphics.lineTo(cp.x, cp.y);
      this.graphics.strokePath();
    }
  }

  private checkComplete() {
    if (this.connections.length < WIRE_COLORS.length) return;
    let correct = 0;
    for (const conn of this.connections) {
      if (this.leftPegs[conn.from].color === this.rightPegs[conn.to].color) correct++;
    }
    if (correct === WIRE_COLORS.length) this.showSuccess();
  }

  private showSuccess() {
    const { width: W, height: H } = this.scale;
    this.add.text(W/2, H/2, '✓ Wiring Fixed!', {
      fontSize: '40px', color: '#00ff88', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
    }).setOrigin(0.5);
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
