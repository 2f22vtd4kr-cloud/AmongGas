import Phaser from 'phaser';
import { fitContain, fitCover } from '../utils/imageFit';

type MenuSection = 'main' | 'charSelect' | 'nameInput' | 'help' | 'credits';

// ─── Telegram helpers (safe outside Telegram context) ─────────────────────────
type TgWebApp = {
  initDataUnsafe?: {
    start_param?: string;
    user?: { first_name?: string; last_name?: string };
  };
};
function tgWebApp(): TgWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
}
function getStartParam(): string {
  return tgWebApp()?.initDataUnsafe?.start_param ?? '';
}
function getTelegramFirstName(): string {
  return tgWebApp()?.initDataUnsafe?.user?.first_name ?? '';
}

const MAIN_OPTIONS = ['Freeplay', 'Online', 'Help', 'Credits', 'Quit'];
// Y-positions as fractions of HEIGHT (matching Python i values)
const MAIN_Y = [0.41 * 1, 0.53, 0.65, 0.77, 0.89].map((_, i) =>
  225 + i * 75
);
// Actual ranges from Python:
// 225<y<300 => Freeplay, 300<y<385 => Multiplayer, 385<y<457 => Help, 457<y<520 => Credits, else Quit
const CHAR_COLORS = ['Red', 'Blue', 'Orange', 'Yellow', 'Green'];

export class MenuScene extends Phaser.Scene {
  private section: MenuSection = 'main';
  private cursorIdx = 0;
  private helpPage = 0;
  private playerName = '';
  private playerColor = 'Red';
  private music?: Phaser.Sound.BaseSound;
  private cursor?: Phaser.GameObjects.Image;
  private nameText?: Phaser.GameObjects.Text;
  private nameInputEl?: HTMLInputElement;

  // Main menu items
  private menuItems: { text: string; y: number }[] = [
    { text: 'Freeplay',    y: 262 },
    { text: 'Online',      y: 342 },
    { text: 'Help',        y: 420 },
    { text: 'Credits',     y: 488 },
    { text: 'Quit',        y: 556 },
  ];

  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    // ── Autoplay / screenshot-tour mode: ?autoplay=… skips all menus ──────────────
    // Supported values: '1' (walk), 'task' (open fix-wiring), 'meeting', 'minimap'
    // Uses fastMode so only Blue player sprites are loaded — reduces loading time
    // from ~12 s to ~2 s so the Screenshot tool captures GameScene, not the bar.
    const autoplayParam = new URLSearchParams(window.location.search).get('autoplay');
    if (autoplayParam !== null) {
      this.registry.set('playerName', 'Player');
      this.registry.set('playerColor', 'Blue');  // only Blue sprites loaded in fastMode
      this.registry.set('gameMode', 'Freeplay');
      this.registry.set('autoplay', autoplayParam);
      this.registry.set('fastMode', true);        // skips audio + non-Blue player art
      this.scene.start('GamePreloadScene');
      return;
    }

    // ── Deep-link auto-join: Telegram opened this Mini App via t.me/Bot?startapp=CODE ──
    // Skip all menus and jump straight to LobbyScene with defaults so the
    // player lands in the invited room immediately.
    const startParam = getStartParam();
    if (startParam) {
      const name = getTelegramFirstName().slice(0, 11) || 'Crewmate';
      this.registry.set('playerName', name);
      this.registry.set('playerColor', this.playerColor || 'Red');
      this.registry.set('gameMode', 'online');
      this.scene.start('LobbyScene');
      return;
    }

    const { width: W, height: H } = this.scale;

    // Background
    fitCover(this.add.image(W / 2, H / 2, 'menu_back'), W, H);

    // Title
    fitContain(this.add.image(W / 2, H * 0.13, 'menu_title'), W * 0.5, H * 0.18);

    // Menu option images
    const imgs = ['menu_freeplay','menu_online','menu_help','menu_credits','menu_quit'];
    const yPos = [0.36, 0.47, 0.58, 0.68, 0.77];
    for (let i = 0; i < imgs.length; i++) {
      const btn = fitContain(this.add.image(W * 0.5, H * yPos[i], imgs[i]), W * 0.22, H * 0.07)
        .setInteractive();
      const idx = i;
      btn.on('pointerdown', () => {
        this.selectMainItem(idx);
      });
      btn.on('pointerover', () => { this.cursorIdx = idx; this.moveCursor(); });
    }

    // Selection cursor
    this.cursor = this.add.image(W * 0.28, H * yPos[0], 'menu_sel')
      .setDisplaySize(40, 40);

    // Keyboard
    const keys = this.input.keyboard!;
    keys.on('keydown-UP',    () => this.navigate(-1));
    keys.on('keydown-DOWN',  () => this.navigate(1));
    keys.on('keydown-W',     () => this.navigate(-1));
    keys.on('keydown-S',     () => this.navigate(1));
    keys.on('keydown-ENTER', () => this.selectMainItem(this.cursorIdx));
    keys.on('keydown-SPACE', () => this.selectMainItem(this.cursorIdx));

    // Music — lazy-loaded (9.7 MB) so the menu appears immediately.
    // If already cached (e.g. returning from a game), play right away.
    // Otherwise start a background load and play when ready.
    this.startMenuMusic();
  }

  private startMenuMusic() {
    // Already in cache (e.g. returning from a game round) — play immediately
    if (this.cache.audio.exists('sfx_menu_music')) {
      if (!this.sound.get('sfx_menu_music')?.isPlaying) {
        this.music = this.sound.add('sfx_menu_music', { loop: true, volume: 0.5 });
        this.music.play();
      }
      return;
    }
    // Not yet cached — load in background, play when ready (no progress bar shown)
    this.load.audio('sfx_menu_music', 'Assets/Sounds/Background/main_menu_music.mp3');
    this.load.once('complete', () => {
      // Scene may have changed by the time music loads — guard against it
      if (!this.scene.isActive('MenuScene')) return;
      if (this.cache.audio.exists('sfx_menu_music') && !this.sound.get('sfx_menu_music')?.isPlaying) {
        this.music = this.sound.add('sfx_menu_music', { loop: true, volume: 0.5 });
        this.music.play();
      }
    });
    this.load.start();
  }

  private navigate(dir: -1 | 1) {
    this.cursorIdx = Phaser.Math.Clamp(this.cursorIdx + dir, 0, 4);
    this.moveCursor();
    if (this.cache.audio.exists('sfx_menu_sel')) this.sound.play('sfx_menu_sel', { volume: 0.6 });
  }

  private moveCursor() {
    const yPos = [0.36, 0.47, 0.58, 0.68, 0.77];
    if (this.cursor) {
      this.cursor.setY(this.scale.height * yPos[this.cursorIdx]);
    }
  }

  private selectMainItem(idx: number) {
    if (this.cache.audio.exists('sfx_selected')) this.sound.play('sfx_selected', { volume: 0.7 });
    switch (idx) {
      case 0: // Freeplay
        this.registry.set('gameMode', 'Freeplay');
        this.showCharSelect();
        break;
      case 1: // Online multiplayer
        this.registry.set('gameMode', 'online');
        // If the Mini App was opened via a deep-link invite (start_param present),
        // skip character select — go straight to LobbyScene which auto-joins the room.
        if (getStartParam()) {
          const name = getTelegramFirstName().slice(0, 11) ||
                       (this.registry.get('playerName') as string) || 'Crewmate';
          this.registry.set('playerName', name);
          this.registry.set('playerColor', this.playerColor || 'Red');
          this.music?.stop();
          this.cleanupInput();
          this.scene.start('LobbyScene');
        } else {
          this.showCharSelect();
        }
        break;
      case 2: this.showHelp(); break;
      case 3: this.showCredits(); break;
      case 4: this.showNotice('Thanks for playing!'); break;
    }
  }

  private showCharSelect() {
    const { width: W, height: H } = this.scale;
    this.clearScene();

    fitCover(this.add.image(W/2, H/2, 'menu_back2'), W, H);
    fitContain(this.add.image(W/2, H*0.08, 'menu_choosecolour'), W*0.4, H*0.1);

    const colors = ['Red','Blue','Orange','Yellow','Green'];
    const colorImgs = ['menu_color_red','menu_color_blue','menu_color_orange','menu_color_yellow','menu_color_green'];
    const yFracs = [0.25, 0.38, 0.51, 0.64, 0.77];

    for (let i = 0; i < colors.length; i++) {
      const btn = fitContain(this.add.image(W*0.5, H*yFracs[i], colorImgs[i]), 120, 90)
        .setInteractive();
      const color = colors[i];
      btn.on('pointerdown', () => {
        this.playerColor = color;
        this.registry.set('playerColor', color);
        this.showNameInput();
        if (this.cache.audio.exists('sfx_selected')) this.sound.play('sfx_selected', { volume: 0.7 });
      });
      btn.on('pointerover', () => {
        btn.setScale(1.1);
        if (this.cache.audio.exists('sfx_menu_sel')) this.sound.play('sfx_menu_sel', { volume: 0.5 });
      });
      btn.on('pointerout', () => btn.setScale(1));
    }

    // Keyboard nav
    this.input.keyboard!.once('keydown-ESC', () => {
      if (this.cache.audio.exists('sfx_go_back')) this.sound.play('sfx_go_back', { volume: 0.6 });
      this.scene.restart();
    });
  }

  private showNameInput() {
    const { width: W, height: H } = this.scale;
    // Remove any leftover <input> from a previous call before creating a new one.
    this.cleanupInput();
    this.clearScene();

    // Pre-fill from Telegram user data if available and no name chosen yet
    if (!this.playerName) {
      this.playerName = getTelegramFirstName().slice(0, 11);
    }

    fitCover(this.add.image(W/2, H/2, 'menu_back2'), W, H);
    fitContain(this.add.image(W/2, H*0.25, 'menu_entername'), W*0.35, H*0.1);
    fitContain(this.add.image(W/2, H*0.45, 'menu_input'), W*0.35, H*0.1);

    this.nameText = this.add.text(W/2, H*0.45, this.playerName, {
      fontSize: '28px',
      color: '#fff',
      fontFamily: 'Arial',
    }).setOrigin(0.5);

    // HTML input for mobile keyboard
    this.nameInputEl = document.createElement('input');
    this.nameInputEl.type = 'text';
    this.nameInputEl.maxLength = 11;
    this.nameInputEl.placeholder = 'Enter name…';
    this.nameInputEl.value = this.playerName;
    Object.assign(this.nameInputEl.style, {
      position: 'fixed', left: '-9999px', top: '0',
    });
    document.body.appendChild(this.nameInputEl);
    this.nameInputEl.focus();

    this.nameInputEl.addEventListener('input', () => {
      this.playerName = this.nameInputEl!.value.slice(0, 11);
      if (this.nameText) this.nameText.setText(this.playerName);
      if (this.cache.audio.exists('sfx_keypress')) this.sound.play('sfx_keypress', { volume: 0.5 });
    });
    this.nameInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.playerName.length > 0) {
        this.startGame();
      } else if (e.key === 'Escape') {
        this.cleanupInput();
        this.showCharSelect();
      }
    });

    // On-screen confirm button
    const confirmBtn = this.add.text(W/2, H*0.65, '▶  PLAY', {
      fontSize: '32px', color: '#00ff88',
      fontFamily: 'Arial', fontStyle: 'bold',
      backgroundColor: '#333', padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    confirmBtn.on('pointerdown', () => {
      if (this.playerName.length === 0) this.playerName = 'Crewmate';
      this.startGame();
    });

    // Focus hack for mobile
    this.input.on('pointerdown', () => this.nameInputEl?.focus());
  }

  private showHelp() {
    this.helpPage = 0;
    this.renderHelp();
  }

  private renderHelp() {
    const { width: W, height: H } = this.scale;
    this.clearScene();

    const page = Phaser.Math.Clamp(this.helpPage, 0, 8);
    fitCover(this.add.image(W/2, H/2, `help_${page + 1}`), W, H);

    const prevBtn = this.add.text(20, H/2, '◀', {
      fontSize: '52px', color: '#fff', backgroundColor: '#0008',
      padding: { x: 16, y: 14 },
    }).setInteractive();
    const nextBtn = this.add.text(W - 20, H/2, '▶', {
      fontSize: '52px', color: '#fff', backgroundColor: '#0008',
      padding: { x: 16, y: 14 },
    }).setOrigin(1, 0.5).setInteractive();

    prevBtn.on('pointerdown', () => { if (this.helpPage > 0) { this.helpPage--; this.renderHelp(); } });
    nextBtn.on('pointerdown', () => { if (this.helpPage < 8) { this.helpPage++; this.renderHelp(); } });

    // Back button — touch-friendly, works without keyboard
    const backBtn = this.add.text(W/2, H - 30, '✕  Back', {
      fontSize: '24px', color: '#fff', backgroundColor: '#0008',
      padding: { x: 20, y: 14 },
    }).setOrigin(0.5, 1).setInteractive();
    backBtn.on('pointerdown', () => {
      if (this.cache.audio.exists('sfx_go_back')) this.sound.play('sfx_go_back', { volume: 0.6 });
      this.scene.restart();
    });

    this.input.keyboard!.once('keydown-ESC', () => {
      if (this.cache.audio.exists('sfx_go_back')) this.sound.play('sfx_go_back', { volume: 0.6 });
      this.scene.restart();
    });
  }

  private showCredits() {
    const { width: W, height: H } = this.scale;
    this.clearScene();
    fitCover(this.add.image(W/2, H/2, 'credits_img'), W, H);
    this.input.keyboard!.once('keydown-ESC', () => {
      if (this.cache.audio.exists('sfx_go_back')) this.sound.play('sfx_go_back', { volume: 0.6 });
      this.scene.restart();
    });
    const credBack = this.add.text(W/2, H - 30, '✕  Back', {
      fontSize: '24px', color: '#fff', backgroundColor: '#0008',
      padding: { x: 20, y: 14 },
    }).setOrigin(0.5, 1).setInteractive();
    credBack.on('pointerdown', () => {
      if (this.cache.audio.exists('sfx_go_back')) this.sound.play('sfx_go_back', { volume: 0.6 });
      this.scene.restart();
    });
  }

  private showNotice(msg: string) {
    const { width: W, height: H } = this.scale;
    const box = this.add.rectangle(W/2, H/2, Math.min(W * 0.85, 500), 200, 0x000000, 0.85);
    const t = this.add.text(W/2, H/2 - 20, msg, {
      fontSize: '24px', color: '#fff', fontFamily: 'Arial', wordWrap: { width: 460 },
    }).setOrigin(0.5);
    const ok = this.add.text(W/2, H/2 + 60, 'OK', {
      fontSize: '28px', color: '#00ff88', backgroundColor: '#333',
      padding: { x: 20, y: 8 },
    }).setOrigin(0.5).setInteractive();
    ok.on('pointerdown', () => { box.destroy(); t.destroy(); ok.destroy(); });
  }

  private startGame() {
    this.cleanupInput();
    this.registry.set('playerName', this.playerName || 'Crewmate');
    this.registry.set('playerColor', this.playerColor);
    this.music?.stop();
    const mode = this.registry.get('gameMode') as string;
    if (mode === 'online') {
      this.scene.start('LobbyScene');
    } else {
      this.scene.start('GamePreloadScene');
    }
  }

  private cleanupInput() {
    this.nameInputEl?.remove();
    this.nameInputEl = undefined;
  }

  private clearScene() {
    // Remove all game objects except active ones — restart scene children
    this.children.removeAll(true);
    this.input.keyboard?.removeAllListeners();
    this.input.removeAllListeners();
  }

  shutdown() {
    this.cleanupInput();
  }
}
