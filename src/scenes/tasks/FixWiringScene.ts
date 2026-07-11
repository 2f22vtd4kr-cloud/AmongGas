import Phaser from 'phaser';
import type { GameScene } from '../GameScene';

interface TaskData { taskId: string; gameScene: GameScene; }

const WIRE_COLORS = ['blue', 'pink', 'red', 'yellow'];
const HEX: Record<string, number> = { blue: 0x4444ff, pink: 0xff69b4, red: 0xff2222, yellow: 0xffdd00 };

export class FixWiringScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private taskId!: string;
  private solution: number[] = [];   // correct order
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

    // Dim background
    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.85);

    // Panel
    const pw = 480, ph = 380;
    const px = (W - pw) / 2, py = (H - ph) / 2;
    this.add.rectangle(W/2, H/2, pw, ph, 0x1a1a2e).setStrokeStyle(2, 0x4444ff);

    if (this.textures.exists('task_wiring_base')) {
      this.add.image(W/2, H/2, 'task_wiring_base').setDisplaySize(pw - 40, ph - 80);
    }

    this.add.text(W/2, py + 18, 'Fix The Electricity Wires', {
      fontSize: '20px', color: '#00ffff', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    // Close button
    const close = this.add.text(px + pw - 12, py + 10, '✕', {
      fontSize: '24px', color: '#fff', backgroundColor: '#333', padding: { x: 6, y: 2 },
    }).setOrigin(1, 0).setInteractive();
    close.on('pointerdown', () => this.closeTask());

    // Shuffle wires
    const shuffled = Phaser.Math.RND.shuffle([...WIRE_COLORS]);
    this.solution = shuffled.map((_, i) => i);

    // Left pegs (fixed order)
    const leftX = px + 60;
    const rightX = px + pw - 60;
    const pegStartY = py + 100;
    const pegSpacing = 60;

    for (let i = 0; i < WIRE_COLORS.length; i++) {
      this.leftPegs.push({ x: leftX, y: pegStartY + i * pegSpacing, color: WIRE_COLORS[i] });
      this.rightPegs.push({ x: rightX, y: pegStartY + i * pegSpacing, color: shuffled[i] });
    }

    // Draw pegs
    this.graphics = this.add.graphics();
    this.drawPegs();

    // Interaction
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const cp = this.cameras.main.getWorldPoint(p.x, p.y);
      for (let i = 0; i < this.leftPegs.length; i++) {
        const peg = this.leftPegs[i];
        if (Phaser.Math.Distance.Between(cp.x, cp.y, peg.x, peg.y) < 20) {
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
        if (Phaser.Math.Distance.Between(cp.x, cp.y, peg.x, peg.y) < 24) {
          // Remove existing connection from this left peg
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
    for (const peg of this.leftPegs) {
      this.graphics.fillStyle(HEX[peg.color] ?? 0xffffff);
      this.graphics.fillCircle(peg.x, peg.y, 14);
      this.graphics.lineStyle(2, 0xffffff);
      this.graphics.strokeCircle(peg.x, peg.y, 14);
    }
    for (const peg of this.rightPegs) {
      this.graphics.fillStyle(HEX[peg.color] ?? 0xffffff);
      this.graphics.fillCircle(peg.x, peg.y, 14);
      this.graphics.lineStyle(2, 0xffffff);
      this.graphics.strokeCircle(peg.x, peg.y, 14);
    }
    // Draw connected wires
    for (const conn of this.connections) {
      const lp = this.leftPegs[conn.from];
      const rp = this.rightPegs[conn.to];
      this.graphics.lineStyle(4, HEX[lp.color] ?? 0xffffff);
      this.graphics.beginPath();
      this.graphics.moveTo(lp.x + 14, lp.y);
      this.graphics.lineTo(rp.x - 14, rp.y);
      this.graphics.strokePath();
    }
  }

  private drawWires() {
    this.drawPegs();
    if (this.dragFrom !== null) {
      const lp = this.leftPegs[this.dragFrom];
      const ptr = this.input.activePointer;
      const cp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      this.graphics.lineStyle(3, HEX[lp.color] ?? 0xffffff, 0.7);
      this.graphics.beginPath();
      this.graphics.moveTo(lp.x + 14, lp.y);
      this.graphics.lineTo(cp.x, cp.y);
      this.graphics.strokePath();
    }
  }

  private checkComplete() {
    if (this.connections.length < WIRE_COLORS.length) return;
    // Each left peg must connect to right peg with same color
    let correct = 0;
    for (const conn of this.connections) {
      if (this.leftPegs[conn.from].color === this.rightPegs[conn.to].color) correct++;
    }
    if (correct === WIRE_COLORS.length) {
      this.showSuccess();
    }
  }

  private showSuccess() {
    const { width: W, height: H } = this.scale;
    this.add.text(W/2, H/2, '✓ Wiring Fixed!', {
      fontSize: '36px', color: '#00ff88', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
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
