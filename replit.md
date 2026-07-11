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

Goal: adapt the desktop/landscape web port for mobile **portrait** play (Telegram Mini App), with a virtual joystick, contextual action buttons, and full Telegram SDK integration. The user set a hard checkpoint: do camera + HUD first, get it reviewed, before touching scene layouts/task mini-scenes. That checkpoint has been reviewed and passed. Since then, task-arrow behavior and the letterbox/black-bar cosmetic issue (below) have also been reworked and confirmed. **Next session should pick up the "Not started yet" list.**

### Done
- **Base resolution**: fixed portrait `750×1334` design resolution (`src/settings.ts` `WIDTH`/`HEIGHT`, `src/main.ts` Phaser config), `Scale.FIT` + `CENTER_BOTH`. Deliberately **not** changed to match real device pixels — every HUD element (fonts, icon sizes, button dimensions, camera zoom) is hand-tuned in literal pixels against this fixed resolution; changing the internal resolution breaks all of that sizing at once (see `.agents/memory/phaser-letterbox-fix.md`). Any future work must keep this constraint in mind rather than "fixing" it by resizing the canvas.
- **Camera zoom**: `CAMERA_ZOOM` constant in `src/settings.ts` (currently `1.45`) applied to the main camera in `GameScene.create()` for a tighter mobile framing.
- **Dual-camera HUD fix**: `setScrollFactor(0)` alone does not protect HUD objects from camera zoom/rotation in Phaser 3. Added a second unzoomed `uiCamera` (`GameScene.setupUiCamera()`) — main camera `.ignore()`s all HUD objects, `uiCamera` ignores everything else. Any HUD-layer object created dynamically later (alert overlays, meeting result text, minimap overlay) needs its own explicit `this.cameras.main.ignore(...)` call at creation time — see `triggerEmergency()`, `resolveMeeting()`, `toggleMiniMap()` in `GameScene.ts`. Durable lesson in `.agents/memory/phaser-zoomed-hud-camera.md`.
- **HUD repositioning** (`GameScene.ts`): virtual joystick bottom-left (activation zone restricted so it doesn't steal taps from other controls); Emergency Meeting button top-left; Kill/Report/Use as a stack of circular touch-target buttons (`buildActionButton()`/`buildImageButton()` helpers) at bottom-left, contextually shown/hidden via `detectNearby()`. Mini-map button top-right.
- **Image aspect-ratio bug fixed**: `src/utils/imageFit.ts` (`fitContain`/`fitCover`) applied across `MenuScene.ts`, `GameScene.ts`, `VictoryScene.ts` wherever images were previously stretched via independent width/height canvas fractions. Durable lesson in `.agents/memory/phaser-image-aspect-distortion.md`. Fixed-pixel task-panel image sizes in `src/scenes/tasks/*.ts` were left untouched (separate, lower-priority issue).
- **Task compass arrows** (`GameScene.ts`): one arrow per incomplete task (not just the tracked one), each independently in one of two modes — edge-hugging radar for off-screen tasks, or hovering just short of the task's exact screen position for on-screen tasks. Arrows hide only when their task completes. Durable lesson in `.agents/memory/phaser-edge-hugging-compass.md`.
- **Letterbox/pillarbox black bars**: kept Phaser's own uniform `Scale.FIT` (no stretch, no crop — both were tried and rejected, see below) and instead blended the leftover bar area into the game's own dark space palette via a CSS radial-gradient on `html, body` (`index.html`), so it reads as part of the scene instead of a broken black stripe. Two tempting alternatives were tried and reverted because they broke things worse: (a) resizing the internal canvas to the real device resolution — breaks all literal-pixel HUD sizing (see above); (b) CSS-stretching the canvas to `100%/100%` independently — deforms circular buttons into ovals and throws off the task-arrow edge-margin math whenever the device aspect ratio isn't exactly 750:1334. Full write-up and the "if a literal edge-to-edge fill is ever required" note in `.agents/memory/phaser-letterbox-fix.md`.
- Telegram SDK bootstrap (`src/main.ts`): `ready()`, `expand()`, `disableVerticalSwipes()`. Safe-area insets read once at game start (`GameScene.readSafeInsets()`) and applied to top/bottom-anchored HUD offsets (`safeTop`/`safeBot`). Portrait-only rotate prompt already present in `index.html` (`#rotate-prompt`, shown via a landscape+short-height media query).
- Verified via `npx tsc --noEmit` (clean) and Screenshot tool checks of the menu and in-game HUD; user separately confirmed round shapes/arrow positions look correct via real-phone screenshots for the camera/HUD/task-arrow work.

### Not started yet (next session)
1. **Scene layouts**: `MeetingScene.ts` — convert to a single-column voter list for portrait; verify `VictoryScene.ts` layout on a real phone.
2. **Task mini-scenes** (`src/scenes/tasks/*.ts`): resize/reposition for portrait touch; review hardcoded panel pixel sizes (`pw`/`ph`) for touch target sizing; their fixed-pixel image aspect-ratio distortion (noted above) is still unfixed.
3. **`viewportChanged`**: Telegram SDK viewport-resize event isn't currently wired up (safe-area insets are only read once at boot).
4. **Final verification on a real phone**: the user should confirm the current letterbox-blend fix, task arrows, and general HUD sizing look correct in the actual Telegram Mini App / a real portrait device — the Screenshot tool's `appPreview` source only offers a fixed 1280×720 landscape viewport (no portrait/phone-size option currently), so sandbox screenshots can only approximate the real device experience, especially for anything aspect-ratio-sensitive like the letterbox bars.
