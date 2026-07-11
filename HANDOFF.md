# Among Gas — Session Handoff

> **⚠️ MANDATORY FOR EVERY NEW SESSION**
> 1. Read this file immediately after a successful repo import.
> 2. Update the "Last session" section before ending any session.
> Failure to do this means the next session starts blind and may undo or duplicate work.

---

## Project overview

**Among Gas** — an unofficial Among Us clone ported from Python/Pygame to **TypeScript + Phaser 3**, targeting browsers and Telegram HTML5 Mini Apps.

- **Run command**: `npm run dev` → http://localhost:5000
- **Build**: `npm run build`
- **Engine**: Phaser 3.90.0 | **Bundler**: Vite 5 | **Lang**: TypeScript 5

### Core rule (enforced by user — never violate)
> **Do NOT redraw, regenerate, or create any new sprites/images/sounds.**
> Load and use the **exact original assets from the `Assets/` folder only.**
> This means: no `this.add.graphics()` to fake sprites, no canvas-drawn images, no programmatically generated textures passed as game objects that substitute for real asset images.
> Phaser primitives (rectangles, text) are allowed **only for UI chrome** (loading bars, HUD overlays, task panels) — never as substitutes for sprites/backgrounds that should come from `Assets/`.

---

## Repository layout

```
src/
  main.ts                — Phaser config, scene registry
  settings.ts            — Constants (speeds, world size, colors, task titles)
  types.ts               — Shared TS interfaces
  utils/TmxParser.ts     — Parses TMX XML → wall rects + object list
  scenes/
    PreloadScene.ts      — Loads menu images + ALL menu audio; hides HTML loading div; boots MenuScene
    GamePreloadScene.ts  — Loads heavy game assets (sprites, map, game audio) after Freeplay click
    MenuScene.ts         — Main menu, char select, name input
    GameScene.ts         — Core gameplay
    MeetingScene.ts      — Emergency meeting + voting
    VictoryScene.ts      — End screen
    tasks/               — 8 individual task mini-games (all use Assets/ images)
  objects/
    Player.ts            — Local player
    Bot.ts               — NPC bots
Assets/
  Images/                — All sprites, maps, UI, task panels (ORIGINAL — do not replace)
  Sounds/                — All WAV/MP3 files (ORIGINAL — do not replace)
  Maps/                  — map2back.png (world BG), map_final.backv2.tmx (collision/objects)
index.html               — HTML shell; has #loading div (purple, hidden by PreloadScene.create())
```

---

## What was worked on — session log

### Session 2 (2026-07-11) — Fixed stuck loading screen

**Problem reported (with screenshots)**:
- Purple `#loading` HTML div appeared and never went away (game seemed stuck at "Loading…")
- After partial loads, a black screen with a purple band appeared (broken MenuScene)

**Root cause found**:
`MenuScene.create()` called `this.sound.add('sfx_menu_music')` and other UI sounds (`sfx_menu_sel`, `sfx_selected`, `sfx_keypress`, `sfx_go_back`, `sfx_backspace`, `sfx_map_click`). These were **only loaded in `GamePreloadScene`**, which runs *after* the user clicks Freeplay. On the very first visit to MenuScene (coming from PreloadScene), those audio keys were absent → Phaser threw → MenuScene failed to render → left user staring at the dark Phaser canvas background colour (`#1a0a2e`, which is purple).

**Fix applied**:
1. **`src/scenes/PreloadScene.ts`** — Added loading of all 7 menu audio files (6 UI sounds ~1.2 MB + menu music ~9.7 MB). These are now available before MenuScene ever starts.
2. **`src/scenes/GamePreloadScene.ts`** — Removed the 7 menu audio `load.audio()` calls (already cached by PreloadScene; listing them again was harmless but inflated progress bar count).
3. **`src/scenes/MenuScene.ts`** — Added `this.cache.audio.exists(key)` guards before every `this.sound.play()` / `this.sound.add()` call as a belt-and-suspenders safety net.

**Files changed**:
- `src/scenes/PreloadScene.ts`
- `src/scenes/GamePreloadScene.ts`
- `src/scenes/MenuScene.ts`

**NOT yet done / known issues**:
- Task scenes (`FixWiringScene`, `StabilizeNavScene`, etc.) draw some UI chrome with Phaser primitives (circles for wire pegs, rectangles for dim overlays). These are **UI chrome only** — the actual task panel backgrounds are loaded from `Assets/Images/Tasks/`. A separate compliance check was requested to verify no task scene is drawing fake sprite replacements.
- `GamePreloadScene` displays an in-Phaser loading bar using `this.add.rectangle()` and `this.add.text()`. This is intentional UI chrome (the HTML loading div is hidden before `GamePreloadScene` runs).
- `Dead/` sprite paths in `GamePreloadScene` use `dead_blue.png` etc. but actual files are `Deadblue.png`. These 404 silently (Phaser fallback). Fix is to correct the paths or rename files.

---

## How the load sequence works (important — don't break this)

```
Browser opens
  └─ HTML #loading div shown (purple, CSS-generated — NOT an asset)
  └─ Phaser boots → PreloadScene.preload()
       Loads: menu images (Assets/Images/menu/, help/, credits/) + 7 menu audio files
       Progress bar updated via DOM (loading-bar element)
  └─ PreloadScene.create()
       Hides #loading div
       Starts MenuScene (or preview route if ?preview=X in URL)

User clicks Freeplay → MenuScene → GamePreloadScene.preload()
       Loads: map, all player sprites (10 colors × 4 dirs × up to 17 frames), items,
              UI images, meeting images, task panel images, kill audio, footsteps, game sounds
       Progress shown via Phaser-drawn bar (NOT HTML div — already gone)
  └─ GamePreloadScene.create()
       Builds walk animations
       Starts GameScene
```

---

## Asset naming quirks (watch out)

| Issue | Detail |
|-------|--------|
| Dead sprites | Files are `Deadblue.png` / `Deadred.png` etc., but code loads `dead_blue.png`. Silently 404s; fallback to walk frame used in GameScene. |
| Case-sensitive extensions | Some items use `.PNG` (uppercase), some `.png`. Code already handles this per-file. |
| Kill banners | `Assets/Images/Alerts/kill1.png` … `kill18.png` (1–18) |
| Colors with animations | Only Blue/Green/Orange/Red/Yellow have 17-frame walks; Black/Brown/Pink/Purple/White have 1 frame. |

---

## Session update instructions

At the **end of every session**, add a new block under "What was worked on":

```markdown
### Session N (YYYY-MM-DD) — Short title

**What was done**: …
**Files changed**: …
**NOT yet done / open issues**: …
```

Keep entries concise. The goal is: a fresh agent reading only this file can understand the current state and continue without re-investigating.
