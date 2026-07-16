import Phaser from 'phaser';

/**
 * Visual stand-in for another connected player (multiplayer Phase 2: Position
 * Sync). Unlike Player/Bot, RemotePlayer takes no local input — its position
 * and frame are entirely server-driven. GameScene feeds it the latest values
 * from the Colyseus room state (`PlayerState.x/y/anim/isAlive`) and it
 * dead-reckons toward the last known position each frame so movement reads
 * smoothly despite the 10 Hz network tick.
 */
export class RemotePlayer extends Phaser.GameObjects.Sprite {
  public playerName: string;
  public playerColor: string;
  public isAlive = true;

  private targetX: number;
  private targetY: number;
  private colorKey: string;
  private nameLabel: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, color: string, name: string) {
    const lc = color.toLowerCase();
    super(scene, x, y, `${lc}_down_1`);
    this.playerColor = color;
    this.colorKey = lc;
    this.playerName = name;
    this.targetX = x;
    this.targetY = y;

    scene.add.existing(this);
    this.setDepth(10);

    this.nameLabel = scene.add.text(x, y - 45, name, {
      fontSize: '14px',
      color: '#fff',
      stroke: '#000',
      strokeThickness: 3,
      fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(11);
  }

  /** Latest authoritative position from PlayerState.x/y — lerped toward each frame. */
  setTarget(x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
  }

  /**
   * PlayerState.anim is already a concrete texture-frame key (e.g.
   * "blue_down_3"), matching the local Player's `this.texture.key` — not a
   * Phaser animation key — so we just swap the frame directly.
   */
  setFrameKey(key: string) {
    if (!key || this.texture.key === key) return;
    if (this.scene.textures.exists(key)) this.setTexture(key);
  }

  setAlive(alive: boolean) {
    if (this.isAlive === alive) return;
    this.isAlive = alive;
    this.setAlpha(alive ? 1 : 0.5);
    this.nameLabel.setVisible(alive);
    const deadKey = `dead_${this.colorKey}`;
    if (!alive && this.scene.textures.exists(deadKey)) this.setTexture(deadKey);
  }

  /**
   * Hides/shows the remote player while they are inside a vent.
   * In the original Among Us, nearby players CAN see someone enter/exit a
   * vent — that's a valid way to catch impostors.  We fade to invisible
   * (alpha 0) so the sprite is gone from view but kept alive in the scene.
   */
  setInVent(inVent: boolean) {
    this.setVisible(!inVent);
    this.nameLabel.setVisible(!inVent && this.isAlive);
  }

  /** Called every frame from GameScene.update() — same convention as Bot.update(delta). */
  update(_delta: number) {
    this.x = Phaser.Math.Linear(this.x, this.targetX, 0.25);
    this.y = Phaser.Math.Linear(this.y, this.targetY, 0.25);
    this.nameLabel.setPosition(this.x, this.y - 55);
  }

  destroy(fromScene?: boolean) {
    this.nameLabel?.destroy();
    super.destroy(fromScene);
  }
}
