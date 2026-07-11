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
- Added `task_align_position` image for align target indicator
- Added all missing asset loads to `GamePreloadScene` (align engine, empty garbage, clear asteroids)
- Fixed `closeTask()` order in all 8 task scenes: `resume('GameScene')` now called before `stop()`
- Fixed `ClearAsteroidsScene` ship image tracking (was statically placed, now updates each frame)
- Used `setDepth(-1)` on panel images where buttons/text must remain on top

### Next Session Priorities
1. Fix dead body sprites (Task #3): `dead_blue` → `Deadblue`, etc. for all 12 colors in `Player.die()` and `Bot.die()`
2. Verify full in-game playthrough (Freeplay → complete 8 tasks → meeting → victory) with screenshots
3. Investigate missing `sfx_wire_drag`, `sfx_wire_connect` sounds — `FixWiringScene` might reference them
4. Consider lazy-loading ambient sounds per room (31 MB currently omitted)
