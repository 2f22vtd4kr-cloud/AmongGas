---
name: Colyseus room — players map key vs p.id
description: Why comparing p.id to impostorSid silently breaks win conditions; always use the MapSchema key (sessionId).
---

## The Rule
In `AmongGasRoom`, `state.players` is a `MapSchema<Player>` keyed by `client.sessionId`.
`p.id` is the *userId* — `"dev_<sessionId>"` in dev mode, Telegram numeric ID in prod.
`this.impostorSid` is the raw `sessionId`.

**Never** compare `p.id` to `this.impostorSid` — they are different strings.

## Why
`checkWinConditions` originally did:
```ts
const aliveCrew = alive.filter(p => p.id !== this.impostorSid);
const aliveImps = alive.filter(p => p.id === this.impostorSid);
```
In dev mode `p.id = "dev_XXXX"` but `impostorSid = "XXXX"` → `aliveImps.length` was always 0
→ `endGame('crew')` fired after every event (first task, first kill, first vote).

## How to Apply
Always iterate the map by key when comparing to sessionIds:
```ts
this.state.players.forEach((p, sid) => {
  if (!p.isAlive) return;
  if (sid === this.impostorSid) impostorAlive = true;
  else aliveCrewCount++;
});
```
