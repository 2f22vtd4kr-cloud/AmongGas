import Phaser from 'phaser';
import type { GameScene } from '../GameScene';

interface TaskData { taskId: string; gameScene: GameScene; }

interface Asteroid { x: number; y: number; vx: number; vy: number; r: number; hp: number; }
interface Bullet  { x: number; y: number; vx: number; vy: number; }

export class ClearAsteroidsScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private taskId!: string;
  private asteroids: Asteroid[] = [];
  private bullets: Bullet[] = [];
  private killed = 0;
  private TARGET = 30;
  private graphics!: Phaser.GameObjects.Graphics;
  private killedText?: Phaser.GameObjects.Text;
  private shipX = 0;
  private shipY = 0;
  private done = false;
  private fireTimer = 0;
  private FIRE_RATE = 300; // ms

  constructor() { super({ key: 'ClearAsteroidsScene' }); }
  init(d: TaskData) { this.gameScene = d.gameScene; this.taskId = d.taskId; }

  create() {
    const { width: W, height: H } = this.scale;

    // Space background
    this.add.rectangle(W/2, H/2, W, H, 0x000011);
    // Stars
    for (let i = 0; i < 100; i++) {
      this.add.circle(Math.random()*W, Math.random()*H, Math.random()*1.5+0.5, 0xffffff, Math.random()*0.8+0.2);
    }

    const closeBtn = this.add.text(W-10, 10, '✕', {
      fontSize: '22px', color: '#fff', backgroundColor: '#333', padding: { x: 6, y: 2 },
    }).setOrigin(1,0).setInteractive().setDepth(10);
    closeBtn.on('pointerdown', () => this.closeTask());

    this.add.text(W/2, 12, 'Clear the Asteroids (30)', {
      fontSize: '18px', color: '#88aaff', fontFamily: 'Arial',
    }).setOrigin(0.5, 0).setDepth(10);

    this.killedText = this.add.text(12, 40, `Destroyed: 0 / ${this.TARGET}`, {
      fontSize: '16px', color: '#ffff00', fontFamily: 'Arial',
    }).setDepth(10);

    this.shipX = W/2;
    this.shipY = H - 80;

    if (this.textures.exists('task_asteroids_ship')) {
      this.add.image(this.shipX, this.shipY, 'task_asteroids_ship').setDisplaySize(60, 60);
    }

    this.graphics = this.add.graphics().setDepth(5);

    // Spawn asteroids periodically
    this.time.addEvent({ delay: 800, callback: this.spawnAsteroid, callbackScope: this, loop: true });

    // Touch / mouse fire (tap = fire toward tap point)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.fireBullet(p.x, p.y);
    });

    // Keyboard fire
    const space = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    space.on('down', () => this.fireBullet(this.shipX, 0));

    // Ship movement via keyboard
    this.input.keyboard!.createCursorKeys();
  }

  private spawnAsteroid() {
    const { width: W } = this.scale;
    const r = Phaser.Math.Between(16, 36);
    const x = Phaser.Math.Between(r, W - r);
    const speed = Phaser.Math.FloatBetween(60, 140);
    this.asteroids.push({ x, y: -r, vx: Phaser.Math.FloatBetween(-30, 30), vy: speed, r, hp: 1 });
  }

  private fireBullet(tx: number, ty: number) {
    const dx = tx - this.shipX;
    const dy = ty - this.shipY;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const speed = 600;
    this.bullets.push({ x: this.shipX, y: this.shipY - 20, vx: dx/len*speed, vy: dy/len*speed });
  }

  update(_t: number, delta: number) {
    if (this.done) return;
    const dt = delta / 1000;
    const { width: W, height: H } = this.scale;

    // Move ship with keyboard / mouse x
    const ptr = this.input.activePointer;
    if (ptr.isDown && ptr.x > W*0.4 && ptr.x < W*0.6) {
      // center tap = fire only
    } else if (ptr.isDown) {
      this.shipX = Phaser.Math.Linear(this.shipX, ptr.x, 0.08);
    }

    // Fire cooldown auto-fire if holding
    this.fireTimer += delta;
    if (ptr.isDown && this.fireTimer > this.FIRE_RATE) {
      this.fireBullet(ptr.x, ptr.y);
      this.fireTimer = 0;
    }

    // Update bullets
    for (const b of this.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    const activeBullets = this.bullets.filter(b => b.y > -10 && b.y < H + 10 && b.x > -10 && b.x < W + 10);
    this.bullets.length = 0;
    this.bullets.push(...activeBullets);

    // Update asteroids
    for (const a of this.asteroids) { a.x += a.vx * dt; a.y += a.vy * dt; }

    // Collision
    for (const a of this.asteroids) {
      for (const b of this.bullets) {
        const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        if (d < a.r + 6) {
          a.hp--;
          b.y = -9999;
          if (a.hp <= 0) {
            a.y = H + 9999; // remove
            this.killed++;
            if (this.killedText) this.killedText.setText(`Destroyed: ${this.killed} / ${this.TARGET}`);
          }
        }
      }
    }

    // Remove gone asteroids
    this.asteroids = this.asteroids.filter(a => a.y < H + 50 && a.hp > 0);

    // Draw
    this.graphics.clear();
    // Ship
    this.graphics.fillStyle(0x4488ff);
    this.graphics.fillTriangle(this.shipX, this.shipY-28, this.shipX-20, this.shipY+18, this.shipX+20, this.shipY+18);
    // Bullets
    this.graphics.fillStyle(0xffff00);
    for (const b of this.bullets) this.graphics.fillRect(b.x-3, b.y-8, 6, 16);
    // Asteroids
    this.graphics.fillStyle(0x886644);
    for (const a of this.asteroids) {
      this.graphics.fillCircle(a.x, a.y, a.r);
      this.graphics.lineStyle(1, 0xaa8866);
      this.graphics.strokeCircle(a.x, a.y, a.r);
    }

    if (this.killed >= this.TARGET) { this.done = true; this.showSuccess(); }
  }

  private showSuccess() {
    const { width: W, height: H } = this.scale;
    this.add.text(W/2, H/2, '✓ Asteroids Cleared!', {
      fontSize: '34px', color: '#00ff88', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(20);
    this.time.delayedCall(1500, () => { this.gameScene.completeTask(this.taskId); this.scene.stop(); });
  }

  private closeTask() { this.scene.stop(); this.scene.resume('GameScene'); }
}
