import Phaser from 'phaser';
import { Player } from '../objects/Player';
import { Bot } from '../objects/Bot';
import {
  BOT_POS, ALL_COLORS, PLAYER_SPAWN, WORLD_WIDTH, WORLD_HEIGHT,
  INTERACT_RADIUS, KILL_RADIUS, REPORT_RADIUS, NO_OF_MISSIONS,
  AMBIENT_CENTRES, TASK_TITLES, CAMERA_ZOOM,
} from '../settings';
import type { TaskDef, BotData } from '../types';
import { parseTmx } from '../utils/TmxParser';
import { fitContain } from '../utils/imageFit';

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

  // --- ambient sounds ---
  private ambientPlaying: Set<string> = new Set();

  // --- interaction markers ---
  private interactZones: { obj: TaskDef | null; name: string; x: number; y: number; sprite?: Phaser.GameObjects.Sprite }[] = [];
  private emergencyPos = { x: 3257, y: 655 };
  // Sprites placed in the world for task interactables, keyed by objectName.
  // Used to swap textures: base / highlight (player nearby) / connected (done).
  private taskSprites = new Map<string, Phaser.GameObjects.Image>();

  // --- task list HUD ---
  private taskListRows: Phaser.GameObjects.Text[] = [];

  // --- task compass (one directional arrow per incomplete task) ---
  private selectedTaskId: string | null = null;
  private taskArrows: {
    task: TaskDef;
    container: Phaser.GameObjects.Container;
    icon: Phaser.GameObjects.Triangle;
  }[] = [];

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

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    const playerName  = this.registry.get('playerName')  as string ?? 'Crewmate';
    const playerColor = this.registry.get('playerColor') as string ?? 'Red';

    // ── Background world image ──
    const bg = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 'map_bg');
    bg.setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT);
    bg.setDepth(0);

    // ── Parse TMX for collision + objects ──
    const tmxText = this.cache.text.get('map_tmx') as string;
    const { walls: wallRects, objects: mapObjs } = parseTmx(tmxText);

    // ── Static walls ──
    this.walls = this.physics.add.staticGroup();
    for (const wr of wallRects) {
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

    // ── Bots ──
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

    // ── Player ──
    this.player = new Player(this, PLAYER_SPAWN.x, PLAYER_SPAWN.y, playerColor, playerName);
    this.playerWallCollider = this.physics.add.collider(this.player, this.walls);

    // Prevent bots from standing on top of the player
    for (const bot of this.bots) {
      this.physics.add.collider(this.player, bot);
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

    // ── Round start sound ──
    this.time.delayedCall(800, () => {
      this.sound.play('sfx_roundstart', { volume: 0.8 });
    });

    // ── Impostor kill AI timer ──
    this.time.addEvent({
      delay: 8000,
      callback: this.impostorAct,
      callbackScope: this,
      loop: true,
    });

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
    this.hud.add([bg, hdr]);

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

    this.cameras.main.ignore(hudObjects);
    const hudSet = new Set(hudObjects);
    this.uiCamera.ignore(this.children.list.filter((o) => !hudSet.has(o)));
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
    if (!this.player.isAlive || this.gameOver) return;
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
    if (this.killCooldown > 0) this.killCooldown -= delta;
    if (this.emergencyCooldown > 0) this.emergencyCooldown -= delta;

    // Player
    this.player.update(this.cursors, this.wasd, delta, this.joystickForce);

    // Bots
    for (const bot of this.bots) bot.update(delta);

    // Bot task completion — crew bots complete tasks they walk over, just like the player.
    // Without this, any game where the player dies before finishing all tasks is a deadlock:
    // tasks never complete, impostor can't achieve majority, game never ends.
    this.botCheckTasks();

    // Keyboard interactions
    if (Phaser.Input.Keyboard.JustDown(this.eKey)) this.tryInteract();
    if (Phaser.Input.Keyboard.JustDown(this.rKey)) this.tryReport();
    if (Phaser.Input.Keyboard.JustDown(this.mKey)) this.toggleMiniMap();

    // Nearby detection
    this.detectNearby();

    // Ambient sounds
    this.updateAmbient();

    // Update task bar
    this.updateTaskBar();

    // Update per-task directional compass arrows
    this.updateTaskArrows();

    // Win check
    this.checkWinConditions();
  }

  private detectNearby() {
    if (!this.player.isAlive) {
      this.interactPrompt.setVisible(false);
      this.nearbyTask = null;
      this.nearbyCorpse = null;
      return;
    }

    const px = this.player.x, py = this.player.y;
    let closest: { dist: number; task: TaskDef | null; corpse: Bot | null } = { dist: Infinity, task: null, corpse: null };

    // Check tasks
    for (const t of this.tasks) {
      if (t.completed) continue;
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

    // Prompt
    const nearEmergency = eDist < INTERACT_RADIUS * 1.5 && this.player.isAlive;
    if (this.nearbyTask) {
      this.interactPrompt
        .setText(`[E] ${this.nearbyTask.title}`)
        .setVisible(true);
    } else if (nearEmergency) {
      this.interactPrompt.setText('[E] Emergency Meeting').setVisible(true);
    } else if (this.nearbyCorpse) {
      this.interactPrompt.setText('[R] Report Body').setVisible(true);
    } else {
      this.interactPrompt.setVisible(false);
    }

    // Contextual action buttons — only show the ones that are actionable
    // right now, so the bottom-right thumb zone doesn't clutter the screen.
    this.useBtn.setVisible(!!this.nearbyTask || nearEmergency);
    this.reportBtn.setVisible(!!this.nearbyCorpse);
  }

  private tryInteract() {
    if (!this.player.isAlive || this.gameOver) return;

    if (this.nearbyTask) {
      this.openTask(this.nearbyTask);
      return;
    }

    // Emergency button
    const eDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.emergencyPos.x, this.emergencyPos.y);
    if (eDist < INTERACT_RADIUS * 1.5) {
      this.triggerEmergency(false);
    }
  }

  private tryReport() {
    if (!this.player.isAlive || this.gameOver) return;
    if (this.nearbyCorpse) this.triggerEmergency(true);
  }

  private openTask(task: TaskDef) {
    if (task.completed) return;
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
      // Immediately flip the world sprite to its "connected" state
      const sprite = this.taskSprites.get(t.objectName);
      const variants = TASK_SPRITE_VARIANTS[t.objectName];
      if (sprite && variants?.connected && this.textures.exists(variants.connected)) {
        sprite.setTexture(variants.connected);
      }
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

  private updateTaskBar() {
    const pct = NO_OF_MISSIONS > 0 ? this.tasksDone / NO_OF_MISSIONS : 0;
    this.taskBarFill.setSize(340 * pct, 23);
    this.taskLabel.setText(`Tasks: ${this.tasksDone} / ${NO_OF_MISSIONS}`);
  }

  // ────────────────── Meetings ──────────────────

  private triggerEmergency(isReport: boolean) {
    if (this.gameOver || this.emergencyCooldown > 0) return;
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

    // Overlay the kill cinematic (non-blocking — game logic already updated above)
    this.showKillAnimation();
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
      // Player is the closest target
      this.killPlayer();
      this.sound.play('sfx_kill', { volume: 0.6 });
      this.checkWinConditions();
      return;
    }

    if (target && minDist < 300) {
      target.die();
      this.sound.play('sfx_kill', { volume: 0.6 });
      // Check win after bot kill — previously missing, so impostor wiping all
      // crew bots wasn't detected until the player also died or a meeting fired.
      this.checkWinConditions();
    }
  }

  private attemptKill() {
    if (this.killCooldown > 0 || !this.player.isAlive || this.gameOver) return;
    // Player impostor mode (not used in Freeplay, future feature)
  }

  // ────────────────── Win Conditions ──────────────────

  private botCheckTasks() {
    for (const bot of this.bots) {
      if (!bot.isAlive || bot.isImpostor) continue;
      for (const task of this.tasks) {
        if (task.completed) continue;
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

  // ────────────────── Ambient ──────────────────

  private updateAmbient() {
    const px = this.player.x, py = this.player.y;
    for (const [key, centre] of Object.entries(AMBIENT_CENTRES)) {
      const d = Phaser.Math.Distance.Between(px, py, centre.x, centre.y);
      const sndKey = `amb_${key}`;
      if (!this.sound.get(sndKey)) continue;
      if (d <= centre.radius) {
        if (!this.ambientPlaying.has(key)) {
          this.sound.play(sndKey, { loop: true, volume: 0.25 });
          this.ambientPlaying.add(key);
        }
      } else {
        if (this.ambientPlaying.has(key)) {
          this.sound.stopByKey(sndKey);
          this.ambientPlaying.delete(key);
        }
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
  }
}
