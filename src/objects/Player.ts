import Phaser from 'phaser';
import { PLAYER_SPEED, STEPPING_RATE } from '../settings';

type Direction = 'up' | 'down' | 'left' | 'right';

export class Player extends Phaser.Physics.Arcade.Sprite {
  public playerName: string;
  public playerColor: string;
  public isAlive = true;
  public isImpostor = false;
  public tasksCompleted = 0;
  public lastDirection: Direction = 'down';

  private lastStep = 0;
  private nameLabel: Phaser.GameObjects.Text;
  private colorKey: string;

  constructor(scene: Phaser.Scene, x: number, y: number, color: string, name: string) {
    const lc = color.toLowerCase();
    super(scene, x, y, `${lc}_down_1`);
    this.playerColor = color;
    this.colorKey = lc;
    this.playerName = name;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setDepth(10);

    // Smaller hit box
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(40, 50);
    body.setOffset(12, 30);

    // Name label
    this.nameLabel = scene.add.text(x, y - 45, name, {
      fontSize: '14px',
      color: '#fff',
      stroke: '#000',
      strokeThickness: 3,
      fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(11);
  }

  update(cursors: Phaser.Types.Input.Keyboard.CursorKeys, wasd: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  }, dt: number, joystickForce?: { x: number; y: number }) {
    if (!this.isAlive) {
      this.setVelocity(0, 0);
      this.nameLabel.setPosition(this.x, this.y - 55);
      return;
    }

    let vx = 0;
    let vy = 0;

    const up    = cursors.up?.isDown    || wasd.up?.isDown;
    const down  = cursors.down?.isDown  || wasd.down?.isDown;
    const left  = cursors.left?.isDown  || wasd.left?.isDown;
    const right = cursors.right?.isDown || wasd.right?.isDown;

    // Joystick support
    const jx = joystickForce?.x ?? 0;
    const jy = joystickForce?.y ?? 0;

    if (left  || jx < -0.2) { vx = -PLAYER_SPEED; this.lastDirection = 'left'; }
    if (right || jx >  0.2) { vx =  PLAYER_SPEED; this.lastDirection = 'right'; }
    if (up    || jy < -0.2) { vy = -PLAYER_SPEED; this.lastDirection = 'up'; }
    if (down  || jy >  0.2) { vy =  PLAYER_SPEED; this.lastDirection = 'down'; }

    // Apply joystick magnitude
    if (Math.abs(jx) > 0.2 || Math.abs(jy) > 0.2) {
      const len = Math.sqrt(jx * jx + jy * jy);
      vx = (jx / len) * PLAYER_SPEED;
      vy = (jy / len) * PLAYER_SPEED;
    }

    // Diagonal normalization
    if (vx !== 0 && vy !== 0) {
      vx *= 0.7071;
      vy *= 0.7071;
    }

    this.setVelocity(vx, vy);

    const moving = vx !== 0 || vy !== 0;
    const dir = this.lastDirection;
    const animKey = moving
      ? `${this.colorKey}_walk_${dir}`
      : `${this.colorKey}_idle_${dir}`;

    if (this.anims.currentAnim?.key !== animKey) {
      this.anims.play(animKey, true);
    }

    // Footsteps
    if (moving) {
      const now = Date.now();
      if (now - this.lastStep > STEPPING_RATE) {
        const idx = Phaser.Math.Between(1, 8);
        this.scene.sound.play(`sfx_step_${idx}`, { volume: 0.3 });
        this.lastStep = now;
      }
    }

    // Update name label
    this.nameLabel.setPosition(this.x, this.y - 55);
  }

  die() {
    if (!this.isAlive) return; // guard against double-die
    this.isAlive = false;
    this.anims.stop(); // stop walk animation so it doesn't keep overriding the dead texture
    const lc = this.colorKey;
    this.setTexture(`dead_${lc}`);
    this.setDepth(3);
    this.nameLabel.setVisible(false);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
  }

  destroy(fromScene?: boolean) {
    this.nameLabel?.destroy();
    super.destroy(fromScene);
  }
}
