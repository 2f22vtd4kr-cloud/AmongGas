import Phaser from 'phaser';
import { getStateCallbacks } from '@colyseus/sdk';
import { Player } from '../objects/Player';
import { Bot } from '../objects/Bot';
import { RemotePlayer } from '../objects/RemotePlayer';
import { NetworkManager } from '../network/NetworkManager';
import {
  BOT_POS, ALL_COLORS, PLAYER_SPAWN, WORLD_WIDTH, WORLD_HEIGHT,
  INTERACT_RADIUS, KILL_RADIUS, REPORT_RADIUS, NO_OF_MISSIONS,
  AMBIENT_CENTRES, TASK_TITLES, CAMERA_ZOOM, PLAYER_SPEED,
  CREW_VISION, IMP_VISION, CREW_VISION_SABOTAGED,
  SABOTAGE_ROOM_KEY, SABOTAGE_LABELS,
  SABOTAGE_COOLDOWN_MS, CRITICAL_SABOTAGE_MS, DOORS_LOCK_MS, SABOTAGE_SAFETY_MS,
} from '../settings';

type SabotageType = '' | 'lights' | 'comms' | 'reactor' | 'o2' | 'doors';
const FIXABLE_SABOTAGE_TYPES: Exclude<SabotageType, '' | 'doors'>[] = ['lights', 'comms', 'reactor', 'o2'];
import type { TaskDef, BotData, WallRect } from '../types';
import { parseTmx } from '../utils/TmxParser';
import { fitContain } from '../utils/imageFit';
import { computeVisibilityPolygon } from '../utils/visibility';

/** How often (ms) the local player's position is sent to the server — 10 Hz, matching the server's TICK_MS. */
const MOVE_SEND_INTERVAL_MS = 100;

const BOT_NAMES = ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta'];
// Prioritise colors that have full 18-frame walk animations (FULL_COLORS in
// GamePreloadScene: red, blue, green, orange, yellow).  Red is reserved for
// the player, so bots get Blue, Green, Orange, Yellow first — those four all
// animate properly.  Black/Brown/Pink/Purple are fallbacks for extra bots.
const BOT_COLOR_POOL = ['Blue','Green','Orange','Yellow','Black','Brown','Pink','Purple'];

// Emergency button art (Assets/Images/UI/emergency_icon.png) is 153x130px —
// displayed at 2x native size so it reads clearly as a large HUD button,
// matching the scale of the original game's corner buttons.
const EMERGENCY_BTN_W = 122;
const EMERGENCY_BTN_H = 104;

/** Texture key variants per world-object name: base / highlight (near) / connected (done). */
const TASK_SPRITE_VARIANTS: Record<string, { base: string; highlight?: string; connected?: string }> = {
  electricity_wires: { base: 'electricity_wires', highlight: 'electricity_wires_highlight', connected: 'electricity_wires_connected' },
  wifi:              { base: 'wifi',              highlight: 'wifi_highlight',              connected: 'wifi_connected' },
  nav:               { base: 'nav',               highlight: 'navigation_highlight' },
  // Extra glow variants — art already existed in Assets/Images/Items/ and
  // was preloaded, just not wired to a task object yet.
  reactor_btn:       { base: 'reactor_btn',       highlight: 'reactor_btn_highlight' },
  generator_circuit: { base: 'generator',         highlight: 'generator_highlight' },
  garbage_liver:     { base: 'garbage_liver',     highlight: 'garbage_liver_highlight' },
};

/** Short display names for the task list panel. */
const SHORT_TASK_NAMES: Record<string, string> = {
  fix_wiring:      'Fix Wiring',
  stabilize_nav:   'Stabilize Nav',
  reboot_wifi:     'Reboot WiFi',
  fuel_engine:     'Fuel Engine',
  start_reactor:   'Divert Power',
  align_engine:    'Align Engine',
  empty_garbage:   'Empty Garbage',
  clear_asteroids: 'Clear Asteroids',
};

// ── Vent system ──────────────────────────────────────────────────────────────
// Vent network adjacency: each TMX vent object id maps to the ids it connects
// to.  Networks are isolated groups — you can only travel within a group.
//   Network A (top triangle): Cafeteria ↔ Medbay ↔ Upper Engine
//   Network B (left chain):   Reactor × 2 ↔ Security ↔ Electrical
//   Network C (bottom chain): Lower Engine ↔ Storage ↔ Admin
//   Network D (right chain):  Weapons ↔ Navigation ↔ Cockpit × 2
const VENT_NETWORK: Record<number, number[]> = {
  // A
  66: [72, 73], 72: [66, 73], 73: [66, 72],
  // B
  76: [77], 77: [76, 75], 75: [77, 738], 738: [75],
  // C
  74: [71], 71: [74, 407], 407: [71],
  // D
  67: [68], 68: [67, 69], 69: [68, 70], 70: [69],
};

/** Human-readable label shown in the vent travel UI for each vent id. */
const VENT_ROOM_NAMES: Record<number, string> = {
  66: 'Cafeteria',   72: 'Medbay',        73: 'Upper Engine',
  76: 'Reactor',     77: 'Reactor (2)',   75: 'Security',   738: 'Electrical',
  74: 'Lower Engine',71: 'Storage',       407: 'Admin',
  67: 'Weapons',     68: 'Navigation',    69: 'Cockpit',     70: 'Cockpit (2)',
};

/** Display-friendly room names for the AMBIENT_CENTRES keys, used to prefix task-list rows ("Room: Task"), matching the original game's list format. */
const ROOM_DISPLAY_NAMES: Record<string, string> = {
  cafeteria:       'Cafeteria',
  medbay_room:     'Medbay',
  security_room:   'Security',
  reactor_room:    'Reactor',
  u_engine_room:   'Upper Engine',
  l_engine_room:   'Lower Engine',
  electrical_room: 'Electrical',
  storage_room:    'Storage',
  admin_room:      'Admin',
  comms3:          'Communications',
  oxygen_room:     'Oxygen',
  cockpit:         'Cockpit',
  weapons:         'Weapons',
};

/** Finds the nearest known room to a world position, for task-list "Room: Task" labels. */
function nearestRoomName(x: number, y: number): string | null {
  let best: string | null = null, bestDist = Infinity;
  for (const [key, c] of Object.entries(AMBIENT_CENTRES)) {
    const d = Phaser.Math.Distance.Between(x, y, c.x, c.y);
    if (d < bestDist) { bestDist = d; best = key; }
  }
  return best ? ROOM_DISPLAY_NAMES[best] ?? null : null;
}

export class GameScene extends Phaser.Scene {
  // --- sprites ---
  public player!: Player;
  public bots: Bot[] = [];

  // --- physics ---
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private playerWallCollider!: Phaser.Physics.Arcade.Collider;

  // --- game state ---
  public tasks: TaskDef[] = [];
  public tasksDone = 0;
  public meetings = 0;
  private gameOver = false;
  private impostorId = -1;
  private killCooldown = 0;
  private emergencyCooldown = 0;

  // --- ambient sounds (lazy-loaded on first zone entry) ---
  private ambientPlaying: Set<string> = new Set();
  private ambientPending: Set<string> = new Set();

  private static readonly AMBIENT_FILE_MAP: Record<string, string> = {
    cafeteria:       'Assets/Sounds/Ambience/AMB_Cafeteria.wav',
    medbay_room:     'Assets/Sounds/Ambience/AMB_MedbayRoom.wav',
    security_room:   'Assets/Sounds/Ambience/AMB_SecurityRoom.wav',
    reactor_room:    'Assets/Sounds/Ambience/AMB_ReactorRoom.wav',
    u_engine_room:   'Assets/Sounds/Ambience/AMB_EngineRoom.wav',
    l_engine_room:   'Assets/Sounds/Ambience/AMB_EngineRoom.wav',
    electrical_room: 'Assets/Sounds/Ambience/AMB_ElectricRoom.wav',
    storage_room:    'Assets/Sounds/Ambience/AMB_Storage.wav',
    admin_room:      'Assets/Sounds/Ambience/AMB_Admin.wav',
    comms3:          'Assets/Sounds/Ambience/AMB_Comms.wav',
    oxygen_room:     'Assets/Sounds/Ambience/AMB_Oxygen.wav',
    cockpit:         'Assets/Sounds/Ambience/AMB_Cockpit.wav',
    weapons:         'Assets/Sounds/Ambience/AMB_Weapons.wav',
  };

  // --- interaction markers ---
  private interactZones: { obj: TaskDef | null; name: string; x: number; y: number; sprite?: Phaser.GameObjects.Sprite }[] = [];
  private emergencyPos = { x: 3257, y: 655 };
  // Sprites placed in the world for task interactables, keyed by objectName.
  // Used to swap textures: base / highlight (player nearby) / connected (done).
  private taskSprites = new Map<string, Phaser.GameObjects.Image>();

  // --- room name label ---
  private roomNameText?: Phaser.GameObjects.Text;

  // --- task list HUD ---
  private taskListRows: Phaser.GameObjects.Text[] = [];
  private taskListBg?: Phaser.GameObjects.Rectangle;
  private taskListHdr?: Phaser.GameObjects.Text;
  private commsDownLabel?: Phaser.GameObjects.Text;
  private commsDownActive = false;

  // --- task compass (one directional arrow per incomplete task) ---
  private selectedTaskId: string | null = null;
  private taskArrows: {
    task: TaskDef;
    container: Phaser.GameObjects.Container;
    icon: Phaser.GameObjects.Triangle;
  }[] = [];

  // --- fog of war (native Canvas 2D, offscreen composite) ---
  // Using an offscreen canvas instead of Phaser GeometryMasks so we can draw
  // a proper radial gradient for the circular vision falloff. GeometryMasks
  // are binary (pixel present or not) and cannot produce smooth alpha gradients.
  private fogCanvas: HTMLCanvasElement | null = null;
  private fogCtx: CanvasRenderingContext2D | null = null;
  private wallRects: WallRect[] = [];   // TMX rects — used by shadow-casting

  // --- UI overlay ---
  // A second, unzoomed camera dedicated to HUD/UI. Camera zoom/rotation on
  // the main (world) camera still applies to scrollFactor(0) objects, so
  // without this the HUD would get dragged off-screen by CAMERA_ZOOM.
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;
  private hud!: Phaser.GameObjects.Container;
  private taskBarFill!: Phaser.GameObjects.Rectangle;
  private taskLabel!: Phaser.GameObjects.Text;
  private interactPrompt!: Phaser.GameObjects.Text;
  private killBtn!: Phaser.GameObjects.Container;
  private useBtn!: Phaser.GameObjects.Container;
  private reportBtn!: Phaser.GameObjects.Container;
  private emergencyBtn!: Phaser.GameObjects.Container;
  private miniMapBtn!: Phaser.GameObjects.Image;
  private miniMapOverlay?: Phaser.GameObjects.Container;
  private sabotageBtn?: Phaser.GameObjects.Container;
  private sabotageMenu?: Phaser.GameObjects.Container;
  private sabotageBanner?: Phaser.GameObjects.Container;
  private sabotageBannerText?: Phaser.GameObjects.Text;

  // --- sabotage ---
  // In multiplayer this state is server-authoritative and arrives via
  // SABOTAGE_START/SABOTAGE_END messages. In Freeplay there is no server, so
  // the bot impostor drives the exact same state locally (see
  // impostorSabotageAI/triggerBotSabotage below) — every other system that
  // reads these fields (fog, task list, door locks, banner) works unchanged
  // in both modes.
  private sabotageType: SabotageType = '';
  private sabotageEndsAt = 0;
  private sabotageCooldownUntil = 0;
  private sabotageLockedTasks: string[] = [];
  private sabotageTimerEvt?: Phaser.Time.TimerEvent;
  private nearSabotagePanel = false;

  // --- input ---
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
  private eKey!: Phaser.Input.Keyboard.Key;
  private rKey!: Phaser.Input.Keyboard.Key;
  private mKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;

  // --- virtual joystick ---
  private joystickBase?: Phaser.GameObjects.Arc;
  private joystickThumb?: Phaser.GameObjects.Arc;
  private joystickActive = false;
  private joystickStart = { x: 0, y: 0 };
  private joystickForce = { x: 0, y: 0 };

  // --- device safe-area insets (notch / home bar) ---
  // Read from Telegram WebApp SDK at boot; defaults to 0 outside Telegram.
  private safeTop = 0;
  private safeBot = 0;

  // --- nearby detection ---
  private nearbyTask: TaskDef | null = null;
  private nearbyCorpse: Bot | null = null;

  // --- vent system ---
  // ventData: positions of all vent objects parsed from the TMX map.
  private ventData: { id: number; x: number; y: number }[] = [];
  // Vent id of the vent the impostor is currently inside (-1 = not venting).
  private currentVentId = -1;
  // Vent id currently in proximity range (-1 = none nearby).
  private nearbyVentId = -1;
  // Whether the local player is currently inside a vent.
  public isInVent = false;
  // The vent-travel overlay shown while inside a vent.
  private ventOverlay?: Phaser.GameObjects.Container;
  // The HUD button that appears when an impostor stands near a vent.
  private ventBtn?: Phaser.GameObjects.Container;

  // --- bot impostor vent AI (Freeplay only) ---
  // 'idle'           : bot walks randomly and kills normally
  // 'moving_to_vent' : bot is pathing toward a vent entrance
  // 'in_vent'        : bot is hidden inside a vent
  private botVentState: 'idle' | 'moving_to_vent' | 'in_vent' = 'idle';

  /** Public accessor used by AdminTableScene to hide the bot impostor dot while it is inside a vent. */
  get botImpostorInVent(): boolean { return this.botVentState === 'in_vent'; }
  private botVentTargetId = -1;
  private botVentTargetX = 0;
  private botVentTargetY = 0;
  private botVentCooldownUntil = 0; // ms timestamp — bot won't vent before this

  // --- admin table ---
  // World-space centres of admin_btn1 and admin_btn2 from the TMX.
  private adminBtnPositions: { x: number; y: number }[] = [];
  private nearbyAdminBtn = false;

  // --- multiplayer (Phase 2: Position Sync) ---
  // True when this GameScene was launched from LobbyScene (registry
  // gameMode === 'online'). Bots/local win-checking are skipped in this
  // mode — remote players are rendered from server state instead.
  private isMultiplayer = false;
  private remotePlayers = new Map<string, RemotePlayer>();
  private moveSendAccum = 0;
  private lastSentX = -1;
  private lastSentY = -1;
  private lastSentAnim = '';

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    const playerName  = this.registry.get('playerName')  as string ?? 'Crewmate';
    const playerColor = this.registry.get('playerColor') as string ?? 'Red';
    this.isMultiplayer = this.registry.get('gameMode') === 'online';

    // Phaser reuses the same GameScene instance across replays (MenuScene →
    // GamePreloadScene → GameScene again), so per-round state that isn't
    // otherwise reassigned below must be explicitly reset here — otherwise a
    // second Freeplay round could inherit a stale gameOver flag or leftover
    // sabotage state (e.g. locked tasks) from the previous round.
    this.gameOver = false;
    this.sabotageTimerEvt?.remove(false);
    this.sabotageTimerEvt = undefined;
    this.sabotageType = '';
    this.sabotageEndsAt = 0;
    this.sabotageCooldownUntil = 0;
    this.sabotageLockedTasks = [];

    // ── Background world image ──
    const bg = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 'map_bg');
    bg.setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT);
    bg.setDepth(0);

    // ── Parse TMX for collision + objects ──
    const tmxText = this.cache.text.get('map_tmx') as string;
    const { walls, tables, objects: mapObjs } = parseTmx(tmxText);
    // Only true WALLS cast fog-of-war shadows — tables are transparent to vision
    // (matching original Among Us: cafeteria tables do not block line-of-sight).
    this.wallRects = walls;

    // ── Static walls + tables (both block movement, only walls cast shadows) ──
    this.walls = this.physics.add.staticGroup();
    for (const wr of [...walls, ...tables]) {
      const r = this.add.rectangle(wr.x + wr.width / 2, wr.y + wr.height / 2, wr.width, wr.height);
      r.setVisible(false);
      r.setDepth(0);
      this.physics.add.existing(r, true);
      this.walls.add(r);
    }

    // ── Build task definitions from TMX objects ──
    this.tasks = this.buildTasks(mapObjs);
    this.tasksDone = 0;

    // ── Item sprites ──
    this.placeItemSprites(mapObjs);

    // ── Vent positions (impostor-only interactive objects) ──
    // Stored as world-space centres so detectNearby can do simple distance checks.
    this.ventData = mapObjs
      .filter(o => o.name === 'vent' || o.name === 'ventilation')
      .map(o => ({ id: o.id, x: o.x + o.width / 2, y: o.y + o.height / 2 }));

    // ── Admin button positions (any player can open the admin table) ──
    this.adminBtnPositions = mapObjs
      .filter(o => o.name === 'admin_btn1' || o.name === 'admin_btn2')
      .map(o => ({ x: o.x + o.width / 2, y: o.y + o.height / 2 }));

    // Reset vent state for scene restarts
    this.isInVent = false;
    this.currentVentId = -1;
    this.nearbyVentId = -1;
    this.nearbyAdminBtn = false;
    this.ventOverlay = undefined;

    // Reset bot vent AI state
    this.botVentState = 'idle';
    this.botVentTargetId = -1;
    this.botVentCooldownUntil = 0;

    // ── Bots ── (Freeplay only — multiplayer uses real remote players instead)
    if (!this.isMultiplayer) {
      const impostor = Phaser.Math.Between(0, BOT_POS.length - 1);
      this.impostorId = impostor;
      const usedColors = new Set<string>([playerColor]);
      for (let i = 0; i < BOT_POS.length; i++) {
        let col = BOT_COLOR_POOL[i % BOT_COLOR_POOL.length];
        if (usedColors.has(col)) col = ALL_COLORS.find(c => !usedColors.has(c)) ?? col;
        usedColors.add(col);
        const data: BotData = {
          id: i, color: col,
          x: BOT_POS[i].x, y: BOT_POS[i].y,
          isImpostor: i === impostor,
          alive: true, name: BOT_NAMES[i] ?? `Bot${i}`,
        };
        const bot = new Bot(this, data);
        this.bots.push(bot);
        this.physics.add.collider(bot, this.walls);
      }
    }

    // ── Player ──
    this.player = new Player(this, PLAYER_SPAWN.x, PLAYER_SPAWN.y, playerColor, playerName);
    this.playerWallCollider = this.physics.add.collider(this.player, this.walls);

    // Prevent bots from standing on top of the player
    for (const bot of this.bots) {
      this.physics.add.collider(this.player, bot);
    }

    // ── Multiplayer: render other connected players from server state ──
    if (this.isMultiplayer) {
      this.player.isImpostor = this.registry.get('isImpostor') === true;
      this.initMultiplayer();
    }

    // ── World bounds ──
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    // Portrait viewport is narrower than the original landscape frame, so we
    // zoom in a bit to keep the player readable while still showing enough
    // of the surrounding room. Tuned for the 750x1334 base design size.
    this.cameras.main.setZoom(CAMERA_ZOOM);

    // ── Input ──
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.eKey   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.rKey   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.mKey   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    Phaser.Input.Keyboard.JustDown(this.eKey);
    Phaser.Input.Keyboard.JustDown(this.rKey);

    // ── Safe-area insets (phone notch / home bar) ──
    this.readSafeInsets();

    // ── Virtual joystick ──
    this.setupJoystick();

    // ── HUD ──
    this.buildHUD();

    // ── UI camera: renders the HUD without the main camera's zoom/scroll ──
    this.setupUiCamera();

    // ── Fog of war ──
    this.setupFog();

    // ── Round start sound ──
    this.time.delayedCall(800, () => {
      this.sound.play('sfx_roundstart', { volume: 0.8 });
    });

    // ── Impostor AI timers (Freeplay only — multiplayer kills/sabotage are server-driven) ──
    if (!this.isMultiplayer) {
      this.time.addEvent({
        delay: 8000,
        callback: this.impostorAct,
        callbackScope: this,
        loop: true,
      });
      // Separate, slower-ticking timer for sabotage so it doesn't compete
      // 1:1 with the kill-attempt cadence above — the bot impostor rolls a
      // chance to sabotage each tick once off cooldown, giving an average
      // gap similar to the cooldown itself rather than firing the instant
      // it's available.
      this.time.addEvent({
        delay: 10_000,
        callback: this.impostorSabotageAI,
        callbackScope: this,
        loop: true,
      });
    }

    // ── Emergency cooldown ──
    this.emergencyCooldown = 30000;
    this.killCooldown = 15000;

    // ── Escape for pause/menu ──
    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.miniMapOverlay) { this.closeMiniMap(); return; }
    });
  }

  // ────────────────── Safe-area ──────────────────

  /**
   * Reads Telegram WebApp safe-area insets (notch height, home-bar height).
   * Falls back to zero outside Telegram or on older SDK versions.
   * Must be called before buildHUD() and setupJoystick().
   */
  private readSafeInsets() {
    type TgWA = { safeAreaInset?: { top: number; bottom: number; left: number; right: number } };
    const tg = (window as unknown as { Telegram?: { WebApp?: TgWA } }).Telegram?.WebApp;
    const inset = tg?.safeAreaInset;
    this.safeTop = Math.round(inset?.top    ?? 0);
    this.safeBot = Math.round(inset?.bottom ?? 0);
  }

  /**
   * Called by main.ts whenever the Telegram Mini App viewport changes
   * (e.g. keyboard shown, swipe gesture, safe-area inset update).
   * Re-reads insets and moves every safe-area-sensitive HUD element.
   */
  public onViewportChanged(): void {
    this.readSafeInsets();
    const { width: W, height: H } = this.scale;
    const st = this.safeTop, sb = this.safeBot;
    const actionX = 68;

    // Joystick home (only move when finger is not on it)
    if (!this.joystickActive) {
      const jx = W - 130, jy = H - 170 - sb;
      this.joystickBase?.setPosition(jx, jy);
      this.joystickThumb?.setPosition(jx, jy);
    }

    // Action buttons
    this.killBtn?.setPosition(actionX, H - 390 - sb);
    this.reportBtn?.setPosition(actionX, H - 260 - sb);
    this.useBtn?.setPosition(actionX, H - 130 - sb);
    this.sabotageBtn?.setPosition(actionX, H - 520 - sb);
    this.interactPrompt?.setPosition(W / 2, H - 210 - sb);

    // Corner buttons
    this.emergencyBtn?.setPosition(EMERGENCY_BTN_W / 2 + 12, EMERGENCY_BTN_H / 2 + 56 + st);
    this.miniMapBtn?.setPosition(W - 52, 52 + st);

    // Vent button (same slot as REPORT)
    this.ventBtn?.setPosition(actionX, H - 260 - sb);
  }

  // ────────────────── Tasks ──────────────────

  private buildTasks(objs: { name: string; x: number; y: number; width: number; height: number; id: number }[]): TaskDef[] {
    const mapping: { objName: string; type: string; title: string }[] = [
      { objName: 'electricity_wires',       type: 'fix_wiring',      title: TASK_TITLES['fix_wiring'] },
      { objName: 'nav',                     type: 'stabilize_nav',   title: TASK_TITLES['stabilize_nav'] },
      { objName: 'wifi',                    type: 'reboot_wifi',     title: TASK_TITLES['reboot_wifi'] },
      { objName: 'engines',                 type: 'fuel_engine',     title: TASK_TITLES['fuel_engine'] },
      { objName: 'reactor_btn',             type: 'start_reactor',   title: TASK_TITLES['start_reactor'] },
      { objName: 'generator_circuit',       type: 'align_engine',    title: TASK_TITLES['align_engine'] },
      { objName: 'garbage_liver',           type: 'empty_garbage',   title: TASK_TITLES['empty_garbage'] },
      { objName: 'laptop',                  type: 'clear_asteroids', title: TASK_TITLES['clear_asteroids'] },
    ];

    const tasks: TaskDef[] = [];
    let id = 0;

    for (const m of mapping) {
      const found = objs.find(o => o.name === m.objName);
      if (found) {
        tasks.push({
          id: `task_${id++}`,
          type: m.type as TaskDef['type'],
          title: m.title,
          completed: false,
          x: found.x + found.width / 2,
          y: found.y + found.height / 2,
          objectName: m.objName,
        });
      }
    }

    // Pad to NO_OF_MISSIONS if needed
    while (tasks.length < NO_OF_MISSIONS && tasks.length > 0) {
      const clone = { ...tasks[tasks.length % tasks.length] };
      clone.id = `task_${id++}`;
      clone.completed = false;
      tasks.push(clone);
    }

    return tasks.slice(0, NO_OF_MISSIONS);
  }

  private placeItemSprites(objs: { name: string; x: number; y: number; width: number; height: number; id: number }[]) {
    const imgMap: Record<string, string> = {
      emergency_btn:         'emergency_button',
      wifi:                  'wifi',
      reactor_btn:           'reactor_btn',
      admin_btn1:            'admin_control1',
      admin_btn2:            'admin_control2',
      garbage_liver:         'garbage_liver',
      electricity_wires:     'electricity_wires',
      nav:                   'nav',
      generator_circuit:     'generator',
      fuel_engine_item:      'fuel_engine',
      ventilation:           'ventilation',
      vent:                  'ventilation',
      laptop:                'cafeteria_comp',
    };

    for (const obj of objs) {
      const key = imgMap[obj.name];
      if (key && this.textures.exists(key)) {
        const sp = this.add.image(obj.x + obj.width / 2, obj.y + obj.height / 2, key);
        sp.setDepth(5);
        // fitContain preserves the texture's native aspect ratio instead of
        // squishing it to match the TMX bounding box (which caused laptop art
        // to appear stretched when width/height proportions differed).
        fitContain(sp, obj.width || 64, obj.height || 48);

        // Track world sprites for task interactables so we can swap to
        // highlight (nearby) / connected (completed) variants later.
        if (this.tasks.some(t => t.objectName === obj.name) && !this.taskSprites.has(obj.name)) {
          this.taskSprites.set(obj.name, sp);
        }
      }
    }
  }

  /** Swap each task's world sprite to its highlight / connected / base variant. */
  private updateTaskSprites() {
    for (const [objName, sprite] of this.taskSprites) {
      const variants = TASK_SPRITE_VARIANTS[objName];
      if (!variants) continue;
      const tasksForObj = this.tasks.filter(t => t.objectName === objName);
      const allDone   = tasksForObj.length > 0 && tasksForObj.every(t => t.completed);
      const isNearby  = this.nearbyTask?.objectName === objName;
      const nextKey   = allDone && variants.connected  ? variants.connected
                      : isNearby && variants.highlight ? variants.highlight
                      : variants.base;
      if (sprite.texture.key !== nextKey && this.textures.exists(nextKey)) {
        sprite.setTexture(nextKey);
      }
    }
  }

  // --- doors sabotage: visual lock markers on affected task sprites ---
  private doorLockMarkers = new Map<string, Phaser.GameObjects.Text>();

  /**
   * No dedicated "locked" sprite art exists (Strict Asset Rule — see
   * HANDOFF.md), so locked tasks get a drawn 🔒 badge over their existing
   * world sprite plus a red tint, mirroring how USE/REPORT already fall back
   * to drawn glyphs where no art exists.
   */
  private updateDoorLocks() {
    const lockedObjNames = new Set(
      this.sabotageLockedTasks
        .map(id => this.tasks.find(t => t.id === id)?.objectName)
        .filter((n): n is string => !!n),
    );

    for (const [objName, sprite] of this.taskSprites) {
      const locked = lockedObjNames.has(objName);
      if (locked && !this.doorLockMarkers.has(objName)) {
        sprite.setTint(0xff5555);
        const marker = this.add.text(sprite.x, sprite.y - 40, '🔒', { fontSize: '28px' })
          .setOrigin(0.5).setDepth(6);
        this.uiCamera.ignore(marker);
        this.doorLockMarkers.set(objName, marker);
      } else if (!locked && this.doorLockMarkers.has(objName)) {
        sprite.clearTint();
        this.doorLockMarkers.get(objName)?.destroy();
        this.doorLockMarkers.delete(objName);
      }
    }
  }

  // ────────────────── HUD ──────────────────

  private buildHUD() {
    const { width: W, height: H } = this.scale;
    this.hud = this.add.container(0, 0).setScrollFactor(0).setDepth(100);

    // Task progress bar — enlarged and divided into NO_OF_MISSIONS tick
    // segments, matching the original game's bold "TOTAL TASKS COMPLETED"
    // bar instead of a thin plain fill strip.
    const barY = 10 + this.safeTop;
    const barW = 340, barH = 26;
    const barX0 = W / 2 - barW / 2;
    const barBg = this.add.rectangle(W / 2, barY, barW, barH, 0x1a1a1a, 0.85).setOrigin(0.5, 0);
    const barBorder = this.add.rectangle(W / 2, barY, barW + 3, barH + 3, 0x000000, 0)
      .setOrigin(0.5, 0).setStrokeStyle(2, 0xbbbbbb, 0.9);
    this.taskBarFill = this.add.rectangle(barX0, barY + 1.5, 0, barH - 3, 0x2fd66a).setOrigin(0, 0);
    // Tick-mark dividers, one per mission, so the bar reads as a segmented
    // progress meter rather than a smooth gradient fill.
    const ticks = this.add.graphics().lineStyle(1.5, 0x000000, 0.55);
    for (let i = 1; i < NO_OF_MISSIONS; i++) {
      const tx = barX0 + (barW / NO_OF_MISSIONS) * i;
      ticks.lineBetween(tx, barY + 2, tx, barY + barH - 2);
    }
    this.taskLabel = this.add.text(W / 2, barY + barH + 4, `Tasks: 0 / ${NO_OF_MISSIONS}`, {
      fontSize: '15px', color: '#fff', stroke: '#000', strokeThickness: 3, fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.hud.add([barBg, this.taskBarFill, ticks, barBorder, this.taskLabel]);

    // Interact prompt — sits just above the action button stack so it never
    // overlaps a thumb resting on the buttons below it.
    this.interactPrompt = this.add.text(W / 2, H - 210 - this.safeBot, '', {
      fontSize: '18px', color: '#ffff00', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101).setVisible(false);

    // Emergency meeting button — top-left, shifted down by safe-area inset.
    // Uses the real "EMERGENCY" button art (Assets/Images/UI/emergency_icon.png)
    // instead of a plain text label, matching the original game's HUD button.
    this.emergencyBtn = this.buildImageButton(
      EMERGENCY_BTN_W / 2 + 12, EMERGENCY_BTN_H / 2 + 56 + this.safeTop,
      'ui_emergency_icon', EMERGENCY_BTN_W, EMERGENCY_BTN_H,
      () => this.triggerEmergency(false),
    );

    // Mini-map button (top-right) — shifted down by safe-area inset.
    // Sized up slightly so it reads clearly as a tappable icon on mobile.
    this.miniMapBtn = this.add.image(W - 52, 52 + this.safeTop, 'ui_map_button')
      .setScrollFactor(0).setDepth(101).setDisplaySize(64, 64)
      .setInteractive({ useHandCursor: true });
    this.miniMapBtn.on('pointerdown', () => {
      this.sound.play('sfx_map_click', { volume: 0.5 });
      this.toggleMiniMap();
    });

    // ── Contextual action buttons — bottom-left, stacked vertically
    // (joystick moved to right, so actions live on the left).
    // Shifted up by safe-area bottom inset so they clear the home bar.
    // Sized and captioned to match the original game's large circular
    // touch buttons (icon + caption). No dedicated "USE"/"REPORT" icon art
    // exists in Assets/, so those two keep a drawn glyph; KILL uses the
    // real Assets/Images/UI/kill_icon.png art like the original HUD.
    const actionX = 68;
    const sb = this.safeBot;
    this.killBtn = this.buildImageButton(actionX, H - 390 - sb, 'ui_kill_icon', 76, 76, () => this.attemptKill());
    this.killBtn.setVisible(false);

    this.reportBtn = this.buildActionButton(actionX, H - 260 - sb, 58, 0xdddddd, '🚩', 'REPORT', () => this.tryReport());
    this.reportBtn.setVisible(false);

    this.useBtn = this.buildActionButton(actionX, H - 130 - sb, 64, 0xdddddd, '✋', 'USE', () => this.tryInteract());
    this.useBtn.setVisible(false);

    // Sabotage button — impostor-only, always available (not proximity
    // gated like KILL/USE), sits above the kill button in the stack. Uses
    // the real sabotage_icon.png art; dims via sabotage_icon_dim.png while
    // on cooldown or while a sabotage is already active.
    if (this.isMultiplayer && this.player.isImpostor) {
      this.sabotageBtn = this.buildImageButton(actionX, H - 520 - sb, 'ui_sabotage_icon', 72, 72, () => this.toggleSabotageMenu());
      this.buildSabotageMenu(actionX, H - 520 - sb);
    }

    // Vent button — impostor-only, shows when near a vent.
    // Sits in the REPORT slot (H-260) and replaces REPORT while visible
    // (impostors are rarely near both a dead body and a vent entrance).
    if (this.player.isImpostor) {
      this.ventBtn = this.buildActionButton(
        actionX, H - 260 - sb, 58, 0xaa44ff, '🌀', 'VENT', () => this.enterVent(),
      );
      this.ventBtn.setVisible(false);
    }

    // Sabotage banner — top-of-screen alert shown to everyone while a
    // sabotage is active (countdown for reactor/o2, status text for the rest).
    this.buildSabotageBanner();

    // Room name label — bottom-centre, matches the original Among Us HUD:
    // shows the name of the room the player is currently inside (e.g. "O2"),
    // and hides automatically when they're in a corridor between rooms.
    this.roomNameText = this.add.text(W / 2, H - 48 - this.safeBot, '', {
      fontSize: '30px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 5,
      fontFamily: 'Arial',
      fontStyle: 'bold',
    }).setOrigin(0.5, 1).setDepth(102);
    this.hud.add(this.roomNameText);

    // Task list panel — left side, below emergency button
    this.buildTaskListInHud();

    // Directional compass — points toward the tracked task
    this.buildTaskCompass();

    // Initial highlight of the tracked row now that both exist
    this.updateTaskList();
  }

  /**
   * Builds one directional-compass arrow per task — bare yellow chevrons
   * (no ring, no label — matching the real game's look), sized up so they
   * read clearly on a phone screen. Each arrow tracks its own task: it
   * rides the border of the screen while the task is far off-screen, or
   * hovers right next to the task once it's actually in view (see
   * updateTaskArrows()), and disappears for good once that task is
   * completed. Tapping a row in the task list still highlights it in the
   * list (via selectedTaskId/getTrackedTask) but no longer hides/shows
   * arrows — every incomplete task gets its own arrow simultaneously.
   */
  private buildTaskCompass() {
    for (const task of this.tasks) {
      const container = this.add.container(0, 0).setDepth(101);
      const icon = this.add.triangle(0, 0, 0, -38, 28, 26, -28, 26, 0xffe600)
        .setStrokeStyle(4, 0x3a2c00, 1);
      container.add(icon);
      this.hud.add(container);
      this.taskArrows.push({ task, container, icon });
    }
  }

  /** Currently tracked task: manually selected one if still incomplete, else the first incomplete task in list order. Used only to highlight the task-list row now — arrows track every task independently. */
  private getTrackedTask(): TaskDef | null {
    const selected = this.tasks.find(t => t.id === this.selectedTaskId);
    if (selected && !selected.completed) return selected;
    return this.tasks.find(t => !t.completed) ?? null;
  }

  /**
   * Updates every task's compass arrow, every frame. Two modes, chosen per
   * arrow based on whether its task is currently within the camera's view:
   *  - Off-screen: the arrow rides the border of the screen like a 360°
   *    radar, cast from screen centre toward the task (same technique as
   *    before).
   *  - On-screen: the arrow hovers just short of the task's actual screen
   *    position, pointing straight at it — like the reference screenshots,
   *    where the arrow sits right beside the objective instead of staying
   *    pinned to a corner. The task's own highlight texture still takes
   *    over as the "you're here" signal (see updateTaskSprites); the arrow
   *    itself only disappears once the task is completed.
   */
  private updateTaskArrows() {
    const { width: W, height: H } = this.scale;
    const margin = 30;
    const cam = this.cameras.main;
    const view = cam.worldView;

    for (const entry of this.taskArrows) {
      const { task, container, icon } = entry;
      if (task.completed) { container.setVisible(false); continue; }
      container.setVisible(true);

      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, task.x, task.y);
      icon.rotation = angle + Math.PI / 2;
      const dx = Math.cos(angle), dy = Math.sin(angle);

      // Where the task actually sits on screen right now (camera has no
      // rotation, so world angle === screen angle exactly; only the origin
      // differs between the two modes below).
      const screenX = (task.x - view.x) * cam.zoom;
      const screenY = (task.y - view.y) * cam.zoom;
      const onScreen = screenX > margin && screenX < W - margin && screenY > margin && screenY < H - margin;

      if (onScreen) {
        const hover = 50;
        container.setPosition(screenX - dx * hover, screenY - dy * hover);
      } else {
        // Off-screen: cast a ray from screen centre and clip it to a
        // rectangle inset from the true screen border, so the arrow rides
        // the border like a compass without ever clipping off it.
        const halfW = W / 2 - margin, halfH = H / 2 - margin;
        const tx = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
        const ty = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
        const t = Math.min(tx, ty);
        container.setPosition(W / 2 + dx * t, H / 2 + dy * t);
      }
    }
  }

  /**
   * Builds the persistent task-list panel on the left side of the HUD.
   * Shows each task with a ☐ / ✅ indicator, updated by updateTaskList().
   * Items are added to this.hud so the UI camera picks them up automatically.
   */
  private buildTaskListInHud() {
    const listX  = 10;
    // Below the EMERGENCY button, which now uses full-size button art
    // (EMERGENCY_BTN_H tall) instead of a slim text label.
    const listY  = EMERGENCY_BTN_H + 66 + this.safeTop;
    const listW  = 250;
    const rowH   = 26;
    const numRows = this.tasks.length;
    const totalH  = 26 + numRows * rowH + 6;

    const bg = this.add.rectangle(listX + listW / 2, listY + totalH / 2, listW, totalH, 0x000000, 0.62)
      .setStrokeStyle(1, 0x334466);
    const hdr = this.add.text(listX + 8, listY + 5, 'TASKS', {
      fontSize: '15px', color: '#99bbdd', fontStyle: 'bold', fontFamily: 'Arial',
      stroke: '#000', strokeThickness: 2,
    });
    this.taskListBg = bg;
    this.taskListHdr = hdr;
    this.hud.add([bg, hdr]);

    // 'comms' sabotage hides the task list + compass entirely (matches the
    // original: comms knocks out the task tracker, not just chat/admin).
    this.commsDownLabel = this.add.text(listX + 8, listY + 5, 'COMMS DOWN', {
      fontSize: '15px', color: '#ff5555', fontStyle: 'bold', fontFamily: 'Arial',
      stroke: '#000', strokeThickness: 2,
    }).setVisible(false);
    this.hud.add(this.commsDownLabel);

    this.taskListRows = [];
    for (let i = 0; i < this.tasks.length; i++) {
      const task = this.tasks[i];
      const rowY = listY + 26 + i * rowH;
      const t = this.add.text(listX + 8, rowY, this.taskRowLabel(task), {
        fontSize: '13px', color: '#aaaaaa', fontFamily: 'Arial',
        stroke: '#000', strokeThickness: 2,
      });
      this.taskListRows.push(t);
      this.hud.add(t);

      // Invisible hit target (bigger than the text) so tapping a row on
      // mobile picks it as the compass's tracked task.
      const hit = this.add.rectangle(listX + listW / 2, rowY + rowH / 2 - 2, listW, rowH, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        if (task.completed) return;
        this.selectedTaskId = task.id;
        this.updateTaskList();
      });
      this.hud.add(hit);
    }
  }

  /**
   * Registers a second camera dedicated to HUD/UI rendering. Phaser applies
   * the main camera's zoom and scroll to *every* object on it, including
   * ones with setScrollFactor(0) — so once CAMERA_ZOOM > 1 the HUD would be
   * dragged off-screen if it stayed on the main camera. Instead the main
   * (zoomed, world-following) camera ignores all HUD objects, and this
   * unzoomed UI camera ignores everything else, so each camera renders only
   * its own layer.
   */
  private setupUiCamera() {
    const { width: W, height: H } = this.scale;
    this.uiCamera = this.cameras.add(0, 0, W, H);

    const hudObjects: Phaser.GameObjects.GameObject[] = [
      this.hud, this.emergencyBtn, this.miniMapBtn, this.interactPrompt,
      this.killBtn, this.reportBtn, this.useBtn,
    ];
    if (this.joystickBase) hudObjects.push(this.joystickBase);
    if (this.joystickThumb) hudObjects.push(this.joystickThumb);
    if (this.sabotageBtn) hudObjects.push(this.sabotageBtn);
    if (this.sabotageMenu) hudObjects.push(this.sabotageMenu);
    if (this.sabotageBanner) hudObjects.push(this.sabotageBanner);

    this.cameras.main.ignore(hudObjects);
    const hudSet = new Set(hudObjects);
    this.uiCamera.ignore(this.children.list.filter((o) => !hudSet.has(o)));
  }

  // ────────────────── Fog of war ──────────────────

  /**
   * Sets up the offscreen canvas used for fog-of-war compositing.
   *
   * Approach: a native Canvas 2D offscreen canvas (fogCanvas) is filled with
   * darkness each frame, then a radial gradient + visibility polygon punch
   * the lit area through it, and the result is blitted onto the live game
   * canvas (see renderFogCanvas).  This avoids Phaser GeometryMask which
   * cannot produce soft gradient edges and was removed from 3.90 typings.
   *
   * Visual result:
   *   0 … CREW_VISION px   → fully lit (gradient fully erased)
   *   CREW_VISION … ×1.2   → soft edge (gradient fades to transparent)
   *   beyond ×1.2           → ~96 % dark (near-black fog)
   *   wall shadows          → hard edges via even-odd visibility polygon
   *
   * Impostors get IMP_VISION instead of CREW_VISION.
   * Ghosts see the full map (fog skipped entirely).
   */
  private setupFog() {
    const { width: W, height: H } = this.scale;
    // Offscreen canvas — drawn via renderFogCanvas() each frame
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width  = W;
    this.fogCanvas.height = H;
    this.fogCtx = this.fogCanvas.getContext('2d')!;
    // Hook into the HUD camera's pre-render so the fog is composited AFTER
    // the world camera draws the map/players but BEFORE the HUD is drawn.
    this.uiCamera.on('prerender', this.renderFogCanvas, this);
  }

  /**
   * Composites the fog of war onto the game canvas using native Canvas 2D.
   * Hooked into uiCamera's 'prerender' event so the world camera has already
   * drawn the map/players and the HUD camera will draw on top afterwards.
   *
   * Visual design (matches the original Among Us):
   *
   *  Step 1 — Fill offscreen canvas with near-opaque darkness.
   *
   *  Step 2 — Erase a radial gradient disc of light centred on the player
   *            (destination-out composite). The gradient is opaque at the
   *            centre (erases all fog → fully bright), stays fully opaque to
   *            60 % of the vision radius, then fades to transparent at
   *            1.2× the vision radius. This produces the smooth circular
   *            falloff seen in the original game — no hard ring edge.
   *
   *  Step 3 — Re-darken areas outside the visibility polygon using an
   *            even-odd path fill (full-screen rect + polygon in the same path).
   *            Even-odd fills the region INSIDE the rect but OUTSIDE the polygon,
   *            i.e. exactly the areas that walls block from sight — restoring
   *            hard, sharp shadow edges while leaving the gradient intact
   *            everywhere else.
   *
   *            IMPORTANT: the polygon radius is visionR × 1.2 — matching the
   *            gradient's outer edge.  If we used visionR the even-odd fill
   *            would re-darken the gradient's soft-falloff zone in open areas,
   *            producing a hard circle edge instead of the desired smooth one.
   *            Wall shadows inside visionR still cast hard edges because their
   *            polygon vertices sit at the actual wall hit-distance, not at
   *            the 1.2× limit.
   *
   *  Step 4 — drawImage the offscreen fog canvas onto the live game canvas.
   *
   * Ghosts skip the whole thing; Phaser draws the unoccluded map for them.
   */
  private renderFogCanvas() {
    if (!this.fogCtx || !this.fogCanvas || !this.player) return;
    if (!this.player.isAlive) return;

    const cam  = this.cameras.main;
    const W    = this.fogCanvas.width;
    const H    = this.fogCanvas.height;
    const sx   = (this.player.x - cam.worldView.x) * cam.zoom;
    const sy   = (this.player.y - cam.worldView.y) * cam.zoom;

    const crewVision = (this.sabotageType === 'lights') ? CREW_VISION_SABOTAGED : CREW_VISION;
    const visionR    = (this.player.isImpostor ? IMP_VISION : crewVision) * cam.zoom;

    const ctx = this.fogCtx;
    ctx.clearRect(0, 0, W, H);

    // ── Step 1: full-screen darkness ─────────────────────────────────────────
    // Original AU uses a dark navy/blue-gray overlay (~82 % opacity) so map
    // geometry (floor tiles, wall outlines) barely shows through — matching
    // the cool "unlit" look of the original game. Wall-shadow areas get a
    // second near-opaque pass in Step 3 so they stay very dark.
    ctx.fillStyle = 'rgba(0,5,12,0.44)';
    ctx.fillRect(0, 0, W, H);

    // ── Step 2: erase a soft disc of light at the player ─────────────────────
    // Radial gradient (destination-out): alpha=1 erases the dark fog completely,
    // alpha=0 leaves it untouched. The colour value (black) doesn't matter for
    // destination-out — only the alpha channel is used to punch out the fog.
    // The solid core extends to 85 % of the radius so the edge is crisp (like
    // the original), with only a short 15 % soft falloff zone at the boundary.
    ctx.globalCompositeOperation = 'destination-out';
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, visionR * 1.2);
    grad.addColorStop(0,    'rgba(0,0,0,1)'); // fully bright at player centre
    grad.addColorStop(0.85, 'rgba(0,0,0,1)'); // still fully bright at 85 % of radius
    grad.addColorStop(1.0,  'rgba(0,0,0,0)'); // short soft fade at the very edge
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // ── Step 3: restore hard wall shadows via even-odd fill ───────────────────
    // Path = [full screen rect] + [visibility polygon].
    // Even-odd rule: inside rect AND outside polygon → filled (wall shadow).
    //                inside rect AND inside polygon  → not filled (keep gradient).
    // Polygon radius = visionR × 1.2 to match the gradient's outer edge.
    // See the comment above for why this must be 1.2× and not 1.0×.
    const worldPoly = computeVisibilityPolygon(
      this.player.x, this.player.y, (visionR * 1.2) / cam.zoom, this.wallRects,
    );
    if (worldPoly.length >= 3) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0,2,8,0.55)'; // wall shadows noticeably darker than open-fog areas
      const toSx = (wx: number) => (wx - cam.worldView.x) * cam.zoom;
      const toSy = (wy: number) => (wy - cam.worldView.y) * cam.zoom;
      ctx.beginPath();
      ctx.rect(0, 0, W, H);                                // outer boundary
      ctx.moveTo(toSx(worldPoly[0].x), toSy(worldPoly[0].y));
      for (let i = 1; i < worldPoly.length; i++) {
        ctx.lineTo(toSx(worldPoly[i].x), toSy(worldPoly[i].y));
      }
      ctx.closePath();
      ctx.fill('evenodd');
    }

    // ── Step 4: composite fog onto the live game canvas ───────────────────────
    // Reset fogCtx composite op so it is clean for the next frame.
    ctx.globalCompositeOperation = 'source-over';

    // getContext('2d') returns null on a WebGL canvas — guard against it so a
    // stray WebGL context can never crash the game loop (the renderer is forced
    // to Canvas in main.ts, but this null-check is a belt-and-suspenders net).
    const gameCtx = this.game.canvas.getContext('2d');
    if (!gameCtx) return;

    // save/restore so we do not mutate Phaser's canvas state (transform,
    // composite op, etc.) and Phaser's next draw call is never corrupted.
    gameCtx.save();
    gameCtx.globalCompositeOperation = 'source-over';
    gameCtx.setTransform(1, 0, 0, 1, 0, 0); // identity — fog always fills full canvas
    gameCtx.drawImage(this.fogCanvas, 0, 0);
    gameCtx.restore();
  }

  /**
   * A large circular touch button used for the action stack, styled after
   * the original game's translucent grey action buttons: dark glass circle,
   * light rim, glyph, and a caption underneath. Used for REPORT/USE, which
   * have no dedicated icon art in Assets/ (only KILL and EMERGENCY do).
   */
  private buildActionButton(
    x: number, y: number, radius: number, rimColor: number, label: string, caption: string, onTap: () => void,
  ): Phaser.GameObjects.Container {
    const circle = this.add.arc(0, 0, radius, 0, 360, false, 0x000000, 0.5)
      .setStrokeStyle(2.5, rimColor, 0.9);
    const icon = this.add.text(0, -6, label, { fontSize: `${Math.round(radius * 0.8)}px` }).setOrigin(0.5);
    const cap = this.add.text(0, radius + 10, caption, {
      fontSize: '13px', color: '#eeeeee', fontFamily: 'Arial', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    const hitArea = new Phaser.Geom.Circle(0, 0, radius);
    const container = this.add.container(x, y, [circle, icon, cap])
      .setScrollFactor(0).setDepth(101)
      .setSize(radius * 2, radius * 2)
      .setInteractive(hitArea, Phaser.Geom.Circle.Contains);
    container.on('pointerdown', onTap);
    return container;
  }

  /**
   * Small pop-up list of the five sabotage types, anchored above the
   * sabotage button. Hidden until toggleSabotageMenu() opens it; tapping a
   * row sends SABOTAGE and closes it again.
   */
  private buildSabotageMenu(anchorX: number, anchorY: number) {
    const rowH = 36, rowW = 130, gap = 4;
    const types: Exclude<SabotageType, ''>[] = ['lights', 'comms', 'reactor', 'o2', 'doors'];
    const rows: Phaser.GameObjects.GameObject[] = [];
    types.forEach((type, i) => {
      const y = -((types.length - i) * (rowH + gap));
      const bg = this.add.rectangle(0, y, rowW, rowH, 0x1a1a1a, 0.9).setStrokeStyle(1.5, 0xff3b3b, 0.9);
      const label = this.add.text(0, y, SABOTAGE_LABELS[type], {
        fontSize: '15px', color: '#fff', fontFamily: 'Arial', fontStyle: 'bold',
      }).setOrigin(0.5);
      const hit = this.add.rectangle(0, y, rowW, rowH, 0x000000, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          NetworkManager.room?.send('SABOTAGE', { type });
          this.setSabotageMenuVisible(false);
        });
      rows.push(bg, label, hit);
    });
    this.sabotageMenu = this.add.container(anchorX, anchorY, rows)
      .setScrollFactor(0).setDepth(102).setVisible(false);
  }

  private lastSabotageToggleAt = -1000;
  private toggleSabotageMenu() {
    // Buttons in this HUD are hit-tested twice per tap (their own Container
    // listener, plus the iOS-safe fallback in handleActionButtonTap) — every
    // other action button tolerates that because its action is idempotent
    // under a cooldown guard, but a raw visibility toggle would just flicker
    // open/closed. this.time.now doesn't advance between the two synchronous
    // calls from the same native event, so this dedupes them.
    if (this.time.now - this.lastSabotageToggleAt < 50) return;
    this.lastSabotageToggleAt = this.time.now;
    if (this.sabotageType !== '' || Date.now() < this.sabotageCooldownUntil) return;
    this.setSabotageMenuVisible(!this.sabotageMenu?.visible);
  }

  private setSabotageMenuVisible(visible: boolean) {
    this.sabotageMenu?.setVisible(visible);
  }

  /**
   * Top-of-screen banner shown to every player (not just the impostor)
   * while a sabotage is active: status text for lights/comms/doors, and a
   * live countdown for the critical reactor/o2 meltdown window.
   */
  private buildSabotageBanner() {
    const { width: W } = this.scale;
    const bg = this.add.rectangle(0, 0, W, 40, 0x7a0000, 0.85);
    this.sabotageBannerText = this.add.text(0, 0, '', {
      fontSize: '17px', color: '#fff', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.sabotageBanner = this.add.container(W / 2, 20 + this.safeTop, [bg, this.sabotageBannerText])
      .setScrollFactor(0).setDepth(150).setVisible(false);
  }

  private updateSabotageBanner() {
    if (!this.sabotageBanner || !this.sabotageBannerText) return;
    if (this.sabotageType === '') {
      this.sabotageBanner.setVisible(false);
      return;
    }
    const label = SABOTAGE_LABELS[this.sabotageType];
    let text: string;
    if (this.sabotageType === 'reactor' || this.sabotageType === 'o2') {
      const remaining = Math.max(0, Math.ceil((this.sabotageEndsAt - Date.now()) / 1000));
      const mm = Math.floor(remaining / 60);
      const ss = String(remaining % 60).padStart(2, '0');
      text = `⚠ ${label.toUpperCase()} MELTDOWN — FIX NOW! ${mm}:${ss}`;
    } else if (this.sabotageType === 'doors') {
      text = `🔒 Doors sabotaged — 2 tasks locked`;
    } else {
      text = `⚠ ${label} sabotaged — find and fix the panel`;
    }
    this.sabotageBannerText.setText(text);
    this.sabotageBanner.setVisible(true);
  }

  /**
   * A HUD button backed by real button art from Assets/ (e.g. kill_icon.png,
   * emergency_icon.png) instead of a drawn shape + emoji. `w`/`h` are the
   * on-screen display size; the source aspect ratio is preserved via
   * fitContain so the art isn't stretched.
   */
  private buildImageButton(
    x: number, y: number, textureKey: string, w: number, h: number, onTap: () => void,
  ): Phaser.GameObjects.Container {
    const img = fitContain(this.add.image(0, 0, textureKey), w, h);
    const hitArea = new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h);
    const container = this.add.container(x, y, [img])
      .setScrollFactor(0).setDepth(101)
      .setSize(w, h)
      .setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
    container.on('pointerdown', onTap);
    return container;
  }

  // ────────────────── Virtual Joystick ──────────────────

  private setupJoystick() {
    const jSize = 80;
    const jx = this.scale.width - 130;   // right side
    // Shift joystick up by safe-area bottom inset (home bar on iPhone etc.)
    const jy = this.scale.height - 170 - this.safeBot;
    this.joystickBase = this.add.arc(jx, jy, jSize, 0, 360, false, 0x444444, 0.5)
      .setScrollFactor(0).setDepth(102).setStrokeStyle(2, 0x888888);
    this.joystickThumb = this.add.arc(jx, jy, 32, 0, 360, false, 0x888888, 0.8)
      .setScrollFactor(0).setDepth(103);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const W = this.scale.width, H = this.scale.height;
      // Bottom-right zone → joystick
      const inMovementZone = p.x > W * 0.45 && p.y > H * 0.35;
      if (inMovementZone) {
        this.joystickActive = true;
        this.joystickStart = { x: p.x, y: p.y };
        this.joystickBase?.setPosition(p.x, p.y);
        this.joystickThumb?.setPosition(p.x, p.y);
        return;
      }
      // Right-side action buttons — fallback zone detection.
      // Container.setInteractive() can silently fail on iOS when a secondary
      // camera (uiCamera) is the rendering camera, so we duplicate the hit
      // detection here using the same coordinates used in buildHUD().
      this.handleActionButtonTap(p.x, p.y);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.joystickActive) return;
      const dx = p.x - this.joystickStart.x;
      const dy = p.y - this.joystickStart.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = 80;
      const clampedDist = Math.min(dist, maxDist);
      const angle = Math.atan2(dy, dx);
      const tx = this.joystickStart.x + Math.cos(angle) * clampedDist;
      const ty = this.joystickStart.y + Math.sin(angle) * clampedDist;
      this.joystickThumb?.setPosition(tx, ty);
      this.joystickForce = {
        x: dist > 10 ? dx / Math.max(dist, 1) : 0,
        y: dist > 10 ? dy / Math.max(dist, 1) : 0,
      };
    });
    this.input.on('pointerup', () => {
      this.joystickActive = false;
      this.joystickForce = { x: 0, y: 0 };
      if (this.joystickBase) {
        this.joystickThumb?.setPosition(this.joystickBase.x, this.joystickBase.y);
      }
    });
  }

  /**
   * Manual fallback touch-zone check for the three right-side action buttons.
   * Called from the global `pointerdown` handler so that button taps are
   * always caught even if Container.setInteractive() misfires on iOS.
   * Mirrors the positions in buildHUD() exactly.
   */
  private handleActionButtonTap(px: number, py: number) {
    if (this.gameOver) return;
    const H = this.scale.height;
    const actionX = 68;   // mirrored to left side with joystick on right
    const sb = this.safeBot;
    const tapR = 76; // generous finger radius, matches the enlarged buttons

    if (this.useBtn.visible) {
      const uy = H - 130 - sb;
      if (Phaser.Math.Distance.Between(px, py, actionX, uy) < tapR) {
        this.tryInteract();
        return;
      }
    }
    if (this.reportBtn.visible) {
      const ry = H - 260 - sb;
      if (Phaser.Math.Distance.Between(px, py, actionX, ry) < tapR) {
        this.tryReport();
        return;
      }
    }
    if (this.killBtn.visible) {
      const ky = H - 390 - sb;
      if (Phaser.Math.Distance.Between(px, py, actionX, ky) < tapR) {
        this.attemptKill();
        return;
      }
    }
    if (this.ventBtn?.visible) {
      const vy = H - 260 - sb;
      if (Phaser.Math.Distance.Between(px, py, actionX, vy) < tapR) {
        this.enterVent();
        return;
      }
    }
    if (this.sabotageBtn?.visible) {
      const sy = H - 520 - sb;
      if (Phaser.Math.Distance.Between(px, py, actionX, sy) < tapR) {
        this.toggleSabotageMenu();
        return;
      }
    }
    // Top-left: emergency button fallback
    const emergBtnX = EMERGENCY_BTN_W / 2 + 12, emergBtnY = EMERGENCY_BTN_H / 2 + 56 + this.safeTop;
    if (Phaser.Math.Distance.Between(px, py, emergBtnX, emergBtnY) < Math.max(EMERGENCY_BTN_W, EMERGENCY_BTN_H) / 2) {
      this.triggerEmergency(false);
    }
  }

  // ────────────────── Update loop ──────────────────

  update(_time: number, delta: number) {
    if (this.gameOver) return;

    // Cooldowns
    if (this.killCooldown > 0) {
      this.killCooldown -= delta;
      // Ping the player when their kill is ready again
      if (this.killCooldown <= 0 && this.player.isImpostor) {
        this.sound.play('sfx_kill_cooldown', { volume: 0.7 });
      }
    }
    if (this.emergencyCooldown > 0) this.emergencyCooldown -= delta;

    // Sabotage: live countdown banner (both modes) + button dim/enable state (multiplayer's impostor button only)
    if (this.sabotageType !== '') this.updateSabotageBanner();
    if (this.sabotageBtn) {
      const key = this.sabotageType === '' && Date.now() >= this.sabotageCooldownUntil
        ? 'ui_sabotage_icon' : 'ui_sabotage_dim';
      const img = this.sabotageBtn.list[0] as Phaser.GameObjects.Image;
      if (img.texture.key !== key) img.setTexture(key);
    }

    // Player — freeze movement while inside a vent
    if (!this.isInVent) {
      this.player.update(this.cursors, this.wasd, delta, this.joystickForce);
    } else {
      this.player.setVelocity(0, 0); // ensure physics doesn't drift
    }

    // Fog of war is rendered via uiCamera 'prerender' hook in renderFogCanvas()

    if (this.isMultiplayer) {
      // Multiplayer (Phase 2: Position Sync) — no local bots or win-checking;
      // remote players are rendered from server state instead.
      this.updateRemotePlayers(delta);
      this.sendPositionUpdate(delta);
    } else {
      // Bots
      for (const bot of this.bots) bot.update(delta);

      // Bot vent AI — runs AFTER bot.update() so we can override the velocity
      // that Bot.update() just set for the impostor.
      if (this.botVentState === 'moving_to_vent') {
        // Steer impostor toward the target vent entrance
        this.updateBotVentMovement();
      } else if (this.botVentState === 'in_vent') {
        // Keep the hidden impostor frozen while it waits inside the vent
        const imp = this.bots.find(b => b.isImpostor && b.isAlive);
        imp?.setVelocity(0, 0);
      }

      // Bot task completion — crew bots complete tasks they walk over, just like
      // the player (alive or ghost). All crewmates contribute to the shared task
      // bar in the original game; this mirrors that behaviour.
      this.botCheckTasks();
    }

    // Keyboard interactions
    if (Phaser.Input.Keyboard.JustDown(this.eKey)) this.tryInteract();
    if (Phaser.Input.Keyboard.JustDown(this.rKey)) this.tryReport();
    if (Phaser.Input.Keyboard.JustDown(this.mKey)) this.toggleMiniMap();

    // Nearby detection
    this.detectNearby();

    // Room name label (bottom-centre — shows current room name like original)
    this.updateRoomLabel();

    // Ambient sounds
    this.updateAmbient();

    // Update task bar
    this.updateTaskBar();

    // 'comms' sabotage blacks out the task list + compass until fixed
    const commsDown = this.sabotageType === 'comms';
    this.setCommsDownVisual(commsDown);
    if (!commsDown) this.updateTaskArrows();

    // Sabotage visual effects that depend on world-sprite positions
    if (this.sabotageLockedTasks.length > 0) this.updateDoorLocks();
    else if (this.doorLockMarkers.size > 0) this.updateDoorLocks(); // clears leftovers when doors sabotage ends

    // Win check (Freeplay only — multiplayer win conditions are decided by the server, Phase 3)
    if (!this.isMultiplayer) this.checkWinConditions();
  }

  // ────────────────── Multiplayer (Phase 2: Position Sync) ──────────────────

  /**
   * Subscribes to the Colyseus room's `players` map: creates a RemotePlayer
   * for every other connected client, keeps it in sync as their state
   * changes, and removes it when they leave. The local player is excluded
   * (it's already rendered by `this.player`).
   */
  private initMultiplayer() {
    const room = NetworkManager.room;
    if (!room) {
      console.warn('[GameScene] initMultiplayer called with no active room — skipping.');
      return;
    }

    // The server schema (server/schema/GameState.ts) isn't shared with the
    // client build, so the decoded state is untyped at compile time here —
    // cast to the shape we know PlayerState has.
    type RemotePlayerState = { x: number; y: number; color: string; name: string; anim: string; isAlive: boolean };
    const $ = getStateCallbacks(room) as unknown as (instance: unknown) => {
      players: {
        onAdd(cb: (player: RemotePlayerState, sessionId: string) => void, immediate?: boolean): void;
        onRemove(cb: (player: RemotePlayerState, sessionId: string) => void): void;
      };
      onChange(cb: () => void): () => void;
    };

    $(room.state).players.onAdd((player, sessionId) => {
      if (sessionId === room.sessionId) return; // local player already rendered as this.player

      const rp = new RemotePlayer(this, player.x, player.y, player.color, player.name);
      rp.setFrameKey(player.anim);
      rp.setAlive(player.isAlive);
      this.remotePlayers.set(sessionId, rp);

      // Fires whenever any field on this player's schema instance changes —
      // re-read the live values (the reference stays valid for the player's
      // whole time in the room) rather than trusting the callback args.
      $(player).onChange(() => {
        rp.setTarget(player.x, player.y);
        rp.setFrameKey(player.anim);
        rp.setAlive(player.isAlive);
        // Hide remote player while they're inside a vent tunnel
        rp.setInVent((player as unknown as { inVent?: boolean }).inVent ?? false);
      });
    }, true);

    $(room.state).players.onRemove((_player, sessionId) => {
      this.remotePlayers.get(sessionId)?.destroy();
      this.remotePlayers.delete(sessionId);
    });

    // ── Phase 3: Game event handlers ───────────────────────────────────────
    room.onMessage('KILL_CONFIRMED', (msg: { killerId: string; victimId: string }) => {
      if (msg.victimId === room.sessionId) {
        this.killPlayer();
      } else {
        const rp = this.remotePlayers.get(msg.victimId);
        if (rp) {
          this.add.image(rp.x, rp.y, `dead_${rp.playerColor.toLowerCase()}`).setDepth(3);
          rp.setAlive(false);
        }
      }
      this.sound.play('sfx_kill', { volume: 0.6 });
      if (msg.victimId !== room.sessionId) {
        this.sound.play('sfx_kill_victim', { volume: 0.55 });
      }
    });

    room.onMessage('MEETING_STARTED', (msg: { callerId: string; reason: 'emergency' | 'report' }) => {
      // Boot the impostor from the vent before the meeting UI opens
      if (this.isInVent) this.exitVent();
      if (this.gameOver) return;
      this.emergencyCooldown = 45_000;
      this.meetings++;
      const isReport = msg.reason === 'report';
      const color = (this.registry.get('playerColor') as string ?? 'Red').toLowerCase();
      const imgKey = isReport ? `alert_report_${color}` : `alert_meeting_${color}`;
      this.sound.play(isReport ? 'sfx_report' : 'sfx_emergency', { volume: 0.9 });

      const { width: W, height: H } = this.scale;
      const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setScrollFactor(0).setDepth(200);
      const alertImg = this.textures.exists(imgKey)
        ? fitContain(this.add.image(W / 2, H / 2, imgKey).setScrollFactor(0).setDepth(201), W * 0.8, H * 0.5)
        : this.add.text(W / 2, H / 2, isReport ? '💀 Body Reported!' : '🚨 Emergency Meeting!', {
            fontSize: '40px', color: '#ff2222', fontFamily: 'Arial',
          }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
      this.cameras.main.ignore([overlay, alertImg]);

      this.time.delayedCall(2500, () => {
        overlay.destroy();
        if ('destroy' in alertImg) (alertImg as Phaser.GameObjects.GameObject).destroy();
        this.launchMeetingMultiplayer();
      });
    });

    room.onMessage('GAME_OVER', (msg: { winner: 'crew' | 'impostor'; impostorId: string }) => {
      this.endGameMultiplayer(msg.winner, msg.impostorId);
    });

    room.onMessage('POSITION_CORRECTION', (msg: { x: number; y: number }) => {
      this.player.setPosition(msg.x, msg.y);
    });

    room.onMessage('SABOTAGE_START', (msg: {
      type: Exclude<SabotageType, ''>; endsAt: number; cooldownUntil: number; lockedTasks: string[];
    }) => {
      this.sabotageType = msg.type;
      this.sabotageEndsAt = msg.endsAt;
      this.sabotageCooldownUntil = msg.cooldownUntil;
      this.sabotageLockedTasks = msg.lockedTasks ?? [];
      this.setSabotageMenuVisible(false);
      this.updateSabotageBanner();
      this.sound.play('sfx_emergency', { volume: 0.5 });
    });

    room.onMessage('SABOTAGE_END', (_msg: { type: SabotageType; reason: 'fixed' | 'expired' | 'timeout' }) => {
      this.sabotageType = '';
      this.sabotageEndsAt = 0;
      this.sabotageLockedTasks = [];
      this.updateSabotageBanner();
    });

    // ── Vent observer animations ────────────────────────────────────────────
    // The server broadcasts these to every client *except* the venting player,
    // so non-impostors who are standing near the vent can see the grate open/
    // close — matching the original Among Us mechanic where nearby crewmates
    // can catch an impostor in the act.

    room.onMessage('PLAYER_VENT', (msg: { sessionId: string; ventId: number }) => {
      const vd = this.ventData.find(v => v.id === msg.ventId);
      if (vd) this.playVentAnimation(vd.x, vd.y);
      this.sound.play('sfx_vent', { volume: 0.5 });
    });

    room.onMessage('PLAYER_TRAVEL_VENT', (msg: { sessionId: string; ventId: number }) => {
      const vd = this.ventData.find(v => v.id === msg.ventId);
      if (vd) this.playVentAnimation(vd.x, vd.y);
      this.sound.play('sfx_vent', { volume: 0.4 });
    });

    room.onMessage('PLAYER_EXIT_VENT', (msg: { sessionId: string }) => {
      // Find the vent position from the remote player's current schema position
      const rp = this.remotePlayers.get(msg.sessionId);
      if (rp) {
        // The remote player's schema x/y was already snapped to the exit vent
        // by the server, so we can find the closest vent to their position.
        let closest: { id: number; x: number; y: number } | null = null;
        let closestDist = Infinity;
        for (const vd of this.ventData) {
          const d = Phaser.Math.Distance.Between(rp.x, rp.y, vd.x, vd.y);
          if (d < closestDist) { closestDist = d; closest = vd; }
        }
        if (closest) this.playVentAnimation(closest.x, closest.y);
      }
      this.sound.play('sfx_vent', { volume: 0.5 });
    });
  }

  private launchMeetingMultiplayer() {
    const room = NetworkManager.room;
    if (!room) return;
    type PS = { name: string; color: string; isAlive: boolean };
    const players: { sessionId: string; name: string; color: string }[] = [];
    (room.state.players as unknown as Map<string, PS>).forEach((p, sid) => {
      if (p.isAlive) players.push({ sessionId: sid, name: p.name, color: p.color });
    });
    this.scene.pause();
    this.scene.launch('MeetingScene', {
      mode: 'multiplayer',
      gameScene: this,
      playerSessionId: room.sessionId,
      playerName: this.registry.get('playerName') as string ?? 'Crewmate',
      playerColor: this.registry.get('playerColor') as string ?? 'Red',
      playerAlive: this.player.isAlive,
      players,
    });
  }

  public resolveMeetingMultiplayer(ejectedSessionId: string | null) {
    this.scene.resume('GameScene');
    if (!ejectedSessionId) return;

    const { width: W, height: H } = this.scale;
    const room = NetworkManager.room;

    if (ejectedSessionId === room?.sessionId) {
      this.killPlayer();
      const name = this.registry.get('playerName') ?? 'You';
      const t = this.add.text(W / 2, H / 2, `${name as string} was ejected!`, {
        fontSize: '32px', color: '#ffffff',
        backgroundColor: '#00000099', padding: { x: 20, y: 12 }, fontFamily: 'Arial',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(200);
      this.cameras.main.ignore(t);
      this.time.delayedCall(3000, () => t.destroy());
    } else {
      const rp = this.remotePlayers.get(ejectedSessionId);
      if (rp) {
        this.add.image(rp.x, rp.y, `dead_${rp.playerColor.toLowerCase()}`).setDepth(3);
        rp.setAlive(false);
      }
    }
  }

  private endGameMultiplayer(winner: 'crew' | 'impostor', impostorId: string) {
    if (this.gameOver) return;
    this.gameOver = true;

    const sfx = winner === 'crew' ? 'sfx_victory_crew' : 'sfx_victory_imp';
    this.sound.play(sfx, { volume: 0.9 });

    const room = NetworkManager.room;
    type PS = { name: string };
    const impostorName = impostorId === room?.sessionId
      ? (this.registry.get('playerName') as string ?? 'You')
      : ((room?.state.players as unknown as Map<string, PS> | undefined)?.get(impostorId)?.name ?? '???');

    this.time.delayedCall(2000, () => {
      this.scene.start('VictoryScene', { winner, tasksDone: this.tasksDone, impostorName });
    });
  }

  /** Dead-reckons every remote player toward its latest server position. */
  private updateRemotePlayers(delta: number) {
    for (const rp of this.remotePlayers.values()) rp.update(delta);
  }

  /**
   * Sends the local player's position to the server at ~10 Hz (matching the
   * server's TICK_MS), and only when it actually changed — avoids flooding
   * the socket while idle. `anim` is the player's current texture-frame key
   * (e.g. "red_down_3"), which the server relays verbatim to other clients.
   */
  private sendPositionUpdate(delta: number) {
    this.moveSendAccum += delta;
    if (this.moveSendAccum < MOVE_SEND_INTERVAL_MS) return;
    this.moveSendAccum = 0;

    const x = this.player.x, y = this.player.y;
    const anim = this.player.texture.key;
    if (x === this.lastSentX && y === this.lastSentY && anim === this.lastSentAnim) return;

    this.lastSentX = x;
    this.lastSentY = y;
    this.lastSentAnim = anim;
    NetworkManager.room?.send('MOVE', { x, y, anim });
  }

  private detectNearby() {
    // ── Ghost mode: dead crewmates can still complete tasks (original Among Us) ──
    if (!this.player.isAlive) {
      const px = this.player.x, py = this.player.y;
      let nearestTask: TaskDef | null = null;
      let nearestDist = Infinity;
      for (const t of this.tasks) {
        if (t.completed || this.sabotageLockedTasks.includes(t.id)) continue;
        const d = Phaser.Math.Distance.Between(px, py, t.x, t.y);
        if (d < INTERACT_RADIUS && d < nearestDist) { nearestTask = t; nearestDist = d; }
      }
      this.nearbyTask = nearestTask;
      this.nearbyCorpse = null;
      if (nearestTask) {
        this.interactPrompt.setText(`[E] ${nearestTask.title}`).setVisible(true);
      } else {
        this.interactPrompt.setVisible(false);
      }
      this.useBtn.setVisible(!!nearestTask);
      this.reportBtn.setVisible(false);
      this.killBtn.setVisible(false);
      return;
    }

    const px = this.player.x, py = this.player.y;
    let closest: { dist: number; task: TaskDef | null; corpse: Bot | null } = { dist: Infinity, task: null, corpse: null };

    // Check tasks
    for (const t of this.tasks) {
      if (t.completed || this.sabotageLockedTasks.includes(t.id)) continue;
      const d = Phaser.Math.Distance.Between(px, py, t.x, t.y);
      if (d < INTERACT_RADIUS && d < closest.dist) {
        closest = { dist: d, task: t, corpse: null };
      }
    }

    // Check emergency button
    const eDist = Phaser.Math.Distance.Between(px, py, this.emergencyPos.x, this.emergencyPos.y);
    if (eDist < INTERACT_RADIUS * 1.5 && eDist < closest.dist) {
      closest = { dist: eDist, task: null, corpse: null };
    }

    // Check dead bots
    for (const bot of this.bots) {
      if (bot.isAlive) continue;
      const d = Phaser.Math.Distance.Between(px, py, bot.x, bot.y);
      if (d < REPORT_RADIUS && d < closest.dist) {
        closest = { dist: d, task: null, corpse: bot };
      }
    }

    this.nearbyTask = closest.task;
    this.nearbyCorpse = closest.corpse;

    // Update world-sprite textures for task interactables
    this.updateTaskSprites();

    // Sabotage fix panel — any alive player standing near the active
    // sabotage's room can fix it (doors has no manual fix, it just expires).
    this.nearSabotagePanel = false;
    if (FIXABLE_SABOTAGE_TYPES.includes(this.sabotageType as typeof FIXABLE_SABOTAGE_TYPES[number])) {
      const zone = AMBIENT_CENTRES[SABOTAGE_ROOM_KEY[this.sabotageType as keyof typeof SABOTAGE_ROOM_KEY]];
      if (zone && Phaser.Math.Distance.Between(px, py, zone.x, zone.y) < zone.radius) {
        this.nearSabotagePanel = true;
      }
    }

    // Vent proximity (impostor only, not while already inside a vent)
    this.nearbyVentId = -1;
    if (this.player.isImpostor && !this.isInVent) {
      for (const v of this.ventData) {
        if (Phaser.Math.Distance.Between(px, py, v.x, v.y) < INTERACT_RADIUS) {
          this.nearbyVentId = v.id;
          break;
        }
      }
    }

    // Admin button proximity (any alive player)
    this.nearbyAdminBtn = false;
    for (const ab of this.adminBtnPositions) {
      if (Phaser.Math.Distance.Between(px, py, ab.x, ab.y) < INTERACT_RADIUS) {
        this.nearbyAdminBtn = true;
        break;
      }
    }

    // Prompt (priority: task > sabotage fix > emergency > admin > vent > report)
    const nearEmergency = eDist < INTERACT_RADIUS * 1.5 && this.player.isAlive;
    if (this.nearbyTask) {
      this.interactPrompt.setText(`[E] ${this.nearbyTask.title}`).setVisible(true);
    } else if (this.nearSabotagePanel) {
      this.interactPrompt.setText(`[E] Fix ${SABOTAGE_LABELS[this.sabotageType as keyof typeof SABOTAGE_LABELS]}`).setVisible(true);
    } else if (nearEmergency) {
      this.interactPrompt.setText('[E] Emergency Meeting').setVisible(true);
    } else if (this.nearbyAdminBtn) {
      this.interactPrompt.setText('[E] Admin Table').setVisible(true);
    } else if (this.nearbyVentId !== -1) {
      this.interactPrompt.setText('[E] Use Vent').setVisible(true);
    } else if (this.nearbyCorpse) {
      this.interactPrompt.setText('[R] Report Body').setVisible(true);
    } else {
      this.interactPrompt.setVisible(false);
    }

    // Contextual action buttons — only show the ones that are actionable
    // right now, so the bottom-right thumb zone doesn't clutter the screen.
    this.useBtn.setVisible(!!this.nearbyTask || this.nearSabotagePanel || nearEmergency || this.nearbyAdminBtn);

    // Vent button: impostor only, near a vent, not currently inside one
    this.ventBtn?.setVisible(this.nearbyVentId !== -1 && !this.isInVent);

    if (this.isMultiplayer) {
      // In multiplayer: report shows when near a dead remote player's body
      let nearDeadRemote = false;
      for (const rp of this.remotePlayers.values()) {
        if (rp.isAlive) continue;
        if (Phaser.Math.Distance.Between(px, py, rp.x, rp.y) < REPORT_RADIUS) {
          nearDeadRemote = true;
          break;
        }
      }
      // Hide REPORT when the vent button is visible (they can't both be needed at once)
      this.reportBtn.setVisible(nearDeadRemote && !this.ventBtn?.visible);

      // Kill button: only for the impostor, when a living remote player is in range
      if (this.player.isImpostor && this.player.isAlive) {
        let nearAliveRemote = false;
        for (const rp of this.remotePlayers.values()) {
          if (!rp.isAlive) continue;
          if (Phaser.Math.Distance.Between(px, py, rp.x, rp.y) < KILL_RADIUS) {
            nearAliveRemote = true;
            break;
          }
        }
        this.killBtn.setVisible(nearAliveRemote && this.killCooldown <= 0);
      }
    } else {
      this.reportBtn.setVisible(!!this.nearbyCorpse);
    }
  }

  private tryInteract() {
    if (this.gameOver) return;

    // Ghosts can open tasks but not call emergency meetings
    if (this.nearbyTask) {
      this.openTask(this.nearbyTask);
      return;
    }

    if (!this.player.isAlive) return;

    // Sabotage fix panel
    if (this.nearSabotagePanel) {
      if (this.isMultiplayer) NetworkManager.room?.send('SABOTAGE_FIX');
      else this.fixSabotageLocal();
      return;
    }

    // Admin table (any alive player)
    if (this.nearbyAdminBtn) {
      this.scene.pause();
      this.scene.launch('AdminTableScene', { gameScene: this, isMultiplayer: this.isMultiplayer });
      return;
    }

    // Vent entry (impostor only)
    if (this.nearbyVentId !== -1 && this.player.isImpostor) {
      this.enterVent();
      return;
    }

    // Emergency button (alive players only)
    const eDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.emergencyPos.x, this.emergencyPos.y);
    if (eDist < INTERACT_RADIUS * 1.5) {
      this.triggerEmergency(false);
    }
  }

  private tryReport() {
    if (!this.player.isAlive || this.gameOver) return;
    if (this.isMultiplayer) {
      this.triggerEmergency(true); // finds nearest dead remote player internally
      return;
    }
    if (this.nearbyCorpse) this.triggerEmergency(true);
  }

  private openTask(task: TaskDef) {
    if (task.completed) return;
    // 'doors' sabotage locks two random tasks until it expires (matches the
    // server's TASK_DONE rejection in multiplayer — enforced here too so
    // Freeplay can't just open a locked task's mini-game while it's locked).
    if (this.sabotageLockedTasks.includes(task.id)) return;
    this.scene.pause();
    this.scene.launch(this.getTaskScene(task.type), { taskId: task.id, gameScene: this });
  }

  private getTaskScene(type: string): string {
    const map: Record<string, string> = {
      fix_wiring:     'FixWiringScene',
      stabilize_nav:  'StabilizeNavScene',
      reboot_wifi:    'RebootWifiScene',
      fuel_engine:    'FuelEngineScene',
      start_reactor:  'StartReactorScene',
      align_engine:   'AlignEngineScene',
      empty_garbage:  'EmptyGarbageScene',
      clear_asteroids:'ClearAsteroidsScene',
    };
    return map[type] ?? 'FixWiringScene';
  }

  public completeTask(taskId: string) {
    const t = this.tasks.find(t => t.id === taskId);
    if (t && !t.completed) {
      t.completed = true;
      this.tasksDone++;
      this.sound.play('sfx_task_done', { volume: 0.8 });
      this.updateTaskBar();
      this.updateTaskList();
      const sprite = this.taskSprites.get(t.objectName);
      const variants = TASK_SPRITE_VARIANTS[t.objectName];
      if (sprite && variants?.connected && this.textures.exists(variants.connected)) {
        sprite.setTexture(variants.connected);
      }
      // Inform server in multiplayer — server validates proximity and updates its count
      if (this.isMultiplayer) NetworkManager.room?.send('TASK_DONE', { taskId });
    }
    this.scene.resume('GameScene');
    // Check win immediately — previously missing, so a crew task-completion
    // win was never detected until the next kill or meeting fired.
    this.checkWinConditions();
  }

  /**
   * Formats a task-list row as "Room: Task Name", matching the original
   * game's list format (room derived from the task's world position via
   * the nearest AMBIENT_CENTRES entry — no new data invented).
   */
  private taskRowLabel(task: TaskDef): string {
    const room = nearestRoomName(task.x, task.y);
    const name = SHORT_TASK_NAMES[task.type] ?? task.title.slice(0, 18);
    return room ? `${room}: ${name}` : name;
  }

  /** Refresh the task-list rows to reflect current completion state. */
  private updateTaskList() {
    const tracked = this.getTrackedTask();
    for (let i = 0; i < this.taskListRows.length; i++) {
      const task = this.tasks[i];
      if (!task) continue;
      const label = this.taskRowLabel(task);
      if (task.completed) {
        this.taskListRows[i].setText(`\u2713 ${label}`).setColor('#44dd77');
      } else if (tracked && task.id === tracked.id) {
        this.taskListRows[i].setText(`\u25b8 ${label}`).setColor('#ffee22');
      } else {
        this.taskListRows[i].setText(`\u25a1 ${label}`).setColor('#aaaaaa');
      }
    }
  }

  private setCommsDownVisual(active: boolean) {
    if (active === this.commsDownActive) return;
    this.commsDownActive = active;
    this.taskListHdr?.setVisible(!active);
    for (const row of this.taskListRows) row.setVisible(!active);
    this.commsDownLabel?.setVisible(active);
    if (active) for (const entry of this.taskArrows) entry.container.setVisible(false);
  }

  private updateTaskBar() {
    const pct = NO_OF_MISSIONS > 0 ? this.tasksDone / NO_OF_MISSIONS : 0;
    this.taskBarFill.setSize(340 * pct, 23);
    this.taskLabel.setText(`Tasks: ${this.tasksDone} / ${NO_OF_MISSIONS}`);
  }

  // ────────────────── Meetings ──────────────────

  private triggerEmergency(isReport: boolean) {
    if (!this.player.isAlive || this.gameOver || this.emergencyCooldown > 0) return;

    // In multiplayer the server drives the meeting — send the action and wait
    // for the MEETING_STARTED broadcast (which fires for all clients, including
    // the caller, so the meeting launches uniformly everywhere).
    if (this.isMultiplayer) {
      if (isReport) {
        // Find nearest dead remote player and report their corpse
        for (const [sid, rp] of this.remotePlayers.entries()) {
          if (rp.isAlive) continue;
          const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, rp.x, rp.y);
          if (d < REPORT_RADIUS) {
            NetworkManager.room?.send('REPORT', { corpseId: sid });
            return;
          }
        }
      } else {
        NetworkManager.room?.send('EMERGENCY', {});
      }
      return;
    }

    this.emergencyCooldown = 45000;
    this.meetings++;

    const color = (this.registry.get('playerColor') as string ?? 'Red').toLowerCase();
    const imgKey = isReport ? `alert_report_${color}` : `alert_meeting_${color}`;
    this.sound.play(isReport ? 'sfx_report' : 'sfx_emergency', { volume: 0.9 });

    // Show alert image, then launch meeting
    const { width: W, height: H } = this.scale;
    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setScrollFactor(0).setDepth(200);
    const alertImg = this.textures.exists(imgKey)
      ? fitContain(this.add.image(W / 2, H / 2, imgKey).setScrollFactor(0).setDepth(201), W * 0.8, H * 0.5)
      : this.add.text(W / 2, H / 2, isReport ? '💀 Body Reported!' : '🚨 Emergency Meeting!', {
          fontSize: '40px', color: '#ff2222', fontFamily: 'Arial',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

    this.cameras.main.ignore([overlay, alertImg]);

    this.time.delayedCall(2500, () => {
      overlay.destroy();
      if ('destroy' in alertImg) (alertImg as Phaser.GameObjects.GameObject).destroy();
      this.launchMeeting();
    });
  }

  private launchMeeting() {
    const aliveBots = this.bots.filter(b => b.isAlive).map(b => ({
      id: b.botId, name: b.botName, color: b.botColor,
    }));
    this.scene.pause();
    this.scene.launch('MeetingScene', {
      gameScene: this,
      playerName: this.registry.get('playerName'),
      playerColor: this.registry.get('playerColor'),
      playerAlive: this.player.isAlive,
      aliveBots,
    });
  }

  public resolveMeeting(ejectedId: number | null) {
    this.scene.resume('GameScene');
    if (ejectedId === null) return;

    const { width: W, height: H } = this.scale;

    // Player ejection — id -1 is used for the local player in MeetingScene
    if (ejectedId === -1) {
      this.killPlayer();
      const name = this.registry.get('playerName') ?? 'You';
      const t = this.add.text(W / 2, H / 2, `${name} was not the Impostor.`, {
        fontSize: '32px', color: '#ffffff',
        backgroundColor: '#00000099', padding: { x: 20, y: 12 }, fontFamily: 'Arial',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(200);
      this.cameras.main.ignore(t);
      this.time.delayedCall(3000, () => t.destroy());
      this.checkWinConditions();
      return;
    }

    const bot = this.bots.find(b => b.botId === ejectedId);
    if (bot) {
      bot.die();
      const wasImp = bot.isImpostor;
      const msg = wasImp
        ? `${bot.botName} was the Impostor!`
        : `${bot.botName} was not the Impostor.`;
      const t = this.add.text(W / 2, H / 2, msg, {
        fontSize: '32px', color: wasImp ? '#ff4444' : '#ffffff',
        backgroundColor: '#00000099', padding: { x: 20, y: 12 }, fontFamily: 'Arial',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(200);
      this.cameras.main.ignore(t);
      this.time.delayedCall(3000, () => t.destroy());
    }
    this.checkWinConditions();
  }

  // ────────────────── Player death / ghost ──────────────────

  /**
   * Kills the local player: places a dead-body sprite at the current position,
   * transitions the player sprite to ghost mode (semi-transparent, can still
   * walk through walls), removes the player-wall collider, and plays the
   * 18-frame kill-banner cinematic as a non-blocking screen overlay.
   */
  private killPlayer() {
    if (!this.player.isAlive) return;

    // Place a dead body at the kill position before the player sprite changes
    const lc = this.player.playerColor.toLowerCase();
    const deadBody = this.add.image(this.player.x, this.player.y, `dead_${lc}`);
    deadBody.setDepth(3);

    this.player.die();

    // Ghost mode: remove wall collision so the ghost walks through walls
    if (this.player.isGhost) {
      this.playerWallCollider?.destroy();
    }

    // Victim scream
    this.sound.play('sfx_kill_victim', { volume: 0.55 });

    // Overlay the kill cinematic (non-blocking — game logic already updated above)
    this.showKillAnimation();
  }

  /**
   * Plays the 3-frame kill_anim sprite at the bot's death position in world
   * space. Visible on the main camera so it tracks with the map. Auto-destroys.
   */
  private showBotKillAnimation(x: number, y: number) {
    if (!this.anims.exists('kill_anim')) return;
    const sprite = this.add.sprite(x, y, 'kill_anim_1')
      .setDepth(20)
      .setOrigin(0.5)
      .setScale(1.4);
    sprite.play('kill_anim');
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
  }

  /**
   * Plays the 18-frame kill-banner animation as a full-width cinematic overlay
   * rendered only on the UI camera (same pattern as showAlert). Auto-destroys
   * when the animation completes.
   */
  private showKillAnimation() {
    if (!this.textures.exists('kill_banner_1')) return;

    const { width: W, height: H } = this.scale;

    // Dark backing so the landscape strip doesn't float on a transparent void
    const bg = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75)
      .setScrollFactor(0)
      .setDepth(249)
      .setOrigin(0.5);
    this.cameras.main.ignore(bg);

    const sprite = this.add.sprite(W / 2, H / 2, 'kill_banner_1')
      .setScrollFactor(0)
      .setDepth(250)
      .setOrigin(0.5);

    // Scale so the image fills the screen width
    const src = this.textures.get('kill_banner_1').getSourceImage() as HTMLImageElement;
    if (src.width > 0) {
      sprite.setScale(W / src.width);
    }

    this.cameras.main.ignore(sprite);

    if (this.anims.exists('kill_banner')) {
      sprite.play('kill_banner');
      sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        sprite.destroy();
        bg.destroy();
      });
    } else {
      // Fallback: no animation defined — show first frame briefly
      this.time.delayedCall(700, () => { sprite.destroy(); bg.destroy(); });
    }
  }

  // ────────────────── Impostor AI ──────────────────

  private impostorAct() {
    if (this.gameOver) return;
    // Bot is hidden inside a vent — skip kill/vent logic until it resurfaces.
    if (this.botVentState === 'in_vent') return;

    const imp = this.bots.find(b => b.isImpostor && b.isAlive);
    if (!imp) return;

    // Target nearest alive victim — bots AND the player
    let minDist = Infinity, target: Bot | null = null;
    for (const bot of this.bots) {
      if (!bot.isAlive || bot.isImpostor) continue;
      const d = Phaser.Math.Distance.Between(imp.x, imp.y, bot.x, bot.y);
      if (d < minDist) { minDist = d; target = bot; }
    }

    // Check player too — previously omitted, making the player immortal in Freeplay
    const playerDist = this.player.isAlive
      ? Phaser.Math.Distance.Between(imp.x, imp.y, this.player.x, this.player.y)
      : Infinity;

    if (playerDist < minDist && playerDist < 300) {
      // Kill takes priority — abort any vent approach
      this.botVentState = 'idle';
      this.killPlayer();
      this.sound.play('sfx_kill', { volume: 0.6 });
      this.checkWinConditions();
      return;
    }

    if (target && minDist < 300) {
      // Kill takes priority — abort any vent approach
      this.botVentState = 'idle';
      const killX = target.x;
      const killY = target.y;
      target.die();
      this.sound.play('sfx_kill', { volume: 0.6 });
      this.sound.play('sfx_kill_victim', { volume: 0.55 });
      this.showBotKillAnimation(killX, killY);
      // Check win after bot kill — previously missing, so impostor wiping all
      // crew bots wasn't detected until the player also died or a meeting fired.
      this.checkWinConditions();
      return;
    }

    // No kill target in range — occasionally use a vent to reposition.
    // ~35% chance per AI tick (every 3s) once the cooldown has expired.
    if (this.botVentState === 'idle' && Math.random() < 0.35) {
      this.startBotVentAI(imp);
    }
  }

  // ────────────────── Bot Impostor Vent AI (Freeplay) ──────────────────

  /**
   * Picks a random vent on the map and puts the impostor bot in
   * 'moving_to_vent' state.  The update loop then overrides the bot's
   * random walk to path it toward the chosen vent entrance.
   *
   * Original Among Us: the impostor bot regularly uses vents to relocate,
   * which gives crewmates the chance to catch it "venting" — one of the
   * core skill-building mechanics in Freeplay.
   */
  private startBotVentAI(imp: Bot) {
    if (this.ventData.length === 0) return;
    if (Date.now() < this.botVentCooldownUntil) return;
    // Don't vent during an active sabotage — the bot should stay near the
    // sabotage location and let the critical timer run down (mirrors the
    // original game's impostor strategy, and avoids confusion with task #4).
    if (this.sabotageType !== '') return;

    // Pick a random vent as destination
    const vent = this.ventData[Phaser.Math.Between(0, this.ventData.length - 1)];
    this.botVentTargetId = vent.id;
    this.botVentTargetX  = vent.x;
    this.botVentTargetY  = vent.y;
    this.botVentState    = 'moving_to_vent';
    void imp; // used implicitly via bots array in update
  }

  /**
   * Called every frame while the impostor bot is pathing to a vent.
   * Overrides the bot's random-walk velocity to steer it toward the vent.
   * When it arrives (within INTERACT_RADIUS), triggers the vent-entry sequence.
   */
  private updateBotVentMovement() {
    const imp = this.bots.find(b => b.isImpostor && b.isAlive);
    if (!imp) { this.botVentState = 'idle'; return; }

    const dx   = this.botVentTargetX - imp.x;
    const dy   = this.botVentTargetY - imp.y;
    const dist = Math.hypot(dx, dy);

    if (dist < INTERACT_RADIUS) {
      // Arrived — enter the vent
      this.enterBotVent(imp);
      return;
    }

    // Override the bot's own random walk velocity (same speed bots use normally)
    imp.setVelocity((dx / dist) * PLAYER_SPEED * 0.55, (dy / dist) * PLAYER_SPEED * 0.55);
  }

  /**
   * Makes the bot impostor enter a vent: hides it, plays the opening
   * animation and sound (visible to any nearby crewmate), then after a
   * random delay teleports it to a connected vent and exits there.
   */
  private enterBotVent(imp: Bot) {
    this.botVentState = 'in_vent';
    imp.setAlpha(0);
    imp.setVelocity(0, 0);

    // Vent opening animation — plays at the entry vent in world space,
    // giving crewmates a visual cue if they happen to be nearby.
    this.playVentAnimation(this.botVentTargetX, this.botVentTargetY);
    this.sound.play('sfx_vent', { volume: 0.7 });

    // Decide where to exit — prefer a connected vent so the bot
    // meaningfully relocates; fall back to the same vent if isolated.
    const connections = VENT_NETWORK[this.botVentTargetId] ?? [];
    const exitVentId  = connections.length > 0
      ? connections[Phaser.Math.Between(0, connections.length - 1)]
      : this.botVentTargetId;
    const exitVent = this.ventData.find(v => v.id === exitVentId)
                  ?? this.ventData.find(v => v.id === this.botVentTargetId);

    // Stay inside for 1.5 – 3 s, then emerge at the exit vent.
    const stayMs = Phaser.Math.Between(1500, 3000);
    this.time.delayedCall(stayMs, () => {
      if (!imp.isAlive || this.gameOver) {
        this.botVentState = 'idle';
        if (imp.isAlive) imp.setAlpha(1);
        return;
      }

      // Teleport to exit vent
      if (exitVent) {
        imp.setPosition(exitVent.x, exitVent.y);
        this.playVentAnimation(exitVent.x, exitVent.y);
      }
      this.sound.play('sfx_vent', { volume: 0.7 });
      imp.setAlpha(1);

      this.botVentState = 'idle';
      // Cooldown of 8 – 15 s before the bot vents again
      this.botVentCooldownUntil = Date.now() + Phaser.Math.Between(8000, 15000);
    });
  }

  /**
   * Freeplay-only sabotage AI. Mirrors AmongGasRoom.handleSabotage's rules
   * (one active sabotage at a time, shared cooldown after triggering) but
   * runs entirely client-side since Freeplay has no server. Ticks every
   * 10s via the timer set up in create(); rolls a chance to fire so
   * sabotage doesn't fire the instant it comes off cooldown.
   */
  private impostorSabotageAI() {
    if (this.gameOver) return;
    const imp = this.bots.find(b => b.isImpostor && b.isAlive);
    if (!imp) return;
    if (this.sabotageType !== '' || Date.now() < this.sabotageCooldownUntil) return;
    if (Math.random() > 0.4) return; // ~40% chance per 10s tick once available

    const weighted: Exclude<SabotageType, ''>[] =
      ['lights', 'lights', 'comms', 'comms', 'doors', 'doors', 'reactor', 'o2'];
    const type = weighted[Phaser.Math.Between(0, weighted.length - 1)];
    this.triggerBotSabotage(type);
  }

  /** Freeplay equivalent of the server's handleSabotage — same durations/effects, driven locally. */
  private triggerBotSabotage(type: Exclude<SabotageType, ''>) {
    const now = Date.now();
    this.sabotageType = type;
    this.sabotageCooldownUntil = now + SABOTAGE_COOLDOWN_MS;

    let durationMs: number;
    if (type === 'doors') {
      durationMs = DOORS_LOCK_MS;
      const incomplete = this.tasks.filter(t => !t.completed);
      const pool = incomplete.length >= 2 ? incomplete : this.tasks;
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      this.sabotageLockedTasks = shuffled.slice(0, Math.min(2, shuffled.length)).map(t => t.id);
    } else if (type === 'reactor' || type === 'o2') {
      durationMs = CRITICAL_SABOTAGE_MS;
    } else {
      durationMs = SABOTAGE_SAFETY_MS;
    }

    this.sabotageEndsAt = now + durationMs;
    this.updateSabotageBanner();
    this.sound.play('sfx_emergency', { volume: 0.5 });

    this.sabotageTimerEvt?.remove(false);
    this.sabotageTimerEvt = this.time.delayedCall(durationMs, () => this.onSabotageTimeoutLocal(type));
  }

  /** Freeplay equivalent of the server's onSabotageTimeout. */
  private onSabotageTimeoutLocal(type: Exclude<SabotageType, ''>) {
    if (this.sabotageType !== type) return; // already fixed

    if (type === 'reactor' || type === 'o2') {
      this.clearSabotageLocal();
      this.endGame('impostor');
      return;
    }
    this.clearSabotageLocal();
  }

  /** Freeplay equivalent of the server's handleSabotageFix (proximity already checked by the caller via nearSabotagePanel). */
  private fixSabotageLocal() {
    if (this.sabotageType === '' || this.sabotageType === 'doors') return;
    this.sound.play('sfx_task_done', { volume: 0.7 });
    this.clearSabotageLocal();
  }

  /** Freeplay equivalent of the server's clearSabotage. */
  private clearSabotageLocal() {
    if (this.sabotageType === '') return;
    this.sabotageTimerEvt?.remove(false);
    this.sabotageTimerEvt = undefined;
    this.sabotageType = '';
    this.sabotageEndsAt = 0;
    this.sabotageLockedTasks = [];
    this.updateSabotageBanner();
  }

  private attemptKill() {
    if (this.killCooldown > 0 || !this.player.isAlive || this.gameOver) return;
    if (!this.isMultiplayer || !this.player.isImpostor) return;

    // Find nearest alive remote player within kill radius
    let nearestSid = '';
    let nearestDist = KILL_RADIUS;
    for (const [sid, rp] of this.remotePlayers.entries()) {
      if (!rp.isAlive) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, rp.x, rp.y);
      if (d < nearestDist) { nearestDist = d; nearestSid = sid; }
    }
    if (!nearestSid) return;

    NetworkManager.room?.send('KILL', { targetId: nearestSid });
    this.killCooldown = 15_000;
    this.sound.play('sfx_kill', { volume: 0.6 });
    this.killBtn.setVisible(false);
  }

  // ────────────────── Vent System (impostor) ──────────────────

  /**
   * Called when the impostor presses the VENT button while standing near a
   * vent entrance.  Hides the player, disables physics movement, plays the
   * vent sound, and opens the vent-travel overlay.
   *
   * Original Among Us behaviour: nearby players CAN see the enter/exit
   * animation — that's how you catch impostors.  We broadcast the event in
   * multiplayer so other clients can react (their RemotePlayer goes invisible).
   */
  private enterVent() {
    if (this.isInVent || this.nearbyVentId === -1 || !this.player.isImpostor) return;
    this.isInVent = true;
    this.currentVentId = this.nearbyVentId;

    // Show opening animation at the vent's world position (visible to nearby
    // crewmates — matching original Among Us behaviour where bystanders can
    // catch an impostor venting).
    const vd = this.ventData.find(v => v.id === this.currentVentId);
    if (vd) this.playVentAnimation(vd.x, vd.y);

    // Hide player sprite; physics body stays enabled so collision state is
    // consistent, but velocity is zeroed so the player can't move while venting.
    this.player.setAlpha(0);
    this.player.setVelocity(0, 0);

    this.sound.play('sfx_vent', { volume: 0.7 });
    this.showVentOverlay();

    if (this.isMultiplayer) {
      NetworkManager.room?.send('ENTER_VENT', { ventId: this.currentVentId });
    }
  }

  /**
   * Builds (or rebuilds) the vent-travel overlay displayed while the player
   * is inside a vent.  Shows one button per connected vent plus an Exit button.
   * Runs on the UI camera so it's always fullscreen regardless of world zoom.
   */
  private showVentOverlay() {
    this.ventOverlay?.destroy();
    const { width: W, height: H } = this.scale;
    const connected = VENT_NETWORK[this.currentVentId] ?? [];

    const items: Phaser.GameObjects.GameObject[] = [];
    const rowH = 60, gap = 8;
    const totalRows = connected.length + 1; // connections + exit
    const panH = 52 + totalRows * (rowH + gap);

    const bg = this.add.rectangle(0, 0, W * 0.80, panH, 0x14002a, 0.95)
      .setStrokeStyle(2, 0xaa44ff, 0.95);
    items.push(bg);

    const title = this.add.text(0, -panH / 2 + 20, '🌀  Vent System', {
      fontSize: '20px', color: '#cc88ff', fontFamily: 'Arial', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 0);
    items.push(title);

    connected.forEach((ventId, i) => {
      const rowY = -panH / 2 + 52 + i * (rowH + gap) + rowH / 2;
      const label = VENT_ROOM_NAMES[ventId] ?? `Vent ${ventId}`;
      const btnBg = this.add.rectangle(0, rowY, W * 0.65, rowH, 0x440088, 0.9)
        .setStrokeStyle(1.5, 0xcc66ff, 0.9)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.travelVent(ventId));
      const btnTxt = this.add.text(0, rowY, `Travel → ${label}`, {
        fontSize: '17px', color: '#fff', fontFamily: 'Arial', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5);
      items.push(btnBg, btnTxt);
    });

    const exitY = -panH / 2 + 52 + connected.length * (rowH + gap) + rowH / 2;
    const exitBg = this.add.rectangle(0, exitY, W * 0.50, rowH, 0x2a2a2a, 0.9)
      .setStrokeStyle(1.5, 0xaaaaaa, 0.7)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.exitVent());
    const exitTxt = this.add.text(0, exitY, 'Exit Vent', {
      fontSize: '17px', color: '#ccc', fontFamily: 'Arial',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
    items.push(exitBg, exitTxt);

    this.ventOverlay = this.add.container(W / 2, H / 2, items)
      .setScrollFactor(0).setDepth(200);
    this.cameras.main.ignore(this.ventOverlay);
  }

  /**
   * Teleports the impostor to a connected vent.  The player remains hidden
   * (alpha 0) and the camera follows instantly because the camera is set to
   * follow the player sprite which we just repositioned.
   */
  private travelVent(toVentId: number) {
    const connections = VENT_NETWORK[this.currentVentId] ?? [];
    if (!connections.includes(toVentId)) return; // not connected — guard

    const target = this.ventData.find(v => v.id === toVentId);
    if (!target) return;

    // Play opening animation at the destination vent so someone standing
    // near the exit can see the impostor emerge.
    this.playVentAnimation(target.x, target.y);

    this.player.setPosition(target.x, target.y);
    this.currentVentId = toVentId;

    this.sound.play('sfx_vent', { volume: 0.5 });
    this.showVentOverlay(); // rebuild with new vent's connection list

    if (this.isMultiplayer) {
      NetworkManager.room?.send('TRAVEL_VENT', { ventId: toVentId });
    }
  }

  /**
   * Exits the current vent: makes the player visible again, re-enables
   * movement, and removes the travel overlay.
   */
  private exitVent() {
    if (!this.isInVent) return;
    this.isInVent = false;

    // Show animation at the exit vent so nearby players can see the impostor emerge.
    const vd = this.ventData.find(v => v.id === this.currentVentId);
    if (vd) this.playVentAnimation(vd.x, vd.y);

    this.currentVentId = -1;

    this.player.setAlpha(1);

    this.ventOverlay?.destroy();
    this.ventOverlay = undefined;

    this.sound.play('sfx_vent', { volume: 0.7 });

    if (this.isMultiplayer) {
      NetworkManager.room?.send('EXIT_VENT', {});
    }
  }

  /**
   * Plays a brief vent-opening/closing animation at the given world position.
   *
   * Original Among Us behaviour: the vent grate visually opens and closes
   * whenever someone enters or exits, making it visible to nearby crewmates.
   * We reproduce this with a procedural Phaser tween — no new art needed.
   *
   * The animation runs in world space so it is affected by the camera (zoom
   * and scroll) and by the fog of war, exactly as a real sprite would be.
   * Only players close enough to see the vent will notice the flash.
   */
  private playVentAnimation(wx: number, wy: number) {
    // Dark oval that rapidly expands (vent opens), holds briefly, then snaps
    // shut — mimicking the vent grate lifting and falling.
    const hole = this.add.ellipse(wx, wy + 4, 46, 18, 0x0a0a0a, 0.92).setDepth(15);
    hole.setScale(0.05, 0.05);

    this.tweens.add({
      targets: hole,
      scaleX: 1,
      scaleY: 1,
      duration: 160,
      ease: 'Back.Out',
      yoyo: true,
      hold: 380,      // stay open while the impostor ducks in/out
      onComplete: () => hole.destroy(),
    });

    // Metallic rim flash — simulates the grate catching light as it swings.
    const rim = this.add.graphics().setDepth(14);
    rim.lineStyle(2.5, 0xbbbbbb, 0.85);
    rim.strokeEllipse(wx, wy + 4, 50, 22);
    this.tweens.add({
      targets: rim,
      alpha: 0,
      duration: 500,
      delay: 60,
      onComplete: () => rim.destroy(),
    });
  }

  // ────────────────── Win Conditions ──────────────────

  private botCheckTasks() {
    for (const bot of this.bots) {
      if (!bot.isAlive || bot.isImpostor) continue;
      for (const task of this.tasks) {
        if (task.completed || this.sabotageLockedTasks.includes(task.id)) continue;
        if (Phaser.Math.Distance.Between(bot.x, bot.y, task.x, task.y) < INTERACT_RADIUS) {
          this.completeTask(task.id);
          break; // one task per bot per frame is enough
        }
      }
    }
  }

  private checkWinConditions() {
    if (this.gameOver) return;

    const aliveCrews = this.bots.filter(b => b.isAlive && !b.isImpostor).length;
    const aliveImps  = this.bots.filter(b => b.isAlive && b.isImpostor).length;

    if (this.tasksDone >= NO_OF_MISSIONS) {
      this.endGame('crew');
    } else if (aliveImps === 0) {
      this.endGame('crew');
    } else if (aliveImps >= aliveCrews + (this.player.isAlive ? 1 : 0)) {
      this.endGame('impostor');
    }
  }

  private endGame(winner: 'crew' | 'impostor') {
    if (this.gameOver) return;
    this.gameOver = true;

    const sfx = winner === 'crew' ? 'sfx_victory_crew' : 'sfx_victory_imp';
    this.sound.play(sfx, { volume: 0.9 });

    this.time.delayedCall(2000, () => {
      this.scene.start('VictoryScene', {
        winner,
        tasksDone: this.tasksDone,
        impostorName: this.bots.find(b => b.isImpostor)?.botName ?? '???',
      });
    });
  }

  // ────────────────── Room name label ──────────────────

  /**
   * Shows the current room name at the bottom-centre of the HUD, matching
   * the original Among Us style: the label only appears when the player is
   * inside a known room zone (within its AMBIENT_CENTRES radius). Corridors
   * and hallways between rooms show nothing.
   */
  private updateRoomLabel() {
    if (!this.roomNameText) return;
    const px = this.player.x, py = this.player.y;
    let found: string | null = null;
    for (const [key, centre] of Object.entries(AMBIENT_CENTRES)) {
      const d = Phaser.Math.Distance.Between(px, py, centre.x, centre.y);
      if (d <= centre.radius) {
        found = ROOM_DISPLAY_NAMES[key] ?? null;
        break;
      }
    }
    this.roomNameText.setText(found ?? '');
    this.roomNameText.setVisible(found !== null);
  }

  // ────────────────── Ambient ──────────────────

  private updateAmbient() {
    const px = this.player.x, py = this.player.y;
    for (const [key, centre] of Object.entries(AMBIENT_CENTRES)) {
      const d   = Phaser.Math.Distance.Between(px, py, centre.x, centre.y);
      const sndKey = `amb_${key}`;
      const inZone = d <= centre.radius;

      if (inZone && !this.ambientPlaying.has(key) && !this.ambientPending.has(key)) {
        if (this.cache.audio.exists(sndKey)) {
          // Already downloaded from a previous visit — play immediately
          this.sound.play(sndKey, { loop: true, volume: 0.25 });
          this.ambientPlaying.add(key);
        } else {
          // First visit: kick off a dynamic load (non-blocking)
          const filePath = GameScene.AMBIENT_FILE_MAP[key];
          if (!filePath) continue;
          this.ambientPending.add(key);
          this.load.audio(sndKey, filePath);
          this.load.once('complete', () => {
            this.ambientPending.delete(key);
            // Only play if the player is still in the zone
            if (this.gameOver || !this.ambientPending.has(key) === false) return;
            const curDist = Phaser.Math.Distance.Between(
              this.player.x, this.player.y, centre.x, centre.y);
            if (curDist <= centre.radius && !this.ambientPlaying.has(key)) {
              this.sound.play(sndKey, { loop: true, volume: 0.25 });
              this.ambientPlaying.add(key);
            }
          });
          this.load.start();
        }
      } else if (!inZone && this.ambientPlaying.has(key)) {
        this.sound.stopByKey(sndKey);
        this.ambientPlaying.delete(key);
      }
    }
  }

  // ────────────────── Mini Map ──────────────────

  private toggleMiniMap() {
    if (this.miniMapOverlay) { this.closeMiniMap(); return; }
    const { width: W, height: H } = this.scale;
    this.miniMapOverlay = this.add.container(W / 2, H / 2).setScrollFactor(0).setDepth(300);

    // Bigger overlay: nearly full-screen so the map is readable on phone
    const bg = this.add.rectangle(0, 0, W * 0.96, H * 0.96, 0x000000, 0.95);
    const mapImg = fitContain(this.add.image(0, 0, 'minimap'), W * 0.9, H * 0.86);

    // Player dot — use actual rendered image dimensions (fitContain may
    // letterbox, so displayWidth/Height reflect the true pixel footprint)
    const mW = mapImg.displayWidth;
    const mH = mapImg.displayHeight;
    const dotX = (this.player.x / WORLD_WIDTH) * mW - mW / 2;
    const dotY = (this.player.y / WORLD_HEIGHT) * mH - mH / 2;

    // Dot color matches player's crew color so it's easy to spot
    const colorName = (this.registry.get('playerColor') as string ?? 'Red').toLowerCase();
    const colorMap: Record<string, number> = {
      red: 0xff2222, blue: 0x4444ff, green: 0x22cc44, yellow: 0xffee22,
      purple: 0xaa44ff, orange: 0xff8800, pink: 0xff88cc, brown: 0x996633,
      black: 0x666666, white: 0xeeeeee, cyan: 0x22eeff, lime: 0x88ff44,
      maroon: 0x881111, rose: 0xff6688, banana: 0xffee88, coral: 0xff6644,
    };
    const dotColor = colorMap[colorName] ?? 0xff4444;
    const dot = this.add.arc(dotX, dotY, 8, 0, 360, false, dotColor)
      .setStrokeStyle(1.5, 0xffffff);

    // Task markers — a yellow "!" over every incomplete task's room, same
    // world→map coordinate transform as the player dot, so players can plan
    // a route instead of memorizing task locations.
    const markerObjs: Phaser.GameObjects.GameObject[] = [];
    const seenSpots = new Set<string>(); // dedupe overlapping task locations
    for (const task of this.tasks) {
      if (task.completed) continue;
      const spotKey = `${Math.round(task.x / 20)},${Math.round(task.y / 20)}`;
      if (seenSpots.has(spotKey)) continue;
      seenSpots.add(spotKey);

      const tx = (task.x / WORLD_WIDTH) * mW - mW / 2;
      const ty = (task.y / WORLD_HEIGHT) * mH - mH / 2;
      const marker = this.add.text(tx, ty, '!', {
        fontSize: '22px', color: '#ffee22', fontStyle: 'bold', fontFamily: 'Arial',
        stroke: '#664400', strokeThickness: 3,
      }).setOrigin(0.5);
      markerObjs.push(marker);

      // Gentle pulse so markers stay noticeable on a busy map
      this.tweens.add({
        targets: marker, scale: 1.25, duration: 500,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }

    // Close button — inside the overlay so it's always visible
    const closeBtn = this.add.text(W * 0.45, -H * 0.46, '✕ Close', {
      fontSize: '22px', color: '#fff', backgroundColor: '#333355',
      padding: { x: 10, y: 6 },
    }).setOrigin(1, 0).setInteractive();
    closeBtn.on('pointerdown', () => this.closeMiniMap());

    this.miniMapOverlay.add([bg, mapImg, ...markerObjs, dot, closeBtn]);
    this.cameras.main.ignore(this.miniMapOverlay);

    // Also close on tap anywhere on the overlay background
    bg.setInteractive();
    bg.on('pointerdown', () => this.closeMiniMap());

    this.input.keyboard!.once('keydown-M', () => this.closeMiniMap());
  }

  private closeMiniMap() {
    if (this.miniMapOverlay) {
      // Stop any pulsing task-marker tweens before destroying their targets
      this.tweens.killTweensOf(this.miniMapOverlay.list);
      this.miniMapOverlay.destroy();
    }
    this.miniMapOverlay = undefined;
  }

  shutdown() {
    // Stop ambient sounds
    for (const key of this.ambientPlaying) {
      this.sound.stopByKey(`amb_${key}`);
    }
    this.ambientPlaying.clear();

    // Clean up vent overlay if player quits while venting
    this.ventOverlay?.destroy();
    this.ventOverlay = undefined;
    this.isInVent = false;
    this.currentVentId = -1;

    // Detach the fog canvas hook (prevents stale draws after scene restart)
    this.uiCamera?.off('prerender', this.renderFogCanvas, this);
    this.fogCanvas = null;
    this.fogCtx    = null;

    // Multiplayer: tear down remote player sprites (their schema listeners
    // are torn down automatically by Colyseus when the room is left/disposed)
    for (const rp of this.remotePlayers.values()) rp.destroy();
    this.remotePlayers.clear();
  }
}
