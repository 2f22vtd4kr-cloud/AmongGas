---
name: Among Us freeplay vs multiplayer dual-mode gameplay systems
description: How to add a new impostor ability (sabotage, venting, etc.) that must work in both server-authoritative multiplayer and server-less Freeplay.
---

## Pattern
Gameplay systems in this project (kill, sabotage) share one set of state fields on `GameScene` (e.g. `sabotageType`/`sabotageEndsAt`/`sabotageLockedTasks`) and one set of *reactive* consumers (fog radius, task list, door-lock markers, banner) that just read those fields — those consumers don't care whether the mode is multiplayer or Freeplay. Only the *trigger* and *fix* paths differ:
- Multiplayer: server owns the state (`server/rooms/AmongGasRoom.ts`); client only mirrors it via `room.onMessage(...)`, and sends intents (`NetworkManager.room?.send(...)`).
- Freeplay: no server exists, so the bot impostor AI must be given its own periodic timer that mutates the same fields directly and schedules the same timeout/expiry logic locally (mirror the server handler almost line-for-line).

**Why:** Before this, sabotage was fully built for multiplayer but silently gated behind `isMultiplayer` everywhere, so Freeplay's impostor bot had only kill. The fix was adding a client-side AI trigger + local timeout/fix/clear functions that mirror the server's `handleSabotage`/`onSabotageTimeout`/`handleSabotageFix`/`clearSabotage`, then stripping the `isMultiplayer &&` guards from the shared reactive consumers (fog, task list, door locks, banner) so both modes render identically.

**How to apply:** When adding a new impostor ability (e.g. venting), check every `if (this.isMultiplayer)` guard touching the new feature's state — guards on *effects/rendering* should usually be removed (both modes should render the same way), while guards on *triggering* should branch into "send to server" vs. "call the equivalent local-AI/local-fix function."

## Phaser scene-instance-reuse gotcha
`GameScene` is registered as a class in `main.ts`'s `scene: [...]` array — Phaser instantiates it **once** and reuses the same JS object across every replay (MenuScene → GamePreloadScene → GameScene again), it does not construct a fresh instance per playthrough. Any per-round field that isn't reassigned somewhere in the normal game-start path (`gameOver`, sabotage state, etc.) will leak into the next round unless explicitly reset at the top of `create()`. `create()` now resets `gameOver` and all `sabotage*` fields for exactly this reason — copy that pattern for any new per-round state.
