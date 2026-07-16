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
 * Returns the room centre in normalised [0..1] fractions, plus a stable
 * string key used to group players in the same room.
 * Uses the same AMBIENT_CENTRES zones as the HUD room label.
 */
function worldToRoomFraction(wx: number, wy: number): { fx: number; fy: number; roomKey: string } | null {
  let bestKey: string | null = null;
  let bestDist = Infinity;
  for (const [key, c] of Object.entries(AMBIENT_CENTRES)) {
    const d = Math.hypot(wx - c.x, wy - c.y);
    if (d < c.radius && d < bestDist) { bestKey = key; bestDist = d; }
  }
  if (!bestKey) {
    // Outside every named room — treat each pixel position as its own "room"
    // so the dot appears at the exact world-fraction position.
    const fx = wx / WORLD_WIDTH;
    const fy = wy / WORLD_HEIGHT;
    return { fx, fy, roomKey: `raw_${fx.toFixed(3)}_${fy.toFixed(3)}` };
  }
  const c = AMBIENT_CENTRES[bestKey];
  return { fx: c.x / WORLD_WIDTH, fy: c.y / WORLD_HEIGHT, roomKey: bestKey };
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

    // ── Collect all visible agents into a flat list ──────────────────────────
    // Original Among Us admin table behaviour:
    //   • Each dot snaps to the room centre (not the player's exact pixel).
    //   • Multiple players in the same room are shown spread in a small cluster
    //     so you can count them — they are NOT hidden behind each other.
    //   • Players inside vents are completely absent (they're underground).

    interface AgentEntry {
      fx: number; fy: number;
      roomKey: string;
      color: number;
      alive: boolean;
    }
    const agents: AgentEntry[] = [];

    if (this.isMultiplayer) {
      // ── Multiplayer: read live Colyseus room state ──
      const room = NetworkManager.room;
      if (!room) return;

      type PS = { x: number; y: number; color: string; isAlive: boolean; inVent: boolean };
      const playerMap = room.state.players as unknown as Map<string, PS>;

      playerMap.forEach((p) => {
        if (p.inVent) return; // hidden while underground — not shown on admin
        const rm = worldToRoomFraction(p.x, p.y);
        if (!rm) return;
        agents.push({
          fx: rm.fx, fy: rm.fy, roomKey: rm.roomKey,
          color: p.isAlive ? (COLOR_MAP[p.color.toLowerCase()] ?? 0xffffff) : 0x888888,
          alive: p.isAlive,
        });
      });
    } else {
      // ── Freeplay: read player + bots from GameScene ──
      const gs = this.gameScene;
      const playerColor = gs.player?.playerColor ?? 'Red';

      if (gs.player) {
        const rm = worldToRoomFraction(gs.player.x, gs.player.y);
        if (rm) agents.push({
          fx: rm.fx, fy: rm.fy, roomKey: rm.roomKey,
          color: gs.player.isAlive ? (COLOR_MAP[playerColor.toLowerCase()] ?? 0xffffff) : 0x888888,
          alive: gs.player.isAlive,
        });
      }

      // Bots — impostor dot looks identical (identity still hidden).
      // Bot impostor inside a vent (botVentState === 'in_vent') is hidden,
      // matching the multiplayer inVent rule.
      for (const bot of gs.bots) {
        // Hide the bot impostor while it is inside a vent
        if (bot.isImpostor && gs.botImpostorInVent) continue;
        const rm = worldToRoomFraction(bot.x, bot.y);
        if (!rm) continue;
        agents.push({
          fx: rm.fx, fy: rm.fy, roomKey: rm.roomKey,
          color: bot.isAlive ? (COLOR_MAP[bot.botColor.toLowerCase()] ?? 0xffffff) : 0x888888,
          alive: bot.isAlive,
        });
      }
    }

    // ── Group agents by room, then draw with spread offsets ──────────────────
    // For n agents in the same room, arrange them evenly around a small ring
    // (radius = DOT_R * 2) so every dot is individually visible.
    // With only 1 agent the ring radius is 0 — dot sits exactly on centre.
    const byRoom = new Map<string, AgentEntry[]>();
    for (const a of agents) {
      if (!byRoom.has(a.roomKey)) byRoom.set(a.roomKey, []);
      byRoom.get(a.roomKey)!.push(a);
    }

    for (const group of byRoom.values()) {
      const n = group.length;
      // Spread radius grows slightly with more players so dots never overlap.
      const spreadR = n > 1 ? DOT_R * 2.0 : 0;

      group.forEach((a, i) => {
        const { sx, sy } = toScreen(a.fx, a.fy);
        // Evenly spaced angles starting from the top (−π/2) for a tidy look.
        const angle = n > 1 ? (2 * Math.PI * i / n) - Math.PI / 2 : 0;
        const px = sx + Math.cos(angle) * spreadR;
        const py = sy + Math.sin(angle) * spreadR;

        g.fillStyle(a.color, 1);
        g.fillCircle(px, py, DOT_R);
        g.lineStyle(1.5, 0xffffff, 0.7);
        g.strokeCircle(px, py, DOT_R);

        if (!a.alive) {
          // Grey ✕ for dead
          g.lineStyle(2.5, 0x888888, 1);
          g.lineBetween(px - 5, py - 5, px + 5, py + 5);
          g.lineBetween(px + 5, py - 5, px - 5, py + 5);
        }
      });
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
