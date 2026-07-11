import Phaser from 'phaser';
import type { BotData } from '../types';
import { PLAYER_SPEED, STEPPING_RATE } from '../settings';

type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * NPC bot — moves randomly around the map and can be the impostor.
 */
export class Bot extends Phaser.Physics.Arcade.Sprite {
  public botId: number;
  public botColor: string;
  public botName: string;
  public isImpostor: boolean;
  public isAlive = true;
  public voted: number | null = null; // id of who they voted
  public gotVotes = 0;
  public tasksCompleted = 0;

  private colorKey: string;
  private direction: Direction = 'down';
  private changeTimer = 0;
  private changeInterval = 0;
  private nameLabel!: Phaser.GameObjects.Text;
  private lastStep = 0;
  private bobTimer = 0;
  // Random phase so bots don't all bob in sync
  private bobPhase = Math.random() * Math.PI * 2;

  constructor(scene: Phaser.Scene, data: BotData) {
    const lc = data.color.toLowerCase();
    super(scene, data.x, data.y, `${lc}_down_1`);
    this.botId = data.id;
    this.botColor = data.color;
    this.colorKey = lc;
    this.botName = data.name;
    this.isImpostor = data.isImpostor;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setDepth(9);

    (this.body as Phaser.Physics.Arcade.Body).setSize(40, 50);
    (this.body as Phaser.Physics.Arcade.Body).setOffset(12, 30);

    this.resetChangeInterval();

    this.nameLabel = scene.add.text(data.x, data.y - 45, data.name, {
      fontSize: '13px',
      color: this.isImpostor ? '#ff4444' : '#ffffff',
      stroke: '#000',
      strokeThickness: 3,
      fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(11);
  }

  private resetChangeInterval() {
    this.changeInterval = Phaser.Math.Between(1500, 3500);
  }

  update(dt: number) {
    if (!this.isAlive) {
      this.setVelocity(0, 0);
      this.nameLabel.setPosition(this.x, this.y - 55);
      return;
    }

    this.changeTimer += dt;
    if (this.changeTimer >= this.changeInterval) {
      this.changeTimer = 0;
      this.resetChangeInterval();
      const dirs: Direction[] = ['up', 'down', 'left', 'right', 'down', 'down'];
      this.direction = dirs[Phaser.Math.Between(0, dirs.length - 1)];
    }

    const speed = PLAYER_SPEED * 0.55;
    let vx = 0, vy = 0;
    switch (this.direction) {
      case 'up':    vy = -speed; break;
      case 'down':  vy =  speed; break;
      case 'left':  vx = -speed; break;
      case 'right': vx =  speed; break;
    }
    this.setVelocity(vx, vy);

    const animKey = `${this.colorKey}_walk_${this.direction}`;
    if (this.anims.currentAnim?.key !== animKey) {
      // Guard: only play if the animation was actually created (some color
      // variants only have 1 sprite frame and silently fail otherwise).
      if (this.scene.anims.exists(animKey)) {
        this.anims.play(animKey, true);
      }
    }

    // Y-scale bob — gives walking feedback for single-frame (BASIC_COLOR)
    // bots that have no multi-frame walk sheet.  Ignored by bots whose full
    // animation already conveys movement.
    const anim = this.anims.currentAnim;
    const isSingleFrame = !anim || anim.frames.length <= 1;
    if (isSingleFrame && (vx !== 0 || vy !== 0)) {
      this.bobTimer += dt;
      // Gentle 5 % vertical squeeze at ~4 Hz — looks like a stride
      const bob = Math.sin(this.bobTimer * 0.025 + this.bobPhase);
      this.setScale(1, 1 + bob * 0.05);
    } else {
      // Reset scale when the full animation takes over or bot is still
      this.setScale(1, 1);
    }

    // Footsteps
    const now = Date.now();
    if (now - this.lastStep > STEPPING_RATE * 1.2) {
      const idx = Phaser.Math.Between(1, 8);
      this.scene.sound.play(`sfx_step_${idx}`, { volume: 0.1 });
      this.lastStep = now;
    }

    this.nameLabel.setPosition(this.x, this.y - 55);
  }

  die() {
    this.isAlive = false;
    this.setTexture(`dead_${this.colorKey}`);
    this.setDepth(3);
    this.nameLabel.setVisible(false);
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    this.setVelocity(0, 0);
  }

  destroy(fromScene?: boolean) {
    this.nameLabel?.destroy();
    super.destroy(fromScene);
  }
}
