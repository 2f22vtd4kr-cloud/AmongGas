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

// The game keeps its original fixed 750x1334 internal design resolution —
// every HUD/text/icon size in the game was hand-tuned in literal pixels
// against that resolution, so changing it makes everything render at the
// wrong physical size on real devices (font sizes, button/icon dimensions,
// panel widths, etc. don't auto-rescale just because the canvas resolution
// changed, unlike world-space camera zoom). The black perimeter bars are
// instead removed purely in CSS: the canvas is stretched to 100% of the
// viewport's width/height (see index.html), which fills the screen edge to
// edge with only a very mild non-uniform stretch (the design aspect ratio
// is already close to most phone aspect ratios), while every game object's
// on-canvas pixel size — and therefore its rendered size — stays exactly
// as originally designed.
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 750,
  height: 1334,
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

// Telegram Mini App bootstrap — safe to call even outside Telegram
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

const game = new Phaser.Game(config);

// Hide HTML loading screen once Phaser is ready
game.events.once('ready', () => {
  const el = document.getElementById('loading');
  if (el) el.style.display = 'none';
});

export default game;
