import Phaser from 'phaser';
import { WORLD_WIDTH, WORLD_HEIGHT, AMBIENT_CENTRES } from '../settings';
import { NetworkManager } from '../network/NetworkManager';
import { fitContain } from '../utils/imageFit';
import type { GameScene } from './GameScene';

interface AdminTableData {
  gameScene: GameScene;
  isMultiplayer: boolean;
}

/** Numeric color values for each player color name, matching GameScene's minimap dot palette. */
const COLOR_MAP: Record<string, number> = {
  red: 0xff2222, blue: 0x4488ff, green: 0x22cc44, yellow: 0xffee22,
  purple: 0xaa44ff, orange: 0xff8800, pink: 0xff88cc, brown: 0x996633,
  black: 0x888888, white: 0xeeeeee, cyan: 0x22eeff, lime: 0x88ff44,
};

/**
 * Returns the x,y centre of the room that a world position belongs to,
 * in normalised [0..1] fractions of the world dimensions.
 * Uses the same AMBIENT_CENTRES zones as the HUD room label.
 */
function worldToRoomFraction(wx: number, wy: number): { fx: number; fy: number } | null {
  let bestKey: string | null = null;
  let bestDist = Infinity;
  for (const [key, c] of Object.entries(AMBIENT_CENTRES)) {
    const d = Math.hypot(wx - c.x, wy - c.y);
    if (d < c.radius && d < bestDist) { bestKey = key; bestDist = d; }
  }
  if (!bestKey) {
    // Outside every named room — use exact player position mapped to world fraction
    return { fx: wx / WORLD_WIDTH, fy: wy / WORLD_HEIGHT };
  }
  const c = AMBIENT_CENTRES[bestKey];
  return { fx: c.x / WORLD_WIDTH, fy: c.y / WORLD_HEIGHT };
}

/**
 * Admin Table overlay — launched (not started) over GameScene so the game
 * continues running in the background. Shows a minimap with a coloured dot
 * per player at their current room position, updated in real time.
 *
 * Original Among Us behaviour modelled here:
 * - Each dot is the player's colour.
 * - Dead players appear as a grey ✕ at their last position.
 * - Players inside vents are not shown (they're underground).
 * - Dots snap to the room centre, not the player's exact pixel position,
 *   so multiple players in the same room stack (matching the original).
 */
export class AdminTableScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private isMultiplayer = false;
  private dotGraphics!: Phaser.GameObjects.Graphics;
  private mapImg!: Phaser.GameObjects.Image;
  private updateTimer?: Phaser.Time.TimerEvent;

  constructor() { super({ key: 'AdminTableScene' }); }

  init(data: AdminTableData) {
    this.gameScene = data.gameScene;
    this.isMultiplayer = data.isMultiplayer;
  }

  create() {
    const { width: W, height: H } = this.scale;

    // ── Dark backdrop ──
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.88)
      .setInteractive(); // catches stray taps so they don't fall through to game

    // ── Panel ──
    const panW = W * 0.92, panH = H * 0.82;
    this.add.rectangle(W / 2, H / 2, panW, panH, 0x0d0d1f, 0.97)
      .setStrokeStyle(2.5, 0x4488ff, 0.9);

    // ── Title ──
    this.add.text(W / 2, H / 2 - panH / 2 + 22, 'ADMIN TABLE', {
      fontSize: '24px', color: '#88ccff', fontFamily: 'Arial', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 0);

    // ── Subtitle ──
    this.add.text(W / 2, H / 2 - panH / 2 + 54, 'Player positions — real time', {
      fontSize: '14px', color: '#5577aa', fontFamily: 'Arial',
    }).setOrigin(0.5, 0);

    // ── Minimap image ──
    const mapAreaW = panW - 32;
    const mapAreaH = panH - 110;
    this.mapImg = fitContain(
      this.add.image(W / 2, H / 2 + 20, 'minimap'),
      mapAreaW, mapAreaH,
    );

    // ── Dot layer (redrawn every tick) ──
    this.dotGraphics = this.add.graphics();

    // ── Close button ──
    const closeBtn = this.add.text(W / 2, H / 2 + panH / 2 - 22, '✕  Close', {
      fontSize: '22px', color: '#fff', backgroundColor: '#222244',
      padding: { x: 24, y: 10 }, stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closeTable());

    // ── ESC to close ──
    this.input.keyboard!.once('keydown-ESC', () => this.closeTable());

    // ── Live updates every 250 ms ──
    this.drawDots();
    this.updateTimer = this.time.addEvent({
      delay: 250,
      callback: this.drawDots,
      callbackScope: this,
      loop: true,
    });
  }

  private drawDots() {
    const g = this.dotGraphics;
    g.clear();

    const mW = this.mapImg.displayWidth;
    const mH = this.mapImg.displayHeight;
    // Top-left corner of the map image on screen
    const mX0 = this.mapImg.x - mW / 2;
    const mY0 = this.mapImg.y - mH / 2;

    /** Maps a world fraction [0..1] to a screen pixel inside the map image. */
    const toScreen = (fx: number, fy: number) => ({
      sx: mX0 + fx * mW,
      sy: mY0 + fy * mH,
    });

    const DOT_R = 7;

    if (this.isMultiplayer) {
      // ── Multiplayer: read live Colyseus room state ──
      const room = NetworkManager.room;
      if (!room) return;

      type PS = { x: number; y: number; color: string; isAlive: boolean; inVent: boolean };
      const playerMap = room.state.players as unknown as Map<string, PS>;

      // Also include the local player (not in remotePlayers map)
      playerMap.forEach((p) => {
        if (p.inVent) return; // hidden while underground
        const rm = worldToRoomFraction(p.x, p.y);
        if (!rm) return;
        const { sx, sy } = toScreen(rm.fx, rm.fy);
        const col = p.isAlive
          ? (COLOR_MAP[p.color.toLowerCase()] ?? 0xffffff)
          : 0x888888;

        g.fillStyle(col, 1);
        g.fillCircle(sx, sy, DOT_R);
        g.lineStyle(1.5, 0xffffff, 0.7);
        g.strokeCircle(sx, sy, DOT_R);

        if (!p.isAlive) {
          // Grey ✕ for dead — draw two crossing lines
          g.lineStyle(2.5, 0x888888, 1);
          g.lineBetween(sx - 5, sy - 5, sx + 5, sy + 5);
          g.lineBetween(sx + 5, sy - 5, sx - 5, sy + 5);
        }
      });
    } else {
      // ── Freeplay: read player + bots from GameScene ──
      const gs = this.gameScene;

      const drawAgent = (wx: number, wy: number, color: string, alive: boolean) => {
        const rm = worldToRoomFraction(wx, wy);
        if (!rm) return;
        const { sx, sy } = toScreen(rm.fx, rm.fy);
        const col = alive ? (COLOR_MAP[color.toLowerCase()] ?? 0xffffff) : 0x888888;
        g.fillStyle(col, 1);
        g.fillCircle(sx, sy, DOT_R);
        g.lineStyle(1.5, 0xffffff, 0.7);
        g.strokeCircle(sx, sy, DOT_R);
        if (!alive) {
          g.lineStyle(2.5, 0x888888, 1);
          g.lineBetween(sx - 5, sy - 5, sx + 5, sy + 5);
          g.lineBetween(sx + 5, sy - 5, sx - 5, sy + 5);
        }
      };

      // Local player
      const playerColor = gs.player?.playerColor ?? 'Red';
      if (gs.player) drawAgent(gs.player.x, gs.player.y, playerColor, gs.player.isAlive);

      // Bots — show dead bots as grey ✕ markers, matching multiplayer behaviour.
      // The impostor's identity is still hidden (dots look the same as crew).
      for (const bot of gs.bots) {
        drawAgent(bot.x, bot.y, bot.botColor, bot.isAlive);
      }
    }
  }

  private closeTable() {
    this.updateTimer?.remove(false);
    this.scene.stop('AdminTableScene');
    this.scene.resume('GameScene');
  }

  shutdown() {
    this.updateTimer?.remove(false);
  }
}
