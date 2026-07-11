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

export class GameScene extends Phaser.Scene {
  // --- sprites ---
  public player!: Player;
  public bots: Bot[] = [];

  // --- physics ---
  private walls!: Phaser.Physics.Arcade.StaticGroup;

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
  private emergencyBtn!: Phaser.GameObjects.Text;
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
    this.physics.add.collider(this.player, this.walls);

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
      }
    }
  }

  // ────────────────── HUD ──────────────────

  private buildHUD() {
    const { width: W, height: H } = this.scale;
    this.hud = this.add.container(0, 0).setScrollFactor(0).setDepth(100);

    // Task progress bar background — shifted down by safe-area top inset
    const barY = 12 + this.safeTop;
    const barBg = this.add.rectangle(W / 2, barY, 300, 18, 0x333333).setOrigin(0.5, 0);
    const barBorder = this.add.rectangle(W / 2, barY, 302, 20, 0x888888).setOrigin(0.5, 0).setFillStyle(0x000000, 0).setStrokeStyle(1, 0xaaaaaa);
    this.taskBarFill = this.add.rectangle(W / 2 - 150, barY, 0, 18, 0x00dd66).setOrigin(0, 0);
    this.taskLabel = this.add.text(W / 2, barY + 23, `Tasks: 0 / ${NO_OF_MISSIONS}`, {
      fontSize: '14px', color: '#fff', stroke: '#000', strokeThickness: 3, fontFamily: 'Arial',
    }).setOrigin(0.5, 0);
    this.hud.add([barBg, barBorder, this.taskBarFill, this.taskLabel]);

    // Interact prompt — sits just above the action button stack so it never
    // overlaps a thumb resting on the buttons below it.
    this.interactPrompt = this.add.text(W / 2, H - 210 - this.safeBot, '', {
      fontSize: '18px', color: '#ffff00', stroke: '#000', strokeThickness: 4, fontFamily: 'Arial',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101).setVisible(false);

    // Emergency meeting button — top-left, shifted down by safe-area inset.
    this.emergencyBtn = this.add.text(16, 64 + this.safeTop, '🚨 MEETING', {
      fontSize: '14px', color: '#ff4444', backgroundColor: '#22000099',
      padding: { x: 10, y: 8 }, fontFamily: 'Arial', align: 'center',
    }).setScrollFactor(0).setDepth(101).setInteractive({ useHandCursor: true });
    this.emergencyBtn.on('pointerdown', () => this.triggerEmergency(false));

    // Mini-map button (top-right) — shifted down by safe-area inset.
    this.miniMapBtn = this.add.image(W - 48, 48 + this.safeTop, 'ui_map_button')
      .setScrollFactor(0).setDepth(101).setDisplaySize(56, 56)
      .setInteractive({ useHandCursor: true });
    this.miniMapBtn.on('pointerdown', () => {
      this.sound.play('sfx_map_click', { volume: 0.5 });
      this.toggleMiniMap();
    });

    // ── Contextual action buttons — bottom-left, stacked vertically
    // (joystick moved to right, so actions live on the left).
    // Shifted up by safe-area bottom inset so they clear the home bar.
    const actionX = 60;
    const sb = this.safeBot;
    this.killBtn = this.buildActionButton(actionX, H - 300 - sb, 46, 0xff2222, '🔪', () => this.attemptKill());
    this.killBtn.setVisible(false);

    this.reportBtn = this.buildActionButton(actionX, H - 180 - sb, 46, 0xff8888, '🚩', () => this.tryReport());
    this.reportBtn.setVisible(false);

    this.useBtn = this.buildActionButton(actionX, H - 60 - sb, 52, 0x88ff88, '✋', () => this.tryInteract());
    this.useBtn.setVisible(false);
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

  /** A large circular touch button used for the bottom-right action stack. */
  private buildActionButton(
    x: number, y: number, radius: number, color: number, label: string, onTap: () => void,
  ): Phaser.GameObjects.Container {
    const circle = this.add.arc(0, 0, radius, 0, 360, false, 0x000000, 0.55)
      .setStrokeStyle(2, color, 0.9);
    const icon = this.add.text(0, 0, label, { fontSize: `${Math.round(radius * 0.9)}px` }).setOrigin(0.5);
    const hitArea = new Phaser.Geom.Circle(0, 0, radius);
    const container = this.add.container(x, y, [circle, icon])
      .setScrollFactor(0).setDepth(101)
      .setSize(radius * 2, radius * 2)
      .setInteractive(hitArea, Phaser.Geom.Circle.Contains);
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
    const W = this.scale.width, H = this.scale.height;
    const actionX = 60;   // mirrored to left side with joystick on right
    const sb = this.safeBot;
    const tapR = 68; // generous finger radius

    if (this.useBtn.visible) {
      const uy = H - 60 - sb;
      if (Phaser.Math.Distance.Between(px, py, actionX, uy) < tapR) {
        this.tryInteract();
        return;
      }
    }
    if (this.reportBtn.visible) {
      const ry = H - 180 - sb;
      if (Phaser.Math.Distance.Between(px, py, actionX, ry) < tapR) {
        this.tryReport();
        return;
      }
    }
    if (this.killBtn.visible) {
      const ky = H - 300 - sb;
      if (Phaser.Math.Distance.Between(px, py, actionX, ky) < tapR) {
        this.attemptKill();
        return;
      }
    }
    // Top-left: emergency button fallback
    const emergBtnY = 64 + this.safeTop + 20; // approximate center of button
    if (px < 160 && py < emergBtnY + 40 && py > 40) {
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
    }
    this.scene.resume('GameScene');
  }

  private updateTaskBar() {
    const { width: W } = this.scale;
    const pct = NO_OF_MISSIONS > 0 ? this.tasksDone / NO_OF_MISSIONS : 0;
    this.taskBarFill.setSize(300 * pct, 18);
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

    const bot = this.bots.find(b => b.botId === ejectedId);
    if (bot) {
      bot.die();
      const wasImp = bot.isImpostor;
      const { width: W, height: H } = this.scale;
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

  // ────────────────── Impostor AI ──────────────────

  private impostorAct() {
    if (this.gameOver) return;
    const imp = this.bots.find(b => b.isImpostor && b.isAlive);
    if (!imp) return;

    // Target nearest alive victim
    let minDist = Infinity, target: Bot | null = null;
    for (const bot of this.bots) {
      if (!bot.isAlive || bot.isImpostor) continue;
      const d = Phaser.Math.Distance.Between(imp.x, imp.y, bot.x, bot.y);
      if (d < minDist) { minDist = d; target = bot; }
    }

    if (target && minDist < 300) {
      target.die();
      this.sound.play('sfx_kill', { volume: 0.6 });
    }
  }

  private attemptKill() {
    if (this.killCooldown > 0 || !this.player.isAlive || this.gameOver) return;
    // Player impostor mode (not used in Freeplay, future feature)
  }

  // ────────────────── Win Conditions ──────────────────

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

    // Close button — inside the overlay so it's always visible
    const closeBtn = this.add.text(W * 0.45, -H * 0.46, '✕ Close', {
      fontSize: '22px', color: '#fff', backgroundColor: '#333355',
      padding: { x: 10, y: 6 },
    }).setOrigin(1, 0).setInteractive();
    closeBtn.on('pointerdown', () => this.closeMiniMap());

    this.miniMapOverlay.add([bg, mapImg, dot, closeBtn]);
    this.cameras.main.ignore(this.miniMapOverlay);

    // Also close on tap anywhere on the overlay background
    bg.setInteractive();
    bg.on('pointerdown', () => this.closeMiniMap());

    this.input.keyboard!.once('keydown-M', () => this.closeMiniMap());
  }

  private closeMiniMap() {
    this.miniMapOverlay?.destroy();
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
