---
name: Colyseus Node.js SDK — movement testing approach
description: Single-hop MOVE with auto-calculated wait beats step-by-step walking for integration tests; schema patches arrive in a separate frame from broadcast messages.
---

## The Rule
In Node.js integration tests using `@colyseus/sdk`, use a **single-hop** `moveTo` that calculates
the minimum real-time wait before sending the MOVE:

```js
async moveTo(tx, ty) {
  const d = dist(this.x, this.y, tx, ty);
  if (d < 1) return;
  const minElapsedMs = Math.max(0, ((d - 50) / SPEED_MAX) * 1000);
  const neededMs = minElapsedMs + 2000;   // 2 s safety buffer
  const elapsed = Date.now() - this._lastMoveAt;
  if (elapsed < neededMs) await wait(neededMs - elapsed);
  this.send('MOVE', { x: Math.round(tx), y: Math.round(ty), anim: '...' });
  this.x = tx; this.y = ty;
  this._lastMoveAt = Date.now();
}
```

Initialize `this._lastMoveAt = Date.now()` inside `_setup()` (right after `create()`/`join()`)
to match the server's `lastPositions.t` timestamp.

## Why Step-by-Step Fails
The server validation: `maxMove = SPEED_MAX × elapsed_s + 50`.
`await wait(120ms)` can fire 4–10 ms early on Linux, making `elapsed_s = 0.116` instead of 0.12.
At `STEP_MAX_PX = 112px` and `maxMove = 520×0.116+50 = 110px` → silent POSITION_CORRECTION.
Player stays at previous position → TASK_DONE proximity check fails silently.
The test's "task completion" Promise still resolves (it only awaits `send()`, not server ACK).

## Schema Patches vs Broadcast Messages
Colyseus sends state patches and `onMessage` broadcasts as separate WebSocket frames.
After `KILL_CONFIRMED` or `MEETING_STARTED` arrives, wait **~400 ms** before reading
`state.players.get(sid).isAlive` or `state.phase` — the schema patch arrives in a later frame.

## How to Apply
- Use `sim/mp-test.mjs` as the reference test script (grows over time as features are added; ~83 checks / ~109 s as of the in-meeting-chat feature).
- `run: node sim/mp-test.mjs` against the running Colyseus server (port 5001).

## Tracker queue drain gotcha
The per-type message tracker (`makeTracker`) queues *every* broadcast of a type, even ones nobody
is waiting for yet. If step N's broadcast of type X is never consumed (no `waitFor(X)` was pending
when it arrived), it sits in the queue — and step N+1's `waitFor(X)` will immediately resolve with
that **stale** message instead of waiting for the new one, silently corrupting the assertion (e.g.
a truncation-length check reporting the length of an old, unrelated message). Always register
`waitFor(type)` for every client *before* sending the message that should trigger it, for every
single step — never assume the queue is empty going into the next assertion.
