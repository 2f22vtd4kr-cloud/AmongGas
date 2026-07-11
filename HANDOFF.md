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
- Dead body sprites — `Player.die()` and `Bot.die()` call `setTexture('dead_blue')` etc. but files are named `Deadblue.png`. Players look alive when dead. See Task #3.

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

- ✅ Menu loads without purple screen
- ✅ FREEPLAY → `GamePreloadScene` → `GameScene`
- ✅ Task mini-games open, complete, and return to `GameScene` (resume-before-stop fixed in all scenes)
- ✅ Emergency meeting → `MeetingScene` → vote → `resolveMeeting()` → `checkWinConditions()`
- ✅ Win/loss → `VictoryScene` → back to `MenuScene` (loop)
- ⚠️ Victory sounds 404 silently (files missing — see §5)
- ⚠️ Dead sprites show wrong texture (see §5 / Task #3)

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

### Next Session Priorities
1. Consider lazy-loading ambient sounds per room (31 MB currently omitted)
2. Wire up Telegram user identity (pre-fill player name from `initDataUnsafe.user.first_name`)
3. Test multiplayer (LOCAL) path
