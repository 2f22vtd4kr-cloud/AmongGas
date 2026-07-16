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
import { LobbyScene } from './scenes/LobbyScene';

// The game keeps its original fixed 750x1334 internal design resolution —
// every HUD/text/icon size in the game was hand-tuned in literal pixels
// against that resolution, so changing it makes everything render at the
// wrong physical size on real devices (font sizes, button/icon dimensions,
// panel widths, etc. don't auto-rescale just because the canvas resolution
// changed, unlike world-space camera zoom). Scale.FIT below scales that
// fixed canvas up uniformly (same factor on both axes) to fill as much of
// the screen as possible without distorting anything; any leftover
// letterbox/pillarbox sliver is blended into the page background instead
// of shown as black bars (see index.html for why we don't stretch or crop
// the canvas itself to force a literal edge-to-edge fill).
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
    LobbyScene,
  ],
  audio: {
    disableWebAudio: false,
  },
};

// Telegram Mini App bootstrap — safe to call even outside Telegram
type TgWebApp = {
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  onEvent?(eventType: string, callback: () => void): void;
};
const tg = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
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

// Telegram viewport-change hook — fires when the keyboard opens/closes, a
// swipe gesture resizes the Mini App window, or safe-area insets change.
// We forward it to GameScene so HUD elements stay correctly placed.
if (tg?.onEvent) {
  tg.onEvent('viewportChanged', () => {
    const gs = game.scene.getScene('GameScene') as { onViewportChanged?(): void } | null;
    if (gs && game.scene.isActive('GameScene')) {
      gs.onViewportChanged?.();
    }
  });
}

export default game;
