import Phaser from 'phaser';
import { ALL_COLORS } from '../settings';

const WALK_DIRS = ['down', 'left', 'right', 'up'] as const;

// Colors with full 18/17-frame walk animations vs. single-frame statics
const FULL_ANIM_COLORS = new Set(['Blue', 'Green', 'Orange', 'Red', 'Yellow']);
// For full-animation colors: down/up=18 frames, left/right=17 frames
// For single-frame colors: every direction has exactly 1 frame
function dirFrameCount(color: string, _dir: string): number {
  if (!FULL_ANIM_COLORS.has(color)) return 1;
  return 17; // all directions have 17 frames (down_walk also has up to 18 but up_walk only 17)
}

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload() {
    // Update HTML loading bar
    this.load.on('progress', (v: number) => {
      const bar = document.getElementById('loading-bar');
      const txt = document.getElementById('loading-text');
      if (bar) bar.style.width = `${Math.round(v * 100)}%`;
      if (txt) txt.textContent = `Loading… ${Math.round(v * 100)}%`;
    });

    // ── World map ──
    this.load.image('map_bg', 'Assets/Maps/map2back.png');
    this.load.text('map_tmx', 'Assets/Maps/map_final.backv2.tmx');
    this.load.image('minimap', 'Assets/Maps/mini_map3.png');

    // ── Menu images ──
    this.load.image('menu_back',   'Assets/Images/menu/back.png');
    this.load.image('menu_back2',  'Assets/Images/menu/back2.png');
    this.load.image('menu_title',  'Assets/Images/menu/title.png');
    this.load.image('menu_freeplay', 'Assets/Images/menu/freeplay.png');
    this.load.image('menu_online', 'Assets/Images/menu/online.png');
    this.load.image('menu_help',   'Assets/Images/menu/help.png');
    this.load.image('menu_credits','Assets/Images/menu/credits.png');
    this.load.image('menu_quit',   'Assets/Images/menu/quit.png');
    this.load.image('menu_sel',    'Assets/Images/menu/sel.png');
    this.load.image('menu_choosecolour', 'Assets/Images/menu/choosecolour.png');
    this.load.image('menu_return', 'Assets/Images/menu/return.png');
    this.load.image('menu_entername', 'Assets/Images/menu/entername.png');
    this.load.image('menu_input',  'Assets/Images/menu/input.png');
    this.load.image('credits_img', 'Assets/Images/credits/credits.png');
    for (const c of ['blue','green','orange','red','yellow']) {
      this.load.image(`menu_color_${c}`, `Assets/Images/menu/${c}.png`);
    }
    for (let i = 1; i <= 9; i++) {
      this.load.image(`help_${i}`, `Assets/Images/help/help${i}.png`);
    }

    // ── Player sprites ──
    for (const color of ALL_COLORS) {
      const lc = color.toLowerCase();
      for (const dir of WALK_DIRS) {
        const frames = dirFrameCount(color, dir);
        for (let f = 1; f <= frames; f++) {
          this.load.image(
            `${lc}_${dir}_${f}`,
            `Assets/Images/Player/${color}/${lc}_${dir}_walk/step${f}.png`
          );
        }
      }
      // Ghost sprites (only exist for Blue, Green, Orange, Red, Yellow)
      if (FULL_ANIM_COLORS.has(color)) {
        const ghostDir = `Assets/Images/Player/${color}/${lc}_ghost`;
        this.load.image(`${lc}_ghost_1`, `${ghostDir}/step1_left.png`);
        this.load.image(`${lc}_ghost_2`, `${ghostDir}/step1_right.png`);
      }
    }

    // Dead sprites — originals live in the Alerts folder, not a separate Dead/ folder
    const deadExts: Record<string,string> = {
      blue:'.PNG', green:'.PNG', orange:'.PNG', red:'.PNG', yellow:'.PNG',
      black:'.PNG', brown:'.PNG', pink:'.PNG', purple:'.PNG', white:'.PNG',
    };
    // Fallback: use the first walk-frame as a stand-in dead sprite (Dead/ folder is absent)
    for (const c of ['blue','green','orange','red','yellow','black','brown','pink','purple','white']) {
      // Dead sprites don't exist in the repo; we'll fall back to the walk frame in GameScene
      // Still attempt load in case they exist under Player/Dead/
      this.load.image(`dead_${c}`, `Assets/Images/Player/Dead/dead_${c}.png`);
    }

    // Kill animation frames
    for (let i = 1; i <= 3; i++) {
      this.load.image(`kill_anim_${i}`, `Assets/Images/Player/Kills/kill${i}.png`);
    }

    // ── Alert images ──
    this.load.image('alert_victory',  'Assets/Images/Alerts/victory.png');
    this.load.image('alert_defeat',   'Assets/Images/Alerts/defeat.png');
    this.load.image('alert_eject',    'Assets/Images/Alerts/eject.png');
    // report_dead_body_blue.PNG and report_dead_body_red.PNG use uppercase extension
    const reportExt: Record<string,string> = { blue:'.PNG', green:'.png', orange:'.png', red:'.PNG', yellow:'.png' };
    for (const c of ['blue','green','orange','red','yellow']) {
      this.load.image(`alert_meeting_${c}`, `Assets/Images/Alerts/emergency_meeting_${c}.png`);
      this.load.image(`alert_report_${c}`,  `Assets/Images/Alerts/report_dead_body_${c}${reportExt[c]}`);
    }
    for (let i = 1; i <= 18; i++) {
      this.load.image(`kill_banner_${i}`, `Assets/Images/Alerts/kill${i}.png`);
    }

    // ── Items / interactables ──
    // Items: some use lowercase .png, some uppercase .PNG — specify per-item
    const itemsLower = [
      'electricity_wires','electricity_wires_highlight','electricity_wires_connected',
      'wifi','wifi_highlight','wifi_connected',
      'security_monitor','security_monitor_highlight',
      'lower_engine','lower_engine_highlight','upper_engine','upper_engine_highlight',
      'generator','generator_highlight',
      'gas_can_highlighted',
      'fuel_engine_highlighted',
      'power_divert','power_divert_highlight',
      'ventilation',
      'emergency_icon','emergency_icon_inv','emergency_icon_bright',
      'admin_control1_highlight','admin_control2_highlight',
    ];
    const itemsUpper = [
      'cafeteria_comp','emergency_button','emergency_button_highlight',
      'nav','navigation','navigation_highlight','navigation_stable',
      'reactor_btn','reactor_btn_highlight',
      'admin_control1','admin_control2',
      'garbage_liver','garbage_liver_highlight',
      'gas_can',
      'fuel_engine',
      'power_diverted',
    ];
    for (const it of itemsLower) {
      this.load.image(it, `Assets/Images/Items/${it}.png`);
    }
    for (const it of itemsUpper) {
      this.load.image(it, `Assets/Images/Items/${it}.PNG`);
    }

    // ── UI ──
    this.load.image('ui_map_button',       'Assets/Images/UI/map_button.png');
    this.load.image('ui_kill_icon',        'Assets/Images/UI/kill_icon.png');
    this.load.image('ui_kill_icon_dim',    'Assets/Images/UI/kill_icon_dim.png');
    this.load.image('ui_emergency_icon',   'Assets/Images/UI/emergency_icon.png');
    this.load.image('ui_emergency_dim',    'Assets/Images/UI/emergency_icon_dim.png');
    this.load.image('ui_sabotage_icon',    'Assets/Images/UI/sabotage_icon.png');
    this.load.image('ui_sabotage_dim',     'Assets/Images/UI/sabotage_icon_dim.png');
    this.load.image('ui_light_icon',       'Assets/Images/UI/light_bulb_icon.png');
    this.load.image('ui_light_icon_dim',   'Assets/Images/UI/light_bulb_icon_dim.png');
    this.load.image('ui_close',            'Assets/Images/UI/close.PNG');

    // ── Meeting UI ──
    this.load.image('meeting_chat',      'Assets/Images/Meeting/chat.png');
    this.load.image('meeting_chat_dead', 'Assets/Images/Meeting/chat_dead.png');
    this.load.image('meeting_vote_base', 'Assets/Images/Meeting/e_vote_base.png');
    this.load.image('meeting_vote_dead', 'Assets/Images/Meeting/e_vote_base_dead.png');
    this.load.image('meeting_checkbox',  'Assets/Images/Meeting/checkbox.png');
    this.load.image('meeting_select',    'Assets/Images/Meeting/select_vote.png');
    this.load.image('meeting_skip',      'Assets/Images/Meeting/skip_vote.png');
    this.load.image('meeting_voted',     'Assets/Images/Meeting/voted_players.PNG');
    this.load.image('meeting_proceed',   'Assets/Images/Meeting/proceed.PNG');

    // ── Task panels ──
    // Fix Wiring
    this.load.image('task_wiring_base',    'Assets/Images/Tasks/Fix Wiring/electricity_wire_base1.png');
    this.load.image('task_wiring_btn',     'Assets/Images/Tasks/Fix Wiring/electricity_wire_btn.png');
    this.load.image('task_wiring_close',   'Assets/Images/Tasks/Fix Wiring/close.PNG');
    for (const c of ['blue','pink','red','yellow']) {
      this.load.image(`task_wire_${c}`, `Assets/Images/Tasks/Fix Wiring/${c}_wire.png`);
    }
    // Stabilize Nav
    this.load.image('task_nav_base',    'Assets/Images/Tasks/Stabilize Steering/stabilizer_base.PNG');
    this.load.image('task_nav_target',  'Assets/Images/Tasks/Stabilize Steering/nav_stabilize_target.png');
    this.load.image('task_nav_center',  'Assets/Images/Tasks/Stabilize Steering/target_center.png');
    this.load.image('task_nav_close',   'Assets/Images/Tasks/Stabilize Steering/close.PNG');
    // Reboot Wifi
    this.load.image('task_wifi_bg',     'Assets/Images/Tasks/Reboot Wifi/panel_wifi_bg.png');
    this.load.image('task_wifi_lever',  'Assets/Images/Tasks/Reboot Wifi/panel_wifi-lever.png');
    this.load.image('task_wifi_on',     'Assets/Images/Tasks/Reboot Wifi/wifi_on.png');
    this.load.image('task_wifi_close',  'Assets/Images/Tasks/Reboot Wifi/close.PNG');
    // Fuel Engine
    this.load.image('task_fuel_base',   'Assets/Images/Tasks/Fuel Engines/fuel_engines_base.png');
    this.load.image('task_fuel_btn',    'Assets/Images/Tasks/Fuel Engines/engineFuel_Button.png');
    this.load.image('task_fuel_can',    'Assets/Images/Tasks/Fuel Engines/gas_can.png');
    this.load.image('task_fuel_close',  'Assets/Images/Tasks/Fuel Engines/close.PNG');
    // Start Reactor
    this.load.image('task_reactor_base1', 'Assets/Images/Tasks/Start Reactor/reactor_base1.PNG');
    this.load.image('task_reactor_base2', 'Assets/Images/Tasks/Start Reactor/reactor_base2.png');
    this.load.image('task_reactor_base3', 'Assets/Images/Tasks/Start Reactor/reactor_base3.png');
    for (const n of [0,2,4,6,8]) {
      this.load.image(`task_reactor_${n}`, `Assets/Images/Tasks/Start Reactor/reactor_${n}.png`);
    }
    this.load.image('task_reactor_close', 'Assets/Images/Tasks/Start Reactor/close.PNG');
    // Align Engine
    this.load.image('task_align_close', 'Assets/Images/Tasks/Align Engine Output/close.PNG');
    // Empty Garbage
    this.load.image('task_garbage_close', 'Assets/Images/Tasks/Empty Garbage/close.PNG');
    // Clear Asteroids
    this.load.image('task_asteroids_ship',  'Assets/Images/Tasks/Clear Asteroids/starship.png');
    this.load.image('task_asteroids_ship2', 'Assets/Images/Tasks/Clear Asteroids/starship2.png');
    this.load.image('task_asteroids_ship3', 'Assets/Images/Tasks/Clear Asteroids/starship3.png');

    // ── Environment ──
    this.load.image('light_mask', 'Assets/Images/Environment/light_350_med.png');

    // ── Sounds ──
    this.load.audio('sfx_menu_music',     'Assets/Sounds/Background/main_menu_music.mp3');
    this.load.audio('sfx_roundstart',     'Assets/Sounds/General/roundstart.wav');
    this.load.audio('sfx_emergency',      'Assets/Sounds/General/alarm_emergencymeeting.wav');
    this.load.audio('sfx_report',         'Assets/Sounds/General/report_Bodyfound.wav');
    this.load.audio('sfx_task_done',      'Assets/Sounds/General/task_complete.wav');
    this.load.audio('sfx_victory_crew',   'Assets/Sounds/General/victory_crew.wav');
    this.load.audio('sfx_victory_imp',    'Assets/Sounds/General/victory_impostor.wav');
    this.load.audio('sfx_vent',           'Assets/Sounds/General/vent.wav');
    this.load.audio('sfx_kill',           'Assets/Sounds/Kill/imposter_kill.wav');
    this.load.audio('sfx_menu_sel',       'Assets/Sounds/UI/select.wav');
    this.load.audio('sfx_go_back',        'Assets/Sounds/UI/back2.wav');
    this.load.audio('sfx_selected',       'Assets/Sounds/UI/selected2.wav');
    this.load.audio('sfx_keypress',       'Assets/Sounds/UI/keypress.wav');
    this.load.audio('sfx_backspace',      'Assets/Sounds/UI/backspace.wav');
    this.load.audio('sfx_map_click',      'Assets/Sounds/UI/map_btn_click.wav');
    this.load.audio('sfx_bg',             'Assets/Sounds/Ambience/AMB_Main.wav');
    for (const [k, file] of Object.entries({
      cafeteria:       'AMB_Cafeteria',
      medbay_room:     'AMB_MedbayRoom',
      security_room:   'AMB_SecurityRoom',
      reactor_room:    'AMB_ReactorRoom',
      u_engine_room:   'AMB_EngineRoom',
      electrical_room: 'AMB_ElectricRoom',
      storage_room:    'AMB_Storage',
      admin_room:      'AMB_Admin',
      cockpit:         'AMB_Cockpit',
      oxygen_room:     'AMB_Oxygen',
      weapons:         'AMB_Weapons',
    })) {
      this.load.audio(`amb_${k}`, `Assets/Sounds/Ambience/${file}.wav`);
    }
    for (let i = 1; i <= 8; i++) {
      this.load.audio(`sfx_step_${i}`, `Assets/Sounds/Footsteps/Footstep0${i}.wav`);
    }
  }

  create() {
    try {
      // Hide loading screen
      const el = document.getElementById('loading');
      if (el) el.style.display = 'none';

      // Build walk animations for every color × direction
      for (const color of ALL_COLORS) {
        const lc = color.toLowerCase();
        for (const dir of WALK_DIRS) {
          const frameCount = dirFrameCount(color, dir);
          // Only include frames whose textures actually loaded
          const frameArr: Phaser.Types.Animations.AnimationFrame[] = [];
          for (let f = 1; f <= frameCount; f++) {
            const key = `${lc}_${dir}_${f}`;
            if (this.textures.exists(key)) {
              frameArr.push({ key });
            }
          }
          if (frameArr.length === 0) {
            // Fallback: use down frame 1 if it loaded
            const fallback = `${lc}_down_1`;
            if (this.textures.exists(fallback)) frameArr.push({ key: fallback });
          }
          if (frameArr.length > 0) {
            const isFullAnim = FULL_ANIM_COLORS.has(color) && frameArr.length > 1;
            try {
              this.anims.create({
                key: `${lc}_walk_${dir}`,
                frames: frameArr,
                frameRate: isFullAnim ? 12 : 4,
                repeat: -1,
              });
              this.anims.create({
                key: `${lc}_idle_${dir}`,
                frames: [frameArr[0]],
                frameRate: 1,
                repeat: 0,
              });
            } catch (_) { /* skip duplicate anim warnings */ }
          }
        }
      }

      // Kill animation
      const killFrames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = 1; i <= 3; i++) {
        const k = `kill_anim_${i}`;
        if (this.textures.exists(k)) killFrames.push({ key: k });
      }
      if (killFrames.length > 0) {
        try {
          this.anims.create({ key: 'kill_anim', frames: killFrames, frameRate: 8, repeat: 0 });
        } catch (_) { /* ignore */ }
      }
    } catch (err) {
      console.error('PreloadScene.create error:', err);
    }

    this.scene.start('MenuScene');
  }
}
