# Among Gas — Web Port

An unofficial **Among Us** clone ported from Python/Pygame to **TypeScript + Phaser 3**, targeting **Telegram HTML5 Mini Apps** and modern browsers.

## Stack

| Layer | Tech |
|-------|------|
| Game engine | [Phaser 3](https://phaser.io/) |
| Language | TypeScript 5 |
| Build/dev | Vite 5 |
| Multiplayer | Colyseus 0.17 (server) + @colyseus/sdk 0.17 (browser) |
| Assets | Original `Assets/` folder (images, sounds, tilemaps) |

## Project structure

```
src/
  main.ts              — Phaser game config + boot (LobbyScene included)
  settings.ts          — Game constants (speed, positions, CAMERA_ZOOM, etc.)
  types.ts             — Shared TypeScript interfaces
  utils/TmxParser.ts   — Parses TMX map XML → collision rects + object list
  utils/imageFit.ts    — fitContain/fitCover helpers (aspect-ratio safe)
  network/
    NetworkManager.ts  — @colyseus/sdk Client, auto-detects Replit dev domain
  scenes/
    PreloadScene.ts    — Loads all assets, builds animations
    MenuScene.ts       — Main menu, character select, name input; Online → LobbyScene
    LobbyScene.ts      — Create/join room UI, player list, Share button, Start Game
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
server/                — Colyseus 0.17 game server (Node.js, port 5001)
  index.ts             — Server entry: Colyseus Server + Express, port 5001
  package.json         — colyseus, @colyseus/schema@^4, express, cors, tsx
  tsconfig.json        — CommonJS target for server
  auth/
    telegram.ts        — HMAC-SHA256 initData validator (bypassed in dev)
  schema/
    GameState.ts       — PlayerState, TaskState, GameRoomState (@colyseus/schema v4)
  rooms/
    AmongGasRoom.ts    — Full room: LOBBY→GAME→MEETING→RESULT, maxClients=15
Assets/                — Original game assets (unchanged)
  Maps/map2back.png    — Pre-rendered world background
  Maps/map_final.backv2.tmx — Collision + object layer data
  Images/Player/       — Walk animations (per color × direction)
  Sounds/              — All original WAV/MP3 sounds
```

## How to run

```bash
# Terminal 1 — game server
cd server && npm run dev     # Colyseus on port 5001

# Terminal 2 — client
npm run dev                  # Vite on port 5000
```

Both are also configured as Replit workflows:
- **"Start application"** → `npm run dev` (port 5000, webview)
- **"Colyseus server"** → `cd server && npm run dev` (port 5001, console)

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
- Workflow "Start application" runs `npm run dev` (Vite on port 5000).
- Workflow "Colyseus server" runs `cd server && npm run dev` (Colyseus on port 5001).
- **IMPORTANT**: `colyseus` (server-only package) must ONLY be in `server/package.json`. Installing it in the root `package.json` breaks Vite's rollup native binary (uWebSockets is blocked by Replit security policy, causing `--omit=optional` to strip rollup's native binary too). Root uses only `@colyseus/sdk` (browser client). See `.agents/memory/colyseus-0.17-replit-setup.md`.

---

## Mobile portrait + Telegram Mini App adaptation — DONE

Goal: adapt the desktop/landscape web port for mobile **portrait** play (Telegram Mini App), with a virtual joystick, contextual action buttons, and full Telegram SDK integration.

### Done
- **Base resolution**: fixed portrait `750×1334` design resolution (`src/settings.ts` `WIDTH`/`HEIGHT`, `src/main.ts` Phaser config), `Scale.FIT` + `CENTER_BOTH`. Deliberately **not** changed to match real device pixels — every HUD element (fonts, icon sizes, button dimensions, camera zoom) is hand-tuned in literal pixels against this fixed resolution; changing the internal resolution breaks all of that sizing at once. Any future work must keep this constraint in mind.
- **Camera zoom**: `CAMERA_ZOOM` constant in `src/settings.ts` (currently `1.45`) applied to the main camera in `GameScene.create()` for a tighter mobile framing.
- **Dual-camera HUD fix**: `setScrollFactor(0)` alone does not protect HUD objects from camera zoom/rotation in Phaser 3. Added a second unzoomed `uiCamera` (`GameScene.setupUiCamera()`) — main camera `.ignore()`s all HUD objects, `uiCamera` ignores everything else. Any HUD-layer object created dynamically later needs its own explicit `this.cameras.main.ignore(...)` call at creation time.
- **HUD repositioning**: virtual joystick bottom-left; Emergency Meeting button top-left; Kill/Report/Use as circular touch-target buttons at bottom-left, contextually shown/hidden via `detectNearby()`. Mini-map button top-right.
- **Image aspect-ratio bug fixed**: `src/utils/imageFit.ts` (`fitContain`/`fitCover`) applied across `MenuScene.ts`, `GameScene.ts`, `VictoryScene.ts`.
- **Task compass arrows**: one arrow per incomplete task, edge-hugging radar for off-screen tasks, hovering near on-screen tasks.
- **Letterbox/pillarbox black bars**: kept `Scale.FIT` and blended the bar area into the game's dark space palette via CSS radial-gradient on `html, body` (`index.html`).
- **Telegram SDK bootstrap** (`src/main.ts`): `ready()`, `expand()`, `disableVerticalSwipes()`. Safe-area insets read once at game start, applied to HUD offsets.

### Still not started (portrait/mobile work)
1. `MeetingScene.ts` — convert to single-column voter list for portrait
2. Task mini-scenes (`src/scenes/tasks/*.ts`) — resize/reposition for portrait touch
3. `viewportChanged` — Telegram SDK viewport-resize event not wired (insets read once at boot only)
4. Final verification on a real phone

---

## Multiplayer — ALL PHASES COMPLETE ✅

All four multiplayer phases are implemented, TypeScript-clean, and verified by a headless integration test (`sim/mp-test.mjs`, 67/67 checks, ~100 s runtime).

### What's working

| Phase | Summary |
|-------|---------|
| 1 — Infrastructure | Colyseus 0.17 server (port 5001), room schema, Telegram auth (bypassed in dev), lobby UI with 6-char room code and player list |
| 2 — Position sync | `RemotePlayer.ts` sprites; 10 Hz MOVE messages; server-side speed validation with POSITION_CORRECTION; linear interpolation on client |
| 3 — Full game events | All gameplay events server-driven: kills (KILL_CONFIRMED), tasks (TASK_DONE), meetings (MEETING_STARTED), votes (VOTE_RESULT), win/loss (GAME_OVER). MeetingScene handles both freeplay and multiplayer init shapes |
| 4 — Telegram deep-link invite | `start_param` at boot or on Online click → skip menus, pre-fill name from Telegram `first_name`, auto-join room. Share button builds `t.me/<BOT>/play?startapp=<roomId>` link |

### Integration test

```bash
node sim/mp-test.mjs   # requires Colyseus server running on port 5001
```

Tests: lobby join/leave, crew win (4/8/15 players), impostor win via kills (4 players), emergency meeting + voting, speed-cheat detection.

### Key server files

| File | Role |
|------|------|
| `server/rooms/AmongGasRoom.ts` | Room logic: LOBBY→GAME→MEETING→RESULT, maxClients=15 |
| `server/schema/GameState.ts` | PlayerState, TaskState, GameRoomState |
| `server/auth/telegram.ts` | HMAC-SHA256 initData validator (bypassed when NODE_ENV=development) |

### Known bugs (low priority)
- Red player visor renders green (cosmetic, pre-existing)

### To activate Telegram deep-link in production
1. Create bot via BotFather, register Mini App URL, set `/play` command
2. Update `VITE_BOT_USERNAME` Replit env var to the real bot username
3. Deploy

### What's NOT done yet
- `MeetingScene.ts` — still landscape layout; needs single-column portrait reflow for mobile
- Task mini-scenes — not yet resized/repositioned for portrait touch
- Telegram `viewportChanged` event not wired (safe-area insets read once at boot only)
- Two-tab manual smoke test — all events verified by headless test but not yet visually confirmed across two real browser tabs
