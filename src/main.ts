import Phaser from 'phaser';
import { PreloadScene } from './scenes/PreloadScene';
import { GamePreloadScene } from './scenes/GamePreloadScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { MeetingScene } from './scenes/MeetingScene';
import { VictoryScene } from './scenes/VictoryScene';
import { FixWiringScene } from './scenes/tasks/FixWiringScene';
import { StabilizeNavScene } from './scenes/tasks/StabilizeNavScene';
import { RebootWifiScene } from './scenes/tasks/RebootWifiScene';
import { FuelEngineScene } from './scenes/tasks/FuelEngineScene';
import { StartReactorScene } from './scenes/tasks/StartReactorScene';
import { AlignEngineScene } from './scenes/tasks/AlignEngineScene';
import { EmptyGarbageScene } from './scenes/tasks/EmptyGarbageScene';
import { ClearAsteroidsScene } from './scenes/tasks/ClearAsteroidsScene';

// Telegram Mini App bootstrap — safe to call even outside Telegram. Run
// this *before* sizing the canvas: tg.expand() maximizes the WebView
// viewport, and we want the very first frame to size against that
// maximized viewport rather than a smaller pre-expand one.
const tg = (window as unknown as { Telegram?: { WebApp?: {
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
} } }).Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.disableVerticalSwipes?.();
}

// The game's internal resolution is set to the actual on-screen viewport
// (not a fixed "design" size like 750x1334) so Phaser's FIT scaling has
// zero leftover space in either axis — no black letterbox/pillarbox bars
// around the game. A fixed design canvas whose aspect ratio doesn't match
// the device's (e.g. taller/narrower modern phones vs. an older 0.56
// aspect) is exactly what caused the bars. HUD element positions are
// already derived from `this.scale.width/height` at runtime (see
// GameScene/MenuScene), so they adapt automatically; safe-area insets
// (readSafeInsets in GameScene) still reserve the same margins for
// buttons as before — only the surrounding black bars are removed.
const initialW = Math.max(1, Math.round(window.innerWidth || 750));
const initialH = Math.max(1, Math.round(window.innerHeight || 1334));

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: initialW,
  height: initialH,
  parent: 'game-container',
  backgroundColor: '#1a0a2e',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    PreloadScene,
    GamePreloadScene,
    MenuScene,
    GameScene,
    MeetingScene,
    VictoryScene,
    FixWiringScene,
    StabilizeNavScene,
    RebootWifiScene,
    FuelEngineScene,
    StartReactorScene,
    AlignEngineScene,
    EmptyGarbageScene,
    ClearAsteroidsScene,
  ],
  audio: {
    disableWebAudio: false,
  },
};

const game = new Phaser.Game(config);

// Re-match the canvas resolution to the viewport whenever it changes (e.g.
// mobile browser chrome show/hide, orientation change, Telegram WebView
// viewport events arriving after boot) so the bars can't reappear later.
window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});

// Hide HTML loading screen once Phaser is ready
game.events.once('ready', () => {
  const el = document.getElementById('loading');
  if (el) el.style.display = 'none';
});

export default game;
