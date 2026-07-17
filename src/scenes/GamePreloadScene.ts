/**
 * GamePreloadScene — loads all heavy game assets after the menu.
 *
 * Sprite strategy: load actual artwork from Assets/ for every color.
 *
 *   Full animation colors (18 down / 17 up,left,right walk frames + ghost): Red, Blue, Green, Orange, Yellow
 *   Single-frame colors (1 walk frame, no ghost):   Black, Brown, Pink, Purple, White
 *
 * Texture key conventions (same as the rest of the codebase):
 *   walk  → "${lc}_${dir}_${f}"   e.g. "blue_down_1"
 *   ghost → "${lc}_ghost_1" / "${lc}_ghost_2"
 *   dead  → "dead_${lc}"          e.g. "dead_blue"
 */
import Phaser from 'phaser';
import { fixRedSprite } from '../utils/SpriteRecolor';

const WALK_DIRS = ['down', 'left', 'right', 'up'] as const;

/**
 * Number of walk frames available per direction for FULL_COLORS.
 * The "down" walk cycle has 18 frames; "up"/"left"/"right" only have 17 —
 * this is how the source artwork is laid out, not a missing-asset bug.
 */
const FRAME_COUNT: Record<typeof WALK_DIRS[number], number> = {
  down: 18, left: 17, right: 17, up: 17,
};

/** Colors that have 18 walk frames and ghost sprites in Assets/. */
const FULL_COLORS  = ['red', 'blue', 'green', 'orange', 'yellow'] as const;
/** Colors that have only 1 walk frame and no ghost sprite in Assets/. */
const BASIC_COLORS = ['black', 'brown', 'pink', 'purple', 'white'] as const;
const ALL_COLORS   = [...FULL_COLORS, ...BASIC_COLORS] as const;

/** Capitalises the first letter to match the Asset folder names (e.g. "blue" → "Blue"). */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export class GamePreloadScene extends Phaser.Scene {
  private barFill!: Phaser.GameObjects.Rectangle;
  private pctText!: Phaser.GameObjects.Text;

  constructor() { super({ key: 'GamePreloadScene' }); }

  preload() {
    const { width: W, height: H } = this.scale;
    const fastMode = !!this.registry.get('fastMode');

    // ── Fast mode: load only essentials for a gameplay screenshot ──
    // No audio loaded — visual-only preview. All bot color textures are
    // stubbed as 1×1 transparent canvases so GameScene doesn't crash on
    // missing animations when bots spawn with non-Blue colours.
    if (fastMode) {
      this.load.image('map_bg',  'Assets/Maps/map2back.png');
      this.load.text('map_tmx',  'Assets/Maps/map_final.backv2.tmx');
      this.load.image('minimap', 'Assets/Maps/mini_map3.png');
      for (const dir of WALK_DIRS) {
        for (let f = 1; f <= FRAME_COUNT[dir as keyof typeof FRAME_COUNT]; f++) {
          this.load.image(`blue_${dir}_${f}`, `Assets/Images/Player/Blue/blue_${dir}_walk/step${f}.png`);
        }
      }
      this.load.image('blue_ghost_1', 'Assets/Images/Player/Blue/blue_ghost/step1_left.png');
      this.load.image('blue_ghost_2', 'Assets/Images/Player/Blue/blue_ghost/step1_right.png');
      this.load.image('dead_blue', 'Assets/Images/Player/Dead/Deadblue.png');
      this.load.image('light_mask', 'Assets/Images/Environment/light_350_med.png');
      this.load.image('ui_map_button',     'Assets/Images/UI/map_button.png');
      this.load.image('ui_kill_icon',      'Assets/Images/UI/kill_icon.png');
      this.load.image('ui_kill_icon_dim',  'Assets/Images/UI/kill_icon_dim.png');
      this.load.image('ui_emergency_icon', 'Assets/Images/UI/emergency_icon.png');
      this.load.image('ui_emergency_dim',  'Assets/Images/UI/emergency_icon_dim.png');
      this.load.image('ui_sabotage_icon',  'Assets/Images/UI/sabotage_icon.png');
      this.load.image('ui_sabotage_dim',   'Assets/Images/UI/sabotage_icon_dim.png');
      this.load.image('ui_close',          'Assets/Images/UI/close.PNG');
      // NO audio in fast mode — shaves ~800 KB and avoids the last-percent stall
      // that prevented the screenshot tool from capturing actual gameplay.
      return;
    }

    // ── Purge stale player textures from cache ────────────────────
    // If a previous game session used runtime recoloring, Phaser's in-memory
    // texture cache may still hold those canvas textures under the same keys.
    // load.image() silently skips keys that already exist, so we must remove
    // them first to guarantee the real asset files are loaded.
    const keysToEvict: string[] = [];
    for (const lc of FULL_COLORS) {
      for (const dir of WALK_DIRS) {
        for (let f = 1; f <= FRAME_COUNT[dir]; f++) keysToEvict.push(`${lc}_${dir}_${f}`);
      }
      keysToEvict.push(`${lc}_ghost_1`, `${lc}_ghost_2`);
    }
    for (const lc of BASIC_COLORS) {
      for (const dir of WALK_DIRS) keysToEvict.push(`${lc}_${dir}_1`);
    }
    for (const lc of ALL_COLORS) keysToEvict.push(`dead_${lc}`);
    for (const key of keysToEvict) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }

    // ── In-game loading bar ──────────────────────────────────────
    this.add.rectangle(W / 2, H / 2 - 60, W * 0.6, 40, 0x222244).setStrokeStyle(2, 0x6666cc);
    this.add.rectangle(W / 2, H / 2 - 60, W * 0.6 - 4, 36, 0x111133);
    this.barFill = this.add.rectangle(
      W / 2 - (W * 0.6 - 4) / 2, H / 2 - 60,
      0, 36, 0x44aaff,
    ).setOrigin(0, 0.5);
    this.pctText = this.add.text(W / 2, H / 2 - 10, 'Loading game assets… 0%', {
      fontSize: '18px', color: '#aaaacc', fontFamily: 'Arial',
    }).setOrigin(0.5);
    this.add.text(W / 2, H / 2 - 110, 'AMONG GAS', {
      fontSize: '36px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.load.on('progress', (v: number) => {
      this.barFill.width = (W * 0.6 - 4) * v;
      this.pctText.setText(`Loading game assets… ${Math.round(v * 100)}%`);
    });

    // ── World map ─────────────────────────────────────────────────
    this.load.image('map_bg',  'Assets/Maps/map2back.png');
    this.load.text('map_tmx',  'Assets/Maps/map_final.backv2.tmx');
    this.load.image('minimap', 'Assets/Maps/mini_map3.png');

    // ── Player walk sprites ───────────────────────────────────────
    // Full-animation colors: 18 frames × 4 directions
    for (const lc of FULL_COLORS) {
      const C = cap(lc);
      for (const dir of WALK_DIRS) {
        for (let f = 1; f <= FRAME_COUNT[dir]; f++) {
          this.load.image(
            `${lc}_${dir}_${f}`,
            `Assets/Images/Player/${C}/${lc}_${dir}_walk/step${f}.png`,
          );
        }
      }
      // Ghost frames
      this.load.image(`${lc}_ghost_1`, `Assets/Images/Player/${C}/${lc}_ghost/step1_left.png`);
      this.load.image(`${lc}_ghost_2`, `Assets/Images/Player/${C}/${lc}_ghost/step1_right.png`);
    }

    // Basic colors: 1 frame × 4 directions (same frame reused across animation)
    for (const lc of BASIC_COLORS) {
      const C = cap(lc);
      for (const dir of WALK_DIRS) {
        this.load.image(
          `${lc}_${dir}_1`,
          `Assets/Images/Player/${C}/${lc}_${dir}_walk/step1.png`,
        );
      }
    }

    // ── Dead body sprites ─────────────────────────────────────────
    for (const lc of ALL_COLORS) {
      this.load.image(`dead_${lc}`, `Assets/Images/Player/Dead/Dead${lc}.png`);
    }

    // Kill animation frames
    for (let i = 1; i <= 3; i++) {
      this.load.image(`kill_anim_${i}`, `Assets/Images/Player/Kills/kill${i}.png`);
    }

    // ── Alert images ─────────────────────────────────────────────
    this.load.image('alert_victory', 'Assets/Images/Alerts/victory.png');
    this.load.image('alert_defeat',  'Assets/Images/Alerts/defeat.png');
    this.load.image('alert_eject',   'Assets/Images/Alerts/eject.png');
    const repExt: Record<string, string> = {
      blue: '.PNG', green: '.png', orange: '.png', red: '.PNG', yellow: '.png',
    };
    for (const c of ['blue', 'green', 'orange', 'red', 'yellow']) {
      this.load.image(`alert_meeting_${c}`, `Assets/Images/Alerts/emergency_meeting_${c}.png`);
      this.load.image(`alert_report_${c}`,  `Assets/Images/Alerts/report_dead_body_${c}${repExt[c]}`);
    }
    for (let i = 1; i <= 18; i++) {
      this.load.image(`kill_banner_${i}`, `Assets/Images/Alerts/kill${i}.png`);
    }

    // ── Items / interactables ────────────────────────────────────
    for (const it of [
      'electricity_wires', 'electricity_wires_highlight', 'electricity_wires_connected',
      'wifi', 'wifi_highlight', 'wifi_connected',
      'security_monitor', 'security_monitor_highlight',
      'lower_engine', 'lower_engine_highlight', 'upper_engine', 'upper_engine_highlight',
      'generator', 'generator_highlight',
      'gas_can_highlighted', 'fuel_engine_highlighted',
      'power_divert', 'power_divert_highlight',
      'ventilation', 'emergency_icon', 'emergency_icon_inv', 'emergency_icon_bright',
      'admin_control1_highlight', 'admin_control2_highlight',
    ]) { this.load.image(it, `Assets/Images/Items/${it}.png`); }

    for (const it of [
      'cafeteria_comp', 'emergency_button', 'emergency_button_highlight',
      'nav', 'navigation', 'navigation_highlight', 'navigation_stable',
      'reactor_btn', 'reactor_btn_highlight',
      'admin_control1', 'admin_control2',
      'garbage_liver', 'garbage_liver_highlight',
      'gas_can', 'fuel_engine', 'power_diverted',
    ]) { this.load.image(it, `Assets/Images/Items/${it}.PNG`); }

    // ── UI ───────────────────────────────────────────────────────
    this.load.image('ui_map_button',     'Assets/Images/UI/map_button.png');
    this.load.image('ui_kill_icon',      'Assets/Images/UI/kill_icon.png');
    this.load.image('ui_kill_icon_dim',  'Assets/Images/UI/kill_icon_dim.png');
    this.load.image('ui_emergency_icon', 'Assets/Images/UI/emergency_icon.png');
    this.load.image('ui_emergency_dim',  'Assets/Images/UI/emergency_icon_dim.png');
    this.load.image('ui_sabotage_icon',  'Assets/Images/UI/sabotage_icon.png');
    this.load.image('ui_sabotage_dim',   'Assets/Images/UI/sabotage_icon_dim.png');
    this.load.image('ui_light_icon',     'Assets/Images/UI/light_bulb_icon.png');
    this.load.image('ui_light_icon_dim', 'Assets/Images/UI/light_bulb_icon_dim.png');
    this.load.image('ui_close',          'Assets/Images/UI/close.PNG');

    // ── Meeting UI ───────────────────────────────────────────────
    this.load.image('meeting_chat',      'Assets/Images/Meeting/chat.png');
    this.load.image('meeting_chat_dead', 'Assets/Images/Meeting/chat_dead.png');
    this.load.image('meeting_vote_base', 'Assets/Images/Meeting/e_vote_base.png');
    this.load.image('meeting_vote_dead', 'Assets/Images/Meeting/e_vote_base_dead.png');
    this.load.image('meeting_checkbox',  'Assets/Images/Meeting/checkbox.png');
    this.load.image('meeting_select',    'Assets/Images/Meeting/select_vote.png');
    this.load.image('meeting_skip',      'Assets/Images/Meeting/skip_vote.png');
    this.load.image('meeting_voted',     'Assets/Images/Meeting/voted_players.PNG');
    this.load.image('meeting_proceed',   'Assets/Images/Meeting/proceed.PNG');

    // ── Task panels ──────────────────────────────────────────────
    this.load.image('task_wiring_base', 'Assets/Images/Tasks/Fix Wiring/electricity_wire_base1.png');
    this.load.image('task_wiring_btn',  'Assets/Images/Tasks/Fix Wiring/electricity_wire_btn.png');
    this.load.image('task_wiring_close','Assets/Images/Tasks/Fix Wiring/close.PNG');
    for (const c of ['blue', 'pink', 'red', 'yellow']) {
      this.load.image(`task_wire_${c}`, `Assets/Images/Tasks/Fix Wiring/${c}_wire.png`);
    }
    this.load.image('task_nav_base',   'Assets/Images/Tasks/Stabilize Steering/stabilizer_base.PNG');
    this.load.image('task_nav_target', 'Assets/Images/Tasks/Stabilize Steering/nav_stabilize_target.png');
    this.load.image('task_nav_center', 'Assets/Images/Tasks/Stabilize Steering/target_center.png');
    this.load.image('task_nav_close',  'Assets/Images/Tasks/Stabilize Steering/close.PNG');
    this.load.image('task_wifi_bg',    'Assets/Images/Tasks/Reboot Wifi/panel_wifi_bg.png');
    this.load.image('task_wifi_lever', 'Assets/Images/Tasks/Reboot Wifi/panel_wifi-lever.png');
    this.load.image('task_wifi_on',    'Assets/Images/Tasks/Reboot Wifi/wifi_on.png');
    this.load.image('task_wifi_close', 'Assets/Images/Tasks/Reboot Wifi/close.PNG');
    this.load.image('task_fuel_base',  'Assets/Images/Tasks/Fuel Engines/fuel_engines_base.png');
    this.load.image('task_fuel_btn',   'Assets/Images/Tasks/Fuel Engines/engineFuel_Button.png');
    this.load.image('task_fuel_can',   'Assets/Images/Tasks/Fuel Engines/gas_can.png');
    this.load.image('task_fuel_close', 'Assets/Images/Tasks/Fuel Engines/close.PNG');
    this.load.image('task_reactor_base1', 'Assets/Images/Tasks/Start Reactor/reactor_base1.PNG');
    this.load.image('task_reactor_base2', 'Assets/Images/Tasks/Start Reactor/reactor_base2.png');
    this.load.image('task_reactor_base3', 'Assets/Images/Tasks/Start Reactor/reactor_base3.png');
    for (const n of [0, 2, 4, 6, 8]) {
      this.load.image(`task_reactor_${n}`, `Assets/Images/Tasks/Start Reactor/reactor_${n}.png`);
    }
    this.load.image('task_reactor_close', 'Assets/Images/Tasks/Start Reactor/close.PNG');
    this.load.image('task_align_close',    'Assets/Images/Tasks/Align Engine Output/close.PNG');
    this.load.image('task_align_base',     'Assets/Images/Tasks/Align Engine Output/engineAlign_base.png');
    this.load.image('task_align_liver',    'Assets/Images/Tasks/Align Engine Output/engine_liver.png');
    this.load.image('task_align_position', 'Assets/Images/Tasks/Align Engine Output/alignment_position.png');
    this.load.image('task_garbage_close',      'Assets/Images/Tasks/Empty Garbage/close.PNG');
    this.load.image('task_garbage_full',       'Assets/Images/Tasks/Empty Garbage/garbage_base_full.PNG');
    this.load.image('task_garbage_empty',      'Assets/Images/Tasks/Empty Garbage/garbage_base_empty.PNG');
    this.load.image('task_garbage_liver_up',   'Assets/Images/Tasks/Empty Garbage/liver_up.PNG');
    this.load.image('task_garbage_liver_down', 'Assets/Images/Tasks/Empty Garbage/liver_down.PNG');
    this.load.image('task_garbage_gb2',        'Assets/Images/Tasks/Empty Garbage/gb2.png');
    this.load.image('task_garbage_gb3',        'Assets/Images/Tasks/Empty Garbage/gb3.png');
    this.load.image('task_garbage_gb4',        'Assets/Images/Tasks/Empty Garbage/gb4.png');
    this.load.image('task_asteroids_ship',  'Assets/Images/Tasks/Clear Asteroids/starship.png');
    this.load.image('task_asteroids_ship2', 'Assets/Images/Tasks/Clear Asteroids/starship2.png');
    this.load.image('task_asteroids_ship3', 'Assets/Images/Tasks/Clear Asteroids/starship3.png');
    this.load.image('task_space_bg',        'Assets/Images/Tasks/Clear Asteroids/space.jpg');
    this.load.image('task_asteroid_1',      'Assets/Images/Tasks/Clear Asteroids/asteroid1.png');
    this.load.image('task_asteroid_2',      'Assets/Images/Tasks/Clear Asteroids/asteroid2.png');
    this.load.image('task_asteroid_3',      'Assets/Images/Tasks/Clear Asteroids/asteroid3.png');
    this.load.image('task_asteroid_4',      'Assets/Images/Tasks/Clear Asteroids/asteroid4.png');
    this.load.image('task_laser',           'Assets/Images/Tasks/Clear Asteroids/laser.png');

    // ── Environment ──────────────────────────────────────────────
    this.load.image('light_mask', 'Assets/Images/Environment/light_350_med.png');

    // ── Audio ─────────────────────────────────────────────────────
    this.load.audio('sfx_roundstart',   'Assets/Sounds/General/roundstart.wav');
    this.load.audio('sfx_emergency',    'Assets/Sounds/General/alarm_emergencymeeting.wav');
    this.load.audio('sfx_report',       'Assets/Sounds/General/report_Bodyfound.wav');
    this.load.audio('sfx_task_done',    'Assets/Sounds/General/task_complete.wav');
    this.load.audio('sfx_victory_crew', 'Assets/Sounds/General/victory_crew.wav');
    this.load.audio('sfx_victory_imp',  'Assets/Sounds/General/victory_impostor.wav');
    this.load.audio('sfx_vent',             'Assets/Sounds/General/vent.wav');
    this.load.audio('sfx_kill',             'Assets/Sounds/Kill/imposter_kill.wav');
    this.load.audio('sfx_kill_victim',      'Assets/Sounds/Kill/imposter_kill_victim.wav');
    this.load.audio('sfx_kill_cooldown',    'Assets/Sounds/Kill/imposter_kill_cooldown.wav');
    for (let i = 1; i <= 8; i++) {
      this.load.audio(`sfx_step_${i}`, `Assets/Sounds/Footsteps/Footstep0${i}.wav`);
    }

    // Room ambience sounds are lazy-loaded on first zone entry in GameScene
    // to avoid adding ~16 MB to the initial preload barrier.
  }

  create() {
    // ── Fix Red sprites: replace blue backpack + green visor ──────
    // Red's artwork is inconsistent with all other colors (blue backpack,
    // green visor). Apply fixRedSprite to every Red texture so it looks
    // like the rest of the cast: solid red body + white/grey visor.
    const RED_WALK_KEYS: string[] = [];
    for (const dir of WALK_DIRS) {
      for (let f = 1; f <= FRAME_COUNT[dir]; f++) RED_WALK_KEYS.push(`red_${dir}_${f}`);
    }
    RED_WALK_KEYS.push('red_ghost_1', 'red_ghost_2', 'dead_red');

    for (const key of RED_WALK_KEYS) {
      if (!this.textures.exists(key)) continue;
      const src = (this.textures.get(key).source[0] as unknown as { image: HTMLImageElement }).image;
      if (!src) continue;
      const fixed = fixRedSprite(src);
      this.textures.remove(key);
      this.textures.addCanvas(key, fixed);
    }

    // ── Build walk + idle animations for all colors ───────────────
    for (const lc of FULL_COLORS) {
      for (const dir of WALK_DIRS) {
        const frames = [];
        for (let f = 1; f <= FRAME_COUNT[dir]; f++) {
          const key = `${lc}_${dir}_${f}`;
          if (this.textures.exists(key)) frames.push({ key });
        }
        if (frames.length === 0) continue;
        try {
          this.anims.create({ key: `${lc}_walk_${dir}`, frames, frameRate: 40, repeat: -1 });
          this.anims.create({ key: `${lc}_idle_${dir}`, frames: [frames[0]], frameRate: 1, repeat: 0 });
        } catch (_) {}
      }
    }

    for (const lc of BASIC_COLORS) {
      for (const dir of WALK_DIRS) {
        const key = `${lc}_${dir}_1`;
        if (!this.textures.exists(key)) continue;
        const frame = [{ key }];
        try {
          this.anims.create({ key: `${lc}_walk_${dir}`, frames: frame, frameRate: 1, repeat: -1 });
          this.anims.create({ key: `${lc}_idle_${dir}`, frames: frame, frameRate: 1, repeat: 0 });
        } catch (_) {}
      }
    }

    // ── Kill animation (3-frame sprite walk) ─────────────────────
    const killFrames = [1, 2, 3]
      .map(i => `kill_anim_${i}`)
      .filter(k => this.textures.exists(k))
      .map(key => ({ key }));
    if (killFrames.length > 0) {
      try { this.anims.create({ key: 'kill_anim', frames: killFrames, frameRate: 8, repeat: 0 }); }
      catch (_) {}
    }

    // ── Kill banner cinematic (18-frame screen overlay) ───────────
    const bannerFrames = Array.from({ length: 18 }, (_, i) => `kill_banner_${i + 1}`)
      .filter(k => this.textures.exists(k))
      .map(key => ({ key }));
    if (bannerFrames.length > 0) {
      try { this.anims.create({ key: 'kill_banner', frames: bannerFrames, frameRate: 12, repeat: 0 }); }
      catch (_) {}
    }

    this.scene.start('GameScene');

    // Keep the network busy so networkidle doesn't fire until the game has
    // rendered frames and the canvas capture has been taken.
    // Triggered by ?debugNoFog OR by any ?autoplay=… mode.
    const isScreenshotMode =
      new URLSearchParams(window.location.search).get('debugNoFog') !== null ||
      (this.registry.get('autoplay') !== undefined && this.registry.get('autoplay') !== null && this.registry.get('autoplay') !== '');
    if (isScreenshotMode) {
      // Fire the long-poll hold IMMEDIATELY (delay=0) so the network is still
      // "busy" when the last asset-load request completes — this prevents the
      // Screenshot tool's networkidle timer from firing too early.
      // /dev/ping-hold waits 10 s then responds, giving the game time to render.
      fetch('/dev/ping-hold').catch(() => {});
    }
  }
}
