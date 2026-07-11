# Among Gas — Web Port

An unofficial **Among Us** clone ported from Python/Pygame to **TypeScript + Phaser 3**, targeting **Telegram HTML5 Mini Apps** and modern browsers.

## Stack

| Layer | Tech |
|-------|------|
| Game engine | [Phaser 3](https://phaser.io/) |
| Language | TypeScript 5 |
| Build/dev | Vite 5 |
| Assets | Original `Assets/` folder (images, sounds, tilemaps) |

## Project structure

```
src/
  main.ts              — Phaser game config + boot
  settings.ts          — Game constants (speed, positions, etc.)
  types.ts             — Shared TypeScript interfaces
  utils/TmxParser.ts   — Parses TMX map XML → collision rects + object list
  scenes/
    PreloadScene.ts    — Loads all assets, builds animations
    MenuScene.ts       — Main menu, character select, name input
    GameScene.ts       — Core gameplay: movement, tasks, meetings, win/lose
    MeetingScene.ts    — Emergency meeting + voting
    VictoryScene.ts    — End screen
    tasks/
      FixWiringScene.ts
      StabilizeNavScene.ts
      RebootWifiScene.ts
      FuelEngineScene.ts
      StartReactorScene.ts
      AlignEngineScene.ts
      EmptyGarbageScene.ts
      ClearAsteroidsScene.ts
  objects/
    Player.ts          — Local player sprite + WASD/touch movement
    Bot.ts             — NPC bots with random-walk AI
Assets/                — Original game assets (unchanged)
  Maps/map2back.png    — Pre-rendered world background
  Maps/map_final.backv2.tmx — Collision + object layer data
  Images/Player/       — Walk animations (per color × direction)
  Sounds/              — All original WAV/MP3 sounds
```

## How to run

```bash
npm run dev    # dev server on port 5000
npm run build  # production build
```

## Gameplay (Freeplay mode)

- **WASD / Arrow keys** — move
- **E** — interact with nearby task or press emergency button
- **R** — report a dead body
- **M** — toggle mini-map
- **Touch** — virtual joystick (bottom-left zone only, so it doesn't steal taps meant for the action buttons)

Complete **8 tasks** before the impostor bot kills enough crewmates to win.

## User preferences

- Port the Python/Pygame game to TypeScript + Phaser 3
- Target Telegram HTML5 Mini App (touch + keyboard)
- Preserve all original game logic, visuals, and assets exactly
- Single entry point (`index.html`), TypeScript modules via Vite

## Project setup notes

- This repo also contains the original Python/Pygame source (`main.py`, `board.py`, `server.py`, etc.) kept for reference — the active, maintained version is the TypeScript/Phaser web port under `src/`.
- Workflow "Start application" runs `npm run dev` (Vite on port 5000) and is confirmed working.

## Mobile portrait + Telegram Mini App adaptation — handoff

Goal: adapt the desktop/landscape web port for mobile **portrait** play (Telegram Mini App), with a virtual joystick, contextual action buttons, and full Telegram SDK integration. The user set a hard checkpoint: do camera + HUD first, get it reviewed, before touching scene layouts/task mini-scenes/Telegram. That checkpoint has now been reviewed and passed — the next session should move on to the remaining items below.

### Done
- **Base resolution** changed to portrait `750×1334` (`src/settings.ts` `WIDTH`/`HEIGHT`, `src/main.ts` Phaser config). `Scale.FIT` + `CENTER_BOTH` retained.
- **Camera zoom**: `CAMERA_ZOOM` constant in `src/settings.ts` (currently `1.45`) applied to the main camera in `GameScene.create()` for a tighter mobile framing.
- **Dual-camera HUD fix**: `setScrollFactor(0)` alone does not protect HUD objects from camera zoom/rotation in Phaser 3. Added a second unzoomed `uiCamera` (`GameScene.setupUiCamera()`) — main camera `.ignore()`s all HUD objects, `uiCamera` ignores everything else. Any HUD-layer object created dynamically later (alert overlays, meeting result text, minimap overlay) needs its own explicit `this.cameras.main.ignore(...)` call at creation time — see `triggerEmergency()`, `resolveMeeting()`, `toggleMiniMap()` in `GameScene.ts`. Durable lesson recorded in `.agents/memory/phaser-zoomed-hud-camera.md`.
- **HUD repositioning** (`GameScene.ts`): virtual joystick moved to bottom-left with its activation zone restricted to a bottom-left rectangle (so it doesn't steal taps meant for other controls); Emergency Meeting button moved to top-left; Kill/Report/Use converted from inline text buttons to a stack of circular touch-target buttons (`buildActionButton()` helper) at bottom-right, contextually shown/hidden via `detectNearby()` (Use near a task/emergency point, Report near a body). Mini-map button stayed top-right.
- **Image aspect-ratio bug fixed**: legacy code sized many UI images with independent width/height canvas fractions (`setDisplaySize(W*0.22, H*0.07)`), which only looked right by coincidence at the old aspect ratio and visibly stretched/squished once the canvas went portrait. Added `src/utils/imageFit.ts` (`fitContain`/`fitCover`, like CSS `object-fit`) and applied it to: menu title/buttons/color-swatches/panels/backgrounds (`MenuScene.ts`), help/credits full-page art, the in-game minimap and emergency/report alert banner (`GameScene.ts`), and the victory/defeat result image (`VictoryScene.ts`). Durable lesson in `.agents/memory/phaser-image-aspect-distortion.md`. Fixed-pixel (non-canvas-relative) task-panel image sizes in `src/scenes/tasks/*.ts` were left untouched — their distortion is constant regardless of canvas resolution, so it's a separate, lower-priority issue if it needs fixing later.
- Verified via `npx tsc --noEmit` (clean) and Screenshot tool checks of the menu and in-game minimap.

### Not started yet (next session)
1. User wants to run their own tests on the camera/HUD/aspect-ratio work above first.
2. **Scene layouts**: convert `MenuScene.ts` fractional-position cleanup/dead-code check, `MeetingScene.ts` to a single-column voter list for portrait, verify `VictoryScene.ts` layout.
3. **Task mini-scenes** (`src/scenes/tasks/*.ts`): resize/repos for portrait touch, review their hardcoded panel pixel sizes (`pw`/`ph`) for touch target sizing.
4. **Telegram SDK integration**: `ready()`, `expand()`, `disableVerticalSwipes()`, `viewportChanged`, safe-area insets.
5. **`index.html`**: orientation-lock / rotate-prompt for portrait-only play.
6. **Final verification**: screenshot at multiple phone viewports (360×800, 390×844, 428×926) across menu/in-game/meeting/task views. Note: the Screenshot tool's `appPreview` source does not currently expose a viewport-size parameter — check for one before relying on default 1280×720, or verify via other means (e.g. temporary debug query params in-scene, as used during this session's QA, always removed again before finishing).
