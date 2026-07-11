import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload() {
    // Loads menu images + all menu audio so MenuScene works immediately on first visit.
    // GamePreloadScene skips these keys (already cached) and loads heavier game assets.
    this.load.on('progress', (v: number) => {
      const bar = document.getElementById('loading-bar');
      const txt = document.getElementById('loading-text');
      if (bar) bar.style.width = `${Math.round(v * 100)}%`;
      if (txt) txt.textContent = `Loading… ${Math.round(v * 100)}%`;
    });

    this.load.image('menu_back',         'Assets/Images/menu/back.png');
    this.load.image('menu_back2',        'Assets/Images/menu/back2.png');
    this.load.image('menu_title',        'Assets/Images/menu/title.png');
    this.load.image('menu_freeplay',     'Assets/Images/menu/freeplay.png');
    this.load.image('menu_online',       'Assets/Images/menu/online.png');
    this.load.image('menu_help',         'Assets/Images/menu/help.png');
    this.load.image('menu_credits',      'Assets/Images/menu/credits.png');
    this.load.image('menu_quit',         'Assets/Images/menu/quit.png');
    this.load.image('menu_sel',          'Assets/Images/menu/sel.png');
    this.load.image('menu_choosecolour', 'Assets/Images/menu/choosecolour.png');
    this.load.image('menu_return',       'Assets/Images/menu/return.png');
    this.load.image('menu_entername',    'Assets/Images/menu/entername.png');
    this.load.image('menu_input',        'Assets/Images/menu/input.png');
    this.load.image('credits_img',       'Assets/Images/credits/credits.png');
    for (const c of ['blue','green','orange','red','yellow']) {
      this.load.image(`menu_color_${c}`, `Assets/Images/menu/${c}.png`);
    }
    for (let i = 1; i <= 9; i++) {
      this.load.image(`help_${i}`, `Assets/Images/help/help${i}.png`);
    }

    // ── Menu audio — UI click sounds only (~1.2 MB, fast on mobile) ─
    // Music (9.7 MB) is lazy-loaded in MenuScene.create() so the menu
    // appears immediately without a long initial wait on slow connections.
    this.load.audio('sfx_menu_sel',  'Assets/Sounds/UI/select.wav');
    this.load.audio('sfx_go_back',   'Assets/Sounds/UI/back2.wav');
    this.load.audio('sfx_selected',  'Assets/Sounds/UI/selected2.wav');
    this.load.audio('sfx_keypress',  'Assets/Sounds/UI/keypress.wav');
    this.load.audio('sfx_backspace', 'Assets/Sounds/UI/backspace.wav');
    this.load.audio('sfx_map_click', 'Assets/Sounds/UI/map_btn_click.wav');
  }

  create() {
    const el = document.getElementById('loading');
    if (el) el.style.display = 'none';

    // ── Preview router (dev only) ─────────────────────────────────
    const p = new URLSearchParams(window.location.search).get('preview') ?? '';
    const mockGameScene = { completeTask: () => {}, resolveMeeting: () => {}, triggerEmergency: () => {} };
    const mockTaskData  = { gameScene: mockGameScene, taskId: 'preview' };

    if      (p === 'GameScene')       { this.registry.set('playerColor','Blue'); this.registry.set('playerName','Astro'); this.scene.start('GamePreloadScene'); }
    else if (p === 'VictoryCrew')     { this.scene.start('VictoryScene', { winner:'crew',     tasksDone:8, impostorName:'Red' }); }
    else if (p === 'VictoryImpostor') { this.scene.start('VictoryScene', { winner:'impostor', tasksDone:3, impostorName:'Red' }); }
    else if (p === 'FixWiring')       { this.scene.start('FixWiringScene',    mockTaskData); }
    else if (p === 'StabilizeNav')    { this.scene.start('StabilizeNavScene', mockTaskData); }
    else if (p === 'RebootWifi')      { this.scene.start('RebootWifiScene',   mockTaskData); }
    else if (p === 'FuelEngine')      { this.scene.start('FuelEngineScene',   mockTaskData); }
    else if (p === 'StartReactor')    { this.scene.start('StartReactorScene', mockTaskData); }
    else if (p === 'AlignEngine')     { this.scene.start('AlignEngineScene',  mockTaskData); }
    else if (p === 'EmptyGarbage')    { this.scene.start('EmptyGarbageScene', mockTaskData); }
    else if (p === 'ClearAsteroids')  { this.scene.start('ClearAsteroidsScene', mockTaskData); }
    else                              { this.scene.start('MenuScene'); }
  }
}
