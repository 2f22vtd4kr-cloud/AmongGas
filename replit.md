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

## Multiplayer — Phase 1 complete, Phase 2 next

### Phase 1 — Infrastructure (COMPLETE, both servers running)

All files created and TypeScript-clean (`npx tsc --noEmit` passes):

| File | Status |
|---|---|
| `server/index.ts` | Colyseus 0.17 server, port 5001 |
| `server/auth/telegram.ts` | HMAC-SHA256 initData validator |
| `server/schema/GameState.ts` | PlayerState, TaskState, GameRoomState |
| `server/rooms/AmongGasRoom.ts` | LOBBY→GAME→MEETING→RESULT, maxClients=15 |
| `src/network/NetworkManager.ts` | @colyseus/sdk browser client, auto-detects dev URL |
| `src/scenes/LobbyScene.ts` | Create/join UI, 6-char room code, player list, Share |
| `src/main.ts` | LobbyScene added to scene list |
| `src/scenes/MenuScene.ts` | Online button → char select → LobbyScene |

**Phase 1 test checklist** (manual, two browser tabs):
- [ ] 1.1 Colyseus server starts on port 5001 ← already confirmed in workflow logs
- [ ] 1.2 Two tabs can join same room code
- [ ] 1.3 initData validation bypassed in dev (NODE_ENV=development)
- [ ] 1.4 Player leaves tab → other tab's player list updates
- [ ] 1.5 Room disposed after all players leave

### Phase 2 — Real-time position sync (NOT STARTED — start here)

Goal: other players' characters appear and move on your screen in GameScene.

Files to create/modify:
- **`src/objects/RemotePlayer.ts`** — sprite for other players (driven by server state, not input)
- **`src/scenes/GameScene.ts`** — inject NetworkManager; on `state.players` change: create/destroy/move RemotePlayer instances; send local position updates on `preUpdate` throttle (~20 Hz)
- **`server/rooms/AmongGasRoom.ts`** — `onMessage('move', ...)` handler updates `PlayerState.x/y/anim`; schema already has those fields

Key Colyseus 0.17 API for Phase 2:
```typescript
// Client — listen for state changes
room.state.players.onAdd((player, sessionId) => { /* create RemotePlayer */ });
room.state.players.onRemove((player, sessionId) => { /* destroy RemotePlayer */ });
player.onChange(() => { /* update position/anim */ });

// Client — send position
room.send('move', { x, y, anim: 'walk_down' });

// Server — handle in AmongGasRoom
this.onMessage('move', (client, data) => {
  const p = this.state.players.get(client.sessionId);
  if (p) { p.x = data.x; p.y = data.y; p.anim = data.anim; }
});
```

### Phase 3 — Full game events ✅ COMPLETE
- Kills, task completion, emergency meeting, votes, win/loss all routed through Colyseus
- `MeetingScene.ts` rewritten to handle both freeplay and multiplayer init shapes
- Client listens for: `KILL_CONFIRMED`, `MEETING_STARTED`, `VOTE_RESULT`, `GAME_OVER`, `POSITION_CORRECTION`
- Client sends: `KILL`, `REPORT`, `EMERGENCY`, `TASK_DONE`, `VOTE`

### Phase 4 — Telegram deep-link invite ✅ COMPLETE
- `MenuScene.ts`: if `start_param` present at boot or on Online click → skip char select, use Telegram `first_name`, go straight to `LobbyScene`
- `LobbyScene.ts`: auto-join shows "Joining room…" status + error recovery back button; `shareRoom()` uses `VITE_BOT_USERNAME` env var
- `src/vite-env.d.ts` declares `VITE_BOT_USERNAME`; env var set to `AmongGasBot` (update to real bot username after BotFather setup)
- **To activate in production**: create bot via BotFather, register Mini App, set `/play` command, update `VITE_BOT_USERNAME` in Replit env vars, deploy
