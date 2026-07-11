import Phaser from 'phaser';
import type { GameScene } from '../GameScene';

interface TaskData { taskId: string; gameScene: GameScene; }

interface Asteroid {
  x: number; y: number; vx: number; vy: number; r: number; hp: number;
  img: Phaser.GameObjects.Image;
}
interface Bullet {
  x: number; y: number; vx: number; vy: number;
  img: Phaser.GameObjects.Image;
}

const ASTEROID_KEYS = ['task_asteroid_1', 'task_asteroid_2', 'task_asteroid_3', 'task_asteroid_4'];

export class ClearAsteroidsScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private taskId!: string;
  private asteroids: Asteroid[] = [];
  private bullets: Bullet[] = [];
  private killed = 0;
  private TARGET = 30;
  private killedText?: Phaser.GameObjects.Text;
  private shipX = 0;
  private shipY = 0;
  private shipImg?: Phaser.GameObjects.Image;
  private done = false;
  private fireTimer = 0;
  private FIRE_RATE = 300;

  constructor() { super({ key: 'ClearAsteroidsScene' }); }
  init(d: TaskData) { this.gameScene = d.gameScene; this.taskId = d.taskId; }

  create() {
    const { width: W, height: H } = this.scale;

    // Space background from original asset
    if (this.textures.exists('task_space_bg')) {
      this.add.image(W / 2, H / 2, 'task_space_bg').setDisplaySize(W, H).setDepth(0);
    } else {
      this.add.rectangle(W / 2, H / 2, W, H, 0x000011).setDepth(0);
      for (let i = 0; i < 100; i++) {
        this.add.circle(
          Math.random() * W, Math.random() * H,
          Math.random() * 1.5 + 0.5, 0xffffff, Math.random() * 0.8 + 0.2,
        ).setDepth(0);
      }
    }

    // HUD
    const closeBtn = this.add.text(W - 10, 10, '✕', {
      fontSize: '22px', color: '#fff', backgroundColor: '#333', padding: { x: 6, y: 2 },
    }).setOrigin(1, 0).setInteractive().setDepth(10);
    closeBtn.on('pointerdown', () => this.closeTask());

    this.add.text(W / 2, 12, 'Clear the Asteroids (30)', {
      fontSize: '18px', color: '#88aaff', fontFamily: 'Arial',
    }).setOrigin(0.5, 0).setDepth(10);

    this.killedText = this.add.text(12, 40, `Destroyed: 0 / ${this.TARGET}`, {
      fontSize: '16px', color: '#ffff00', fontFamily: 'Arial',
    }).setDepth(10);

    // Ship sprite — stored and moved in update loop
    this.shipX = W / 2;
    this.shipY = H - 80;
    if (this.textures.exists('task_asteroids_ship')) {
      this.shipImg = this.add.image(this.shipX, this.shipY, 'task_asteroids_ship')
        .setDisplaySize(60, 60).setDepth(6);
    }

    // Spawn asteroids periodically
    this.time.addEvent({ delay: 800, callback: this.spawnAsteroid, callbackScope: this, loop: true });

    // Input: tap to fire toward tap point
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.fireBullet(p.x, p.y);
    });

    // Keyboard fire — spacebar shoots straight up
    const space = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    space.on('down', () => this.fireBullet(this.shipX, 0));
  }

  private spawnAsteroid() {
    if (this.done) return;
    const { width: W } = this.scale;
    const r = Phaser.Math.Between(18, 38);
    const x = Phaser.Math.Between(r, W - r);
    const speed = Phaser.Math.FloatBetween(60, 140);
    const key = ASTEROID_KEYS[Phaser.Math.Between(0, ASTEROID_KEYS.length - 1)];
    const useKey = this.textures.exists(key) ? key : '__DEFAULT';
    const img = this.add.image(x, -r, useKey).setDisplaySize(r * 2, r * 2).setDepth(3);
    this.asteroids.push({
      x, y: -r,
      vx: Phaser.Math.FloatBetween(-30, 30),
      vy: speed,
      r, hp: 1, img,
    });
  }

  private fireBullet(tx: number, ty: number) {
    const dx = tx - this.shipX;
    const dy = ty - this.shipY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = 600;
    const bx = this.shipX, by = this.shipY - 20;
    const img = this.textures.exists('task_laser')
      ? this.add.image(bx, by, 'task_laser').setDisplaySize(8, 22).setDepth(4)
      : this.add.image(bx, by, '__DEFAULT').setDisplaySize(6, 16).setDepth(4);
    this.bullets.push({ x: bx, y: by, vx: dx / len * speed, vy: dy / len * speed, img });
  }

  update(_t: number, delta: number) {
    if (this.done) return;
    const dt = delta / 1000;
    const { width: W, height: H } = this.scale;

    // Move ship toward pointer X
    const ptr = this.input.activePointer;
    if (ptr.isDown) {
      this.shipX = Phaser.Math.Linear(this.shipX, ptr.x, 0.08);
    }
    // Keyboard left/right arrows also move ship
    const kLeft  = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT).isDown;
    const kRight = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT).isDown;
    if (kLeft)  this.shipX = Math.max(30, this.shipX - 4);
    if (kRight) this.shipX = Math.min(W - 30, this.shipX + 4);

    // Update ship image
    this.shipImg?.setPosition(this.shipX, this.shipY);

    // Auto-fire while holding
    this.fireTimer += delta;
    if (ptr.isDown && this.fireTimer > this.FIRE_RATE) {
      this.fireBullet(ptr.x, ptr.y);
      this.fireTimer = 0;
    }

    // Move bullets
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.img.setPosition(b.x, b.y);
    }
    // Remove off-screen bullets
    const offBullets = this.bullets.filter(b => b.y < -20 || b.y > H + 20 || b.x < -20 || b.x > W + 20);
    offBullets.forEach(b => b.img.destroy());
    const keepBullets = this.bullets.filter(b => b.y >= -20 && b.y <= H + 20 && b.x >= -20 && b.x <= W + 20);
    this.bullets.length = 0;
    this.bullets.push(...keepBullets);

    // Move asteroids
    for (const a of this.asteroids) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.img.setPosition(a.x, a.y);
    }

    // Bullet–asteroid collision
    for (const a of this.asteroids) {
      if (a.hp <= 0) continue;
      for (const b of this.bullets) {
        const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        if (d < a.r + 6) {
          a.hp--;
          b.y = -9999; // mark for removal
          if (a.hp <= 0) {
            a.img.destroy();
            a.y = H + 9999; // mark for removal
            this.killed++;
            this.killedText?.setText(`Destroyed: ${this.killed} / ${this.TARGET}`);
          }
        }
      }
    }

    // Clean up destroyed/off-screen
    const removedBullets = this.bullets.filter(b => b.y < -100);
    removedBullets.forEach(b => b.img.destroy());
    this.bullets = this.bullets.filter(b => b.y >= -100);

    this.asteroids = this.asteroids.filter(a => a.y < H + 60 && a.hp > 0);

    if (this.killed >= this.TARGET) {
      this.done = true;
      this.showSuccess();
    }
  }

  private showSuccess() {
    const { width: W, height: H } = this.scale;
    this.add.text(W / 2, H / 2, '✓ Asteroids Cleared!', {
      fontSize: '34px', color: '#00ff88', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(20);
    this.time.delayedCall(1500, () => {
      this.gameScene.completeTask(this.taskId);
      this.scene.stop();
    });
  }

  private closeTask() {
    // Destroy all in-flight images before closing
    this.asteroids.forEach(a => a.img?.destroy());
    this.bullets.forEach(b => b.img?.destroy());
    this.scene.resume('GameScene');
    this.scene.stop();
  }
}
