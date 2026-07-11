/**
 * GamePreloadScene — loads all heavy game assets after the menu.
 * Shown when the player taps Freeplay/Local. Streams ~20 MB then
 * builds animations and launches GameScene.
 *
 * Ambience (31 MB) is deliberately excluded; rooms load ambient
 * audio lazily inside GameScene if/when they are implemented.
 */
import Phaser from 'phaser';
import { ALL_COLORS } from '../settings';

const WALK_DIRS = ['down', 'left', 'right', 'up'] as const;
const FULL_ANIM_COLORS = new Set(['Blue', 'Green', 'Orange', 'Red', 'Yellow']);

function dirFrameCount(color: string): number {
  return FULL_ANIM_COLORS.has(color) ? 17 : 1;
}

export class GamePreloadScene extends Phaser.Scene {
  private barBg!: Phaser.GameObjects.Rectangle;
  private barFill!: Phaser.GameObjects.Rectangle;
  private pctText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'GamePreloadScene' });
  }

  preload() {
    const { width: W, height: H } = this.scale;

    // ── In-game loading bar ──────────────────────────────────────
    this.add.rectangle(W / 2, H / 2 - 60, W * 0.6, 40, 0x222244).setStrokeStyle(2, 0x6666cc);
    this.barBg   = this.add.rectangle(W / 2, H / 2 - 60, W * 0.6 - 4, 36, 0x111133);
    this.barFill = this.add.rectangle(W / 2 - (W * 0.6 - 4) / 2, H / 2 - 60, 0, 36, 0x44aaff).setOrigin(0, 0.5);
    this.pctText = this.add.text(W / 2, H / 2 - 10, 'Loading game assets… 0%', {
      fontSize: '18px', color: '#aaaacc', fontFamily: 'Arial',
    }).setOrigin(0.5);
    this.add.text(W / 2, H / 2 - 110, 'AMONG GAS', {
      fontSize: '36px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.load.on('progress', (v: number) => {
      const fullW = W * 0.6 - 4;
      this.barFill.width = fullW * v;
      this.pctText.setText(`Loading game assets… ${Math.round(v * 100)}%`);
    });

    // ── World map ─────────────────────────────────────────────────
    this.load.image('map_bg',  'Assets/Maps/map2back.png');
    this.load.text('map_tmx',  'Assets/Maps/map_final.backv2.tmx');
    this.load.image('minimap', 'Assets/Maps/mini_map3.png');

    // ── Player sprites ───────────────────────────────────────────
    for (const color of ALL_COLORS) {
      const lc = color.toLowerCase();
      for (const dir of WALK_DIRS) {
        const frames = dirFrameCount(color);
        for (let f = 1; f <= frames; f++) {
          this.load.image(`${lc}_${dir}_${f}`,
            `Assets/Images/Player/${color}/${lc}_${dir}_walk/step${f}.png`);
        }
      }
      if (FULL_ANIM_COLORS.has(color)) {
        const gd = `Assets/Images/Player/${color}/${lc}_ghost`;
        this.load.image(`${lc}_ghost_1`, `${gd}/step1_left.png`);
        this.load.image(`${lc}_ghost_2`, `${gd}/step1_right.png`);
      }
      // Dead sprites (missing in repo — will fallback to walk frame in GameScene)
      this.load.image(`dead_${lc}`, `Assets/Images/Player/Dead/dead_${lc}.png`);
    }

    // Kill animation frames
    for (let i = 1; i <= 3; i++) {
      this.load.image(`kill_anim_${i}`, `Assets/Images/Player/Kills/kill${i}.png`);
    }

    // ── Alert images ─────────────────────────────────────────────
    this.load.image('alert_victory', 'Assets/Images/Alerts/victory.png');
    this.load.image('alert_defeat',  'Assets/Images/Alerts/defeat.png');
    this.load.image('alert_eject',   'Assets/Images/Alerts/eject.png');
    const repExt: Record<string,string> = { blue:'.PNG', green:'.png', orange:'.png', red:'.PNG', yellow:'.png' };
    for (const c of ['blue','green','orange','red','yellow']) {
      this.load.image(`alert_meeting_${c}`, `Assets/Images/Alerts/emergency_meeting_${c}.png`);
      this.load.image(`alert_report_${c}`,  `Assets/Images/Alerts/report_dead_body_${c}${repExt[c]}`);
    }
    for (let i = 1; i <= 18; i++) {
      this.load.image(`kill_banner_${i}`, `Assets/Images/Alerts/kill${i}.png`);
    }

    // ── Items / interactables ────────────────────────────────────
    for (const it of [
      'electricity_wires','electricity_wires_highlight','electricity_wires_connected',
      'wifi','wifi_highlight','wifi_connected',
      'security_monitor','security_monitor_highlight',
      'lower_engine','lower_engine_highlight','upper_engine','upper_engine_highlight',
      'generator','generator_highlight',
      'gas_can_highlighted','fuel_engine_highlighted',
      'power_divert','power_divert_highlight',
      'ventilation','emergency_icon','emergency_icon_inv','emergency_icon_bright',
      'admin_control1_highlight','admin_control2_highlight',
    ]) { this.load.image(it, `Assets/Images/Items/${it}.png`); }

    for (const it of [
      'cafeteria_comp','emergency_button','emergency_button_highlight',
      'nav','navigation','navigation_highlight','navigation_stable',
      'reactor_btn','reactor_btn_highlight',
      'admin_control1','admin_control2',
      'garbage_liver','garbage_liver_highlight',
      'gas_can','fuel_engine','power_diverted',
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
    for (const c of ['blue','pink','red','yellow']) {
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
    this.load.image('task_reactor_base1','Assets/Images/Tasks/Start Reactor/reactor_base1.PNG');
    this.load.image('task_reactor_base2','Assets/Images/Tasks/Start Reactor/reactor_base2.png');
    this.load.image('task_reactor_base3','Assets/Images/Tasks/Start Reactor/reactor_base3.png');
    for (const n of [0,2,4,6,8]) {
      this.load.image(`task_reactor_${n}`, `Assets/Images/Tasks/Start Reactor/reactor_${n}.png`);
    }
    this.load.image('task_reactor_close','Assets/Images/Tasks/Start Reactor/close.PNG');
    this.load.image('task_align_close',  'Assets/Images/Tasks/Align Engine Output/close.PNG');
    this.load.image('task_garbage_close','Assets/Images/Tasks/Empty Garbage/close.PNG');
    this.load.image('task_asteroids_ship', 'Assets/Images/Tasks/Clear Asteroids/starship.png');
    this.load.image('task_asteroids_ship2','Assets/Images/Tasks/Clear Asteroids/starship2.png');
    this.load.image('task_asteroids_ship3','Assets/Images/Tasks/Clear Asteroids/starship3.png');

    // ── Environment ──────────────────────────────────────────────
    this.load.image('light_mask', 'Assets/Images/Environment/light_350_med.png');

    // ── Audio (essential only — skip 31 MB ambience) ─────────────
    // General game sounds (~8 MB)
    this.load.audio('sfx_roundstart',   'Assets/Sounds/General/roundstart.wav');
    this.load.audio('sfx_emergency',    'Assets/Sounds/General/alarm_emergencymeeting.wav');
    this.load.audio('sfx_report',       'Assets/Sounds/General/report_Bodyfound.wav');
    this.load.audio('sfx_task_done',    'Assets/Sounds/General/task_complete.wav');
    this.load.audio('sfx_victory_crew', 'Assets/Sounds/General/victory_crew.wav');
    this.load.audio('sfx_victory_imp',  'Assets/Sounds/General/victory_impostor.wav');
    this.load.audio('sfx_vent',         'Assets/Sounds/General/vent.wav');
    // Kill (~748 KB)
    this.load.audio('sfx_kill', 'Assets/Sounds/Kill/imposter_kill.wav');
    // UI sounds (~1.2 MB)
    this.load.audio('sfx_menu_sel',  'Assets/Sounds/UI/select.wav');
    this.load.audio('sfx_go_back',   'Assets/Sounds/UI/back2.wav');
    this.load.audio('sfx_selected',  'Assets/Sounds/UI/selected2.wav');
    this.load.audio('sfx_keypress',  'Assets/Sounds/UI/keypress.wav');
    this.load.audio('sfx_backspace', 'Assets/Sounds/UI/backspace.wav');
    this.load.audio('sfx_map_click', 'Assets/Sounds/UI/map_btn_click.wav');
    // Footsteps (~284 KB)
    for (let i = 1; i <= 8; i++) {
      this.load.audio(`sfx_step_${i}`, `Assets/Sounds/Footsteps/Footstep0${i}.wav`);
    }
    // Menu music (~9.7 MB) — loaded here so it can play on return to menu
    this.load.audio('sfx_menu_music', 'Assets/Sounds/Background/main_menu_music.mp3');
    // NOTE: Ambience (31 MB) intentionally omitted — lazy-load per room if needed
  }

  create() {
    // ── Build walk animations ────────────────────────────────────
    for (const color of ALL_COLORS) {
      const lc = color.toLowerCase();
      for (const dir of WALK_DIRS) {
        const fc = dirFrameCount(color);
        const frameArr: Phaser.Types.Animations.AnimationFrame[] = [];
        for (let f = 1; f <= fc; f++) {
          const key = `${lc}_${dir}_${f}`;
          if (this.textures.exists(key)) frameArr.push({ key });
        }
        if (frameArr.length === 0) {
          const fb = `${lc}_down_1`;
          if (this.textures.exists(fb)) frameArr.push({ key: fb });
        }
        if (frameArr.length > 0) {
          const isFull = FULL_ANIM_COLORS.has(color) && frameArr.length > 1;
          try {
            this.anims.create({ key: `${lc}_walk_${dir}`, frames: frameArr, frameRate: isFull ? 12 : 4, repeat: -1 });
            this.anims.create({ key: `${lc}_idle_${dir}`, frames: [frameArr[0]], frameRate: 1, repeat: 0 });
          } catch (_) { /* ignore duplicate */ }
        }
      }
    }

    // Kill animation
    const killFrames = [1,2,3].map(i => `kill_anim_${i}`).filter(k => this.textures.exists(k)).map(key => ({ key }));
    if (killFrames.length > 0) {
      try { this.anims.create({ key: 'kill_anim', frames: killFrames, frameRate: 8, repeat: 0 }); } catch (_) {}
    }

    this.scene.start('GameScene');
  }
}
