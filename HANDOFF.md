# HANDOFF — Among Gas (TypeScript + Phaser 3 Among Us Clone)

> **READ THIS FIRST** every new session. Update the "Session Log" section before ending.

---

## 1. Project Overview

- Stack: TypeScript, Phaser 3, Vite, Tiled (TMX maps)
- Run: `npm run dev` → port 5000
- Map file: `Assets/Maps/the_skeld.tmx` (Tiled)
- Entry: `src/main.ts` → scene boot order below

---

## 2. Strict Asset Rule

**No new sprites, images, or sounds may be drawn or generated.**  
Only load and display assets that already exist in `Assets/`.

---

## 3. Scene Boot / Load Sequence

```
Browser loads index.html
  └─ Phaser boots with [PreloadScene, MenuScene, GamePreloadScene, GameScene, ...]
      │
      ├── PreloadScene (auto-runs first)
      │     loads: menu background, logo, 6 UI sounds + lazy-loads menu music
      │
      ├── MenuScene (runs after PreloadScene)
      │     shows: main menu with FREEPLAY / LOCAL / HELP / CREDITS / QUIT
      │
      ├── [FREEPLAY click] → GamePreloadScene
      │     loads: ALL game images (players, maps, tasks, environment)
      │              + ALL game audio (footsteps, sfx, ambient)
      │              + creates walk animations for all 12 player colors
      │
      └── GameScene (runs after GamePreloadScene)
            launches task mini-scenes on top (pauses GameScene)
            → MeetingScene (pauses GameScene)
            → VictoryScene (replaces GameScene)
            → MenuScene (replaces VictoryScene, loop back)
```

---

## 4. Asset Key Naming Quirks

| Logical concept       | Key used in code          | Actual file path |
|-----------------------|---------------------------|-----------------|
| Nav stabilizer base   | `task_nav_base`           | `Assets/Images/Tasks/Stabilize Nav/stabilizer_base.PNG` |
| Nav target crosshair  | `task_nav_target`         | `Assets/Images/Tasks/Stabilize Nav/nav_stabilize_target.png` |
| Nav center circle     | `task_nav_center`         | `Assets/Images/Tasks/Stabilize Nav/target_center.png` |
| Align engine base     | `task_align_base`         | `Assets/Images/Tasks/Align Engine Output/engineAlign_base.png` |
| Align engine lever    | `task_align_liver`        | `Assets/Images/Tasks/Align Engine Output/engine_liver.png` |
| Align target marker   | `task_align_position`     | `Assets/Images/Tasks/Align Engine Output/alignment_position.png` |
| Garbage chute full    | `task_garbage_full`       | `Assets/Images/Tasks/Empty Garbage/garbage_base_full.PNG` |
| Garbage chute empty   | `task_garbage_empty`      | `Assets/Images/Tasks/Empty Garbage/garbage_base_empty.PNG` |
| Garbage lever up      | `task_garbage_liver_up`   | `Assets/Images/Tasks/Empty Garbage/liver_up.PNG` |
| Garbage lever down    | `task_garbage_liver_down` | `Assets/Images/Tasks/Empty Garbage/liver_down.PNG` |
| Garbage pieces        | `task_garbage_gb2/3/4`    | `Assets/Images/Tasks/Empty Garbage/gb2/3/4.png` |
| Space background      | `task_space_bg`           | `Assets/Images/Tasks/Clear Asteroids/space.jpg` |
| Asteroid sprite 1–4   | `task_asteroid_1..4`      | `Assets/Images/Tasks/Clear Asteroids/asteroid1..4.png` |
| Laser bullet          | `task_laser`              | `Assets/Images/Tasks/Clear Asteroids/laser.png` |
| Reactor panel         | `task_reactor_base1`      | `Assets/Images/Tasks/Start Reactor/reactor_base1.PNG` |
| Fuel engine base      | `task_fuel_base`          | `Assets/Images/Tasks/Fuel Engine/fuel_engines_base.png` |

---

## 5. Known Permanent Gaps (files do not exist in Assets/)

- `victory_crew.wav` and `victory_impostor.wav` — loaded in `GamePreloadScene` as `sfx_victory_crew` / `sfx_victory_imp` but the files are absent. Phaser will 404 silently; no crash. No replacement available.
- Red player visor renders green (same copy-paste asset bug family as the shading band fixed in an earlier session). Cosmetic only; needs a separate recolor pass on the Red assets if addressed.

---

## 6. Task Scene Asset Status (as of 2026-07-11)

| Scene | Status | Notes |
|-------|--------|-------|
| `FixWiringScene` | ✅ | Uses `task_wiring_base` panel bg |
| `StabilizeNavScene` | ✅ | Uses `task_nav_base` panel bg + `task_nav_center` crosshair |
| `RebootWifiScene` | ✅ | Uses `task_wifi_bg` |
| `FuelEngineScene` | ✅ | Uses `task_fuel_base` panel bg (depth -1 under controls) |
| `StartReactorScene` | ✅ | Uses `task_reactor_base1` panel bg (depth -1 under controls) |
| `AlignEngineScene` | ✅ | Full rewrite — uses `task_align_base` + `task_align_liver` slider handle |
| `EmptyGarbageScene` | ✅ | Full rewrite — uses `task_garbage_full/empty` + liver/gb sprites |
| `ClearAsteroidsScene` | ✅ | Full rewrite — uses `task_space_bg` + `task_asteroid_1-4` + `task_laser`; ship image tracked and moved each frame |

---

## 7. End-to-End Flow Status

### Freeplay
- ✅ Menu loads without purple screen
- ✅ FREEPLAY → `GamePreloadScene` → `GameScene`
- ✅ Task mini-games open, complete, and return to `GameScene` (resume-before-stop fixed in all scenes)
- ✅ Emergency meeting → `MeetingScene` → vote → `resolveMeeting()` → `checkWinConditions()`
- ✅ Win/loss → `VictoryScene` → back to `MenuScene` (loop)
- ⚠️ Victory sounds 404 silently (files missing — see §5)

### Multiplayer (Colyseus)
- ✅ Phase 1 — Infrastructure (server, room codes, Telegram auth bypass in dev)
- ✅ Phase 2 — Position sync (`RemotePlayer` sprites, 10 Hz MOVE, interpolation)
- ✅ Phase 3 — Full game events (kills, tasks, meetings, votes, win/loss — server-driven)
- ✅ Phase 4 — Telegram deep-link invite — **COMPLETE**

### ▶ Next session START HERE — End-to-End Multiplayer Test

The entire multiplayer implementation is complete. The next priority is testing it:

**Phase 3 end-to-end test (two browser tabs):**
1. Open two tabs → both click Online → Create (tab 1) / Join with code (tab 2)
2. Both see each other in the player list → host clicks Start Game
3. Move around — verify both tabs see movement in real time
4. Tab 1 (impostor) kills tab 2 → dead body appears on both sides
5. Any player triggers Emergency Meeting → MeetingScene launches on both tabs
6. Both vote → result shown → game continues or ends
7. Win/loss → VictoryScene → back to MenuScene

**Known still-needed: BotFather setup (for real Telegram invites)**
Phase 4 code is wired and TypeScript-clean. To activate it in production:
1. Create a bot via BotFather → `/newbot`
2. Register the Mini App → `/newapp` → set URL to your deployed Replit app
3. Set the `/play` command → BotFather links it to the Mini App with `?startapp=ROOM_CODE`
4. Update the `VITE_BOT_USERNAME` Replit env var to your actual bot username
5. Deploy the Replit app (Reserved VM) so the `wss://` Colyseus URL is accessible from Telegram WebView

---

## 8. Session Log

### Session 1 (prior)
- Diagnosed purple loading screen (MenuScene calling sounds not yet loaded)
- Fixed: added 6 UI sounds to `PreloadScene`; lazy-loaded 9.7 MB music in `MenuScene.startMenuMusic()`
- Added `cache.audio.exists()` guards in `MenuScene`

### Session 2 (2026-07-11)
- Audited all 8 task mini-game scenes for asset compliance
- Fully rewrote `AlignEngineScene`, `EmptyGarbageScene`, `ClearAsteroidsScene` to use original sprites
- Added panel background images to `StabilizeNavScene`, `FuelEngineScene`, `StartReactorScene`
- Added all missing asset loads to `GamePreloadScene` (align engine, empty garbage, clear asteroids)
- Fixed `closeTask()` order in all 8 task scenes: `resume('GameScene')` now called before `stop()`
- Fixed `ClearAsteroidsScene` ship image tracking (was statically placed, now updates each frame)

### Session 3 (2026-07-11)
- Created `src/utils/SpriteRecolor.ts` with `recolorCanvas(src, target)` utility
  - Detects red-dominant pixels (R > G+50 AND R > B+50)
  - Bright body (R ≥ 120): remaps to target color scaled by brightness (ref: R=197)
  - Shadow body (30 ≤ R < 120): remaps to shadow color (55% brightness) scaled by brightness (ref: R=108)
  - Black outlines, white visor, backpack: unchanged
  - `PLAYER_COLORS` table with official 12-color RGB palette
- Rewrote `GamePreloadScene.ts` sprite loading:
  - Now loads ONLY Red sprites as base (4 dirs × 17 frames + 2 ghost + 1 dead = 71 images)
  - `generateColorVariants()` in `create()` pixel-recolors Red base → 11 other colors
  - All 12 colors get full 17-frame walk animations (was: 7 colors had only 1 frame)
  - Dead body fix: `Deadred.png` loaded as `dead_red` (correct filename); all other dead textures generated by recoloring
- Dead body sprites now work: `Player.die()` / `Bot.die()` call `setTexture('dead_${lc}')` which now resolves to the recolored canvas texture
- `victory_crew.wav` and `victory_impostor.wav` confirmed to exist in Assets (earlier note was wrong)

### Session 4 (2026-07-11)
- Discovered root cause of wrong colors: Assets/ already has real sprite files for all 10 colors; runtime pixel-recoloring was unnecessary and produced incorrect results (yellow/white/black especially wrong)
- Rewrote `GamePreloadScene.ts` to load actual artwork directly:
  - Full-animation colors (18 frames + ghost): Red, Blue, Green, Orange, Yellow
  - Basic colors (1 frame, no ghost): Black, Brown, Pink, Purple, White
  - Dead body sprites loaded from `Assets/Images/Player/Dead/Dead{color}.png` for all 10 colors
- Removed all `SpriteRecolor.ts` / `recolorCanvas` usage from `GamePreloadScene.ts`
- `SpriteRecolor.ts` left in place but no longer imported
- Added texture cache eviction in `GamePreloadScene.preload()`: removes all player sprite keys before loading, so old canvas-recolor textures from a previous in-tab session cannot silently block the real file loads
- Added player-bot physics colliders in `GameScene.create()`: bots can no longer walk directly on top of the player, preventing the confusing red+blue overlap visual

### Session 5 (2026-07-11)
- **MeetingScene** redesigned for portrait: switched to single-column voter list (rowH=72px), larger fonts (22px names), bigger swatch (36×36), result overlay uses canvas-relative width, larger Skip button.
- **Task mini-scenes (all 7 panel-based)**: panels now dynamic — `pw = min(W-60, 560)`, `ph = min(H×0.52, 520)` — fills portrait screen instead of tiny fixed panels. Close buttons enlarged. All touch hit areas increased (e.g. FixWiring pegs 20→30px radius, StabilizeNav drag 30→42px, RebootWifi lever ±30→50px, AlignEngine ±30→52px, EmptyGarbage ±30→68px). FuelEngineScene.update() no longer hardcodes ph=420; uses `this._pw`/`this._ph` stored in create().
- **MenuScene**: Help page arrows enlarged for touch (52px, 16px padding), back button added (touch-friendly ✕ Back) to Help and Credits pages. showNotice box width now canvas-relative.
- **Telegram SDK**: Added `<script src="https://telegram.org/js/telegram-web-app.js">` to `index.html`. In `src/main.ts`, calls `tg.ready()`, `tg.expand()`, `tg.disableVerticalSwipes?.()` at boot. Note: `disableVerticalSwipes` requires TG ≥ 7.7; SDK logs a warning in older versions (harmless).
- **Orientation lock**: Added CSS rotate-prompt (`#rotate-prompt`) shown via `@media (max-height:500px) and (orientation:landscape)` for mobile landscape users.
- TypeScript check: clean (`tsc --noEmit` passes).

### Session 6 (2026-07-11)
- **Safe-area insets** added to `GameScene.ts`:
  - New `safeTop`/`safeBot` class properties (default 0 outside Telegram).
  - `readSafeInsets()` private method reads `window.Telegram?.WebApp?.safeAreaInset` (available TG ≥ 7.7).
  - Called before `setupJoystick()` and `buildHUD()` in `create()`.
  - Applied to all HUD Y positions: task bar (+safeTop), emergency btn (+safeTop), minimap btn (+safeTop), interact prompt (−safeBot), kill/report/use action buttons (−safeBot), virtual joystick base (−safeBot).
  - Full-screen overlay positions (`triggerEmergency`, `resolveMeeting`, `toggleMiniMap`) are centered at H/2 — no adjustment needed.
- **Task scene visual QA** (analytical — 750×1334 layout math):
  - All panels (pw=560×ph=520 typ.) verified to fit within canvas with 95px left margin, 407px top margin.
  - Peg/drag/lever hit areas confirmed generous (30–68px) on the new larger panels.
  - MeetingScene single-column: 9 voters × 72px row = 648px from startY=108 → bottom 756px, well clear of skip button at H−30=1304 ✓.
  - TypeScript: clean (`tsc --noEmit` passes).

### Session 7 (2026-07-11)
- **Bot walk animations fixed**: removed a faulty `this.scene.anims.exists(animKey)` guard introduced in Session 6 that was silently blocking `anims.play()`. Bots now call `play()` directly, matching the Player pattern. Bots with FULL_COLORS (Blue/Green/Orange/Yellow) now show their 18-frame walk sheets.
- **Walk animation speed doubled**: `frameRate` raised from 20 → 40 fps for all FULL_COLORS walk animations. Stride cycle now matches movement speed visually.
- **Bot Y-bob for single-frame colors**: BASIC_COLOR bots (Black/Brown/Pink/Purple/White) still have only 1 sprite frame. When moving, they now get a subtle 5% vertical scale squeeze at ~4 Hz using `Math.sin(bobTimer * 0.025 + bobPhase)`. Each bot has a random `bobPhase` so they don't all pulse in sync. Scale resets to (1, 1) when still or when a full animation is active.
- **Security monitor prop removed from world**: `security_room_comp` was mapped to `security_monitor.png`, which is a rendered image of a security-camera room view — it produced a "room inside a room" visual artifact in the security room corner. Removed the key from `placeItemSprites` imgMap. Task proximity detection is unaffected (it uses TMX coordinates, not sprites).

### Session 8 (2026-07-11)
- **Dead body invisible after kill (fixed)**: root cause was Phaser's animation manager continuing to advance the active walk animation every tick even after `setTexture('dead_...')`, silently overriding the dead frame. Fixed by calling `this.anims.stop()` immediately before `setTexture()` in both `Bot.die()` and `Player.die()`. (The `Deadblue.png`-vs-`dead_blue` filename mismatch noted in §5 from earlier sessions had already been resolved by Session 4's asset-loading rewrite — this was a distinct, newer bug.)
- **Task mini-game panels squished (fixed)**: all 6 remaining task scenes (`FixWiringScene`, `StabilizeNavScene`, `FuelEngineScene`, `AlignEngineScene`, `EmptyGarbageScene`, plus `RebootWifiScene`) switched from `setDisplaySize(w,h)` (stretches to fit box, distorting aspect ratio) to `fitContain(img, maxW, maxH)` (`src/utils/imageFit.ts`, letterboxes instead of stretching). `RebootWifiScene` panel height also increased from `H×0.52` (max 520) to `H−100` (max 720) because its background art (`panel_wifi_bg.png`) is portrait-oriented (366×716) and was being crushed into a near-square box.
- **WiFi/Wiring task glow after completion (fixed)**: `GameScene.placeItemSprites()` now tracks each task's world sprite in a `taskSprites: Map<objectName, Image>`. New `updateTaskSprites()` (called every frame from `detectNearby()`) swaps each tracked sprite's texture between base / `_highlight` (player nearby, task incomplete) / `_connected` (task done) variants, driven by a `TASK_SPRITE_VARIANTS` lookup table. `completeTask()` also force-swaps to the connected texture immediately so there's no one-frame lag. Currently wired for `wifi` and `electricity_wires` (the only objects with highlight/connected art); `nav` only has a highlight variant.
- **Task list HUD added**: persistent left-side panel (`buildTaskListInHud()`, added to `this.hud` so it renders on the unzoomed UI camera) lists all tasks by short name (`SHORT_TASK_NAMES` map) with ☐ / ✓ state, updated from `completeTask()` via `updateTaskList()`.
- **Minimap task markers added**: `toggleMiniMap()` now overlays a pulsing yellow "!" (Phaser tween, scale 1↔1.25) over every incomplete task's location, using the same world→map coordinate transform as the player dot. Duplicate task locations (e.g. two tasks mapped to the same `wifi` object) are deduped by rounded world position so markers don't stack. Tweens are explicitly killed in `closeMiniMap()` via `this.tweens.killTweensOf(this.miniMapOverlay.list)` to avoid orphaned tweens targeting destroyed objects.
- **Directional task compass added**: new HUD element (`buildTaskCompass()`) below the task bar — a yellow triangle arrow inside a ring that rotates every frame (`updateTaskArrow()`, called from `update()`) to point from the player toward the "tracked" task, with the task's short name labeled underneath. Tracked task = `getTrackedTask()`: the manually selected task (tap a row in the task list — each row got an invisible larger hit-rectangle for mobile) if still incomplete, else the first incomplete task in list order. Arrow hides entirely once all tasks are done. Rotation math: Phaser's `Angle.Between` returns 0°=right/90°=down (y-down, atan2 convention); the triangle's built-in "up" orientation corresponds to −90° in that convention, so `icon.rotation = angle + Math.PI/2`.
- Together these four changes replicate the original Among Us navigation loop end-to-end: task list → map markers → arrow guidance → walk in and press Use.
- TypeScript check: clean (`tsc --noEmit` passes) after every change in this session; workflow restarted and screenshot-verified (compass rotation, minimap markers, task list highlight all visually confirmed).

### Session 9 (2026-07-12) — Multiplayer Phase 3: Full Game Events (client-side wiring)
**What was done:** The server (`AmongGasRoom.ts`) already had complete Phase 3 handlers. This session wired all the missing client-side responses.

**GameScene.ts additions:**
- `player.isImpostor` now set from registry (`isImpostor` key written by LobbyScene on `YOU_ARE_IMPOSTOR` message) at `create()` time in multiplayer mode.
- `initMultiplayer()` extended with `room.onMessage` handlers for all Phase 3 server broadcasts:
  - `KILL_CONFIRMED` → kills local player or marks remote player dead + places dead-body sprite
  - `MEETING_STARTED` → plays alert sound/overlay on all clients, then calls `launchMeetingMultiplayer()` after 2.5 s
  - `GAME_OVER` → calls `endGameMultiplayer()` → VictoryScene
  - `POSITION_CORRECTION` → snaps local player to server-corrected position
- `completeTask()` — now also sends `TASK_DONE` to server in multiplayer (server validates proximity + increments its count).
- `triggerEmergency(isReport)` — in multiplayer, sends `EMERGENCY` or `REPORT` to server and returns immediately (server broadcasts `MEETING_STARTED` to all clients; no local launch).
- `tryReport()` — in multiplayer, delegates to `triggerEmergency(true)` (which finds nearest dead remote player).
- `detectNearby()` — in multiplayer: report button shows when near a dead remote player; kill button shows when `player.isImpostor` and a living remote player is within `KILL_RADIUS`.
- `attemptKill()` — in multiplayer: finds nearest alive remote player, sends `KILL` message to server, resets `killCooldown`.
- New private methods: `launchMeetingMultiplayer()`, `resolveMeetingMultiplayer(sessionId)`, `endGameMultiplayer(winner, impostorId)`.

**MeetingScene.ts rewrite:**
- Now accepts two init shapes: `FreeMeetingData` (existing freeplay — unchanged behaviour) and `MultiMeetingData` (multiplayer — server player list + sessionIds).
- Voter ids unified as `string` (`'_player'` / `'bot_N'` for freeplay; raw `sessionId` for multiplayer).
- In multiplayer: `castVote()` sends `room.send('VOTE', { targetId })` instead of recording locally. `openVoting()` does **not** simulate bot votes. Local timer is cosmetic only — `tallyVotes()` is never called.
- `create()` subscribes to `VOTE_RESULT` in multiplayer mode; on receipt calls shared `showResultAndClose()`.
- `showResultAndClose()` is now shared: calls `gameScene.resolveMeetingMultiplayer(id)` in multiplayer or converts string id back to `number` and calls `gameScene.resolveMeeting(id)` in freeplay.
- `tsc --noEmit` passes cleanly.

**Multiplayer phase summary (as of this session):**
- ✅ Phase 1 — Infrastructure (Colyseus server, room codes, Telegram auth bypass in dev)
- ✅ Phase 2 — Position sync (RemotePlayer sprites, 10 Hz MOVE, interpolation)
- ✅ Phase 3 — Full game events (kills, tasks, meetings, votes, win/loss — fully server-driven)
- ❌ Phase 4 — Telegram deep-link invite (BotFather /play command → auto-join) — NOT STARTED

### Session 10 (2026-07-12) — Phase 4: Telegram Deep-Link Invite
- **`src/vite-env.d.ts`** created — declares `VITE_SERVER_URL` and `VITE_BOT_USERNAME` in `ImportMetaEnv`
- **`VITE_BOT_USERNAME`** set as Replit env var (value: `AmongGasBot`; update to real bot username after BotFather setup)
- **`MenuScene.ts`** — module-level helpers `getStartParam()` and `getTelegramFirstName()` added
  - `create()`: if `start_param` present on boot, sets name from Telegram `first_name` (fallback `'Crewmate'`), color `'Red'`, jumps straight to `LobbyScene` — no menu shown
  - `selectMainItem(1)` (Online click): if `start_param` present, also skips char select and goes directly to `LobbyScene`
  - `showNameInput()`: pre-fills the name field from Telegram `first_name` when no name has been entered yet
- **`LobbyScene.ts`** — `autoJoinStatusText` field added
  - `create()`: when `start_param` branch fires, renders "Joining room…" + room code text so user sees feedback during connection
  - `setEntryStatus()`: routes status updates to `autoJoinStatusText` when `errorText` is absent; on error (red), auto-creates a Back to Menu button so user is never stuck
  - `shareRoom()`: hardcoded `'AmongGasBot'` replaced with `import.meta.env.VITE_BOT_USERNAME ?? 'AmongGasBot'`
- TypeScript: clean (`tsc --noEmit` passes)

### Session 13 (2026-07-12) — In-meeting chat

**In-meeting text chat (added — server + `src/scenes/MeetingScene.ts`):**
- Server-relayed only, never stored in the replicated `GameRoomState` schema — chat has no gameplay effect and would bloat every state patch.
- `server/rooms/AmongGasRoom.ts`: new `CHAT_SEND` message handler → `handleChat()`. Validates `phase === 'MEETING'`, sender is alive (ghosts excluded from the main channel — ghost-only chat remains a separate, still-missing gap), trims/truncates to 200 chars, per-sender 500 ms rate limit (`ERROR` code `CHAT_RATE_LIMIT` on violation). Broadcasts `CHAT_MESSAGE` `{ senderId, name, color, text, ts }` to all clients, including the sender.
- Client: `MeetingScene.ts` — multiplayer-only (freeplay has no one to chat with). Toggle button + unread badge, modal panel (message log + HTML `<input>` mirrored to a Phaser text preview, following the existing `MenuScene`/`LobbyScene` DOM-input pattern) with a Send button. Dead players see the panel (spectate) but the input row is hidden. Listener unsubscribe + DOM input cleanup wired into `shutdown()` — `MeetingScene` is fully re-created each meeting, so listeners must be torn down or they'd stack across meetings.
- Test coverage: `sim/mp-test.mjs` Test F (drop-outside-meeting, broadcast shape, rate limit, truncation, drop-for-dead-players) — 83/83 checks pass across the full suite (~109 s).

**Next priority (see §9):** Sabotage (Lights / O2 / Reactor / Comms / Doors + win timer).

### Session 12 (2026-07-12) — Ghost task fix + Fog of war + Gap analysis

**Ghost task completion (fixed):**
- `detectNearby()`: dead players now scan for nearby incomplete tasks and show `[E]` prompt + USE button (instead of early-return). Report/Kill/Emergency blocked for ghosts.
- `tryInteract()`: removed blanket `!isAlive` guard; ghosts can open task mini-games but not call meetings.
- `handleActionButtonTap()`: removed `!isAlive` guard; USE button tap works for ghosts.
- `triggerEmergency()`: added `!isAlive` guard — ghosts cannot call meetings via any code path.
- Matches original Among Us: dead crewmates (ghosts) can complete tasks and those completions count.

**Fog of war (added — `src/scenes/GameScene.ts`, `src/settings.ts`):**
- `CREW_VISION = 200` world units (~290 px at zoom 1.45), `IMP_VISION = 280` world units (~406 px).
- Initial implementation used a two-layer `GeometryMask invertAlpha=true` approach. **Replaced in Session 14** with a native Canvas 2D offscreen composite that supports smooth radial gradients and hard wall shadows via a visibility polygon.
- Ghosts see full map (fog skipped entirely when `!player.isAlive`).

**Original-vs-clone gap analysis (see §9):**
- Documented all ✅ / ❌ / ⚠️ gaps vs original Among Us.
- Priority order: chat → sabotage → venting → admin/security.

### Session 11 (2026-07-12) — Bug fix + full multiplayer integration test
**Bug fixed — `checkWinConditions` impostor comparison (`server/rooms/AmongGasRoom.ts`)**

Root cause: `checkWinConditions` compared `p.id` (which is `"dev_<sessionId>"` in dev mode) against `this.impostorSid` (raw sessionId). They never matched, so `aliveImps` was always 0 → crew "won" after every single event (first task done, first kill, first vote). Fixed by iterating `players.forEach((p, sid)` and comparing the map key (`sid`) directly against `impostorSid`.

**`sim/mp-test.mjs` — new multiplayer integration test (67 checks, ~98 s runtime)**

Tests run against the live Colyseus server with real `@colyseus/sdk` WebSocket connections:

| Test | Players | What is verified |
|------|---------|-----------------|
| A — Lobby join/leave | 2 | Schema size before/after disconnect |
| B — Crew win | 4, 8, 15 | Lobby, role assignment (1 imp), all 8 tasks completed, GAME_OVER crew, phase=RESULT, tasksDone=8, no POSITION_CORRECTION during movement |
| C — Impostor win | 4 | 2 kills, KILL_CONFIRMED on all clients, victim isAlive=false in state, GAME_OVER impostor, impostorId correct |
| D — Meeting flow | 6 | MEETING_STARTED, phase=MEETING, all-skip vote → VOTE_RESULT ejectedId=null, phase returns to GAME, duplicate EMERGENCY rejected with EMERGENCY_USED |
| E — Speed cheat | 2 | Instant 10 000 px jump triggers POSITION_CORRECTION, corrected x ≤ 5800 |

**Key implementation note for `moveTo`:** uses a single-hop approach — calculates the minimum real-time elapsed needed for the server's `maxMove = SPEED_MAX × elapsed_s + 50` to accept the move, then waits `minElapsedMs + 2000ms` (2 s safety buffer) before sending. No step-by-step walking; no timer-jitter risk. Avoids the bug where small timer jitter (−4 ms on Linux) caused step sizes to exceed the server budget, silently rejecting MOVE messages and leaving players off-task.

**All 67/67 checks pass.**

### Session 14 (2026-07-16) — Fog of war rewrite + correctness fixes + Room name label

**Fog of war — rewritten to native Canvas 2D offscreen composite:**
- Replaced the GeometryMask approach with a 4-step offscreen canvas technique hooked into `uiCamera.prerender`:
  1. Fill offscreen canvas with near-opaque darkness (`rgba(10,10,10,0.96)`)
  2. `destination-out` radial gradient punches a soft disc of light at the player (opaque 0→60 % of `visionR×1.2`, fades to transparent at `visionR×1.2`)
  3. `source-over` even-odd fill re-darkens wall-shadow areas (path = full-canvas rect + visibility polygon)
  4. `gameCtx.save()` / `drawImage(fogCanvas)` / `gameCtx.restore()` blits result onto the live Phaser canvas
- Motivation: GeometryMask is binary (no gradient) and `{ add: false }` was removed from Phaser 3.90 typings.

**Fog of war — correctness fixes applied this session:**
- **Polygon radius = visionR × 1.2** (critical): if the polygon only extends to `visionR`, the even-odd step-3 fill re-darkens the gradient's soft-falloff zone in open areas, producing a hard circle instead of a smooth fade. Matching the polygon boundary to the gradient's outer edge (`visionR×1.2`) preserves the soft edge. Wall shadows inside `visionR` still have hard edges (their vertices sit at actual wall hit-distance, not the 1.2× limit).
- **64 boundary rays** (up from 24): chord deviation drops from ~2.5 px to ~0.3 px at r=200 — polygon facets invisible on screen.
- **`gameCtx` save/restore**: explicit `setTransform(identity)` and `globalCompositeOperation = 'source-over'` before blitting, then `restore()`, so Phaser's canvas state is never mutated between frames.
- `public/fog_game.html` and `public/fog_test.html` updated to match (side-by-side NEW vs OLD demo with Reactor critical-case scenario).
- Visibility polygon algorithm (`src/utils/visibility.ts`): unchanged from prior session — `circleSegIntersectAngles()` handles walls whose corners are all outside the vision radius (the "Reactor case" that motivated the rewrite).

**Room name label (added — matches original Among Us HUD):**
- White bold 30 px text at `W/2, H − 48 − safeBot`, added to `this.hud` container (rendered by uiCamera above fog).
- `updateRoomLabel()` called each frame from `update()`: iterates `AMBIENT_CENTRES`, checks player distance ≤ `centre.radius`. Shows room display name (e.g. "O2", "Cafeteria") when inside a room zone; hidden in corridors/hallways between rooms — exactly matching the original game.
- 13 named rooms covered: Cafeteria, Medbay, Security, Reactor, Upper Engine, Lower Engine, Electrical, Storage, Admin, Communications, Oxygen, Cockpit, Weapons.
- Key files: `src/scenes/GameScene.ts` — `buildHUD()`, `updateRoomLabel()`, `update()`.

### Session 15 (2026-07-16) — Venting, Bot Vent AI, Admin Table Dot Spread

**Vent opening animation (added — procedural Phaser tweens, no new art):**
- New `playVentAnimation(wx, wy)` private method in `GameScene.ts`: spawns a dark expanding ellipse + metallic rim flash at the given world coordinate using Phaser tweens. Runs in world space so fog-of-war applies naturally — crewmates who are close enough see it; distant ones do not. Total duration ~500 ms; all GameObjects destroyed on tween complete.
- Called in the local client's `enterVent()`, `exitVent()`, and `travelVent()` flows so the local player sees their own vent grate opening.
- Called for remote players via three new `room.onMessage` handlers in `initMultiplayer()`:
  - `PLAYER_VENT` → plays animation at the entry vent (server already broadcast this to all clients except the venting player).
  - `PLAYER_TRAVEL_VENT` → plays animation at the destination vent.
  - `PLAYER_EXIT_VENT` → snaps to the closest vent to the remote player's current schema position and plays animation there.
- All three handlers also play `sfx_vent` at appropriate volume so observers hear the grate audio as well.

**Bot impostor vent AI (added — Freeplay only):**
- Full state machine on `GameScene`: `idle → moving_to_vent → in_vent → idle`, stored in five private fields (`botVentState`, `botVentTargetId/X/Y`, `botVentCooldownUntil`). All fields reset in `create()` so repeated Freeplay games start clean.
- `startBotVentAI(imp)`: picks a random vent from `ventData`, sets `botVentState = 'moving_to_vent'`, stores target world position. Blocked when `sabotageType !== ''` (bot stays near the sabotage location during active sabotages, matching original impostor strategy and pre-empting Task #4).
- `updateBotVentMovement()`: steers the bot toward the vent entrance using `PLAYER_SPEED`-scaled velocity, overriding `bot.update()` output each frame. When within 8 px, calls `enterBotVent()`.
- `enterBotVent(imp)`: hides bot (`setAlpha(0)`), plays `playVentAnimation()` + `sfx_vent`, picks a random *connected* vent from the vent network graph, teleports bot there, schedules reappearance after 1.5–3 s (random), then sets `in_vent` state. On reappearance: sets `setAlpha(1)`, plays vent animation again at exit vent, applies 8–15 s cooldown, returns to `idle`.
- `impostorAct()` in freeplay: skips kill logic while `botVentState === 'in_vent'`, aborts vent-entry if a kill target is found (killing always takes priority), and calls `startBotVentAI()` when no kill target is in range.
- `update()`: calls `updateBotVentMovement()` when `moving_to_vent`; freezes bot velocity to zero while `in_vent`.

**Admin table dot spread (fixed — `src/scenes/AdminTableScene.ts`):**
- `worldToRoomFraction()` now also returns `roomKey: string` (the room name matched by `AMBIENT_CENTRES`).
- `drawDots()` refactored: collects all agents (local player + remote players + bot) into a flat array, groups by `roomKey`, then for each group of n dots arranges them evenly on a ring of radius `DOT_R × 2`. Single occupants draw at the room centre as before; clusters of 2+ spread so every dot is individually visible.
- Bot impostor hidden from admin dots while `botVentState === 'in_vent'` — mirrors the multiplayer `inVent` rule.

**Code quality fix:**
- Added `get botImpostorInVent(): boolean { return this.botVentState === 'in_vent'; }` public getter to `GameScene`. `AdminTableScene` now uses this typed accessor instead of the earlier `(gs as unknown as { botVentState: string })` cast.

### Next Session Priorities
See §9 for the full original-vs-clone gap analysis. Implement in this order:
1. **Fog of war** — ✅ DONE (Sessions 12 + 14)
2. **In-meeting chat** — ✅ DONE (Session 13)
3. **Sabotage** — ✅ DONE (Session 13+)
4. **Room name label** — ✅ DONE (Session 14)
5. **Venting + vent animation + bot vent AI + admin dot spread** — ✅ DONE (Session 15)
6. **Remaining proposed tasks** (see task list):
   - Task #2: Vent animation visible to multiplayer observers — ✅ resolved inside Session 15 (PLAYER_VENT / PLAYER_TRAVEL_VENT / PLAYER_EXIT_VENT handlers)
   - Task #3: Count badge on admin table clusters (dot group → show number)
   - Task #4: Bot must not vent during active sabotage — ✅ resolved inside Session 15 (`sabotageType !== ''` guard)
7. **Security cameras** — let players watch the camera feeds from the Security room
8. **Multi-step tasks** — Fix Wiring (3 locations), Fuel Engines (2 stages)

---

## 9. Original-vs-Clone Gap Analysis (as of Session 14)

### ✅ Implemented correctly
| Feature | Notes |
|---|---|
| Movement (WASD + joystick) | Matches |
| 8 task mini-games + task list/bar/compass | Matches (compass shows all tasks; original shows one at a time) |
| Report dead body / Emergency meeting button | Matches |
| Meeting: discuss→vote→result phases (30 s + 60 s) | Matches |
| Vote tallying, skip, ejection | Matches |
| Kill with cooldown (15 s) | Matches |
| Win conditions (task complete / impostor majority / eject all impostors) | Matches |
| Ghost walks through walls | Matches |
| Ghost can complete tasks (contributions count) | Matches — fixed Session 12 |
| Fog of war (crew 200 wu, impostor 280 wu; ghosts see full map) | Matches — added Session 12, rewritten + corrected Session 14 |
| Ambient room sounds, minimap, kill banner | Matches |
| Multiplayer up to 15 players (Colyseus) | Matches |
| In-meeting text chat (multiplayer, alive players only) | Matches (no Quick Chat presets, no separate ghost channel) — added Session 13 |
| **Sabotage** (Lights/Comms/Doors/Reactor/O2) | Server-authoritative in multiplayer; client-driven bot AI in Freeplay. Reactor/O2 unfixed → impostor wins, matching original. |
| **Room name label** (bottom-centre HUD) | Shows current room name (e.g. "O2") when inside a room zone; hidden in corridors — added Session 14 |

### ❌ Missing — high gameplay impact

*(none remaining — all high-impact gaps resolved)*

### ⚠️ Missing — medium impact
| Gap | What original does |
|---|---|
| **Admin map — count badge** | Room dot clusters show player count number (Task #3) |
| **Security cameras** | Watch static camera feeds from Security room |
| **Multi-step tasks** | Fix Wiring (3 locations), Fuel Engines (2 stages), Divert Power (Electrical → target room) |
| **Fake tasks** | Impostor stands at consoles faking animation |
| **Per-ejection role reveal** | Shows ejected player's role + remaining impostors count |

### 🟡 Missing — minor/cosmetic
| Gap | Notes |
|---|---|
| Hats/skins/pets/visors | Clone: colour + name only |
| Ghost chat | Ghosts can send ghost-only messages in original |
| Visual tasks | Medbay Scan etc. play a public animation proving innocence |
| Number-of-impostors setting | Original: 1–3; clone: always 1 |
| Kill cooldown visual counter | Number countdown on kill button |
